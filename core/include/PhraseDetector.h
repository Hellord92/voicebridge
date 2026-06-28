#pragma once
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
#include <functional>
#include <string>

/**
 * PhraseDetector — accumulates audio frames and fires a callback when a
 * complete utterance (phrase) has been captured.
 *
 * Logic:
 *   - Collect frames while speech is detected (VAD=1)
 *   - After VAD goes silent for SILENCE_FRAMES, consider phrase complete
 *   - Fire onPhrase callback with the accumulated float32 PCM @ 48 kHz
 *   - Maximum phrase duration: MAX_PHRASE_SECS (to prevent memory bloat)
 */

struct PhraseConfig {
    double   sampleRate      = 48000.0;
    uint32_t silenceFrames   = 14400;    /* 300 ms at 48 kHz */
    uint32_t minPhraseFrames = 9600;     /* 200 ms minimum */
    uint32_t maxPhraseFrames = 576000;   /* 12 seconds maximum */
    int      vadAggressiveness = 2;
};

class PhraseDetector {
public:
    using PhraseCallback = std::function<void(const float *pcm, uint32_t frames)>;

    explicit PhraseDetector(const PhraseConfig &config = {});
    ~PhraseDetector();

    void setCallback(PhraseCallback cb) { mCallback = cb; }

    /**
     * Feed raw captured audio frames (float32, mono, 48 kHz).
     * Must be called continuously from the audio capture callback.
     */
    void push(const float *frames, uint32_t count);

    void reset();

private:
    void flushPhrase();

    PhraseConfig    mConfig;
    PhraseCallback  mCallback;

    struct VBVADHandle;
    VBVADHandle    *mVad = nullptr;

    std::vector<float> mBuffer;      /* accumulated audio (48 kHz) */
    std::vector<float> mVadBuf;      /* resampled to 16 kHz for VAD */
    uint32_t mSilenceCounter = 0;
    bool     mInSpeech       = false;
};

#endif /* __cplusplus */
