/**
 * VoiceBridge Audio — CoreAudio AudioServerPlugin
 *
 * Creates a virtual microphone device called "VoiceBridge Microphone".
 * The VoiceBridge desktop app writes decoded TTS PCM (float32, 48 kHz, mono)
 * into a POSIX shared-memory ring buffer. This driver reads from that ring
 * buffer and exposes it to the system as a real microphone. Any app
 * (Zoom, Meet, Teams …) that selects "VoiceBridge Microphone" will hear
 * the translated speech.
 *
 * IPC protocol
 * ─────────────
 * Shared memory name : /voicebridge_shm
 * Layout (VBSharedRing):
 *   uint32_t writePos  — byte offset where the app will write next
 *   uint32_t readPos   — byte offset where the driver last read
 *   uint8_t  buf[VB_BUF_BYTES] — circular PCM buffer
 *
 * Both sides treat readPos/writePos as monotonically increasing byte
 * counters; actual index = pos % VB_BUF_BYTES.
 *
 * Build
 * ─────
 *   cmake -B build -DCMAKE_BUILD_TYPE=Release
 *   cmake --build build
 *   sudo cmake --install build   # copies .driver bundle to /Library/Audio/Plug-Ins/HAL/
 *   sudo launchctl kickstart -kp system/com.apple.audio.coreaudiod
 */

#include "VoiceBridgeDriver.h"

#include <CoreAudio/AudioHardware.h>
#include <CoreAudio/AudioServerPlugIn.h>
#include <CoreFoundation/CoreFoundation.h>
#include <mach/mach_time.h>
#include <os/log.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>

#include <fcntl.h>
#include <sys/mman.h>
#include <unistd.h>

static Boolean VBUUIDMatches(REFIID id, CFUUIDRef uuid)
{
    CFUUIDRef idRef = CFUUIDCreateFromUUIDBytes(kCFAllocatorDefault, id);
    if (!idRef) return false;
    Boolean eq = CFEqual(idRef, uuid);
    CFRelease(idRef);
    return eq;
}

/* ─────────────────────────────── constants ─────────────────────────────── */

#define VB_PLUGIN_UID  "com.voicebridge.audio.driver"
#define VB_DEVICE_UID  "VoiceBridgeMicrophone-UID"
#define VB_STREAM_UID  "VoiceBridgeMicrophone-Stream-UID"
#define VB_BOX_UID     "VoiceBridgeMicrophone-Box-UID"

#define VB_SAMPLE_RATE   48000.0
#define VB_CHANNEL_COUNT 1u
#define VB_FRAMES        512u           /* frames per IO cycle             */
#define VB_BYTES_PER_FRAME 4u           /* float32                         */
#define VB_ZERO_TS_PERIOD VB_FRAMES     /* frames between zero timestamps = IO buffer size */

#define VB_SHM_NAME "/voicebridge_shm"

/* Object IDs: each AudioServerPlugin has its own namespace, small ints are fine */
#define VB_DEVICE_OBJECT_ID    2u
#define VB_STREAM_OBJECT_ID    3u

static os_log_t gLog;


/* ─────────────────────────────── driver state ───────────────────────────── */

typedef struct {
    AudioServerPlugInDriverInterface *mInterface;   /* MUST be first */
    AudioServerPlugInDriverInterface  mInterfaceImpl;
    const AudioServerPlugInHostInterface *mHost;

    /* ref count */
    volatile int32_t mRefCount;

    /* IDs assigned by the HAL */
    AudioObjectID mPlugInObjectID;
    AudioObjectID mBoxObjectID;
    AudioObjectID mDeviceObjectID;
    AudioObjectID mStreamInputObjectID;

    /* IO state */
    pthread_mutex_t mMutex;
    Boolean         mIORunning;
    uint64_t        mZeroTimestampHostTime;
    uint64_t        mSavedHostTime;
    uint64_t        mSavedSampleTime;
    double          mHostTicksPerFrame;

    /* shared memory */
    VBSharedRing   *mRing;
    int             mShmFd;

    /* underrun crossfade state (stereo float) */
    float           mLastSampleL;
    float           mLastSampleR;
} VBDriver;

static VBDriver *gDriver = NULL;

/* ──────────────────────── forward declarations ──────────────────────────── */

static HRESULT VBDriver_QueryInterface(void *inDriver, REFIID inUUID, LPVOID *outInterface);
static ULONG   VBDriver_AddRef(void *inDriver);
static ULONG   VBDriver_Release(void *inDriver);
static OSStatus VBDriver_Initialize(AudioServerPlugInDriverRef inDriver,
                                    AudioServerPlugInHostRef inHost);
static OSStatus VBDriver_CreateDevice(AudioServerPlugInDriverRef inDriver,
                                      CFDictionaryRef inDescription,
                                      const AudioServerPlugInClientInfo *inClientInfo,
                                      AudioObjectID *outDeviceObjectID);
static OSStatus VBDriver_DestroyDevice(AudioServerPlugInDriverRef inDriver,
                                       AudioObjectID inDeviceObjectID);
static OSStatus VBDriver_AddDeviceClient(AudioServerPlugInDriverRef inDriver,
                                         AudioObjectID inDeviceObjectID,
                                         const AudioServerPlugInClientInfo *inClientInfo);
static OSStatus VBDriver_RemoveDeviceClient(AudioServerPlugInDriverRef inDriver,
                                            AudioObjectID inDeviceObjectID,
                                            const AudioServerPlugInClientInfo *inClientInfo);
static OSStatus VBDriver_PerformDeviceConfigurationChange(AudioServerPlugInDriverRef inDriver,
                                                          AudioObjectID inDeviceObjectID,
                                                          UInt64 inChangeAction,
                                                          void *inChangeInfo);
static OSStatus VBDriver_AbortDeviceConfigurationChange(AudioServerPlugInDriverRef inDriver,
                                                        AudioObjectID inDeviceObjectID,
                                                        UInt64 inChangeAction,
                                                        void *inChangeInfo);
static Boolean  VBDriver_HasProperty(AudioServerPlugInDriverRef inDriver,
                                     AudioObjectID inObjectID,
                                     pid_t inClientProcessID,
                                     const AudioObjectPropertyAddress *inAddress);
