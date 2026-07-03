#include <napi.h>
#include "../include/AudioPipeline.h"
#include "../include/AudioCapture.h"
#include <memory>

static std::unique_ptr<AudioPipeline> gPipeline;

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

    /* JS callbacks */
    if (opts.Has("onTranscript")) {
        auto fn = opts.Get("onTranscript").As<Napi::Function>();
        auto tsfn = Napi::ThreadSafeFunction::New(env, fn, "transcript", 0, 1);
        cfg.transcriptCallback = [tsfn](const std::string &t) mutable {
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

    gPipeline = std::make_unique<AudioPipeline>(cfg);
    int rc = gPipeline->start();
    return Napi::Number::New(env, rc);
}

Napi::Value StopPipeline(const Napi::CallbackInfo &info)
{
    if (gPipeline) gPipeline->stop();
    gPipeline.reset();
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

Napi::Value ListInputDevices(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    char names[64][128] = {};
    int count = vb_capture_list_devices(names, 64);
    auto arr = Napi::Array::New(env, (size_t)count);
    for (int i = 0; i < count; i++)
        arr.Set((uint32_t)i, Napi::String::New(env, names[i]));
    return arr;
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("startPipeline",   Napi::Function::New(env, StartPipeline));
    exports.Set("stopPipeline",    Napi::Function::New(env, StopPipeline));
    exports.Set("setLanguages",    Napi::Function::New(env, SetLanguages));
    exports.Set("setVoiceGender",  Napi::Function::New(env, SetVoiceGender));
    exports.Set("listInputDevices",Napi::Function::New(env, ListInputDevices));
    return exports;
}

NODE_API_MODULE(voicebridge_core, Init)
