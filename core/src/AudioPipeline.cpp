#include "../include/AudioPipeline.h"
#include "../include/AudioCapture.h"
#include "../include/PhraseDetector.h"

/* minimp3 — define implementation in exactly one TU */
#define MINIMP3_IMPLEMENTATION
#include <minimp3.h>

#ifdef __APPLE__
#include "../../drivers/macos/ShmWriter.h"
#endif

#include <httplib.h>
#include <nlohmann/json.hpp>

#include <atomic>
#include <mutex>
#include <thread>
#include <condition_variable>
#include <queue>
#include <memory>
#include <cstring>
#include <chrono>
#include <algorithm>
#include <cmath>

using json = nlohmann::json;

struct ServerEndpoint {
    std::string host;
    int         port;
    bool        ssl;
};

static ServerEndpoint parseServerUrl(const std::string &url)
{
    ServerEndpoint ep{"api.voicebridgeapps.com", 443, true};
    std::string u = url;
    if (u.rfind("https://", 0) == 0) { ep.ssl = true;  u = u.substr(8); ep.port = 443; }
    else if (u.rfind("http://", 0) == 0) { ep.ssl = false; u = u.substr(7); ep.port = 8000; }
    else if (!u.empty() && u.find("://") == std::string::npos) { ep.host = u; return ep; }
    auto slash = u.find('/');
    if (slash != std::string::npos) u = u.substr(0, slash);
    auto colon = u.find(':');
    if (colon != std::string::npos) {
        ep.host = u.substr(0, colon);
        try { ep.port = std::stoi(u.substr(colon + 1)); } catch (...) {}
    } else {
        ep.host = u;
    }
    return ep;
}

/* ─────────────────── Audio helpers ─────────────────── */

static void normalizePCM(std::vector<float> &pcm)
{
    float peak = 0.f;
    for (float s : pcm) peak = std::max(peak, std::fabs(s));
    if (peak < 1e-6f) return;
    const float target = 0.85f;
    const float gain = std::min(target / peak, 4.f);
    for (float &s : pcm) s = std::clamp(s * gain, -1.f, 1.f);
}

/* Returns RMS energy in range [0,1]. Noise/silence is typically < 0.01 */
static float computeRMS(const std::vector<float> &pcm)
{
    if (pcm.empty()) return 0.f;
    double sum = 0.0;
    for (float s : pcm) sum += (double)s * s;
    return (float)std::sqrt(sum / pcm.size());
}

/* Simple 44100 → 48000 linear resample for TTS output */
static std::vector<float> resampleTo48k(const std::vector<float> &in, int srcHz)
{
    if (in.empty()) return {};
    if (srcHz == 48000) return in; /* already correct rate */
    const double ratio = 48000.0 / (double)srcHz;
    size_t outLen = (size_t)(in.size() * ratio + 0.5);
    std::vector<float> out(outLen);
    for (size_t i = 0; i < outLen; i++) {
        double src = i / ratio;
        size_t idx = (size_t)src;
        double frac = src - idx;
        float a = in[std::min(idx,     in.size() - 1)];
        float b = in[std::min(idx + 1, in.size() - 1)];
        out[i] = (float)(a * (1.0 - frac) + b * frac);
    }
    return out;
}

static std::vector<float> decodeMp3(const std::string &mp3Bytes, bool streamToShm = false, int *outHz = nullptr)
{
    mp3dec_t dec;
    mp3dec_init(&dec);
    std::vector<float> out;
    int detectedHz = 44100; /* default fallback */

    const uint8_t *data = reinterpret_cast<const uint8_t *>(mp3Bytes.data());
    size_t         size = mp3Bytes.size();
    size_t         pos  = 0;

    while (pos < size) {
        mp3dec_frame_info_t info;
        mp3d_sample_t       pcm[MINIMP3_MAX_SAMPLES_PER_FRAME];
        int samples = mp3dec_decode_frame(&dec, data + pos, (int)(size - pos), pcm, &info);
        if (info.frame_bytes == 0) break;
        pos += (size_t)info.frame_bytes;
        if (info.hz > 0) detectedHz = info.hz;

        std::vector<float> frame(samples);
        for (int i = 0; i < samples; i++)
            frame[i] = (float)pcm[i] / 32768.0f;

        if (streamToShm && !frame.empty()) {
#ifdef __APPLE__
            vb_shm_write(frame.data(), (uint32_t)frame.size());
#endif
        }
        out.insert(out.end(), frame.begin(), frame.end());
    }
    if (outHz) *outHz = detectedHz;
    return out;
}

