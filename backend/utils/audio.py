"""
Audio chunk yardımcı fonksiyonları.

Frontend, AudioWorkletProcessor üzerinden 16kHz mono Float32 PCM verisi
gönderir. Her WebSocket mesajı ~100ms'lik bir chunk'tır. Whisper API'nin
daha doğru sonuçlar vermesi için chunk'ları belirli bir minimum boyuta
(yaklaşık 2-3 saniye) ulaşana kadar biriktiriyoruz.
"""

import struct
import wave
import io
import math
from typing import Optional

# Minimum birikim eşiği: ~2 saniye @ 16kHz mono 16-bit = 64000 byte
MIN_AUDIO_BYTES = 64_000

# Maksimum birikim: ~10 saniye (gecikmeyi önlemek için)
MAX_AUDIO_BYTES = 320_000


def accumulate_chunks(buffer: list[bytes]) -> Optional[bytes]:
    """
    Gelen binary chunk'ları biriktir.
    Yeterli veri birikmişse birleştirilmiş byte dizisini döner, aksi halde None.
    Maksimum eşik aşılırsa da işleme alınır (gecikme önleme).
    """
    total = sum(len(c) for c in buffer)
    if total >= MIN_AUDIO_BYTES or total >= MAX_AUDIO_BYTES:
        return b"".join(buffer)
    return None


def float32_pcm_to_wav(raw_bytes: bytes, sample_rate: int = 16000) -> bytes:
    """
    Frontend'den gelen raw Float32 LE PCM verisini WAV formatına dönüştürür.
    Whisper API, dosya uzantısına göre format algıladığı için WAV sarmalayıcı gereklidir.
    """
    num_samples = len(raw_bytes) // 4  # Float32 = 4 byte/sample
    floats = struct.unpack(f"<{num_samples}f", raw_bytes)

    # Float32 [-1, 1] → Int16 [-32768, 32767]
    int16_samples = [max(-32768, min(32767, int(f * 32767))) for f in floats]
    pcm16 = struct.pack(f"<{num_samples}h", *int16_samples)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)       # Mono
        wf.setsampwidth(2)       # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(pcm16)

    return buf.getvalue()


def webm_to_passthrough(raw_bytes: bytes) -> bytes:
    """
    Frontend WebM/Opus formatında veri gönderiyorsa olduğu gibi geçirme.
    Whisper API, WebM dosyalarını doğrudan destekler.
    """
    return raw_bytes


def calculate_rms_f32(raw_bytes: bytes) -> float:
    """
    Float32 LE PCM verisinin RMS değerini hesaplar (0.0 – 1.0 arası).
    Sessizlik için 0.0, normal konuşma için 0.02-0.2 arası değer döner.
    """
    n = len(raw_bytes) // 4
    if n == 0:
        return 0.0
    samples = struct.unpack(f"<{n}f", raw_bytes[:n * 4])
    mean_sq = sum(s * s for s in samples) / n
    return math.sqrt(mean_sq)


def detect_format(raw_bytes: bytes) -> str:
    """
    Gelen byte dizisinin ses formatını tespit eder.
    WebM magic bytes: 0x1A 0x45 0xDF 0xA3
    WAV magic bytes:  'RIFF'
    """
    if len(raw_bytes) >= 4:
        if raw_bytes[:4] == b"\x1a\x45\xdf\xa3":
            return "webm"
        if raw_bytes[:4] == b"RIFF":
            return "wav"
    return "pcm_f32"