static OSStatus VBDriver_IsPropertySettable(AudioServerPlugInDriverRef inDriver,
                                            AudioObjectID inObjectID,
                                            pid_t inClientProcessID,
                                            const AudioObjectPropertyAddress *inAddress,
                                            Boolean *outIsSettable);
static OSStatus VBDriver_GetPropertyDataSize(AudioServerPlugInDriverRef inDriver,
                                             AudioObjectID inObjectID,
                                             pid_t inClientProcessID,
                                             const AudioObjectPropertyAddress *inAddress,
                                             UInt32 inQualifierDataSize,
                                             const void *inQualifierData,
                                             UInt32 *outDataSize);
static OSStatus VBDriver_GetPropertyData(AudioServerPlugInDriverRef inDriver,
                                         AudioObjectID inObjectID,
                                         pid_t inClientProcessID,
                                         const AudioObjectPropertyAddress *inAddress,
                                         UInt32 inQualifierDataSize,
                                         const void *inQualifierData,
                                         UInt32 inDataSize,
                                         UInt32 *outDataSize,
                                         void *outData);
static OSStatus VBDriver_SetPropertyData(AudioServerPlugInDriverRef inDriver,
                                         AudioObjectID inObjectID,
                                         pid_t inClientProcessID,
                                         const AudioObjectPropertyAddress *inAddress,
                                         UInt32 inQualifierDataSize,
                                         const void *inQualifierData,
                                         UInt32 inDataSize,
                                         const void *inData);
static OSStatus VBDriver_StartIO(AudioServerPlugInDriverRef inDriver,
                                 AudioObjectID inDeviceObjectID,
                                 UInt32 inClientID);
static OSStatus VBDriver_StopIO(AudioServerPlugInDriverRef inDriver,
                                AudioObjectID inDeviceObjectID,
                                UInt32 inClientID);
static OSStatus VBDriver_GetZeroTimeStamp(AudioServerPlugInDriverRef inDriver,
                                          AudioObjectID inDeviceObjectID,
                                          UInt32 inClientID,
                                          Float64 *outSampleTime,
                                          UInt64 *outHostTime,
                                          UInt64 *outSeed);
static OSStatus VBDriver_WillDoIOOperation(AudioServerPlugInDriverRef inDriver,
                                           AudioObjectID inDeviceObjectID,
                                           UInt32 inClientID,
                                           UInt32 inOperationID,
                                           Boolean *outWillDo,
                                           Boolean *outWillDoInPlace);
static OSStatus VBDriver_BeginIOOperation(AudioServerPlugInDriverRef inDriver,
                                          AudioObjectID inDeviceObjectID,
                                          UInt32 inClientID,
                                          UInt32 inOperationID,
                                          UInt32 inIOBufferFrameSize,
                                          const AudioServerPlugInIOCycleInfo *inIOCycleInfo);
static OSStatus VBDriver_DoIOOperation(AudioServerPlugInDriverRef inDriver,
                                       AudioObjectID inDeviceObjectID,
                                       AudioObjectID inStreamObjectID,
                                       UInt32 inClientID,
                                       UInt32 inOperationID,
                                       UInt32 inIOBufferFrameSize,
                                       const AudioServerPlugInIOCycleInfo *inIOCycleInfo,
                                       void *ioMainBuffer,
                                       void *ioSecondaryBuffer);
static OSStatus VBDriver_EndIOOperation(AudioServerPlugInDriverRef inDriver,
                                        AudioObjectID inDeviceObjectID,
                                        UInt32 inClientID,
                                        UInt32 inOperationID,
                                        UInt32 inIOBufferFrameSize,
                                        const AudioServerPlugInIOCycleInfo *inIOCycleInfo);

/* ─────────────────────────── vtable ─────────────────────────────────────── */

static AudioServerPlugInDriverInterface gDriverInterface = {
    NULL,  /* _reserved */
    VBDriver_QueryInterface,
    VBDriver_AddRef,
    VBDriver_Release,
    VBDriver_Initialize,
    VBDriver_CreateDevice,
    VBDriver_DestroyDevice,
    VBDriver_AddDeviceClient,
    VBDriver_RemoveDeviceClient,
    VBDriver_PerformDeviceConfigurationChange,
    VBDriver_AbortDeviceConfigurationChange,
    VBDriver_HasProperty,
    VBDriver_IsPropertySettable,
    VBDriver_GetPropertyDataSize,
    VBDriver_GetPropertyData,
    VBDriver_SetPropertyData,
    VBDriver_StartIO,
    VBDriver_StopIO,
    VBDriver_GetZeroTimeStamp,
    VBDriver_WillDoIOOperation,
    VBDriver_BeginIOOperation,
    VBDriver_DoIOOperation,
    VBDriver_EndIOOperation,
};

/* ──────────────────────── entry point ───────────────────────────────────── */

void *VoiceBridgeAudioDriverEntryPoint(CFAllocatorRef inAllocator,
                                       CFUUIDRef inRequestedTypeUUID)
{
    (void)inAllocator;
    gLog = os_log_create("com.voicebridge.audio.driver", "driver");

    if (!CFEqual(inRequestedTypeUUID, kAudioServerPlugInTypeUUID)) {
        os_log_error(gLog, "Unsupported plugin type requested");
        return NULL;
    }

    if (gDriver != NULL) {
        VBDriver_AddRef(gDriver);
        return gDriver;
    }

    gDriver = (VBDriver *)calloc(1, sizeof(VBDriver));
    if (gDriver == NULL) return NULL;

    gDriver->mInterfaceImpl = gDriverInterface;
    gDriver->mInterface     = &gDriver->mInterfaceImpl;
    gDriver->mRefCount      = 1;
    gDriver->mShmFd         = -1;
    gDriver->mRing          = NULL;

    pthread_mutex_init(&gDriver->mMutex, NULL);

    os_log_info(gLog, "VoiceBridge Audio driver loaded");
    return gDriver;
}

/* ─────────────────────────── IUnknown ───────────────────────────────────── */

