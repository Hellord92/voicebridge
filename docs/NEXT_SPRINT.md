# VoiceBridge — Next Sprint Checklist

Last updated: 2026-07-08

Priority: P0 = blocker, P1 = important, P2 = nice to have.

---

## P0 — Must Fix Before User Testing

### 1. Railway PostgreSQL (USER ACTION — 5 min)

The SQLite database resets every time Railway redeploys. License keys are lost.

**Steps:**
1. Go to [railway.app](https://railway.app) → your project
2. Click **+ Add Service** → **Database** → **PostgreSQL** → Deploy
3. Railway automatically sets `DATABASE_URL` env var for the server
4. Redeploy server (push any commit or click Deploy in dashboard)
5. Sign out of app → sign in again → license is recreated in PostgreSQL

**Test:**
```bash
curl -s https://api.voicebridgeapps.com/health | python3 -m json.tool
# Expect: "db": true
```

- [ ] PostgreSQL added to Railway project
- [ ] Server redeployed with new DATABASE_URL
- [ ] Sign out / sign in → pipeline works without "Server error"

---

### 2. Install New DMG + Sign In Flow

New DMG includes:
- PortAudio device dropdown (mic selection now actually works)
- VAD aggressiveness=2 + RMS energy gate (no more "Altyazı M.K." hallucination)
- Firebase token auto-refresh on startup
- License auto-sync from server

**Steps:**
1. Quit the current app
2. Drag old VoiceBridge to Trash
3. Open `app/dist/VoiceBridge-0.1.0-arm64.dmg`
4. Drag VoiceBridge to Applications
5. Open VoiceBridge
6. **Sign out** (if already signed in)
7. **Sign in with Google** → new `refreshToken` stored
8. Go to Settings → confirm MacBook Pro Microphone is selected in Input dropdown
9. Start session → speak Turkish → English should appear

**Test checklist:**
- [ ] DMG installs without Gatekeeper warning
- [ ] Sign in works
- [ ] Input dropdown shows PortAudio device names (not UUIDs)
- [ ] MacBook Pro Microphone is visible and selectable
- [ ] VoiceBridge Microphone visible in Output dropdown
- [ ] Start session → speak → transcript appears (NOT "Altyazı M.K.")
- [ ] Translation appears in THEY HEAR column
- [ ] Audio plays through VoiceBridge Microphone in Meet/Zoom

---

## P1 — Important Improvements

### 3. SetupWizard Mic Test — Use PortAudio Path

Currently the wizard uses `navigator.mediaDevices.getUserMedia` (Web Audio) for the 3-second level meter. This tests a different audio path than what the pipeline actually uses.

**Fix needed in:** `app/src/components/SetupWizard.jsx`
- Replace Web Audio level meter with a call to `window.vb.testMicLevel()` (new IPC handler)
- Or: add a short recording test that sends audio through the real pipeline path

**Test:**
- [ ] Speak during wizard mic step → level bar moves
- [ ] "Yes, I hear myself" → wizard proceeds
- [ ] Pipeline mic captures same device as wizard tested

---

### 4. Real Streaming TTS (Lower Latency)

Current: C++ client buffers entire SSE response before processing (httplib limitation). ElevenLabs supports streaming MP3 chunks but we receive them all at once.

**Current latency:** ~300–540ms (entire pipeline)
**Potential with true streaming:** first audio chunk < 200ms

**Fix needed in:**
- `core/src/AudioPipeline.cpp` — use `httplib` streaming response callback instead of buffering full body
- `server/main.py` — already generates SSE events; just need client to consume them incrementally

**Test:**
- [ ] First audio chunk plays < 300ms after VAD phrase end
- [ ] Latency badge in UI shows < 300ms

---

### 5. Mute-While-Speaking Duration Fix

`ttsPlaying` is set false immediately after `vb_shm_write()`, but audio keeps playing from the ring buffer for another 1-3 seconds. This can cause the mic to pick up TTS output if the room has echo.

**Fix in `AudioPipeline.cpp`:**
```cpp
// After vb_shm_write, estimate playback duration and sleep before clearing gate
size_t durationMs = (pcm48.size() * 1000) / 48000;
ttsPlaying.store(true);
vb_shm_write(pcm48.data(), (uint32_t)pcm48.size());
std::this_thread::sleep_for(std::chrono::milliseconds(durationMs + 200)); // +200ms buffer
ttsPlaying.store(false);
```

**Test:**
- [ ] During TTS playback, microphone does not re-trigger
- [ ] After TTS finishes, mic picks up next utterance correctly

---

### 6. Payment Integration

No payment flow exists yet. Options evaluated:
- **NOWPayments** (crypto) — API keys ready, webhook URL needed
- **Stripe** — requires company registration or personal account
- **Lemon Squeezy** — global, no company required, easy setup

**Next steps:**
- [ ] Choose payment provider (recommend: Lemon Squeezy for solo founder)
- [ ] Create product + pricing in provider dashboard
- [ ] Add `POST /api/payment/webhook` server endpoint
- [ ] Generate license key on successful payment
- [ ] Send license key email to buyer

---

## P2 — Nice to Have

### 7. Windows Support (MSI/NSIS)

The C++ addon compiles on Windows (PortAudio has WASAPI backend). Main blocker: no virtual mic driver for Windows yet.

Options:
- Bundle VB-Cable (free virtual audio cable) and auto-configure
- Build a Windows WDM/WASAPI virtual driver

**Estimate:** 2–3 weeks for a proper Windows driver.

- [ ] Research VB-Cable bundling license
- [ ] Test C++ core build on Windows (MSVC or MinGW)
- [ ] electron-builder NSIS target

---

### 8. Referral System

`/api/referral/claim` endpoint exists on server. UI input in Settings exists. Not yet tested end-to-end.

- [ ] Referral code input in Settings saves to store
- [ ] `POST /api/referral/claim` called on startup if code present
- [ ] Server grants trial extension or discount on valid code

---

### 9. Session Export

"Export session" button exists in UI but not wired.

- [ ] Export transcript + translation to `.txt` or `.pdf`
- [ ] Include session date, language pair, duration, word count

---

### 10. Auto-Update

Electron has built-in `autoUpdater`. Users on old DMGs won't get fixes.

- [ ] Set up S3 or GitHub Releases as update server
- [ ] Add `electron-updater` package
- [ ] Notify user when update is available → one-click install

---

## Test Protocol (Run After Every Change)

```bash
# 1. Server health
curl -s https://api.voicebridgeapps.com/health | python3 -m json.tool

# 2. Core build
cd core && npm run build 2>&1 | tail -3

# 3. App lint
cd app && npm run lint 2>&1 | tail -5

# 4. Driver visible
system_profiler SPAudioDataType | grep -i voicebridge

# 5. Pipeline end-to-end (needs valid license key)
# Sign in, get licenseKey from electron-store, then:
curl -X POST https://api.voicebridgeapps.com/api/pipeline/stream \
  -F "audio=@/tmp/test_real.wav;type=audio/wav" \
  -F "source_lang=tr" -F "target_lang=en" \
  -H "Authorization: Bearer <licenseKey>" | head -5
```
