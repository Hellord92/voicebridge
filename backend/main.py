import asyncio
import json
import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import settings
from backend.services.stt import transcribe_audio
from backend.services.translation import translate_text
from backend.services.tts import synthesize_speech
from backend.utils.audio import accumulate_chunks, MIN_AUDIO_BYTES, calculate_rms_f32, detect_format

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        settings.validate()
        logger.info("Tüm API anahtarları doğrulandı.")
    except ValueError as e:
        logger.warning(f"Yapılandırma uyarısı: {e}")
    yield


# Whisper'ın sessizlik/arka plan gürültüsünde ürettiği bilinen sahte çıktılar
WHISPER_HALLUCINATIONS = {
    "thank you.", "thank you", "thanks.", "thanks",
    "thanks for watching.", "thanks for watching",
    "thank you for watching.", "thank you for watching",
    "thank you so much.", "thank you so much",
    "thanks for listening.", "thanks for listening",
    "bye.", "bye", "goodbye.", "goodbye",
    ".", "..", "...", "you", "you.",
    "the", "the.", "a", "an",
    "teşekkür ederim.", "teşekkür ederim",
    "teşekkürler.", "teşekkürler",
}

# Ses enerjisi eşiği — bu değerin altındaki chunk'lar sessizliktir, Groq'a gönderilmez
RMS_THRESHOLD = 0.005