static HRESULT VBDriver_QueryInterface(void *inDriver, REFIID inUUID, LPVOID *outInterface)
{
    if (!VBUUIDMatches(inUUID, IUnknownUUID) &&
        !VBUUIDMatches(inUUID, kAudioServerPlugInDriverInterfaceUUID)) {
        *outInterface = NULL;
        return E_NOINTERFACE;
    }
    VBDriver_AddRef(inDriver);
    *outInterface = inDriver;
    return S_OK;
}

static ULONG VBDriver_AddRef(void *inDriver)
{
    VBDriver *d = (VBDriver *)inDriver;
    return (ULONG)__sync_add_and_fetch(&d->mRefCount, 1);
}

static ULONG VBDriver_Release(void *inDriver)
{
    VBDriver *d = (VBDriver *)inDriver;
    ULONG n = (ULONG)__sync_sub_and_fetch(&d->mRefCount, 1);
    if (n == 0) {
        pthread_mutex_destroy(&d->mMutex);
        if (d->mRing)  munmap(d->mRing, sizeof(VBSharedRing));
        if (d->mShmFd >= 0) close(d->mShmFd);
        free(d);
        gDriver = NULL;
    }
    return n;
}

/* ─────────────────────────── Initialize ─────────────────────────────────── */

static OSStatus VBDriver_Initialize(AudioServerPlugInDriverRef inDriver,
                                    AudioServerPlugInHostRef inHost)
{
    VBDriver *d = (VBDriver *)inDriver;
    d->mHost = inHost;

    /* Host ticks per audio frame: (ns/frame) * (ticks/ns)
       mach ticks → ns: multiply by numer/denom
       ns → mach ticks: multiply by denom/numer
       ns per frame = 1e9 / VB_SAMPLE_RATE
       ticks per frame = (1e9 / VB_SAMPLE_RATE) * (denom / numer)        */
    mach_timebase_info_data_t tbi;
    mach_timebase_info(&tbi);
    d->mHostTicksPerFrame = (1.0e9 / VB_SAMPLE_RATE) *
                             ((double)tbi.denom / (double)tbi.numer);

    /* Assign hardcoded object IDs — device list returned to HAL */
    d->mDeviceObjectID      = VB_DEVICE_OBJECT_ID;
    d->mStreamInputObjectID = VB_STREAM_OBJECT_ID;

    /* Open / create shared memory (non-fatal: device appears even if shm fails) */
    d->mShmFd = shm_open(VB_SHM_NAME, O_RDWR | O_CREAT, 0666);
    if (d->mShmFd < 0) {
        os_log_error(gLog, "shm_open failed errno=%d — device will output silence", errno);
        d->mRing = NULL;
    } else {
        ftruncate(d->mShmFd, (off_t)sizeof(VBSharedRing));
        d->mRing = (VBSharedRing *)mmap(NULL, sizeof(VBSharedRing),
                                        PROT_READ | PROT_WRITE, MAP_SHARED,
                                        d->mShmFd, 0);
        if (d->mRing == MAP_FAILED) {
            os_log_error(gLog, "mmap failed errno=%d — device will output silence", errno);
            d->mRing = NULL;
        }
    }

    /* Notify HAL: device list changed → triggers GetPropertyData(kAudioPlugInPropertyDeviceList) */
    AudioObjectPropertyAddress deviceListAddr = {
        kAudioPlugInPropertyDeviceList,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
    };
    (void)d->mHost->PropertiesChanged(d->mHost, kAudioObjectSystemObject, 1, &deviceListAddr);

    os_log_info(gLog, "VoiceBridge driver initialized, shm mapped");
    return kAudioHardwareNoError;
}

/* ─────────────────────────── device lifecycle ───────────────────────────── */

static OSStatus VBDriver_CreateDevice(AudioServerPlugInDriverRef inDriver,
                                      CFDictionaryRef inDescription,
                                      const AudioServerPlugInClientInfo *inClientInfo,
                                      AudioObjectID *outDeviceObjectID)
{
    (void)inDriver; (void)inDescription; (void)inClientInfo;
    *outDeviceObjectID = kAudioObjectUnknown;
    return kAudioHardwareUnsupportedOperationError;
}

static OSStatus VBDriver_DestroyDevice(AudioServerPlugInDriverRef inDriver,
                                       AudioObjectID inDeviceObjectID)
{
    (void)inDriver; (void)inDeviceObjectID;
    return kAudioHardwareUnsupportedOperationError;
}

static OSStatus VBDriver_AddDeviceClient(AudioServerPlugInDriverRef inDriver,
                                         AudioObjectID inDeviceObjectID,
                                         const AudioServerPlugInClientInfo *inClientInfo)
{
    (void)inDriver; (void)inDeviceObjectID; (void)inClientInfo;
    return kAudioHardwareNoError;
}

static OSStatus VBDriver_RemoveDeviceClient(AudioServerPlugInDriverRef inDriver,
                                            AudioObjectID inDeviceObjectID,
                                            const AudioServerPlugInClientInfo *inClientInfo)
{
    (void)inDriver; (void)inDeviceObjectID; (void)inClientInfo;
    return kAudioHardwareNoError;
}

static OSStatus VBDriver_PerformDeviceConfigurationChange(AudioServerPlugInDriverRef inDriver,
                                                          AudioObjectID inDeviceObjectID,
                                                          UInt64 inChangeAction,
                                                          void *inChangeInfo)
{
    (void)inDriver; (void)inDeviceObjectID; (void)inChangeAction; (void)inChangeInfo;
    return kAudioHardwareNoError;
}

static OSStatus VBDriver_AbortDeviceConfigurationChange(AudioServerPlugInDriverRef inDriver,
                                                        AudioObjectID inDeviceObjectID,
                                                        UInt64 inChangeAction,
                                                        void *inChangeInfo)
{
    (void)inDriver; (void)inDeviceObjectID; (void)inChangeAction; (void)inChangeInfo;
    return kAudioHardwareNoError;
}

/* ─────────────────────────── property helpers ───────────────────────────── */