/* Forward declarations for global keepalive coordination */
#ifdef __APPLE__
static std::atomic<bool> g_ttsActive{false};
static std::atomic<bool> g_keepaliveRunning{false};
static std::thread        g_keepaliveThread;
static void globalKeepaliveLoop(); /* defined below */
#endif

#ifdef __APPLE__
/** Pace 48 kHz mono PCM into the virtual mic ring at real-time rate. */
static void streamPcmToVirtualMic(const std::vector<float> &pcm48, std::atomic<bool> &ttsGate)
{
    ttsGate.store(true);
    g_ttsActive.store(true);
    auto guard = std::shared_ptr<void>(nullptr, [&ttsGate](void*){
        ttsGate.store(false);
        g_ttsActive.store(false);
    });

    if (pcm48.empty()) return;

    /* Skip if SHM not open (driver not installed). RAII guard above ensures ttsGate clears. */
    if (!vb_shm_is_ready()) return;

    const uint32_t kChunk   = 2048u;  /* 4× driver buffer — reduces scheduling jitter impact */
    const int      kMaxRetry = 500;   /* 500 × 2ms = 1 s max stall per chunk */
    size_t offset = 0;

    while (offset < pcm48.size()) {
        uint32_t want    = (uint32_t)std::min<size_t>(kChunk, pcm48.size() - offset);
        uint32_t written = 0;
        int      retries = 0;

        while (written < want) {
            uint32_t n = vb_shm_write(pcm48.data() + offset + written, want - written);
            if (n == 0) {
                if (++retries > kMaxRetry) {
                    /* Ring buffer stalled (driver stopped reading) — abort TTS */
                    return;
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(2));
                continue;
            }
            retries = 0;
            written += n;
        }
        offset += written;

    /* Write at 90% real-time speed — keeps ring ~10% ahead of driver
     * consumption, absorbing OS scheduling jitter and preventing underruns. */
    std::this_thread::sleep_for(std::chrono::microseconds(
        (written * 900000u) / 48000u));
    }
}
#endif

/* ─────────────────── Impl ─────────────────────────────────── */
struct AudioPipeline::Impl {
    PipelineConfig   cfg;
    VBAudioCapture  *capture    = nullptr;
    PhraseDetector  *detector   = nullptr;
    std::atomic<bool> running         {false};
    std::atomic<bool>    ttsPlaying   {false}; /* mute-while-speaking gate */
    std::atomic<bool>    inputMuted  {false}; /* push-to-talk gate */
    /* Timestamp (ms since epoch) when TTS last ended — used for echo cooldown */
    std::atomic<int64_t> ttsEndMs    {0};
    std::mutex        langMutex;
    std::string       sourceLang;
    std::string       targetLang;
    std::string       voiceGender;
    std::string       glossaryJson;

    /* Work queue for async HTTP requests */
    struct WorkItem {
        std::vector<float> pcm;
        std::chrono::steady_clock::time_point phraseEnd;
    };
    std::queue<WorkItem>      workQueue;
    std::mutex                workMutex;
    std::condition_variable   workCV;
    std::thread               workerThread;
    std::thread               workerThread2;
#ifdef __APPLE__
    std::thread               keepaliveThread;
#endif

    explicit Impl(const PipelineConfig &c)
        : cfg(c), sourceLang(c.sourceLang), targetLang(c.targetLang),
          voiceGender(c.voiceGender), glossaryJson(c.glossaryJson) {}

    void log(const std::string &lvl, const std::string &msg) {
        if (cfg.logCallback) cfg.logCallback(lvl, msg);
        else std::cerr << "[" << lvl << "] " << msg << "\n";
    }