app = FastAPI(
    title="Google Meet Çeviri API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
async def root():
    return {"status": "ok", "message": "Google Meet Çeviri API çalışıyor."}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/voices")
async def voices_endpoint():
    """ElevenLabs ses listesini döner — Türkçe destekli sesler önce."""
    try:
        from backend.services.tts import get_client
        import asyncio
        from functools import partial

        def _fetch_voices():
            client = get_client()
            resp = client.voices.get_all()
            voices = resp.voices if hasattr(resp, "voices") else []
            result = []
            for v in voices:
                labels = v.labels or {}
                lang = (labels.get("language") or "").lower()
                accent = (labels.get("accent") or "").lower()
                use_case = (labels.get("use_case") or "").lower()
                gender = (labels.get("gender") or labels.get("Gender") or "").lower()
                description = (labels.get("description") or "").lower()
                is_turkish = "turkish" in lang or "türk" in lang
                is_multilingual = "multilingual" in accent or "multilingual" in lang
                result.append({
                    "voice_id": v.voice_id,
                    "name": v.name,
                    "gender": gender,
                    "language": labels.get("language", ""),
                    "accent": labels.get("accent", ""),
                    "description": labels.get("description", ""),
                    "use_case": use_case,
                    "turkish": is_turkish,
                    "multilingual": is_multilingual,
                })
            # Türkçe önce, sonra multilingual, sonra geri kalan
            result.sort(key=lambda x: (0 if x["turkish"] else (1 if x["multilingual"] else 2), x["name"]))
            return result

        loop = asyncio.get_event_loop()
        voices = await loop.run_in_executor(None, _fetch_voices)
        return {"voices": voices}
    except Exception as e:
        logger.error(f"Voices endpoint hatası: {e}")
        return {"voices": [], "error": str(e)}


@app.post("/tts")
async def tts_endpoint(request: Request):
    """Outbound TTS: metin → MP3 (LiteLLM /v1/audio/speech)"""
    body = await request.json()
    text = body.get("text", "").strip()
    voice = body.get("voice", None)
    if not text:
        return Response(content=b"", media_type="audio/mpeg")
    try:
        audio_bytes = await synthesize_speech(text, voice=voice)
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        logger.error(f"TTS endpoint hatası: {e}")
        return Response(content=b"", status_code=500)


@app.websocket("/ws/outbound")
async def ws_outbound(websocket: WebSocket):
    """
    Outbound akış: Türkçe ses → İngilizce sesli çeviri
    Frontend: mikrofon sesi gönderir (binary WebM/PCM chunk'lar)
    Backend:  Whisper (TR→text) → GPT-4o (TR→EN) → ElevenLabs (EN audio) → frontend
    """
    await websocket.accept()
    logger.info("Outbound WebSocket bağlandı.")
    buffer: list[bytes] = []

    try:
        while True:
            data = await websocket.receive()

            if "bytes" in data and data["bytes"]:
                buffer.append(data["bytes"])
                audio_bytes = accumulate_chunks(buffer)

                if audio_bytes is None:
                    continue

                buffer.clear()
                logger.info(f"Outbound: {len(audio_bytes)} byte ses alındı, işleniyor...")

                try:
                    # 1. Whisper STT: Türkçe ses → metin
                    tr_text = await transcribe_audio(audio_bytes, language="tr")
                    if not tr_text.strip():
                        logger.debug("Boş transkript, atlanıyor.")
                        continue

                    if tr_text.strip().lower() in WHISPER_HALLUCINATIONS:
                        logger.debug(f"Outbound: hallüsinasyon atlandı: {tr_text!r}")
                        continue

                    logger.info(f"TR Transkript: {tr_text}")
                    await websocket.send_json({"type": "transcript", "lang": "tr", "text": tr_text})

                    # 2. GPT-4o Çeviri: Türkçe → İngilizce
                    en_text = await translate_text(tr_text, source_lang="tr", target_lang="en")
                    logger.info(f"EN Çeviri: {en_text}")
                    await websocket.send_json({"type": "translation", "lang": "en", "text": en_text})

                    # 3. ElevenLabs TTS: İngilizce metin → ses
                    audio_out = await synthesize_speech(en_text)
                    if audio_out:
                        await websocket.send_bytes(audio_out)
                        logger.info(f"TTS audio gönderildi: {len(audio_out)} byte")

                except Exception as e:
                    logger.error(f"Outbound işleme hatası: {e}\n{traceback.format_exc()}")
                    await websocket.send_json({"type": "error", "message": str(e)})

            elif "text" in data:
                msg = json.loads(data["text"])
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("Outbound WebSocket bağlantısı kesildi.")
    except Exception as e:
        logger.error(f"Outbound WebSocket hatası: {e}\n{traceback.format_exc()}")


@app.websocket("/ws/inbound")
async def ws_inbound(websocket: WebSocket):
    """
    Inbound akış: İngilizce ses → Türkçe altyazı + TTS
    Frontend: {"type":"config","voice_id":"..."} → sonra binary PCM chunk'lar
    Chunk'lar paralel işlenir — bir önceki bitmeden yenisi başlar.
    """
    await websocket.accept()
    logger.info("Inbound WebSocket bağlandı.")
    buffer: list[bytes] = []
    inbound_voice_id: str = settings.ELEVENLABS_INBOUND_VOICE_ID
    active_tasks: set[asyncio.Task] = set()

    async def process_chunk(audio_bytes: bytes, voice_id: str) -> None:
        fmt = detect_format(audio_bytes)
        if fmt == "pcm_f32":
            rms = calculate_rms_f32(audio_bytes)
            if rms < RMS_THRESHOLD:
                logger.debug(f"Inbound: sessizlik atlandı (RMS={rms:.5f})")
                return

        logger.info(f"Inbound: {len(audio_bytes)} byte işleniyor...")
        try:
            # 1. Whisper STT
            en_text = await transcribe_audio(audio_bytes, language="en")
            if not en_text.strip():
                return
            if en_text.strip().lower() in WHISPER_HALLUCINATIONS:
                logger.debug(f"Hallüsinasyon atlandı: {en_text!r}")
                return

            logger.info(f"EN: {en_text}")
            await websocket.send_json({"type": "transcript", "lang": "en", "text": en_text})

            # 2. Çeviri + TTS paralel
            tr_text, _ = await asyncio.gather(
                translate_text(en_text, source_lang="en", target_lang="tr"),
                asyncio.sleep(0),  # yield
            )
            logger.info(f"TR: {tr_text}")
            await websocket.send_json({"type": "subtitle", "lang": "tr", "text": tr_text})

            # 3. ElevenLabs TTS (turbo — hızlı, Türkçe destekli)
            audio_out = await synthesize_speech(
                tr_text,
                voice_id=voice_id,
                model_id="eleven_turbo_v2_5",
            )
            if audio_out:
                await websocket.send_bytes(audio_out)
                logger.info(f"Inbound TTS: {len(audio_out)} byte gönderildi")

        except Exception as e:
            logger.error(f"Inbound işleme hatası: {e}\n{traceback.format_exc()}")
            try:
                await websocket.send_json({"type": "error", "message": str(e)})
            except Exception:
                pass

    try:
        while True:
            data = await websocket.receive()

            if "bytes" in data and data["bytes"]:
                buffer.append(data["bytes"])
                audio_bytes = accumulate_chunks(buffer)
                if audio_bytes is None:
                    continue
                buffer.clear()

                # Paralel task — bir önceki bitmeden yenisi başlar
                task = asyncio.create_task(process_chunk(audio_bytes, inbound_voice_id))
                active_tasks.add(task)
                task.add_done_callback(active_tasks.discard)

            elif "text" in data:
                msg = json.loads(data["text"])
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg.get("type") == "config":
                    if msg.get("voice_id"):
                        inbound_voice_id = msg["voice_id"]
                        logger.info(f"Inbound ses güncellendi: {inbound_voice_id}")

    except WebSocketDisconnect:
        logger.info("Inbound WebSocket bağlantısı kesildi.")
        for t in active_tasks:
            t.cancel()
    except Exception as e:
        logger.error(f"Inbound WebSocket hatası: {e}\n{traceback.format_exc()}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=settings.BACKEND_HOST,
        port=settings.BACKEND_PORT,
        reload=True,
        log_level="info",
    )
