#ifdef _WIN32
#include "WinVirtualMic.h"
#include <functiondiscoverykeys_devpkey.h>
#include <wchar.h>
#include <stdio.h>

#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "oleaut32.lib")

static IMMDeviceEnumerator *g_enumerator = NULL;
static IMMDevice           *g_device     = NULL;
static IAudioClient        *g_client     = NULL;
static IAudioRenderClient  *g_renderer   = NULL;
static UINT32               g_bufFrames  = 0;
static WAVEFORMATEX         g_format     = {0};

/* Find the "CABLE Input" render endpoint */
static IMMDevice *find_cable_input(IMMDeviceEnumerator *enumerator)
{
    IMMDeviceCollection *coll = NULL;
    HRESULT hr = enumerator->lpVtbl->EnumAudioEndpoints(
        enumerator, eRender, DEVICE_STATE_ACTIVE, &coll);
    if (FAILED(hr)) return NULL;

    UINT count = 0;
    coll->lpVtbl->GetCount(coll, &count);

    for (UINT i = 0; i < count; i++) {
        IMMDevice *dev = NULL;
        coll->lpVtbl->Item(coll, i, &dev);

        IPropertyStore *props = NULL;
        dev->lpVtbl->OpenPropertyStore(dev, STGM_READ, &props);

        PROPVARIANT name;
        PropVariantInit(&name);
        props->lpVtbl->GetValue(props, &PKEY_Device_FriendlyName, &name);

        if (name.pwszVal && wcsstr(name.pwszVal, L"CABLE Input")) {
            PropVariantClear(&name);
            props->lpVtbl->Release(props);
            coll->lpVtbl->Release(coll);
            return dev;
        }
        PropVariantClear(&name);
        if (props) props->lpVtbl->Release(props);
        dev->lpVtbl->Release(dev);
    }

    coll->lpVtbl->Release(coll);
    return NULL;
}

int vb_win_open(void)
{
    CoInitializeEx(NULL, COINIT_MULTITHREADED);

    HRESULT hr = CoCreateInstance(&CLSID_MMDeviceEnumerator, NULL, CLSCTX_ALL,
                                  &IID_IMMDeviceEnumerator, (void **)&g_enumerator);
    if (FAILED(hr)) return -1;

    g_device = find_cable_input(g_enumerator);
    if (!g_device) {
        fprintf(stderr, "[WinVirtualMic] CABLE Input not found — is VB-Audio installed?\n");
        return -1;
    }

    hr = g_device->lpVtbl->Activate(g_device, &IID_IAudioClient, CLSCTX_ALL,
                                    NULL, (void **)&g_client);
    if (FAILED(hr)) return -1;

    /* Set format: 48 kHz, 32-bit float, mono */
    WAVEFORMATEX fmt = {0};
    fmt.wFormatTag      = WAVE_FORMAT_IEEE_FLOAT;
    fmt.nChannels       = 1;
    fmt.nSamplesPerSec  = 48000;
    fmt.wBitsPerSample  = 32;
    fmt.nBlockAlign     = 4;
    fmt.nAvgBytesPerSec = 48000 * 4;
    fmt.cbSize          = 0;
    g_format = fmt;

    REFERENCE_TIME duration = 10000 * 100; /* 100 ms in 100-ns units */
    hr = g_client->lpVtbl->Initialize(g_client, AUDCLNT_SHAREMODE_SHARED,
                                      0, duration, 0, &fmt, NULL);
    if (FAILED(hr)) return -1;

    hr = g_client->lpVtbl->GetBufferSize(g_client, &g_bufFrames);
    if (FAILED(hr)) return -1;

    hr = g_client->lpVtbl->GetService(g_client, &IID_IAudioRenderClient,
                                      (void **)&g_renderer);
    if (FAILED(hr)) return -1;

    hr = g_client->lpVtbl->Start(g_client);
    return FAILED(hr) ? -1 : 0;
}

int vb_win_write(const float *samples, uint32_t frameCount)
{
    if (!g_renderer) return -1;

    UINT32 padding = 0;
    g_client->lpVtbl->GetCurrentPadding(g_client, &padding);
    UINT32 avail = g_bufFrames - padding;
    UINT32 write = frameCount < avail ? frameCount : avail;
    if (write == 0) return 0;

    BYTE *data = NULL;
    HRESULT hr = g_renderer->lpVtbl->GetBuffer(g_renderer, write, &data);
    if (FAILED(hr)) return -1;

    memcpy(data, samples, write * 4u);
    g_renderer->lpVtbl->ReleaseBuffer(g_renderer, write, 0);
    return (int)write;
}

void vb_win_close(void)
{
    if (g_client)    { g_client->lpVtbl->Stop(g_client);     g_client->lpVtbl->Release(g_client);       g_client    = NULL; }
    if (g_renderer)  { g_renderer->lpVtbl->Release(g_renderer); g_renderer = NULL; }
    if (g_device)    { g_device->lpVtbl->Release(g_device);   g_device    = NULL; }
    if (g_enumerator){ g_enumerator->lpVtbl->Release(g_enumerator); g_enumerator = NULL; }
    CoUninitialize();
}

bool vb_win_cable_present(void)
{
    CoInitializeEx(NULL, COINIT_MULTITHREADED);
    IMMDeviceEnumerator *e = NULL;
    CoCreateInstance(&CLSID_MMDeviceEnumerator, NULL, CLSCTX_ALL,
                     &IID_IMMDeviceEnumerator, (void **)&e);
    if (!e) return false;
    IMMDevice *dev = find_cable_input(e);
    bool found = (dev != NULL);
    if (dev) dev->lpVtbl->Release(dev);
    e->lpVtbl->Release(e);
    return found;
}

#endif /* _WIN32 */
