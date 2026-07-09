#!/usr/bin/env bash
# VoiceBridge — complete macOS clean uninstall (any machine)
# Usage:
#   bash clean-install-macos.sh
# Or copy-paste the one-liner from docs/UNINSTALL_MACOS.md

set -u

echo "============================================"
echo "  VoiceBridge — FULL CLEAN UNINSTALL (macOS)"
echo "============================================"
echo ""

# ── 1. Quit processes ──────────────────────────────────────────────────────
echo "[1/8] Stopping VoiceBridge..."
osascript -e 'quit app "VoiceBridge"' 2>/dev/null || true
osascript -e 'quit app "Electron"' 2>/dev/null || true
pkill -9 -f "VoiceBridge" 2>/dev/null || true
pkill -9 -f "voicebridge" 2>/dev/null || true
sleep 2

# ── 2. Application bundle ──────────────────────────────────────────────────
echo "[2/8] Removing app..."
sudo rm -rf "/Applications/VoiceBridge.app" 2>/dev/null || rm -rf "/Applications/VoiceBridge.app" 2>/dev/null || true
rm -rf "$HOME/Applications/VoiceBridge.app" 2>/dev/null || true

# ── 3. User data (license, login, settings) ─────────────────────────────────
echo "[3/8] Removing user data..."
rm -rf "$HOME/Library/Application Support/voicebridge"
rm -rf "$HOME/Library/Application Support/VoiceBridge"
rm -rf "$HOME/Library/Application Support/app.voicebridge"
rm -rf "$HOME/Library/Application Support/Electron" 2>/dev/null || true  # dev only, skip if other apps use it — use with care

# Only remove Electron folder if it only contains voicebridge (safe check)
if [ -d "$HOME/Library/Application Support/Electron" ]; then
  if find "$HOME/Library/Application Support/Electron" -maxdepth 2 -name "config.json" -exec grep -l "licenseKey\|voicebridge\|VoiceBridge" {} \; 2>/dev/null | grep -q .; then
    rm -rf "$HOME/Library/Application Support/Electron"
    echo "       (removed Electron dev data with VoiceBridge settings)"
  fi
fi

# ── 4. Preferences & saved state ───────────────────────────────────────────
echo "[4/8] Removing preferences..."
rm -f  "$HOME/Library/Preferences/voicebridge.plist"
rm -f  "$HOME/Library/Preferences/com.voicebridge.voicebridge.plist"
rm -f  "$HOME/Library/Preferences/app.voicebridge.plist"
rm -rf "$HOME/Library/Saved Application State/voicebridge.savedState"
rm -rf "$HOME/Library/Saved Application State/com.voicebridge.voicebridge.savedState"
rm -rf "$HOME/Library/Saved Application State/app.voicebridge.savedState"

# ── 5. Caches & logs ───────────────────────────────────────────────────────
echo "[5/8] Removing caches and logs..."
rm -rf "$HOME/Library/Caches/voicebridge"
rm -rf "$HOME/Library/Caches/VoiceBridge"
rm -rf "$HOME/Library/Caches/app.voicebridge"
rm -rf "$HOME/Library/Logs/VoiceBridge"
rm -rf "$HOME/Library/Logs/voicebridge"

# ── 6. HAL audio driver ────────────────────────────────────────────────────
echo "[6/8] Removing VoiceBridge audio driver (sudo)..."
sudo rm -rf "/Library/Audio/Plug-Ins/HAL/VoiceBridgeAudio.driver" 2>/dev/null || true
sudo rm -rf "/tmp/VoiceBridgeAudio-staging.driver" 2>/dev/null || true
sudo rm -f  "/tmp/vb_driver.log" 2>/dev/null || true
sudo killall coreaudiod 2>/dev/null || true
sleep 3

# ── 7. DMG leftovers & downloads (optional) ────────────────────────────────
echo "[7/8] Cleaning DMG mount points..."
hdiutil detach "/Volumes/VoiceBridge" -force 2>/dev/null || true
hdiutil detach "/Volumes/VoiceBridge 1" -force 2>/dev/null || true

# ── 8. Verify ──────────────────────────────────────────────────────────────
echo "[8/8] Verification..."
echo ""

OK=0
FAIL=0

check_gone() {
  local label="$1"
  local path="$2"
  if [ -e "$path" ]; then
    echo "  FAIL: $label still exists → $path"
    FAIL=$((FAIL + 1))
  else
    echo "  OK:   $label removed"
    OK=$((OK + 1))
  fi
}

check_gone "App"              "/Applications/VoiceBridge.app"
check_gone "App data"         "$HOME/Library/Application Support/voicebridge"
check_gone "Preferences"      "$HOME/Library/Preferences/voicebridge.plist"
check_gone "Driver"           "/Library/Audio/Plug-Ins/HAL/VoiceBridgeAudio.driver"

if system_profiler SPAudioDataType 2>/dev/null | grep -qi "voicebridge"; then
  echo "  WARN: VoiceBridge still in audio device list — log out/in or restart Mac"
  FAIL=$((FAIL + 1))
else
  echo "  OK:   VoiceBridge not in system audio list"
  OK=$((OK + 1))
fi

echo ""
echo "============================================"
if [ "$FAIL" -eq 0 ]; then
  echo "  CLEAN UNINSTALL COMPLETE ($OK checks passed)"
else
  echo "  DONE with $FAIL warning(s) — restart Mac if driver still visible"
fi
echo "============================================"
echo ""
echo "Next: install fresh DMG → Sign in with Google → install driver"
echo ""
