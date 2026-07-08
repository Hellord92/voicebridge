# VoiceBridge — Current Status

Last updated: 2026-07-08

---

## Architecture Overview

```
MacBook Pro Mic
    │  (PortAudio, float32 mono 48 kHz)
    ▼
C++ AudioCapture → PhraseDetector (WebRTC VAD aggressiveness=2)
    │  RMS gate: skip if RMS < 0.005
    ▼
HTTP POST /api/pipeline/stream  (WAV 48kHz mono int16, Bearer licenseKey)
    │
    ▼  FastAPI on Railway
    ├─ STT:       Groq Whisper (trial) / OpenAI (paid)
    ├─ Translate: Groq LLaMA  (trial) / Gemini (paid)
    └─ TTS:       ElevenLabs eleven_flash_v2_5 mp3_44100_64
    │
    ▼  SSE events: transcript / translation / audio_b64 / done
minimp3 decode → resample 44.1→48 kHz
    │
    ▼
POSIX SHM /voicebridge_shm
    │
    ▼
VoiceBridgeAudio.driver (CoreAudio HAL)
    │
    ▼
Google Meet / Zoom / Teams  (select "VoiceBridge Microphone")
```

---

## Component Status

### Driver — VoiceBridgeAudio.driver

| Item | Status | Evidence |
|------|--------|---------|
| Compiles | Working | cmake build succeeds |
| Code signs | Working | `codesign --verify` passes |
| Notarized | Working | `xcrun stapler validate` OK |
| Loads in CoreAudio | Working | `system_profiler SPAudioDataType` shows "VoiceBridge Microphone" |
| Shared memory write | Working | `vb_shm_write` in AudioPipeline.cpp tested |
| Shared memory read | Working | Driver reads from `/voicebridge_shm` ring buffer |

### C++ Core Addon (@voicebridge/core)

| Item | Status | Notes |
|------|--------|-------|
| Compiles | Working | `npm run build` in core/ succeeds |
| Loads in packaged DMG | Working | Static linking PortAudio + OpenSSL |
| `listInputDevices()` | Working | Returns `{index, name}[]` from PortAudio |
| VAD (WebRTC fvad) | Working | aggressiveness=2, 48kHz→16kHz resample |
| RMS energy gate | Working | Blocks RMS < 0.005 — prevents noise hallucination |
| PhraseDetector | Working | minPhrase=200ms, silence=500ms, max=12s |
| HTTP POST to server | Working | httplib, SSL, multipart WAV |
| SSE parse | Working | Buffers full response then parses events |
| MP3 decode (minimp3) | Working | |
| SHM write to driver | Working | `vb_shm_write()` |
| Mute-while-speaking | Working | `ttsPlaying` atomic gate |

### Electron App

| Item | Status | Notes |
|------|--------|-------|
| Google Sign-In | Working | Firebase popup auth |
| Firebase token refresh | Working | main.js `get-stored-user` refreshes via REST API |
| License sync on startup | Working | `/api/auth/me` called on token refresh |
| PortAudio device dropdown | **Fixed (2026-07-08)** | Previously used Web Audio IDs, now PortAudio index |
| `inputDeviceIndex` → pipeline | Working | Correctly passed to `core.startPipeline` |
| `inputDeviceName` persisted | **Fixed (2026-07-08)** | Stored and restored from electron-store |
| Mic permission check | Working | `systemPreferences.getMediaAccessStatus` |
| DMG build | Working | Signed + notarized, `app/dist/VoiceBridge-0.1.0-arm64.dmg` |
| Setup Wizard mic test | Partial | Uses Web Audio (not PortAudio) — visual only |
| LiveConversationPanel | Working | Shows transcript + translation in real time |
| Session summary | Working | `SessionSummary` component on Stop |

### FastAPI Server (Railway)

| Item | Status | Notes |
|------|--------|-------|
| Deployed | Working | `https://api.voicebridgeapps.com` |
| `/health` | Working | `{"status":"ok","groq":true,"eleven":true,"firebase":true}` |
| `/api/auth/me` | Working | Creates/returns license on Firebase JWT |
| `/api/pipeline/stream` | Working | SSE endpoint tested end-to-end |
| STT (Groq Whisper) | Working | transcript event fires |
| Translation (Groq) | Working | translation event fires |
| TTS (ElevenLabs) | Working | audio_b64 event fires, 44.1kHz MP3 |
| Firebase Admin SDK | Working | `FIREBASE_SERVICE_ACCOUNT_JSON` set on Railway |
| Database | **Issue** | SQLite is ephemeral — resets on redeploy |
| Free trial | Working | 30 min / 24h rolling window |

### Website (voicebridgeapps.com)

| Item | Status | Notes |
|------|--------|-------|
| Deployed on Vercel | Working | |
| 100 languages listed | Working | `LANGUAGES.length === 100` |
| Contact email visible | Working | `info@voicebridgeapps.com` |
| Cloudflare Analytics | Configured | Beacon script added |

---

## Known Issues

### Critical
- **Railway SQLite resets on redeploy** — license keys lost after each deployment. User must sign out / sign in to re-create license. Fix: add PostgreSQL service on Railway.

### Medium
- **SetupWizard mic test uses Web Audio** — does not test actual PortAudio capture path. A user could pass the wizard test but still have the wrong device selected.
- **SSE not streamed on C++ client** — `httplib::Client::Post` buffers entire response body. True streaming latency improvement requires chunked response handling.

### Minor
- **Two worker threads** drain the same queue — potential for overlapping HTTP requests on long phrases.
- **`ttsPlaying` gate does not cover full playback duration** — set to false immediately after `vb_shm_write`, not after audio finishes playing.
- **Gemini translate** disabled on server (`gemini: false` in /health).
- **`outputDeviceIndex` in PipelineConfig** not implemented — TTS always goes to SHM regardless.

---

## Tested End-to-End Results

| Test | Result | Latency |
|------|--------|---------|
| Server pipeline (curl, WAV → SSE) | Pass | 300–540ms |
| STT transcript fires | Pass | — |
| Translation fires | Pass | — |
| audio_b64 fires | Pass | — |
| Noise blocked by RMS gate | Pass | noise RMS=0.0015 < 0.005 |
| Real audio passes gate | Pass | sine RMS=0.212 > 0.005 |