    /* Called on PortAudio IO thread — just queue audio */
    static void captureCallback(const float *frames, uint32_t count, void *ud) {
        auto *self = static_cast<Impl *>(ud);
        /* Drop audio when input is muted (push-to-talk gate) */
        if (self->inputMuted.load()) return;
        self->detector->push(frames, count);
    }

    /* Called from PhraseDetector when a phrase is ready */
    void onPhrase(const float *pcm, uint32_t frames) {
        /* Drop phrase while TTS is playing to prevent echo feedback loop */
        if (ttsPlaying.load()) return;

        /* Drop phrase during echo cooldown (700ms after TTS ends).
         * Speaker echo from ElevenLabs output gets picked up by the mic — this
         * prevents it from being transcribed and re-translated as garbage. */
        int64_t endMs = ttsEndMs.load();
        if (endMs > 0) {
            int64_t nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::steady_clock::now().time_since_epoch()).count();
            if (nowMs - endMs < 700) {
                log("debug", "Dropped echo phrase (cooldown " + std::to_string(nowMs - endMs) + "ms after TTS)");
                return;
            }
        }
        std::vector<float> copy(pcm, pcm + frames);

        /* Energy gate: skip near-silence before normalization amplifies it.
         * 0.008 catches true silence & BT idle noise while passing real speech.
         * If speech is very quiet, user should speak closer or raise mic gain. */
        float rawRms = computeRMS(copy);
        log("debug", "Phrase RMS=" + std::to_string(rawRms) + " frames=" + std::to_string(frames));
        if (rawRms < 0.006f) {
            log("warn", "Skipped low-energy phrase (RMS=" + std::to_string(rawRms) + ") — mic too quiet or wrong device?");
            return;
        }

        normalizePCM(copy);
        {
            std::lock_guard<std::mutex> lk(workMutex);
            workQueue.push({std::move(copy), std::chrono::steady_clock::now()});
        }
        workCV.notify_one();
    }

    void workerLoop() {
        while (running) {
            WorkItem item;
            {
                std::unique_lock<std::mutex> lk(workMutex);
                workCV.wait(lk, [this]{ return !workQueue.empty() || !running; });
                if (!running) break;
                item = std::move(workQueue.front());
                workQueue.pop();
            }
            processPhrase(item.pcm, item.phraseEnd);
        }
    }

#ifdef __APPLE__
    /**
     * Write near-silence (0.0001 amplitude) to the virtual mic SHM ring
     * at 48 kHz real-time pace while TTS is NOT playing.
     *
     * Purpose: Zoom/Meet/Teams detect "microphone not working" when they
     * receive complete silence for >2 seconds. This keepalive prevents that
     * alert without producing audible sound on the far end.
     */
    void keepaliveLoop() {
        /* Match driver IO buffer size (512 frames @ 48kHz ≈ 10.67ms) */
        static const uint32_t kFrames = 512u;
        /* -60 dBFS — below hearing threshold, keeps mic "active" in Zoom/Meet */
        static const float    kAmp    = 0.001f;
        float buf[kFrames];
        /* Dithered near-silence: alternating polarity avoids DC offset */
        for (uint32_t i = 0; i < kFrames; ++i)
            buf[i] = kAmp * ((i % 2 == 0) ? 1.0f : -1.0f) * (0.5f + 0.5f * ((float)(i % 7) / 6.0f));

        const auto kInterval = std::chrono::microseconds(10667); /* 512/48000 s */

        while (running) {
            if (!ttsPlaying.load()) {
                vb_shm_write(buf, kFrames);
            }
            std::this_thread::sleep_for(kInterval);
        }
    }
