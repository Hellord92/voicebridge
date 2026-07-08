#include <napi.h>
#include "../include/AudioPipeline.h"
#include "../include/AudioCapture.h"
#include <memory>
#include <thread>
#include <vector>
#include <cstring>
#include <cstdint>
#include <atomic>

static std::unique_ptr<AudioPipeline> gPipeline;

/* ── Raw audio stream (for Realtime API) ───────────────────────────────────── */
static VBAudioCapture          *gRawCapture    = nullptr;
static Napi::ThreadSafeFunction gRawTsfn;
static std::atomic<bool>        gRawRunning    {false};
static std::atomic<bool>        gRawTsfnInit   {false}; /* guards Release() calls */

/* Accumulate ~100ms of audio (48kHz × 0.1s = 4800 frames) */
static std::vector<float>       gRawAccum;
static const uint32_t           RAW_CHUNK_FRAMES = 4800; /* 100ms @ 48kHz */

/** Resample float32 mono 48kHz → PCM16 mono 24kHz (simple decimation ×2) */
static std::vector<int16_t> resampleTo24kPCM16(const float *src, uint32_t frames48)
{
    uint32_t out_frames = frames48 / 2;
    std::vector<int16_t> out(out_frames);
    for (uint32_t i = 0; i < out_frames; i++) {
        /* Average adjacent pairs for anti-aliasing */
        float s = (src[i * 2] + src[i * 2 + 1]) * 0.5f;
        if (s >  1.0f) s =  1.0f;
        if (s < -1.0f) s = -1.0f;
        out[i] = (int16_t)(s * 32767.0f);
    }
    return out;
}

static void rawCaptureCallback(const float *frames, uint32_t count, void * /*ud*/)
{
    if (!gRawRunning.load()) return;
    gRawAccum.insert(gRawAccum.end(), frames, frames + count);
    if (gRawAccum.size() < RAW_CHUNK_FRAMES) return;

    /* Have ~100ms — resample and send to JS */
    auto pcm16 = resampleTo24kPCM16(gRawAccum.data(), RAW_CHUNK_FRAMES);
    gRawAccum.erase(gRawAccum.begin(), gRawAccum.begin() + RAW_CHUNK_FRAMES);

    /* Copy to heap for async delivery */
    auto *heap = new std::vector<int16_t>(std::move(pcm16));
    gRawTsfn.NonBlockingCall(heap, [](Napi::Env env, Napi::Function cb, std::vector<int16_t> *data) {
        /* Wrap PCM16 bytes as a Node Buffer */
        size_t bytes = data->size() * sizeof(int16_t);
        auto buf = Napi::Buffer<uint8_t>::Copy(env,
            reinterpret_cast<const uint8_t *>(data->data()), bytes);
        delete data;
        cb.Call({buf});
    });
}

Napi::Value StartRawStream(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (gRawRunning.load())
        return Napi::Boolean::New(env, false);

    if (info.Length() < 1 || !info[0].IsObject())
        return Napi::Boolean::New(env, false);

    auto opts = info[0].As<Napi::Object>();
    int deviceIndex = -1;
    if (opts.Has("inputDeviceIndex"))
        deviceIndex = opts.Get("inputDeviceIndex").As<Napi::Number>().Int32Value();

    if (!opts.Has("onAudio") || !opts.Get("onAudio").IsFunction())
        return Napi::Boolean::New(env, false);

    auto fn = opts.Get("onAudio").As<Napi::Function>();
    gRawTsfn = Napi::ThreadSafeFunction::New(env, fn, "rawAudio", 0, 1);
    gRawTsfnInit.store(true);
    gRawAccum.clear();
    gRawAccum.reserve(RAW_CHUNK_FRAMES * 2);
    gRawRunning.store(true);

    gRawCapture = vb_capture_create(deviceIndex, 48000.0, 1440);
    if (!gRawCapture) {
        gRawRunning.store(false);
        gRawTsfn.Release();
        return Napi::Boolean::New(env, false);
    }
    if (vb_capture_start(gRawCapture, rawCaptureCallback, nullptr) != 0) {
        vb_capture_destroy(gRawCapture);
        gRawCapture = nullptr;
        gRawRunning.store(false);
        gRawTsfn.Release();
        return Napi::Boolean::New(env, false);
    }
    return Napi::Boolean::New(env, true);
}

Napi::Value StopRawStream(const Napi::CallbackInfo &info)
{
    gRawRunning.store(false);
    if (gRawCapture) {
        vb_capture_stop(gRawCapture);
        vb_capture_destroy(gRawCapture);
        gRawCapture = nullptr;
    }
    gRawAccum.clear();
    /* Only release TSFN if it was actually initialized — prevents crash on
     * StopRawStream calls when Realtime mode was never started. */
    if (gRawTsfnInit.exchange(false)) {
        gRawTsfn.Release();
    }
    return info.Env().Undefined();
}

