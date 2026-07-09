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
static std::vector<float> resample441to48(const std::vector<float> &in)
{
    if (in.empty()) return {};
    const double ratio = 48000.0 / 44100.0;
    size_t outLen = (size_t)(in.size() * ratio);
    std::vector<float> out(outLen);
    for (size_t i = 0; i < outLen; i++) {
        double src = i / ratio;
        size_t idx = (size_t)src;
        double frac = src - idx;
        float a = in[std::min(idx, in.size() - 1)];
        float b = in[std::min(idx + 1, in.size() - 1)];
        out[i] = (float)(a * (1.0 - frac) + b * frac);
    }
    return out;
}

static std::vector<float> decodeMp3(const std::string &mp3Bytes, bool streamToShm = false)
{
    mp3dec_t dec;
    mp3dec_init(&dec);
    std::vector<float> out;

    const uint8_t *data = reinterpret_cast<const uint8_t *>(mp3Bytes.data());
    size_t         size = mp3Bytes.size();
    size_t         pos  = 0;

    while (pos < size) {
        mp3dec_frame_info_t info;
        mp3d_sample_t       pcm[MINIMP3_MAX_SAMPLES_PER_FRAME];
        int samples = mp3dec_decode_frame(&dec, data + pos, (int)(size - pos), pcm, &info);
        if (info.frame_bytes == 0) break;
        pos += (size_t)info.frame_bytes;

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
    return out;
}

/* ─────────────────── Impl ─────────────────────────────────── */
struct AudioPipeline::Impl {
    PipelineConfig   cfg;
    VBAudioCapture  *capture    = nullptr;
    PhraseDetector  *detector   = nullptr;
    std::atomic<bool> running         {false};
    std::atomic<bool> ttsPlaying      {false}; /* mute-while-speaking gate */
    std::atomic<bool> inputMuted      {false}; /* push-to-talk gate */
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
        std::vector<float> copy(pcm, pcm + frames);

        /* Energy gate: skip silence/noise before normalization amplifies it.
         * Raw RMS < 0.012 = very quiet, likely background/BT noise, not speech.
         * Bluetooth mics produce ~0.005-0.010 background noise, real speech > 0.015. */
        float rawRms = computeRMS(copy);
        if (rawRms < 0.012f) {
            log("debug", "Skipped low-energy phrase (RMS=" + std::to_string(rawRms) + ")");
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
            cli.set_connection_timeout(15);
            cli.set_read_timeout(90);
            streamRes = cli.Post("/api/pipeline/stream", headers, form);
            if (!streamRes || streamRes->status != 200)
                fallback = cli.Post("/api/pipeline", headers, form);
        } else {
            httplib::Client cli(ep.host.c_str(), ep.port);
            cli.set_connection_timeout(15);
            cli.set_read_timeout(90);
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
                else if (code == 401) msg = "Unauthorized (401) — license key missing";
                else if (code == 403) msg = "Trial expired or invalid license (403)";
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

        /* Stream-decode MP3 frames directly to virtual mic for lower TTFB */
        auto pcmOut = decodeMp3(mp3, true);
        if (pcmOut.empty()) return;

        /* Resample 44.1kHz TTS → 48kHz driver rate */
        auto pcm48 = resample441to48(pcmOut);
        normalizePCM(pcm48);

        /* Write TTS audio to virtual mic ring buffer.
         * Gate closes only for the duration of the write (~1ms), not playback.
         * TTS goes to Google Meet's virtual mic — not the user's speakers —
         * so there is no acoustic echo loop to worry about. */
        ttsPlaying.store(true);
#ifdef __APPLE__
        vb_shm_write(pcm48.data(), (uint32_t)pcm48.size());
#endif
        ttsPlaying.store(false);

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
    }
#endif

    PhraseConfig pc;
    pc.sampleRate        = mImpl->cfg.sampleRate;
    pc.minPhraseFrames   = (uint32_t)(0.300 * pc.sampleRate);  /* 300 ms minimum */
    pc.silenceFrames     = (uint32_t)(0.600 * pc.sampleRate);  /* 600 ms pause — tolerates reading pace */
    pc.maxPhraseFrames   = (uint32_t)(5.0   * pc.sampleRate);  /* 5 s force-flush */
    pc.vadAggressiveness = 2;                                   /* 2 = balanced */
    mImpl->detector = new PhraseDetector(pc);
    mImpl->detector->setCallback([this](const float *pcm, uint32_t frames){
        mImpl->onPhrase(pcm, frames);
    });

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
    if (vb_capture_start(mImpl->capture, Impl::captureCallback, mImpl) != 0) {
        mImpl->running = false;
        if (mImpl->workerThread.joinable())  mImpl->workerThread.join();
        if (mImpl->workerThread2.joinable()) mImpl->workerThread2.join();
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
    vb_shm_close();
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