static Boolean VBDriver_HasProperty(AudioServerPlugInDriverRef inDriver,
                                    AudioObjectID inObjectID,
                                    pid_t inClientProcessID,
                                    const AudioObjectPropertyAddress *inAddress)
{
    (void)inDriver; (void)inClientProcessID;
    VBDriver *d = (VBDriver *)inDriver;

    switch (inObjectID) {
        case kAudioObjectSystemObject:
            switch (inAddress->mSelector) {
                case kAudioObjectPropertyClass:
                case kAudioObjectPropertyBaseClass:
                case kAudioObjectPropertyName:
                case kAudioObjectPropertyManufacturer:
                case kAudioObjectPropertyOwnedObjects:
                case kAudioPlugInPropertyDeviceList:
                case kAudioPlugInPropertyBoxList:
                case kAudioPlugInPropertyTranslateUIDToDevice:
                    return true;
                default: return false;
            }
        default:
            if (inObjectID == d->mDeviceObjectID) {
                switch (inAddress->mSelector) {
                    case kAudioObjectPropertyClass:
                    case kAudioObjectPropertyBaseClass:
                    case kAudioObjectPropertyName:
                    case kAudioObjectPropertyManufacturer:
                    case kAudioObjectPropertyOwner:
                    case kAudioObjectPropertyOwnedObjects:
                    case kAudioDevicePropertyDeviceUID:
                    case kAudioDevicePropertyModelUID:
                    case kAudioDevicePropertyTransportType:
                    case kAudioDevicePropertyRelatedDevices:
                    case kAudioDevicePropertyClockDomain:
                    case kAudioDevicePropertyDeviceIsAlive:
                    case kAudioDevicePropertyDeviceIsRunning:
                    case kAudioDevicePropertyDeviceCanBeDefaultDevice:
                    case kAudioDevicePropertyDeviceCanBeDefaultSystemDevice:
                    case kAudioDevicePropertyLatency:
                    case kAudioDevicePropertyStreams:
                    case kAudioObjectPropertyControlList:
                    case kAudioDevicePropertySafetyOffset:
                    case kAudioDevicePropertyNominalSampleRate:
                    case kAudioDevicePropertyAvailableNominalSampleRates:
                    case kAudioDevicePropertyIsHidden:
                    case kAudioDevicePropertyZeroTimeStampPeriod:
                    case kAudioDevicePropertyPreferredChannelsForStereo:
                    case kAudioDevicePropertyPreferredChannelLayout:
                        return true;
                    default: return false;
                }
            } else if (inObjectID == d->mStreamInputObjectID) {
                switch (inAddress->mSelector) {
                    case kAudioObjectPropertyClass:
                    case kAudioObjectPropertyBaseClass:
                    case kAudioObjectPropertyName:
                    case kAudioObjectPropertyOwner:
                    case kAudioStreamPropertyIsActive:
                    case kAudioStreamPropertyDirection:
                    case kAudioStreamPropertyTerminalType:
                    case kAudioStreamPropertyStartingChannel:
                    case kAudioStreamPropertyVirtualFormat:
                    case kAudioStreamPropertyPhysicalFormat:
                    case kAudioStreamPropertyAvailableVirtualFormats:
                    case kAudioStreamPropertyAvailablePhysicalFormats:
                        return true;
                    default: return false;
                }
            }
            return false;
    }
}

static OSStatus VBDriver_IsPropertySettable(AudioServerPlugInDriverRef inDriver,
                                            AudioObjectID inObjectID,
                                            pid_t inClientProcessID,
                                            const AudioObjectPropertyAddress *inAddress,
                                            Boolean *outIsSettable)
{
    (void)inDriver; (void)inObjectID; (void)inClientProcessID;
    *outIsSettable = false;
    switch (inAddress->mSelector) {
        case kAudioDevicePropertyNominalSampleRate:
        case kAudioStreamPropertyVirtualFormat:
        case kAudioStreamPropertyPhysicalFormat:
            *outIsSettable = false;   /* fixed format */
            break;
        default:
            break;
    }
    return kAudioHardwareNoError;
}