#endif

    /* Minimal base64 decoder */
    static std::string base64Decode(const std::string &in) {
        static const std::string chars =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        std::string out;
        int val = 0, valb = -8;
        for (unsigned char c : in) {
            if (c == '=') break;
            size_t pos = chars.find(c);
            if (pos == std::string::npos) continue;
            val = (val << 6) | (int)pos;
            valb += 6;
            if (valb >= 0) { out.push_back(char((val >> valb) & 0xFF)); valb -= 8; }
        }
        return out;
    }

    struct SseParseState {
        std::string buffer;
        std::string audioB64;
        int         processingMs = 0;
        bool        hadError = false;
        std::string errorMsg;
    };

    void feedSseChunk(SseParseState &st, const std::string &chunk) {
        st.buffer += chunk;
        for (;;) {
            auto sep = st.buffer.find("\n\n");
            if (sep == std::string::npos) break;
            std::string block = st.buffer.substr(0, sep);
            st.buffer.erase(0, sep + 2);
            if (block.rfind("data: ", 0) != 0) continue;
            std::string payload = block.substr(6);
            while (!payload.empty() && (payload.back() == '\r' || payload.back() == '\n'))
                payload.pop_back();
            auto ev = json::parse(payload, nullptr, false);
            if (ev.is_discarded()) continue;

            const std::string type = ev.value("type", "");
            if (type == "transcript" && ev.contains("text")) {
                std::string t = ev["text"].get<std::string>();
                if (t.empty()) continue;
                if (cfg.partialTranscriptCallback) cfg.partialTranscriptCallback(t);
                if (cfg.transcriptCallback) cfg.transcriptCallback(t);
            } else if (type == "translation" && ev.contains("text")) {
                std::string t = ev["text"].get<std::string>();
                if (t.empty()) continue;
                if (cfg.translationCallback) cfg.translationCallback(t);
            } else if (type == "audio_b64") {
                if (ev.contains("data")) st.audioB64 = ev["data"].get<std::string>();
                if (ev.contains("processing_ms")) st.processingMs = ev["processing_ms"].get<int>();
            } else if (type == "error") {
                st.hadError = true;
                st.errorMsg = ev.value("message", "Server error");
            }
        }
    }

    void processPhrase(const std::vector<float> &pcm,
                       std::chrono::steady_clock::time_point phraseEnd) {
        if (!running.load()) return;

        std::vector<float> normalized = pcm;
        normalizePCM(normalized);

        std::vector<int16_t> pcm16(normalized.size());
        for (size_t i = 0; i < pcm.size(); i++) {
            float f = normalized[i];
            if (f > 1.0f) f = 1.0f;
            if (f < -1.0f) f = -1.0f;
            pcm16[i] = static_cast<int16_t>(f * 32767.0f);
        }

        /* Build minimal WAV header */
        uint32_t dataBytes = (uint32_t)(pcm16.size() * 2);
        std::string wav;
        wav.resize(44 + dataBytes);
        uint8_t *h = reinterpret_cast<uint8_t *>(wav.data());
        auto le32 = [](uint8_t *p, uint32_t v){ memcpy(p, &v, 4); };
        auto le16 = [](uint8_t *p, uint16_t v){ memcpy(p, &v, 2); };
        memcpy(h, "RIFF", 4); le32(h+4, 36+dataBytes); memcpy(h+8, "WAVE", 4);
        memcpy(h+12, "fmt ", 4); le32(h+16, 16); le16(h+20, 1);
        le16(h+22, 1); le32(h+24, 48000); le32(h+28, 96000); le16(h+32, 2); le16(h+34, 16);
        memcpy(h+36, "data", 4); le32(h+40, dataBytes);
        memcpy(h+44, pcm16.data(), dataBytes);

        /* POST to server */
        std::string srcLang, tgtLang, gender, glossary;
        { std::lock_guard<std::mutex> lk(langMutex);
          srcLang = sourceLang; tgtLang = targetLang; gender = voiceGender; glossary = glossaryJson; }

        httplib::MultipartFormDataItems form = {
            {"audio",         wav, "audio.wav", "audio/wav"},
            {"source_lang",   srcLang, "", ""},
            {"target_lang",   tgtLang, "", ""},
            {"voice_gender",  gender, "", ""},
            {"glossary",      glossary, "", ""},
        };

        httplib::Headers headers = {
            {"Authorization", "Bearer " + cfg.licenseKey}
        };

        SseParseState sse;

        const auto ep = parseServerUrl(cfg.serverUrl);
        httplib::Result streamRes;
        httplib::Result fallback;

        if (ep.ssl) {
            httplib::SSLClient cli(ep.host.c_str(), ep.port);
            cli.set_connection_timeout(5);
            cli.set_read_timeout(12);
            streamRes = cli.Post("/api/pipeline/stream", headers, form);
            if (!streamRes || streamRes->status != 200)
                fallback = cli.Post("/api/pipeline", headers, form);
        } else {
            httplib::Client cli(ep.host.c_str(), ep.port);
            cli.set_connection_timeout(5);
            cli.set_read_timeout(12);
            streamRes = cli.Post("/api/pipeline/stream", headers, form);
            if (!streamRes || streamRes->status != 200)
                fallback = cli.Post("/api/pipeline", headers, form);
        }

        if (streamRes && streamRes->status == 200) {
            feedSseChunk(sse, streamRes->body);
            feedSseChunk(sse, "");
        } else if (fallback && fallback->status == 200) {
            auto bodyJson = json::parse(fallback->body, nullptr, false);
            if (bodyJson.is_discarded()) { log("error", "Bad JSON response"); return; }
            if (bodyJson.contains("transcript") && cfg.transcriptCallback)
                cfg.transcriptCallback(bodyJson["transcript"].get<std::string>());
            if (bodyJson.contains("translation") && cfg.translationCallback)
                cfg.translationCallback(bodyJson["translation"].get<std::string>());
            if (!bodyJson.contains("audio_b64")) return;
            sse.audioB64 = bodyJson["audio_b64"].get<std::string>();
        } else {
            const int code = streamRes ? streamRes->status : (fallback ? fallback->status : 0);
            std::string body;
            if (streamRes) body = streamRes->body.substr(0, 200);
            else if (fallback) body = fallback->body.substr(0, 200);
            log("error", "Pipeline HTTP " + std::to_string(code) + " body=" + body);
            if (cfg.errorCallback) {
                std::string msg;
                if (code == 0)        msg = "Cannot reach API — check network or server";
                else if (code == 401) msg = "Unauthorized (401) — sign out and sign in again";
                else if (code == 403) {
                    auto errJson = json::parse(body, nullptr, false);
                    std::string detail;
                    if (!errJson.is_discarded()) {
                        if (errJson.contains("detail")) {
                            if (errJson["detail"].is_string())
                                detail = errJson["detail"].get<std::string>();
                            else if (errJson["detail"].is_object() && errJson["detail"].contains("reason"))
                                detail = errJson["detail"]["reason"].get<std::string>();
                        }
                    }
                    if (detail == "trial_session_exhausted")
                        msg = "minutes_exhausted";
                    else if (detail == "payment_pending")
                        msg = "License payment pending — complete checkout on voicebridgeapps.com";
                    else if (detail == "minutes_exhausted")
                        msg = "minutes_exhausted";
                    else if (!detail.empty())
                        msg = "License error: " + detail;
                    else
                        msg = "Trial expired or invalid license (403)";
                }
                else if (code == 422) msg = "Bad request (422) — " + body.substr(0, 80);
                else                  msg = "Server error (HTTP " + std::to_string(code) + ")";
                cfg.errorCallback(msg);
            }
            return;
        }

        if (sse.hadError) {
            if (cfg.errorCallback) cfg.errorCallback(sse.errorMsg);
            return;
        }
        if (sse.audioB64.empty()) {
            if (cfg.latencyCallback) {
                int ms = sse.processingMs;
                if (ms <= 0) {
                    ms = (int)std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::steady_clock::now() - phraseEnd).count();
                }
                cfg.latencyCallback(ms);
            }
            return;
        }

        std::string mp3 = base64Decode(sse.audioB64);

        int srcHz = 44100;
        auto pcmOut = decodeMp3(mp3, false, &srcHz);
        if (pcmOut.empty()) return;

        /* Resample TTS output (22050 or 44100Hz) → 48kHz driver rate.
         * ElevenLabs output is already well-normalized — skip normalizePCM to
         * avoid amplifying resampling artifacts and causing distortion. */
        auto pcm48 = resampleTo48k(pcmOut, srcHz);

        /* Stream TTS to virtual mic at 48 kHz real-time pace.
         * ttsPlaying stays true for full playback (mute-while-speaking). */
