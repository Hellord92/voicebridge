# VoiceBridge — Proje Özeti

## Ne yapıyor?

Sen Türkçe konuşursun → uygulama anında İngilizceye çevirir → o İngilizce sesi sanal bir mikrofona yazar → Google Meet / Zoom / WhatsApp karşı taraftaki kişi seni İngilizce duyar. Karşı taraf fark etmez, sanki gerçekten İngilizce konuşuyormuşsun gibi.

---a

## Desteklenen Platformlar

| Platform | Sanal Mikrofon Yöntemi |
|---|---|
| **macOS** | CoreAudio HAL Plugin (`VoiceBridgeAudio.driver`) — Shared Memory ring buffer |
| **Windows** | VB-Audio Virtual Cable (WASAPI exclusive mode) |

---

## Klasör Yapısı

```
google meet transle/
├── app/                    → Electron masaüstü uygulaması (React UI)
│   ├── electron/
│   │   ├── main.js         → Electron ana process, IPC handler'lar
│   │   └── preload.js      → Renderer'a window.vb API'si aç
│   └── src/
│       ├── App.jsx         → Ana React component, tüm state burada
│       └── components/
│           ├── LiveConversationPanel.jsx  → Sol: transcript, Sağ: çeviri
│           └── DeviceSelector.jsx         → Mikrofon seçici + yenile butonu
│
├── core/                   → C++ Native Addon (node-gyp ile Electron'a bağlanır)
│   ├── src/
│   │   ├── AudioCapture.cpp   → PortAudio: mikrofon açma, cihaz listeleme
│   │   ├── AudioPipeline.cpp  → Ana pipeline: VAD → HTTP → MP3 decode → SHM
│   │   ├── PhraseDetector.cpp → VAD: sessizlik tespiti, cümle sonu belirleme
│   │   └── VAD.cpp            → Ses aktivasyon dedektörü
│   └── addon/
│       └── addon.cpp          → N-API köprüsü: C++ → JavaScript
│
├── server/                 → Python FastAPI backend (AI servisleri)
│   ├── main.py             → API endpoint'leri (/api/pipeline/stream)
│   ├── config.py           → API key'ler, model isimleri
│   └── services/
│       ├── stt.py              → Groq Whisper (ses → metin)
│       ├── translate.py        → Groq LLaMA (metin → çeviri)
│       ├── tts_proxy.py        → ElevenLabs (çeviri → ses)
│       ├── pipeline_ai.py      → STT + Translate koordinasyonu
│       ├── optimizations.py    → HTTP keep-alive, streaming TTS
│       └── resilience.py       → Retry, circuit breaker
│
├── drivers/
│   ├── macos/
│   │   ├── VoiceBridgeDriver.cpp/h  → CoreAudio HAL Plugin (sanal mic driver)
│   │   └── ShmWriter.cpp/h          → Shared memory ring buffer yazıcı
│   └── windows/
│       └── WinVirtualMic.cpp/h      → WASAPI → VB-Audio CABLE Input yazıcı
│
├── extension/              → Chrome Extension (alternatif yöntem - web tabanlı)
│   ├── background/         → Service worker
│   ├── content/            → Meet sayfasına inject edilen script
│   └── popup/              → Extension popup UI
│
├── website/                → Pazarlama sitesi (Next.js)
├── .env                    → API key'ler (GROQ, ELEVENLABS)
└── start.sh                → Tüm servisleri tek komutla başlatır
```

---

## Ses Pipeline'ı — Adım Adım

