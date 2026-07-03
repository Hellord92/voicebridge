# VoiceBridge — GitHub Release

## Create v0.1.0 release

1. Ensure GitHub repo secrets are set (Settings → Secrets → Actions):
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
   - Optional code signing: `MAC_CERT_*`, `WIN_CERT_*`, `APPLE_*`

2. Tag and push:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. GitHub Actions builds:
   - `VoiceBridge.dmg` (macOS)
   - `VoiceBridge-Setup.exe` (Windows)

4. Download URLs (auto on release):
   - https://github.com/Hellord92/voicebridge/releases/latest/download/VoiceBridge.dmg
   - https://github.com/Hellord92/voicebridge/releases/latest/download/VoiceBridge-Setup.exe

## Local dev

```bash
cd app && npm install && npm run dev
cd core && npm run build   # native addon (requires PortAudio)
```