#ifdef __APPLE__
        streamPcmToVirtualMic(pcm48, ttsPlaying);
        /* Record TTS end time for echo cooldown in onPhrase */
        ttsEndMs.store(std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now().time_since_epoch()).count());
#endif

        if (cfg.latencyCallback) {
            int ms = sse.processingMs;
            if (ms <= 0) {
                ms = (int)std::chrono::duration_cast<std::chrono::milliseconds>(
                    std::chrono::steady_clock::now() - phraseEnd).count();
            }
            cfg.latencyCallback(ms);
        }
    }
};

/* ─────────────────── Public API ─────────────────────────── */

AudioPipeline::AudioPipeline(const PipelineConfig &config)
    : mImpl(new Impl(config)) {}

AudioPipeline::~AudioPipeline() { stop(); delete mImpl; }

int AudioPipeline::start()
{
    if (mImpl->running) return 0;

#ifdef __APPLE__
    if (vb_shm_open() != 0) {
        mImpl->log("warn",
            "Virtual mic driver not loaded — install VoiceBridgeAudio.driver and restart. "
            "Capture and translation will still run; Meet output needs the driver.");
    } else {
        vb_shm_reset();
    }
    /* Hand off SHM ownership: stop global keepalive so only pipeline writes */
    g_keepaliveRunning.store(false);
#endif

    PhraseConfig pc;
    pc.sampleRate        = mImpl->cfg.sampleRate;
    pc.minPhraseFrames   = (uint32_t)(0.200 * pc.sampleRate);  /* 200 ms minimum */
    pc.silenceFrames     = (uint32_t)(0.500 * pc.sampleRate);  /* 500 ms pause */
    pc.maxPhraseFrames   = (uint32_t)(5.0   * pc.sampleRate);  /* 5 s force-flush */
    pc.vadAggressiveness = 1;                                   /* 1 = more sensitive, catches more speech */
    mImpl->detector = new PhraseDetector(pc);
    mImpl->detector->setCallback([this](const float *pcm, uint32_t frames){
        mImpl->onPhrase(pcm, frames);
    });

    mImpl->log("info", "Opening input device index=" + std::to_string(mImpl->cfg.inputDeviceIndex)
        + " sampleRate=" + std::to_string((int)mImpl->cfg.sampleRate));
    mImpl->capture = vb_capture_create(
        mImpl->cfg.inputDeviceIndex,
        mImpl->cfg.sampleRate, 512);
    if (!mImpl->capture) {
        mImpl->log("error", "Failed to open input device");
        return -1;
    }

    mImpl->running = true;
    mImpl->workerThread  = std::thread(&Impl::workerLoop, mImpl);
    mImpl->workerThread2 = std::thread(&Impl::workerLoop, mImpl);
#ifdef __APPLE__
    mImpl->keepaliveThread = std::thread(&Impl::keepaliveLoop, mImpl);
#endif
    if (vb_capture_start(mImpl->capture, Impl::captureCallback, mImpl) != 0) {
        mImpl->running = false;
        if (mImpl->workerThread.joinable())  mImpl->workerThread.join();
        if (mImpl->workerThread2.joinable()) mImpl->workerThread2.join();
#ifdef __APPLE__
        if (mImpl->keepaliveThread.joinable()) mImpl->keepaliveThread.join();
#endif
        vb_capture_destroy(mImpl->capture);
        mImpl->capture = nullptr;
        delete mImpl->detector;
        mImpl->detector = nullptr;
        mImpl->log("error", "Failed to start microphone stream");
        return -2;
    }
    return 0;
}

