# VoiceBridge macOS Virtual Microphone Driver

## What it does

Installs a CoreAudio AudioServerPlugin that creates a virtual device called
**"VoiceBridge Microphone"** in System Preferences → Sound → Input.

When the VoiceBridge desktop app runs, it decodes TTS audio and writes PCM
samples via POSIX shared memory (`/voicebridge_shm`). The driver reads from
that ring buffer and exposes the data as if a real microphone was speaking.

## Requirements

- macOS 10.15 (Catalina) or later
- Xcode Command Line Tools
- CMake 3.20+
- Apple Developer ID Application certificate (for notarization)

## Build

```bash
cd drivers/macos
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

Output: `build/VoiceBridgeAudio.driver`

## Install

```bash
sudo cmake --install build
# Re-opens coreaudiod automatically
```

Or manually:
```bash
sudo cp -R build/VoiceBridgeAudio.driver /Library/Audio/Plug-Ins/HAL/
sudo launchctl kickstart -kp system/com.apple.audio.coreaudiod
```

## Uninstall

```bash
sudo rm -rf /Library/Audio/Plug-Ins/HAL/VoiceBridgeAudio.driver
sudo launchctl kickstart -kp system/com.apple.audio.coreaudiod
```

## IPC Protocol

The desktop app links against `ShmWriter.cpp` (or calls via the Node.js addon).

```c
vb_shm_open();              // once at startup
vb_shm_write(pcm, frames); // called per decoded MP3 chunk
vb_shm_close();             // on exit
```

## Signing & Notarization (distribution)

```bash
# Sign
codesign --force --sign "Developer ID Application: Your Name (TEAMID)" \
    --entitlements entitlements.plist \
    build/VoiceBridgeAudio.driver

# Notarize
xcrun notarytool submit VoiceBridgeAudio.driver.zip \
    --apple-id you@example.com \
    --team-id TEAMID \
    --password @keychain:AC_PASSWORD \
    --wait
```
