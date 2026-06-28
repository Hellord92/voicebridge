#pragma once
#include <string>
#include <vector>
#include <functional>
#include <cstdint>

/**
 * AudioPipeline — orchestrates the full translation pipeline:
 *
 *   Mic capture → PhraseDetector → HTTP POST to VoiceBridge server
 *   → MP3 response → decode → write to virtual mic shared memory
 *
 * All calls are thread-safe. Start / stop from the main thread.
 */
struct PipelineConfig {
    int    inputDeviceIndex = -1;    /* -1 = system default */
    double sampleRate       = 48000.0;

    std::string serverUrl;           /* e.g. "https://api.voicebridge.app" */
    std::string licenseKey;
    std::string sourceLang = "auto"; /* "tr", "fr", "de" … */
    std::string targetLang = "en";

    bool   monitorEnabled  = false;  /* play TTS through speaker too */
    int    outputDeviceIndex = -1;

    std::function<void(const std::string &level, const std::string &msg)> logCallback;
    std::function<void(const std::string &transcript)> transcriptCallback;
    std::function<void(const std::string &translation)> translationCallback;
    std::function<void(const std::string &errMsg)>      errorCallback;
};

class AudioPipeline {
public:
    explicit AudioPipeline(const PipelineConfig &config);
    ~AudioPipeline();

    /** Start mic capture and translation pipeline. */
    int start();

    /** Stop gracefully. Waits for any in-flight request. */
    void stop();

    bool isRunning() const;

    /** Update language pair on the fly (takes effect on next phrase). */
    void setLanguages(const std::string &src, const std::string &tgt);

private:
    struct Impl;
    Impl *mImpl;
};