void AudioPipeline::stop()
{
    if (!mImpl->running.exchange(false)) return;

    // Stop mic capture first so no new audio enters the queue
    if (mImpl->capture) {
        vb_capture_stop(mImpl->capture);
        vb_capture_destroy(mImpl->capture);
        mImpl->capture = nullptr;
    }
    if (mImpl->detector) { delete mImpl->detector; mImpl->detector = nullptr; }

    // Drain queue and wake workers so they exit
    {
        std::lock_guard<std::mutex> lk(mImpl->workMutex);
        while (!mImpl->workQueue.empty()) mImpl->workQueue.pop();
    }
    mImpl->workCV.notify_all();

    // Join with timeout — workers check running flag and exit quickly
    if (mImpl->workerThread.joinable())  mImpl->workerThread.join();
    if (mImpl->workerThread2.joinable()) mImpl->workerThread2.join();
#ifdef __APPLE__
    if (mImpl->keepaliveThread.joinable()) mImpl->keepaliveThread.join();
    /* Resume global keepalive so Zoom/Meet still see an active mic after pipeline stops */
    if (vb_shm_is_ready() && !g_keepaliveRunning.exchange(true)) {
        g_keepaliveThread = std::thread(globalKeepaliveLoop);
        g_keepaliveThread.detach();
    }
    /* Don't close SHM — global keepalive still needs it */
#endif
}