```
1. KULLANICI KONUŞUR
   └─ MacBook Mic / Haylou X1 (Bluetooth)

2. PORTAUDIO (C++ — AudioCapture.cpp)
   └─ float32 mono, 48kHz, 512 frame chunk'lar

3. VAD — PHRASE DETECTOR (C++ — PhraseDetector.cpp)
   └─ Sessizlik > 150ms → cümle bitti sinyali
   └─ Minimum cümle uzunluğu: 100ms

4. HTTP POST → FASTAPI SERVER (:8000)
   └─ /api/pipeline/stream  (multipart form: audio WAV + dil bilgisi)
   └─ SSE stream ile sonuçlar geri gelir

5. FASTAPI SERVER (Python)
   ├─ Groq Whisper        → transcript  (ses → metin, ~300ms)
   ├─ Groq LLaMA 3.1 8B  → translation (metin → çeviri, ~200ms)
   └─ ElevenLabs          → audio_b64   (çeviri → MP3 ses, ~400ms)

6. SSE CALLBACK → C++ CORE
   ├─ "transcript"   → Electron IPC → React UI (sol sütun)
   ├─ "translation"  → Electron IPC → React UI (sağ sütun)
   └─ "audio_b64"    → base64 decode → MP3 decode → PCM float32

7. RESAMPLE + FORMAT
   └─ 44.1kHz mono → 48kHz mono (TTS çıkışı → driver formatı)

8. SANAL MİKROFONA YAZ
   ├─ macOS: ShmWriter → /voicebridge_shm ring buffer
   │         CoreAudio HAL driver okur → sistem bunu "VoiceBridge Mic" olarak gösterir
   └─ Windows: WASAPI → VB-Audio CABLE Input
               Kullanıcı Meet'te "CABLE Output" seçer → ses oradan gelir
```

---

## AI Servisleri

| Servis | Model | Görev | Ortalama Süre |
|---|---|---|---|
| Groq Whisper | `whisper-large-v3-turbo` | Ses → Metin (STT) | ~300ms |
| Groq LLaMA | `llama-3.1-8b-instant` | Metin → Çeviri | ~200ms |
| ElevenLabs | streaming | Çeviri → Ses (TTS) | ~400ms |
| **Toplam** | | | **~900ms** |

---

## Electron ↔ C++ İletişim (IPC Zinciri)

```
React UI
  │  window.vb.startPipeline(opts)
  ↓
preload.js (ipcRenderer)
  ↓
main.js (ipcMain.handle)
  ↓
core/addon/addon.cpp (N-API)
  ↓
AudioPipeline.cpp (C++)
  │
  ├── onTranscript  callback → main.js → preload → App.jsx
  ├── onTranslation callback → main.js → preload → App.jsx
  ├── onLatency     callback → main.js → preload → App.jsx
  └── onError       callback → main.js → preload → App.jsx
```

**Expose edilen fonksiyonlar** (`window.vb.*`):
- `startPipeline(opts)` — pipeline başlat
- `stopPipeline()` — durdur
- `listDevices()` — mikrofon listesi
- `refreshDevices()` — hot-plug sonrası yenile
- `setLanguages(src, tgt)` — dil değiştir
- `getSettings() / saveSettings()` — ayarları kaydet

---

## Şu An Çalışan / Çalışmayan

| Özellik | Durum |
|---|---|
| Mikrofon sesi yakalama | ✅ Çalışıyor |
| VAD (cümle tespiti) | ✅ Çalışıyor |
| Groq STT (transcript) | ✅ Çalışıyor |
| Groq çeviri | ✅ Çalışıyor |
| ElevenLabs TTS (ses üretimi) | ✅ Çalışıyor |
| UI'da transcript + çeviri gösterme | ✅ Çalışıyor |
| Cihaz yenileme (hot-plug) | ✅ Çalışıyor |
| **Sanal mikrofona ses yazma** | ❌ Driver kurulu değil |
| **Meet'te ses duyulması** | ❌ Driver olmadan olmaz |

---

## Eksik Parça — Sanal Mikrofon

Ses pipeline'ının son adımı tamamlanmamış:
- **macOS:** `VoiceBridgeAudio.driver` (CoreAudio HAL Plugin) yazıldı ama sisteme kurulmadı. Kurulması için `codesign` + `System Extension` onayı gerekiyor.
- **Windows:** VB-Audio Virtual Cable kurulumu gerekiyor.

Geçici çözüm: **BlackHole 2ch** (açık kaynak, imzalı) kurulursa Meet'te mikrofon olarak seçilebilir.

---

## Başlatma

```bash
cd "/Users/sezer/Documents/google meet transle"
bash start.sh
```

Bu komut sırayla şunları başlatır:
1. FastAPI server (`:8000`) — AI pipeline
2. Vite dev server (`:5173`) — React UI
3. Electron — masaüstü penceresi

---

## API Key'ler (`.env`)

```
GROQ_API_KEY=...        # STT + Çeviri
ELEVENLABS_API_KEY=...  # TTS
ELEVENLABS_VOICE_ID=... # Ses karakteri
```
