#include "../include/VAD.h"
#include <fvad.h>
#include <stdlib.h>
#include <string.h>

struct VBVAD {
    Fvad *fvad;
};

VBVAD *vb_vad_create(int aggressiveness)
{
    Fvad *fv = fvad_new();
    if (!fv) return NULL;
    fvad_set_sample_rate(fv, 16000);
    fvad_set_mode(fv, aggressiveness);
    VBVAD *v = (VBVAD *)malloc(sizeof(VBVAD));
    v->fvad = fv;
    return v;
}

void vb_vad_destroy(VBVAD *vad)
{
    if (!vad) return;
    fvad_free(vad->fvad);
    free(vad);
}

int vb_vad_process(VBVAD *vad, const float *samples, uint32_t frameSamples)
{
    if (!vad) return -1;
    /* Convert float32 [-1,1] to int16 */
    int16_t *buf = (int16_t *)malloc(frameSamples * sizeof(int16_t));
    if (!buf) return -1;
    for (uint32_t i = 0; i < frameSamples; i++) {
        float f = samples[i];
        if (f >  1.0f) f =  1.0f;
        if (f < -1.0f) f = -1.0f;
        buf[i] = (int16_t)(f * 32767.0f);
    }
    int result = fvad_process(vad->fvad, buf, (size_t)frameSamples);
    free(buf);
    return result;
}

void vb_resample_48to16(const float *in, float *out, uint32_t inFrames)
{
    /* Simple 3:1 decimation — for production use a proper FIR filter */
    uint32_t outFrames = inFrames / 3;
    for (uint32_t i = 0; i < outFrames; i++)
        out[i] = in[i * 3];
}
