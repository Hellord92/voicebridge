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

/** Device descriptor returned by list/refresh functions. */
typedef struct {
    int  paIndex;      /* real PortAudio device index, pass to vb_capture_create() */
    char name[128];
} VBDeviceInfo;

/** List available input devices; returns count. */
int vb_capture_list_devices(VBDeviceInfo outDevices[], int maxCount);

/**
 * Refresh PortAudio device list (Pa_Terminate + Pa_Initialize).
 * Call when new hardware is connected. Safe to call while no stream is open.
 * Returns updated device count, or -1 on error.
 */
int vb_capture_refresh_devices(VBDeviceInfo outDevices[], int maxCount);

#ifdef __cplusplus
}
#endif
