#pragma once
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Voice Activity Detector — thin wrapper around libfvad (WebRTC VAD).
 * Input:  float32 mono frames @ 16 kHz (resampled from 48 kHz if needed)
 * Output: bool — true if speech detected
 *
 * Aggressiveness: 0 (lenient) … 3 (aggressive noise filtering)
 */

typedef struct VBVAD VBVAD;

VBVAD *vb_vad_create(int aggressiveness);   /* 0-3 */
void   vb_vad_destroy(VBVAD *vad);

/**
 * Process a frame of mono float32 audio at 16 kHz.
 * frameSamples must be exactly 160, 320, or 480 (10/20/30 ms at 16 kHz).
 * Returns 1=speech, 0=silence, -1=error.
 */
int vb_vad_process(VBVAD *vad, const float *samples, uint32_t frameSamples);

/**
 * Downsample float32 audio from 48 kHz to 16 kHz (3:1 decimation).
 * outFrames must be at least inFrames/3 in size.
 */
void vb_resample_48to16(const float *in, float *out, uint32_t inFrames);

#ifdef __cplusplus
}
#endif