static OSStatus VBDriver_GetPropertyDataSize(AudioServerPlugInDriverRef inDriver,
                                             AudioObjectID inObjectID,
                                             pid_t inClientProcessID,
                                             const AudioObjectPropertyAddress *inAddress,
                                             UInt32 inQualifierDataSize,
                                             const void *inQualifierData,
                                             UInt32 *outDataSize)
{
    (void)inClientProcessID;
    (void)inQualifierDataSize; (void)inQualifierData;
    VBDriver *d = (VBDriver *)inDriver;

    /* Plugin-level (system object) properties */
    if (inObjectID == kAudioObjectSystemObject) {
        switch (inAddress->mSelector) {
            case kAudioObjectPropertyName:
            case kAudioObjectPropertyManufacturer:
                *outDataSize = sizeof(CFStringRef);
                return kAudioHardwareNoError;
            case kAudioObjectPropertyClass:
            case kAudioObjectPropertyBaseClass:
                *outDataSize = sizeof(AudioClassID);
                return kAudioHardwareNoError;
            case kAudioObjectPropertyOwnedObjects:
                *outDataSize = 2 * sizeof(AudioObjectID); /* device + stream */
                return kAudioHardwareNoError;
            case kAudioPlugInPropertyDeviceList:
                *outDataSize = sizeof(AudioObjectID);   /* one device */
                return kAudioHardwareNoError;
            case kAudioPlugInPropertyBoxList:
            case kAudioObjectPropertyControlList:
                *outDataSize = 0;
                return kAudioHardwareNoError;
            case kAudioPlugInPropertyTranslateUIDToDevice:
                *outDataSize = sizeof(AudioObjectID);
                return kAudioHardwareNoError;
            default:
                return kAudioHardwareUnknownPropertyError;
        }
    }

    /* Device-level properties */
    if (inObjectID == d->mDeviceObjectID) {
        switch (inAddress->mSelector) {
            case kAudioObjectPropertyName:
            case kAudioObjectPropertyManufacturer:
            case kAudioDevicePropertyDeviceUID:
            case kAudioDevicePropertyModelUID:
                *outDataSize = sizeof(CFStringRef);
                break;
            case kAudioObjectPropertyClass:
            case kAudioObjectPropertyBaseClass:
                *outDataSize = sizeof(AudioClassID);
                break;
            case kAudioObjectPropertyOwner:
            case kAudioObjectPropertyOwnedObjects:
            case kAudioDevicePropertyStreams:
            case kAudioDevicePropertyRelatedDevices:
                *outDataSize = sizeof(AudioObjectID);
                break;
            case kAudioDevicePropertyTransportType:
            case kAudioDevicePropertyClockDomain:
            case kAudioDevicePropertyDeviceIsAlive:
            case kAudioDevicePropertyDeviceIsRunning:
            case kAudioDevicePropertyDeviceCanBeDefaultDevice:
            case kAudioDevicePropertyDeviceCanBeDefaultSystemDevice:
            case kAudioDevicePropertyLatency:
            case kAudioDevicePropertySafetyOffset:
            case kAudioDevicePropertyIsHidden:
            case kAudioDevicePropertyZeroTimeStampPeriod:
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioDevicePropertyNominalSampleRate:
                *outDataSize = sizeof(Float64);
                break;
            case kAudioDevicePropertyAvailableNominalSampleRates:
                *outDataSize = sizeof(AudioValueRange);
                break;
            case kAudioObjectPropertyControlList:
                *outDataSize = 0;
                break;
            case kAudioDevicePropertyPreferredChannelsForStereo:
                *outDataSize = 2 * sizeof(UInt32);
                break;
            case kAudioDevicePropertyPreferredChannelLayout:
                *outDataSize = offsetof(AudioChannelLayout, mChannelDescriptions) +
                                VB_CHANNEL_COUNT * sizeof(AudioChannelDescription);
                break;
            default:
                return kAudioHardwareUnknownPropertyError;
        }
        return kAudioHardwareNoError;
    }

    /* Stream-level properties */
    if (inObjectID == d->mStreamInputObjectID) {
        switch (inAddress->mSelector) {
            case kAudioObjectPropertyClass:
            case kAudioObjectPropertyBaseClass:
                *outDataSize = sizeof(AudioClassID);
                break;
            case kAudioObjectPropertyName:
                *outDataSize = sizeof(CFStringRef);
                break;
            case kAudioObjectPropertyOwner:
                *outDataSize = sizeof(AudioObjectID);
                break;
            case kAudioStreamPropertyIsActive:
            case kAudioStreamPropertyDirection:
            case kAudioStreamPropertyTerminalType:
            case kAudioStreamPropertyStartingChannel:
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioStreamPropertyVirtualFormat:
            case kAudioStreamPropertyPhysicalFormat:
                *outDataSize = sizeof(AudioStreamBasicDescription);
                break;
            case kAudioStreamPropertyAvailableVirtualFormats:
            case kAudioStreamPropertyAvailablePhysicalFormats:
                *outDataSize = sizeof(AudioStreamRangedDescription);
                break;
            default:
                return kAudioHardwareUnknownPropertyError;
        }
        return kAudioHardwareNoError;
    }

    return kAudioHardwareUnknownPropertyError;
}

/* Helper: build the ASBD for our fixed format */
static AudioStreamBasicDescription VBMakeASBD(void)
{
    AudioStreamBasicDescription asbd = {0};
    asbd.mSampleRate       = VB_SAMPLE_RATE;
    asbd.mFormatID         = kAudioFormatLinearPCM;
    asbd.mFormatFlags      = kAudioFormatFlagsNativeFloatPacked |
                              kAudioFormatFlagIsNonInterleaved;
    asbd.mBitsPerChannel   = 32;
    asbd.mChannelsPerFrame = VB_CHANNEL_COUNT;
    asbd.mFramesPerPacket  = 1;
    asbd.mBytesPerFrame    = VB_BYTES_PER_FRAME;
    asbd.mBytesPerPacket   = VB_BYTES_PER_FRAME;
    return asbd;
}