Napi::Value StartPipeline(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject())
        Napi::TypeError::New(env, "Object expected").ThrowAsJavaScriptException();

    auto opts = info[0].As<Napi::Object>();
    PipelineConfig cfg;
    if (opts.Has("inputDeviceIndex")) cfg.inputDeviceIndex = opts.Get("inputDeviceIndex").As<Napi::Number>().Int32Value();
    if (opts.Has("serverUrl"))   cfg.serverUrl   = opts.Get("serverUrl").As<Napi::String>().Utf8Value();
    if (opts.Has("licenseKey"))  cfg.licenseKey  = opts.Get("licenseKey").As<Napi::String>().Utf8Value();
    if (opts.Has("sourceLang"))  cfg.sourceLang  = opts.Get("sourceLang").As<Napi::String>().Utf8Value();
    if (opts.Has("targetLang"))  cfg.targetLang  = opts.Get("targetLang").As<Napi::String>().Utf8Value();
    if (opts.Has("voiceGender")) cfg.voiceGender = opts.Get("voiceGender").As<Napi::String>().Utf8Value();
    if (opts.Has("glossaryJson")) cfg.glossaryJson = opts.Get("glossaryJson").As<Napi::String>().Utf8Value();

    /* JS callbacks */
    if (opts.Has("onTranscript")) {
        auto fn = opts.Get("onTranscript").As<Napi::Function>();
        auto tsfn = Napi::ThreadSafeFunction::New(env, fn, "transcript", 0, 1);
        cfg.transcriptCallback = [tsfn](const std::string &t) mutable {
            tsfn.NonBlockingCall([t](Napi::Env e, Napi::Function cb){ cb.Call({Napi::String::New(e, t)}); });
        };
    }
    if (opts.Has("onPartialTranscript")) {
        auto fn = opts.Get("onPartialTranscript").As<Napi::Function>();
        auto tsfn = Napi::ThreadSafeFunction::New(env, fn, "partialTranscript", 0, 1);
        cfg.partialTranscriptCallback = [tsfn](const std::string &t) mutable {
            tsfn.NonBlockingCall([t](Napi::Env e, Napi::Function cb){ cb.Call({Napi::String::New(e, t)}); });
        };
    }
    if (opts.Has("onTranslation")) {
        auto fn = opts.Get("onTranslation").As<Napi::Function>();
        auto tsfn = Napi::ThreadSafeFunction::New(env, fn, "translation", 0, 1);
        cfg.translationCallback = [tsfn](const std::string &t) mutable {
            tsfn.NonBlockingCall([t](Napi::Env e, Napi::Function cb){ cb.Call({Napi::String::New(e, t)}); });
        };
    }
    if (opts.Has("onError")) {
        auto fn = opts.Get("onError").As<Napi::Function>();
        auto tsfn = Napi::ThreadSafeFunction::New(env, fn, "error", 0, 1);
        cfg.errorCallback = [tsfn](const std::string &m) mutable {
            tsfn.NonBlockingCall([m](Napi::Env e, Napi::Function cb){ cb.Call({Napi::String::New(e, m)}); });
        };
    }

    if (opts.Has("onLatency")) {
        auto fn = opts.Get("onLatency").As<Napi::Function>();
        auto tsfn = Napi::ThreadSafeFunction::New(env, fn, "latency", 0, 1);
        cfg.latencyCallback = [tsfn](int ms) mutable {
            tsfn.NonBlockingCall([ms](Napi::Env e, Napi::Function cb){ cb.Call({Napi::Number::New(e, ms)}); });
        };
    }

    gPipeline = std::make_unique<AudioPipeline>(cfg);
    int rc = gPipeline->start();
    return Napi::Number::New(env, rc);
}

Napi::Value StopPipeline(const Napi::CallbackInfo &info)
{
    if (gPipeline) {
        gPipeline->stop();
        gPipeline.reset();
    }
    return info.Env().Undefined();
}

Napi::Value SetLanguages(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 2) return env.Undefined();
    std::string src = info[0].As<Napi::String>().Utf8Value();
    std::string tgt = info[1].As<Napi::String>().Utf8Value();
    if (gPipeline) gPipeline->setLanguages(src, tgt);
    return env.Undefined();
}

Napi::Value SetVoiceGender(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1) return env.Undefined();
    std::string gender = info[0].As<Napi::String>().Utf8Value();
    if (gPipeline) gPipeline->setVoiceGender(gender);
    return env.Undefined();
}

Napi::Value MuteInput(const Napi::CallbackInfo &info)
{
    if (gPipeline) gPipeline->muteInput();
    return info.Env().Undefined();
}

Napi::Value UnmuteInput(const Napi::CallbackInfo &info)
{
    if (gPipeline) gPipeline->unmuteInput();
    return info.Env().Undefined();
}

static Napi::Array DeviceInfosToArray(Napi::Env env, VBDeviceInfo devs[], int count)
{
    auto arr = Napi::Array::New(env, (size_t)count);
    for (int i = 0; i < count; i++) {
        auto obj = Napi::Object::New(env);
        obj.Set("index", Napi::Number::New(env, devs[i].paIndex));
        obj.Set("name",  Napi::String::New(env, devs[i].name));
        arr.Set((uint32_t)i, obj);
    }
    return arr;
}

Napi::Value ListInputDevices(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    VBDeviceInfo devs[64] = {};
    int count = vb_capture_list_devices(devs, 64);
    return DeviceInfosToArray(env, devs, count);
}

Napi::Value RefreshDevices(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    VBDeviceInfo devs[64] = {};
    int count = vb_capture_refresh_devices(devs, 64);
    if (count < 0) {
        Napi::Error::New(env, "PortAudio refresh failed").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    return DeviceInfosToArray(env, devs, count);
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("startPipeline",    Napi::Function::New(env, StartPipeline));
    exports.Set("stopPipeline",     Napi::Function::New(env, StopPipeline));
    exports.Set("setLanguages",     Napi::Function::New(env, SetLanguages));
    exports.Set("setVoiceGender",   Napi::Function::New(env, SetVoiceGender));
    exports.Set("muteInput",        Napi::Function::New(env, MuteInput));
    exports.Set("unmuteInput",      Napi::Function::New(env, UnmuteInput));
    exports.Set("startRawStream",   Napi::Function::New(env, StartRawStream));
    exports.Set("stopRawStream",    Napi::Function::New(env, StopRawStream));
    exports.Set("listInputDevices", Napi::Function::New(env, ListInputDevices));
    exports.Set("refreshDevices",   Napi::Function::New(env, RefreshDevices));
    return exports;
}

NODE_API_MODULE(voicebridge_core, Init)
