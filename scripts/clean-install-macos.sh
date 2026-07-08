#!/usr/bin/env bash
# VoiceBridge — complete macOS clean uninstall
# Run: bash scripts/clean-install-macos.sh
# You will be prompted for sudo when removing the audio driver.

set -euo pipefail

echo "=== VoiceBridge clean uninstall ==="
echo ""

# 1. Quit app
echo "[1/6] Quitting VoiceBridge..."
osascript -e 'quit app "VoiceBridge"' 2>/dev/null || true
pkill -f "VoiceBridge" 2>/dev/null || true
sleep 2

# 2. Remove app bundle
echo "[2/6] Removing application..."
sudo rm -rf "/Applications/VoiceBridge.app" 2>/dev/null || rm -rf "/Applications/VoiceBridge.app" 2>/dev/null || true

# 3. Remove electron-store + caches + prefs
echo "[3/6] Removing app data (license, settings, login)..."
rm -rf "$HOME/Library/Application Support/voicebridge"
rm -rf "$HOME/Library/Application Support/VoiceBridge"
rm -rf "$HOME/Library/Preferences/com.voicebridge.voicebridge.plist"
rm -rf "$HOME/Library/Preferences/voicebridge.plist"
rm -rf "$HOME/Library/Caches/voicebridge"
rm -rf "$HOME/Library/Caches/VoiceBridge"
rm -rf "$HOME/Library/Logs/VoiceBridge"
rm -rf "$HOME/Library/Saved Application State/com.voicebridge.voicebridge.savedState"
rm -rf "$HOME/Library/Saved Application State/voicebridge.savedState"

# 4. Remove HAL audio driver (optional — comment out if you want to keep driver)
echo "[4/6] Removing VoiceBridge audio driver..."
sudo rm -rf "/Library/Audio/Plug-Ins/HAL/VoiceBridgeAudio.driver" 2>/dev/null || true
sudo killall coreaudiod 2>/dev/null || true
sleep 2

# 5. Clear driver debug log
echo "[5/6] Clearing driver logs..."
sudo rm -f /tmp/vb_driver.log 2>/dev/null || true

# 6. Verify
echo "[6/6] Verification..."
echo ""
if [ -d "/Applications/VoiceBridge.app" ]; then
  echo "  WARN: VoiceBridge.app still exists"
else
  echo "  OK: VoiceBridge.app removed"
fi
if [ -d "$HOME/Library/Application Support/voicebridge" ]; then
  echo "  WARN: App data still exists"
else
  echo "  OK: App data removed"
fi
if system_profiler SPAudioDataType 2>/dev/null | grep -qi voicebridge; then
  echo "  WARN: VoiceBridge mic still in system audio list (restart may be needed)"
else
  echo "  OK: VoiceBridge mic not in audio list"
fi

echo ""
echo "=== Clean uninstall complete ==="
echo "Next steps:"
echo "  1. Install fresh DMG"
echo "  2. Sign in with Google (creates new license on server)"
echo "  3. Install driver when prompted"
echo ""
