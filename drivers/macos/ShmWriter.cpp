#include "ShmWriter.h"
#include "VoiceBridgeDriver.h"

#include <fcntl.h>
#include <sys/mman.h>
#include <unistd.h>
#include <stdatomic.h>
#include <string.h>
#include <errno.h>

static VBSharedRing *g_ring = NULL;
static int           g_fd   = -1;

int vb_shm_open(void)
{
    g_fd = shm_open(VB_SHM_NAME, O_RDWR | O_CREAT, 0666);
    if (g_fd < 0) return -1;

    if (ftruncate(g_fd, (off_t)sizeof(VBSharedRing)) < 0) {
        close(g_fd); g_fd = -1; return -1;
    }

    g_ring = (VBSharedRing *)mmap(NULL, sizeof(VBSharedRing),
                                  PROT_READ | PROT_WRITE, MAP_SHARED, g_fd, 0);
    if (g_ring == MAP_FAILED) {
        g_ring = NULL; close(g_fd); g_fd = -1; return -1;
    }
    return 0;
}

uint32_t vb_shm_write(const float *samples, uint32_t frameCount)
{
    if (!g_ring || !samples || frameCount == 0) return 0;

    uint32_t byteCount = frameCount * 4u; /* float32 */
    uint32_t wp = atomic_load_explicit((_Atomic uint32_t *)&g_ring->writePos,
                                       memory_order_relaxed);
    uint32_t rp = atomic_load_explicit((_Atomic uint32_t *)&g_ring->readPos,
                                       memory_order_acquire);
    uint32_t used  = wp - rp;
    uint32_t free_ = VB_BUF_BYTES - used;

    if (byteCount > free_) byteCount = free_ & ~3u; /* align to 4 bytes */
    if (byteCount == 0) return 0;

    uint32_t wi   = wp % VB_BUF_BYTES;
    uint32_t tail = VB_BUF_BYTES - wi;

    if (tail >= byteCount) {
        memcpy(g_ring->buf + wi, samples, byteCount);
    } else {
        memcpy(g_ring->buf + wi, samples, tail);
        memcpy(g_ring->buf, (const uint8_t *)samples + tail, byteCount - tail);
    }

    atomic_store_explicit((_Atomic uint32_t *)&g_ring->writePos,
                          wp + byteCount, memory_order_release);
    return byteCount / 4u;
}

void vb_shm_close(void)
{
    if (g_ring) { munmap(g_ring, sizeof(VBSharedRing)); g_ring = NULL; }
    if (g_fd >= 0) { close(g_fd); g_fd = -1; }
}
