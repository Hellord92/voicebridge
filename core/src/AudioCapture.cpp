#include "../include/AudioCapture.h"
#include <portaudio.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

struct VBAudioCapture {
    PaStream               *stream;
    VBAudioCaptureCallback  callback;
    void                   *userData;
    double                  sampleRate;
    uint32_t                framesPerBuffer;
};

static int pa_callback(const void *input, void *output,
                       unsigned long frameCount,
                       const PaStreamCallbackTimeInfo *timeInfo,
                       PaStreamCallbackFlags statusFlags,
                       void *userData)
{
    (void)output; (void)timeInfo; (void)statusFlags;
    VBAudioCapture *cap = (VBAudioCapture *)userData;
    if (input && cap->callback)
        cap->callback((const float *)input, (uint32_t)frameCount, cap->userData);
    return paContinue;
}

VBAudioCapture *vb_capture_create(int deviceIndex, double sampleRate, uint32_t framesPerBuffer)
{
    Pa_Initialize();

    VBAudioCapture *cap = (VBAudioCapture *)calloc(1, sizeof(VBAudioCapture));
    cap->sampleRate      = sampleRate;
    cap->framesPerBuffer = framesPerBuffer;

    PaStreamParameters params = {0};
    params.device = (deviceIndex < 0) ? Pa_GetDefaultInputDevice() : (PaDeviceIndex)deviceIndex;
    if (params.device == paNoDevice) { free(cap); return NULL; }

    params.channelCount              = 1;          /* mono */
    params.sampleFormat              = paFloat32;
    params.suggestedLatency          =
        Pa_GetDeviceInfo(params.device)->defaultLowInputLatency;
    params.hostApiSpecificStreamInfo = NULL;

    PaError err = Pa_OpenStream(&cap->stream, &params, NULL,
                                sampleRate, framesPerBuffer,
                                paClipOff, pa_callback, cap);
    if (err != paNoError) {
        fprintf(stderr, "[AudioCapture] Pa_OpenStream: %s\n", Pa_GetErrorText(err));
        free(cap);
        return NULL;
    }
    return cap;
}

int vb_capture_start(VBAudioCapture *cap, VBAudioCaptureCallback cb, void *userData)
{
    cap->callback = cb;
    cap->userData = userData;
    PaError err = Pa_StartStream(cap->stream);
    return (err == paNoError) ? 0 : -1;
}

void vb_capture_stop(VBAudioCapture *cap)
{
    if (cap && cap->stream) Pa_StopStream(cap->stream);
}

void vb_capture_destroy(VBAudioCapture *cap)
{
    if (!cap) return;
    if (cap->stream) { Pa_CloseStream(cap->stream); }
    free(cap);
    Pa_Terminate();
}

static int enumerate_input_devices(VBDeviceInfo outDevices[], int maxCount)
{
    int total = Pa_GetDeviceCount();
    int count = 0;
    for (int i = 0; i < total && count < maxCount; i++) {
        const PaDeviceInfo *info = Pa_GetDeviceInfo(i);
        if (info && info->maxInputChannels > 0) {
            outDevices[count].paIndex = i;   /* real PortAudio index */
            strncpy(outDevices[count].name, info->name, 127);
            outDevices[count].name[127] = '\0';
            count++;
        }
    }
    return count;
}

int vb_capture_list_devices(VBDeviceInfo outDevices[], int maxCount)
{
    Pa_Initialize();
    int count = enumerate_input_devices(outDevices, maxCount);
    Pa_Terminate();
    return count;
}

int vb_capture_refresh_devices(VBDeviceInfo outDevices[], int maxCount)
{
    /* Drive refcount to zero then reinit so PortAudio rescans hardware */
    Pa_Terminate();
    PaError err = Pa_Initialize();
    if (err != paNoError) return -1;
    int count = enumerate_input_devices(outDevices, maxCount);
    Pa_Terminate();
    return count;
}
