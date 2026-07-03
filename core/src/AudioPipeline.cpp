#include "../include/AudioPipeline.h"
#include "../include/AudioCapture.h"
#include "../include/PhraseDetector.h"

/* minimp3 — define implementation in exactly one TU */
#define MINIMP3_IMPLEMENTATION
#include <minimp3.h>

#ifdef __APPLE__
#include "../../drivers/macos/ShmWriter.h"
#endif

#define CPPHTTPLIB_OPENSSL_SUPPORT
#include <httplib.h>
#include <nlohmann/json.hpp>

#include <atomic>
#include <mutex>
#include <thread>
#include <condition_variable>
#include <queue>
#include <memory>
#include <cstring>
#include <iostream>

using json = nlohmann::json;

/* ─────────────────── MP3 decoder helper ─────────────────── */
static std::vector<float> decodeMp3(const std::string &mp3Bytes)
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
        for (int i = 0; i < samples; i++)
            out.push_back((float)pcm[i] / 32768.0f);
    }
    return out;
}

/* ─────────────────── Impl ─────────────────────────────────── */
struct AudioPipeline::Impl {
    PipelineConfig   cfg;
    VBAudioCapture  *capture    = nullptr;
    PhraseDetector  *detector   = nullptr;
    std::atomic<bool> running   {false};
    std::mutex        langMutex;
    std::string       sourceLang;
    std::string       targetLang;
    std::string       voiceGender;

    /* Work queue for async HTTP requests */
    struct WorkItem { std::vector<float> pcm; };
    std::queue<WorkItem>      workQueue;
    std::mutex                workMutex;
    std::condition_variable   workCV;
    std::thread               workerThread;

    explicit Impl(const PipelineConfig &c)
        : cfg(c), sourceLang(c.sourceLang), targetLang(c.targetLang), voiceGender(c.voiceGender) {}

    void log(const std::string &lvl, const std::string &msg) {
        if (cfg.logCallback) cfg.logCallback(lvl, msg);
        else std::cerr << "[" << lvl << "] " << msg << "\n";
    }

    /* Called on PortAudio IO thread — just queue audio */
    static void captureCallback(const float *frames, uint32_t count, void *ud) {
        auto *self = static_cast<Impl *>(ud);
        self->detector->push(frames, count);
    }

    /* Called from PhraseDetector when a phrase is ready */
    void onPhrase(const float *pcm, uint32_t frames) {
        std::vector<float> copy(pcm, pcm + frames);
        {
            std::lock_guard<std::mutex> lk(workMutex);
            workQueue.push({std::move(copy)});
        }
        workCV.notify_one();
    }

    /* Worker thread: send phrase to server, receive MP3, write to virtual mic */
    void workerLoop() {
        while (running) {
            std::unique_lock<std::mutex> lk(workMutex);
            workCV.wait(lk, [this]{ return !workQueue.empty() || !running; });
            if (!running) break;

            auto item = std::move(workQueue.front());
            workQueue.pop();
            lk.unlock();

            processPhrase(item.pcm);
        }
    }

    void processPhrase(const std::vector<float> &pcm) {
        /* Convert float32 PCM to 16-bit WAV bytes for upload */
        std::vector<int16_t> pcm16(pcm.size());
        for (size_t i = 0; i < pcm.size(); i++) {
            float f = pcm[i];
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
        std::string srcLang, tgtLang, gender;
        { std::lock_guard<std::mutex> lk(langMutex); srcLang = sourceLang; tgtLang = targetLang; gender = voiceGender; }

        httplib::SSLClient cli(cfg.serverUrl.c_str(), 443);
        cli.set_connection_timeout(10);
        cli.set_read_timeout(30);

        httplib::MultipartFormDataItems form = {
            {"audio",         wav, "audio.wav", "audio/wav"},
            {"source_lang",   srcLang, "", ""},
            {"target_lang",   tgtLang, "", ""},
            {"voice_gender",  gender, "", ""},
        };

        httplib::Headers headers = {
            {"Authorization", "Bearer " + cfg.licenseKey}
        };

        auto res = cli.Post("/api/pipeline", headers, form);
        if (!res || res->status != 200) {
            log("error", "Pipeline HTTP " + std::to_string(res ? res->status : 0));
            if (cfg.errorCallback) cfg.errorCallback("Server error");
            return;
        }

        /* Parse JSON envelope */
        auto body = json::parse(res->body, nullptr, false);
        if (body.is_discarded()) { log("error", "Bad JSON response"); return; }

        if (body.contains("transcript") && cfg.transcriptCallback)
            cfg.transcriptCallback(body["transcript"].get<std::string>());
        if (body.contains("translation") && cfg.translationCallback)
            cfg.translationCallback(body["translation"].get<std::string>());

        /* Decode MP3 audio (base64-encoded in JSON) */
        if (!body.contains("audio_b64")) return;
        std::string b64 = body["audio_b64"].get<std::string>();
        std::string mp3 = base64Decode(b64);
        auto pcmOut = decodeMp3(mp3);
        if (pcmOut.empty()) return;

        /* Write to virtual mic */
#ifdef __APPLE__
        vb_shm_write(pcmOut.data(), (uint32_t)pcmOut.size());
#endif
        /* TODO Windows: write to named pipe → VB-Audio Cable */
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
        mImpl->log("error", "Failed to open shared memory — is the virtual mic driver installed?");
        return -1;
    }
#endif

    PhraseConfig pc;
    pc.sampleRate = mImpl->cfg.sampleRate;
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
    mImpl->workerThread = std::thread(&Impl::workerLoop, mImpl);
    return vb_capture_start(mImpl->capture, Impl::captureCallback, mImpl);
}

void AudioPipeline::stop()
{
    if (!mImpl->running) return;
    mImpl->running = false;
    mImpl->workCV.notify_all();
    if (mImpl->workerThread.joinable()) mImpl->workerThread.join();
    if (mImpl->capture)  { vb_capture_stop(mImpl->capture); vb_capture_destroy(mImpl->capture); mImpl->capture = nullptr; }
    if (mImpl->detector) { delete mImpl->detector; mImpl->detector = nullptr; }
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
