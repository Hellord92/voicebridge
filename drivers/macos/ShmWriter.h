/**
 * VoiceBridge Shared Memory Writer
 * Use this from the Electron app (via native addon) to push PCM samples
 * into the ring buffer that the CoreAudio driver reads.
 */
#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Open / create the shared memory segment.
 * Call once at app startup. Returns 0 on success, -1 on error.
 */
int vb_shm_open(void);

/**
 * Write float32 PCM samples (mono, 48 kHz).
 * Returns number of frames actually written (may be less if buffer full).
 */
uint32_t vb_shm_write(const float *samples, uint32_t frameCount);

/** Close and unmap shared memory. */
void vb_shm_close(void);

#ifdef __cplusplus
}
#endif
