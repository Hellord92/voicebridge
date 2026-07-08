# VoiceBridge

Real-time voice translation desktop app — speak any language, the meeting hears another.

No BlackHole. No VB-Cable. No external virtual audio driver setup. Just install and go.

## Project Structure

```
voicebridge/
├── app/          — Electron + React desktop app
├── core/         — C++ audio pipeline (PortAudio + VAD + phrase detection)
├── drivers/
│   ├── macos/    — CoreAudio AudioServerPlugin (virtual mic driver)
│   └── windows/  — WDM virtual audio driver / VB-Audio wrapper
├── server/       — FastAPI TTS proxy + license backend
├── website/      — Next.js marketing site (10+ languages, Stripe)
└── extension/    — Chrome extension (browser meeting rooms)
```

## Quick Start (Development)

**macOS:** See [docs/MACOS_DEV.md](docs/MACOS_DEV.md) for full setup (Node 20, PortAudio, build order).

### 1. Build virtual mic driver (macOS)
```bash
brew install portaudio cmake openssl@3
cd drivers/macos && cmake -B build && cmake --build build
```

### 2. Build C++ core + start Electron app
```bash
nvm use          # Node 20 — see .nvmrc
cd core && npm install && npm run build
cd ../app && npm install && npm run dev
```

### 3. Start backend server
```bash
cd server && pip install -r requirements.txt && uvicorn main:app --port 8000
```

### 4. Start website
```bash
cd website && npm install && npm run dev
```

## Architecture

```
Real Mic (headset) → C++ AudioCapture
  → WebRTC VAD → PhraseDetector
  → POST /api/pipeline {audio, sourceLang, targetLang, licenseKey}
  → Server: Groq Whisper STT → Google Translate → ElevenLabs TTS (key stays on server)
  → PCM stream → VoiceBridge virtual mic ring buffer
  → Meeting app reads from "VoiceBridge Microphone"
```

## Required Accounts (you provide)
- ElevenLabs API key (goes in `server/.env`)
- Groq API key (STT, goes in `server/.env`)
- Stripe account (payments)

## License
Proprietary — © VoiceBridge
