/**
 * Windows Virtual Mic Bridge
 *
 * On Windows, VoiceBridge relies on VB-Audio Virtual Cable (bundled in
 * the installer). This module handles:
 *   1. Detecting that CABLE Input / CABLE Output devices are present
 *   2. Writing decoded TTS PCM to CABLE Input via WASAPI exclusive mode
 *
 * The user sets their meeting app mic to "CABLE Output".
 * We write to "CABLE Input" — VB-Audio loops it through.
 */
#pragma once

#ifdef _WIN32
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Initialize Windows WASAPI writer to CABLE Input device.
 * Returns 0 on success, non-zero on error.
 */
int vb_win_open(void);

/**
 * Write float32 mono PCM (48 kHz) to CABLE Input.
 * Returns frames written, 0 on buffer full, -1 on error.
 */
int vb_win_write(const float *samples, uint32_t frameCount);

/** Close WASAPI device. */
void vb_win_close(void);

/**
 * Check if VB-Audio Virtual Cable is installed.
 * Returns true if "CABLE Input" device is found.
 */
bool vb_win_cable_present(void);

#ifdef __cplusplus
}
#endif

#endif /* _WIN32 */
