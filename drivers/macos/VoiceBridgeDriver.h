#pragma once
#include <CoreAudio/AudioServerPlugIn.h>
#include <CoreFoundation/CoreFoundation.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Entry point declared in Info.plist as AudioServerPlugIn factory.
 * Called once by coreaudiod when it loads the driver bundle.
 */
void *VoiceBridgeAudioDriverEntryPoint(CFAllocatorRef inAllocator,
                                       CFUUIDRef      inRequestedTypeUUID);

/* Shared memory helpers — used by the VoiceBridge app to write PCM data */
#define VB_SHM_NAME   "/voicebridge_shm"
#define VB_BUF_BYTES  (48000u * 4u * 4u) /* 4 s mono float32 @ 48kHz */

typedef struct {
    unsigned int writePos; /* atomic write index (bytes, monotonic) */
    unsigned int readPos;  /* atomic read  index (bytes, monotonic) */
    unsigned char buf[VB_BUF_BYTES];
} VBSharedRing;

#ifdef __cplusplus
}
#endif