static OSStatus VBDriver_GetPropertyData(AudioServerPlugInDriverRef inDriver,
                                         AudioObjectID inObjectID,
                                         pid_t inClientProcessID,
                                         const AudioObjectPropertyAddress *inAddress,
                                         UInt32 inQualifierDataSize,
                                         const void *inQualifierData,
                                         UInt32 inDataSize,
                                         UInt32 *outDataSize,
                                         void *outData)
{
    (void)inClientProcessID; (void)inQualifierDataSize; (void)inQualifierData;
    VBDriver *d = (VBDriver *)inDriver;

    /* ── Plugin / system-object level ───────────────────────────────────── */
    if (inObjectID == kAudioObjectSystemObject) {
        switch (inAddress->mSelector) {
            case kAudioObjectPropertyName:
                *(CFStringRef *)outData = CFSTR("VoiceBridge");
                CFRetain(*(CFStringRef *)outData);
                *outDataSize = sizeof(CFStringRef);
                return kAudioHardwareNoError;
            case kAudioObjectPropertyManufacturer:
                *(CFStringRef *)outData = CFSTR("VoiceBridge");
                CFRetain(*(CFStringRef *)outData);
                *outDataSize = sizeof(CFStringRef);
                return kAudioHardwareNoError;
            case kAudioObjectPropertyClass:
                *(AudioClassID *)outData = kAudioPlugInClassID;
                *outDataSize = sizeof(AudioClassID);
                return kAudioHardwareNoError;
            case kAudioObjectPropertyBaseClass:
                *(AudioClassID *)outData = kAudioObjectClassID;
                *outDataSize = sizeof(AudioClassID);
                return kAudioHardwareNoError;
            case kAudioObjectPropertyOwnedObjects: {
                AudioObjectID *ids = (AudioObjectID *)outData;
                ids[0] = d->mDeviceObjectID;
                ids[1] = d->mStreamInputObjectID;
                *outDataSize = 2 * sizeof(AudioObjectID);
                return kAudioHardwareNoError;
            }
            case kAudioPlugInPropertyDeviceList:
                *(AudioObjectID *)outData = d->mDeviceObjectID;
                *outDataSize = sizeof(AudioObjectID);
                return kAudioHardwareNoError;
            case kAudioPlugInPropertyBoxList:
            case kAudioObjectPropertyControlList:
                *outDataSize = 0;
                return kAudioHardwareNoError;
            case kAudioPlugInPropertyTranslateUIDToDevice:
                *(AudioObjectID *)outData = d->mDeviceObjectID;
                *outDataSize = sizeof(AudioObjectID);
                return kAudioHardwareNoError;
            default:
                return kAudioHardwareUnknownPropertyError;
        }
    }

    /* ── Device level ────────────────────────────────────────────────────── */
    if (inObjectID == d->mDeviceObjectID) {
        switch (inAddress->mSelector) {
            case kAudioObjectPropertyClass:
                *(AudioClassID *)outData = kAudioDeviceClassID;
                *outDataSize = sizeof(AudioClassID);
                break;
            case kAudioObjectPropertyBaseClass:
                *(AudioClassID *)outData = kAudioObjectClassID;
                *outDataSize = sizeof(AudioClassID);
                break;
            case kAudioObjectPropertyOwner:
                *(AudioObjectID *)outData = kAudioObjectSystemObject;
                *outDataSize = sizeof(AudioObjectID);
                break;
            case kAudioObjectPropertyOwnedObjects:
                *(AudioObjectID *)outData = d->mStreamInputObjectID;
                *outDataSize = sizeof(AudioObjectID);
                break;
            case kAudioObjectPropertyName:
                *(CFStringRef *)outData = CFSTR("VoiceBridge Microphone");
                CFRetain(*(CFStringRef *)outData);
                *outDataSize = sizeof(CFStringRef);
                break;
            case kAudioObjectPropertyManufacturer:
                *(CFStringRef *)outData = CFSTR("VoiceBridge");
                CFRetain(*(CFStringRef *)outData);
                *outDataSize = sizeof(CFStringRef);
                break;
            case kAudioDevicePropertyDeviceUID:
                *(CFStringRef *)outData = CFStringCreateWithCString(NULL, VB_DEVICE_UID,
                                                                    kCFStringEncodingUTF8);
                *outDataSize = sizeof(CFStringRef);
                break;
            case kAudioDevicePropertyModelUID:
                *(CFStringRef *)outData = CFStringCreateWithCString(NULL, "VoiceBridgeMic-Model",
                                                                    kCFStringEncodingUTF8);
                *outDataSize = sizeof(CFStringRef);
                break;
            case kAudioDevicePropertyTransportType:
                *(UInt32 *)outData = kAudioDeviceTransportTypeVirtual;
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioDevicePropertyClockDomain:
                *(UInt32 *)outData = 0;
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioDevicePropertyDeviceIsAlive:
                *(UInt32 *)outData = 1;
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioDevicePropertyDeviceIsRunning:
                pthread_mutex_lock(&d->mMutex);
                *(UInt32 *)outData = d->mIORunning ? 1 : 0;
                pthread_mutex_unlock(&d->mMutex);
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioDevicePropertyDeviceCanBeDefaultDevice:
                *(UInt32 *)outData = 1;
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioDevicePropertyDeviceCanBeDefaultSystemDevice:
                *(UInt32 *)outData = 0;
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioDevicePropertyLatency:
                *(UInt32 *)outData = 0;
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioDevicePropertySafetyOffset:
                *(UInt32 *)outData = 0;
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioDevicePropertyStreams:
                *(AudioObjectID *)outData = d->mStreamInputObjectID;
                *outDataSize = sizeof(AudioObjectID);
                break;
            case kAudioObjectPropertyControlList:
                *outDataSize = 0;
                break;
            case kAudioDevicePropertyRelatedDevices:
                *(AudioObjectID *)outData = d->mDeviceObjectID;
                *outDataSize = sizeof(AudioObjectID);
                break;
            case kAudioDevicePropertyNominalSampleRate:
                *(Float64 *)outData = VB_SAMPLE_RATE;
                *outDataSize = sizeof(Float64);
                break;
            case kAudioDevicePropertyAvailableNominalSampleRates: {
                AudioValueRange *r = (AudioValueRange *)outData;
                r->mMinimum = VB_SAMPLE_RATE;
                r->mMaximum = VB_SAMPLE_RATE;
                *outDataSize = sizeof(AudioValueRange);
                break;
            }
            case kAudioDevicePropertyIsHidden:
                *(UInt32 *)outData = 0;
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioDevicePropertyZeroTimeStampPeriod:
                *(UInt32 *)outData = VB_ZERO_TS_PERIOD;
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioDevicePropertyPreferredChannelsForStereo: {
                UInt32 *ch = (UInt32 *)outData;
                ch[0] = 1; ch[1] = 1;
                *outDataSize = 2 * sizeof(UInt32);
                break;
            }
            case kAudioDevicePropertyPreferredChannelLayout: {
                UInt32 sz = offsetof(AudioChannelLayout, mChannelDescriptions) +
                            VB_CHANNEL_COUNT * sizeof(AudioChannelDescription);
                AudioChannelLayout *layout = (AudioChannelLayout *)outData;
                layout->mChannelLayoutTag = kAudioChannelLayoutTag_Mono;
                layout->mChannelBitmap    = 0;
                layout->mNumberChannelDescriptions = 1;
                layout->mChannelDescriptions[0].mChannelLabel = kAudioChannelLabel_Mono;
                layout->mChannelDescriptions[0].mChannelFlags = 0;
                layout->mChannelDescriptions[0].mCoordinates[0] = 0.0f;
                layout->mChannelDescriptions[0].mCoordinates[1] = 0.0f;
                layout->mChannelDescriptions[0].mCoordinates[2] = 0.0f;
                *outDataSize = sz;
                break;
            }
            default:
                return kAudioHardwareUnknownPropertyError;
        }
        return kAudioHardwareNoError;
    }

    /* ── Stream level ────────────────────────────────────────────────────── */
    if (inObjectID == d->mStreamInputObjectID) {
        switch (inAddress->mSelector) {
            case kAudioObjectPropertyClass:
                *(AudioClassID *)outData = kAudioStreamClassID;
                *outDataSize = sizeof(AudioClassID);
                break;
            case kAudioObjectPropertyBaseClass:
                *(AudioClassID *)outData = kAudioObjectClassID;
                *outDataSize = sizeof(AudioClassID);
                break;
            case kAudioObjectPropertyOwner:
                *(AudioObjectID *)outData = d->mDeviceObjectID;
                *outDataSize = sizeof(AudioObjectID);
                break;
            case kAudioObjectPropertyName:
                *(CFStringRef *)outData = CFSTR("VoiceBridge Input");
                CFRetain(*(CFStringRef *)outData);
                *outDataSize = sizeof(CFStringRef);
                break;
            case kAudioStreamPropertyIsActive:
                *(UInt32 *)outData = 1;
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioStreamPropertyDirection:
                *(UInt32 *)outData = 1;   /* 1 = input */
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioStreamPropertyTerminalType:
                *(UInt32 *)outData = kAudioStreamTerminalTypeMicrophone;
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioStreamPropertyStartingChannel:
                *(UInt32 *)outData = 1;
                *outDataSize = sizeof(UInt32);
                break;
            case kAudioStreamPropertyVirtualFormat:
            case kAudioStreamPropertyPhysicalFormat: {
                AudioStreamBasicDescription asbd = VBMakeASBD();
                *(AudioStreamBasicDescription *)outData = asbd;
                *outDataSize = sizeof(AudioStreamBasicDescription);
                break;
            }
            case kAudioStreamPropertyAvailableVirtualFormats:
            case kAudioStreamPropertyAvailablePhysicalFormats: {
                AudioStreamRangedDescription *rd = (AudioStreamRangedDescription *)outData;
                rd->mFormat = VBMakeASBD();
                rd->mSampleRateRange.mMinimum = VB_SAMPLE_RATE;
                rd->mSampleRateRange.mMaximum = VB_SAMPLE_RATE;
                *outDataSize = sizeof(AudioStreamRangedDescription);
                break;
            }
            default:
                return kAudioHardwareUnknownPropertyError;
        }
        return kAudioHardwareNoError;
    }

    return kAudioHardwareUnknownPropertyError;
}

