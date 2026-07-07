# VoiceBridge macOS Driver — Code Signing & Notarization

Production releases must be signed and notarized so macOS loads the HAL driver without Gatekeeper blocks.

## Prerequisites

- Apple Developer Program membership
- Developer ID Application certificate (for `.app` and `.driver`)
- App-specific password for notarization

## Driver bundle signing

After building the driver:

```bash
cd drivers/macos/build
codesign --force --deep --sign "Developer ID Application: Your Company (TEAMID)" \
  --options runtime \
  VoiceBridgeAudio.driver
codesign -vvv VoiceBridgeAudio.driver
```

Install to HAL path only after signing:

```bash
sudo rm -rf /Library/Audio/Plug-Ins/HAL/VoiceBridgeAudio.driver
sudo cp -R VoiceBridgeAudio.driver /Library/Audio/Plug-Ins/HAL/
sudo killall coreaudiod
```

## Electron app signing

Set in CI (`.github/workflows/build.yml`):

- `CSC_LINK` — base64 `.p12` certificate
- `CSC_KEY_PASSWORD`
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `TEAM_ID`

## Verification checklist

1. `spctl -a -vv VoiceBridgeAudio.driver` → accepted
2. System Settings → Sound → Input shows **VoiceBridge Microphone**
3. Info.plist UUID must be `EEA5773D-CC43-49F1-8E00-8F9696E7D23B`
