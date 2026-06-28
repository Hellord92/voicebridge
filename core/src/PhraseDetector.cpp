#include "../include/PhraseDetector.h"
#include "../include/VAD.h"
#include <vector>
#include <cstring>

struct PhraseDetector::VBVADHandle {
    VBVAD *vad;
};

PhraseDetector::PhraseDetector(const PhraseConfig &config)
    : mConfig(config)
{
    mVad = new VBVADHandle{vb_vad_create(config.vadAggressiveness)};
    mBuffer.reserve(config.maxPhraseFrames);
    /* VAD processes 480 samples at 16 kHz = 1440 samples at 48 kHz */
    mVadBuf.resize(480);
}

PhraseDetector::~PhraseDetector()
{
    if (mVad) { vb_vad_destroy(mVad->vad); delete mVad; }
}

void PhraseDetector::push(const float *frames, uint32_t count)
{
    /* Process in VAD chunks of 1440 frames @ 48 kHz (= 480 @ 16 kHz = 30 ms) */
    const uint32_t VAD_CHUNK = 1440;
    uint32_t pos = 0;

    while (pos < count) {
        uint32_t chunk = count - pos;
        if (chunk > VAD_CHUNK) chunk = VAD_CHUNK;

        /* Accumulate audio */
        mBuffer.insert(mBuffer.end(), frames + pos, frames + pos + chunk);

        /* Run VAD on the chunk (resample 48→16 kHz) */
        uint32_t vadFrames = chunk / 3;
        if (vadFrames >= 480) {
            vb_resample_48to16(frames + pos, mVadBuf.data(), chunk);
            int speech = vb_vad_process(mVad->vad, mVadBuf.data(), 480);

            if (speech == 1) {
                mInSpeech       = true;
                mSilenceCounter = 0;
            } else if (mInSpeech) {
                mSilenceCounter += chunk;
                if (mSilenceCounter >= mConfig.silenceFrames) {
                    flushPhrase();
                }
            }
        }

        /* Force flush on max duration */
        if (mBuffer.size() >= mConfig.maxPhraseFrames) {
            flushPhrase();
        }

        pos += chunk;
    }
}

void PhraseDetector::flushPhrase()
{
    if (mBuffer.size() >= mConfig.minPhraseFrames && mCallback) {
        mCallback(mBuffer.data(), (uint32_t)mBuffer.size());
    }
    reset();
}

void PhraseDetector::reset()
{
    mBuffer.clear();
    mSilenceCounter = 0;
    mInSpeech       = false;
}