static OSStatus VBDriver_SetPropertyData(AudioServerPlugInDriverRef inDriver,
                                         AudioObjectID inObjectID,
                                         pid_t inClientProcessID,
                                         const AudioObjectPropertyAddress *inAddress,
                                         UInt32 inQualifierDataSize,
                                         const void *inQualifierData,
                                         UInt32 inDataSize,
                                         const void *inData)
{
    (void)inDriver; (void)inObjectID; (void)inClientProcessID; (void)inAddress;
    (void)inQualifierDataSize; (void)inQualifierData; (void)inDataSize; (void)inData;
    return kAudioHardwareUnsupportedOperationError;
}

/* ─────────────────────────── IO ─────────────────────────────────────────── */

static OSStatus VBDriver_StartIO(AudioServerPlugInDriverRef inDriver,
                                 AudioObjectID inDeviceObjectID,
                                 UInt32 inClientID)
{
    (void)inDeviceObjectID; (void)inClientID;
    VBDriver *d = (VBDriver *)inDriver;
    pthread_mutex_lock(&d->mMutex);
    d->mIORunning = true;
    d->mZeroTimestampHostTime = mach_absolute_time();
    d->mSavedHostTime   = d->mZeroTimestampHostTime;
    d->mSavedSampleTime = 0;
    pthread_mutex_unlock(&d->mMutex);
    os_log_debug(gLog, "IO started");
    return kAudioHardwareNoError;
}

static OSStatus VBDriver_StopIO(AudioServerPlugInDriverRef inDriver,
                                AudioObjectID inDeviceObjectID,
                                UInt32 inClientID)
{
    (void)inDeviceObjectID; (void)inClientID;
    VBDriver *d = (VBDriver *)inDriver;
    pthread_mutex_lock(&d->mMutex);
    d->mIORunning = false;
    pthread_mutex_unlock(&d->mMutex);
    os_log_debug(gLog, "IO stopped");
    return kAudioHardwareNoError;
}

static OSStatus VBDriver_GetZeroTimeStamp(AudioServerPlugInDriverRef inDriver,
                                          AudioObjectID inDeviceObjectID,
                                          UInt32 inClientID,
                                          Float64 *outSampleTime,
                                          UInt64 *outHostTime,
                                          UInt64 *outSeed)
{
    (void)inDeviceObjectID; (void)inClientID;
    VBDriver *d = (VBDriver *)inDriver;
    pthread_mutex_lock(&d->mMutex);

    uint64_t now = mach_absolute_time();
    double   ticksPerPeriod = d->mHostTicksPerFrame * (double)VB_ZERO_TS_PERIOD;

    /* Advance anchor forward until it's within one period of now.
       Cap iterations to avoid any possibility of spinning. */
    if (d->mSavedHostTime == 0) {
        /* First call after StartIO — initialise anchor to now */
        d->mSavedHostTime   = now;
        d->mSavedSampleTime = 0;
    } else {
        uint32_t guard = 0;
        while (d->mSavedHostTime + (uint64_t)ticksPerPeriod <= now && ++guard < 1000) {
            d->mSavedHostTime   += (uint64_t)ticksPerPeriod;
            d->mSavedSampleTime += VB_ZERO_TS_PERIOD;
        }
    }

    *outSampleTime = (Float64)d->mSavedSampleTime;
    *outHostTime   = d->mSavedHostTime;
    if (outSeed) *outSeed = 1;
    pthread_mutex_unlock(&d->mMutex);
    return kAudioHardwareNoError;
}

static OSStatus VBDriver_WillDoIOOperation(AudioServerPlugInDriverRef inDriver,
                                           AudioObjectID inDeviceObjectID,
                                           UInt32 inClientID,
                                           UInt32 inOperationID,
                                           Boolean *outWillDo,
                                           Boolean *outWillDoInPlace)
{
    (void)inDriver; (void)inDeviceObjectID; (void)inClientID;
    switch (inOperationID) {
        case kAudioServerPlugInIOOperationReadInput:
            *outWillDo        = true;
            *outWillDoInPlace = true;
            break;
        default:
            *outWillDo        = false;
            *outWillDoInPlace = false;
            break;
    }
    return kAudioHardwareNoError;
}