bool AudioPipeline::isRunning() const { return mImpl->running; }

void AudioPipeline::setLanguages(const std::string &src, const std::string &tgt)
{
    std::lock_guard<std::mutex> lk(mImpl->langMutex);
    mImpl->sourceLang = src;
    mImpl->targetLang = tgt;
}

void AudioPipeline::setVoiceGender(const std::string &gender)
{
    std::lock_guard<std::mutex> lk(mImpl->langMutex);
    mImpl->voiceGender = gender;
}

void AudioPipeline::muteInput()   { mImpl->inputMuted.store(true);  }
void AudioPipeline::unmuteInput() { mImpl->inputMuted.store(false); }

/* ── Global SHM keepalive (runs from app start, independent of pipeline) ── */
#ifdef __APPLE__
/* g_keepaliveRunning, g_keepaliveThread, g_ttsActive declared at top of file */

static void globalKeepaliveLoop()
{
    static const uint32_t kFrames = 512u;
    /* -60 dBFS dithered tone — below hearing threshold, keeps mic "active" in Zoom/Meet */
    static const float kAmp = 0.001f;
    float buf[kFrames];
    for (uint32_t i = 0; i < kFrames; ++i)
        buf[i] = kAmp * ((i % 2 == 0) ? 1.0f : -1.0f) * (0.5f + 0.5f * ((float)(i % 7) / 6.0f));

    const auto kInterval = std::chrono::microseconds(10667); /* 512/48000 s */
    while (g_keepaliveRunning.load()) {
        /* Pause while TTS or pipeline keepalive is writing to avoid interleave */
        if (!g_ttsActive.load()) {
            vb_shm_write(buf, kFrames);
        }
        std::this_thread::sleep_for(kInterval);
    }
}
#endif

int openVirtualMicShm()
{
#ifdef __APPLE__
    int rc = vb_shm_open();
    if (rc == 0 && !g_keepaliveRunning.exchange(true)) {
        vb_shm_reset();
        g_keepaliveThread = std::thread(globalKeepaliveLoop);
        g_keepaliveThread.detach(); /* runs until process exits */
    }
    return rc;
#else
    return -1;
#endif
}

int playMp3ToVirtualMic(const uint8_t *data, size_t len)
{
    if (!data || len == 0) return 0;
#ifdef __APPLE__
    static bool shmReady = false;
    if (!shmReady) {
        if (vb_shm_open() != 0) return -1;
        shmReady = true;
    }
    std::string mp3(reinterpret_cast<const char *>(data), len);
    int srcHz2 = 44100;
    auto pcmOut = decodeMp3(mp3, false, &srcHz2);
    if (pcmOut.empty()) return 0;
    auto pcm48 = resampleTo48k(pcmOut, srcHz2);
    normalizePCM(pcm48);
    static std::atomic<bool> playGate{false};
    streamPcmToVirtualMic(pcm48, playGate);
    return (int)pcm48.size();
#else
    (void)data;
    (void)len;
    return -1;
#endif
}
