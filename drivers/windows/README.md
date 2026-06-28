# VoiceBridge Windows Virtual Mic

## How it works

1. The installer bundles **VB-Audio Virtual Cable** (free, widely trusted).
2. During installation it runs `VBCABLE_Setup_x64.exe /S` silently.
3. Two system audio devices are created:
   - **CABLE Input** — VoiceBridge writes decoded TTS audio here
   - **CABLE Output** — user sets this as mic in Zoom/Meet/Teams
4. `WinVirtualMic.cpp` uses WASAPI shared mode to stream PCM into CABLE Input.

## Building the installer

### Prerequisites
- NSIS 3.x (`choco install nsis`)
- Electron app built: `cd app && npm run build`
- VB-Audio Cable installer in `drivers/windows/vbcable/VBCABLE_Setup_x64.exe`
  (download free from https://vb-audio.com/Cable/)

### Build
```bat
cd drivers\windows
makensis installer.nsi
```
Output: `VoiceBridgeSetup-0.1.0.exe`

## User setup flow

1. Run `VoiceBridgeSetup.exe`
2. VB-Audio Cable installs automatically
3. Open VoiceBridge app
4. In Zoom/Meet/Teams → Microphone → **CABLE Output**
5. VoiceBridge translates your speech → routes to CABLE Input → CABLE Output → meeting