static OSStatus VBDriver_BeginIOOperation(AudioServerPlugInDriverRef inDriver,
                                          AudioObjectID inDeviceObjectID,
                                          UInt32 inClientID,
                                          UInt32 inOperationID,
                                          UInt32 inIOBufferFrameSize,
                                          const AudioServerPlugInIOCycleInfo *inIOCycleInfo)
{
    (void)inDriver; (void)inDeviceObjectID; (void)inClientID; (void)inOperationID;
    (void)inIOBufferFrameSize; (void)inIOCycleInfo;
    return kAudioHardwareNoError;
}

/**
 * DoIOOperation — ReadInput:
 * Drain frames from the shared-memory ring buffer into the HAL's buffer.
 * If the app has not written enough data (ring is empty), fill with silence.
 */
static OSStatus VBDriver_DoIOOperation(AudioServerPlugInDriverRef inDriver,
                                       AudioObjectID inDeviceObjectID,
                                       AudioObjectID inStreamObjectID,
                                       UInt32 inClientID,
                                       UInt32 inOperationID,
                                       UInt32 inIOBufferFrameSize,
                                       const AudioServerPlugInIOCycleInfo *inIOCycleInfo,
                                       void *ioMainBuffer,
                                       void *ioSecondaryBuffer)
{
    (void)inDeviceObjectID; (void)inStreamObjectID; (void)inClientID; (void)inIOCycleInfo;
    (void)ioSecondaryBuffer;
    VBDriver *d = (VBDriver *)inDriver;

    if (inOperationID != kAudioServerPlugInIOOperationReadInput || !ioMainBuffer)
        return kAudioHardwareNoError;

    uint32_t bytesNeeded = inIOBufferFrameSize * VB_BYTES_PER_FRAME;
    float   *dst         = (float *)ioMainBuffer;

    if (!d->mRing) {
        memset(dst, 0, bytesNeeded);
        return kAudioHardwareNoError;
    }

    uint32_t wp = atomic_load_explicit((_Atomic uint32_t *)&d->mRing->writePos, memory_order_acquire);
    uint32_t rp = atomic_load_explicit((_Atomic uint32_t *)&d->mRing->readPos,  memory_order_relaxed);
    uint32_t avail = (wp - rp);   /* unsigned subtraction wraps correctly */

    if (avail >= bytesNeeded) {
        /* copy bytesNeeded bytes from ring */
        uint32_t ri    = rp % VB_BUF_BYTES;
        uint32_t tail  = VB_BUF_BYTES - ri;
        if (tail >= bytesNeeded) {
            memcpy(dst, d->mRing->buf + ri, bytesNeeded);
        } else {
            memcpy(dst, d->mRing->buf + ri, tail);
            memcpy((uint8_t *)dst + tail, d->mRing->buf, bytesNeeded - tail);
        }
        atomic_store_explicit((_Atomic uint32_t *)&d->mRing->readPos, rp + bytesNeeded, memory_order_release);
        /* track last sample for crossfade */
        uint32_t lastFrame = (bytesNeeded / VB_BYTES_PER_FRAME) - 1;
        d->mLastSampleL = dst[lastFrame * 2];
        d->mLastSampleR = dst[lastFrame * 2 + 1];
    } else if (avail > 0) {
        /* partial read + 5ms crossfade to silence */
        uint32_t ri   = rp % VB_BUF_BYTES;
        uint32_t tail = VB_BUF_BYTES - ri;
        if (tail >= avail) {
            memcpy(dst, d->mRing->buf + ri, avail);
        } else {
            memcpy(dst, d->mRing->buf + ri, tail);
            memcpy((uint8_t *)dst + tail, d->mRing->buf, avail - tail);
        }
        atomic_store_explicit((_Atomic uint32_t *)&d->mRing->readPos, rp + avail, memory_order_release);
        uint32_t framesRead = avail / VB_BYTES_PER_FRAME;
        uint32_t framesTotal = bytesNeeded / VB_BYTES_PER_FRAME;
        uint32_t fadeFrames = framesTotal > framesRead
            ? (framesTotal - framesRead > 240 ? 240u : framesTotal - framesRead)
            : 0u;
        float startL = framesRead > 0 ? dst[(framesRead - 1) * 2] : d->mLastSampleL;
        float startR = framesRead > 0 ? dst[(framesRead - 1) * 2 + 1] : d->mLastSampleR;
        for (uint32_t f = 0; f < fadeFrames; ++f) {
            float t = 1.0f - ((float)(f + 1) / (float)(fadeFrames + 1));
            uint32_t idx = framesRead + f;
            dst[idx * 2]     = startL * t;
            dst[idx * 2 + 1] = startR * t;
        }
        for (uint32_t f = framesRead + fadeFrames; f < framesTotal; ++f) {
            dst[f * 2] = dst[f * 2 + 1] = 0.0f;
        }
        d->mLastSampleL = d->mLastSampleR = 0.0f;
    } else {
        /* underrun — 5ms crossfade from last sample to silence */
        uint32_t framesTotal = bytesNeeded / VB_BYTES_PER_FRAME;
        uint32_t fadeFrames = framesTotal > 240 ? 240u : framesTotal;
        for (uint32_t f = 0; f < fadeFrames; ++f) {
            float t = 1.0f - ((float)(f + 1) / (float)(fadeFrames + 1));
            dst[f * 2]     = d->mLastSampleL * t;
            dst[f * 2 + 1] = d->mLastSampleR * t;
        }
        for (uint32_t f = fadeFrames; f < framesTotal; ++f) {
            dst[f * 2] = dst[f * 2 + 1] = 0.0f;
        }
        d->mLastSampleL = d->mLastSampleR = 0.0f;
    }

    return kAudioHardwareNoError;
}

static OSStatus VBDriver_EndIOOperation(AudioServerPlugInDriverRef inDriver,
                                        AudioObjectID inDeviceObjectID,
                                        UInt32 inClientID,
                                        UInt32 inOperationID,
                                        UInt32 inIOBufferFrameSize,
                                        const AudioServerPlugInIOCycleInfo *inIOCycleInfo)
{
    (void)inDriver; (void)inDeviceObjectID; (void)inClientID; (void)inOperationID;
    (void)inIOBufferFrameSize; (void)inIOCycleInfo;
    return kAudioHardwareNoError;
}
