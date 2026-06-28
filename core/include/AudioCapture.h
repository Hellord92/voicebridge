#pragma once
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * AudioCapture — captures audio from a selected input device using PortAudio.
 * Delivers PCM float32 mono frames via a callback.
 */

typedef void (*VBAudioCaptureCallback)(const float *frames, uint32_t frameCount, void *userData);

typedef struct VBAudioCapture VBAudioCapture;

/** Create a capture instance for the given device index (-1 = default). */
VBAudioCapture *vb_capture_create(int deviceIndex, double sampleRate, uint32_t framesPerBuffer);

/** Start capturing audio. Callback is called from PortAudio IO thread. */
int vb_capture_start(VBAudioCapture *cap, VBAudioCaptureCallback cb, void *userData);

/** Stop and destroy. */
void vb_capture_stop(VBAudioCapture *cap);
void vb_capture_destroy(VBAudioCapture *cap);

/** List available input devices; returns count. Fill outNames[maxCount]. */
int vb_capture_list_devices(char outNames[][128], int maxCount);

#ifdef __cplusplus
}
#endif
