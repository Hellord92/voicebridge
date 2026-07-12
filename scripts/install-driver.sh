#!/usr/bin/env bash
# Install VoiceBridge virtual mic driver (macOS). Requires sudo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# $1 can override driver source (used when running from packaged app bundle)
if [[ -n "${1:-}" && -d "${1}/Contents/MacOS" ]]; then
  SRC="$1"
else
  SRC="${VB_DRIVER_SRC:-$ROOT/drivers/macos/build/VoiceBridgeAudio.driver}"
fi
DEST="/Library/Audio/Plug-Ins/HAL/VoiceBridgeAudio.driver"

if [[ ! -d "$SRC/Contents/MacOS" ]]; then
  echo "Build driver first:"
  echo "  cd \"$ROOT/drivers/macos\" && cmake -B build && cmake --build build"
  exit 1
fi

# ── Otomatik imzalama (Developer ID varsa) ────────────────────────────────────
ENV_FILE="$ROOT/.env.codesign"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

CERT="${DEVELOPER_ID_APP:-}"
if [[ -z "$CERT" ]]; then
  # Keychain'de Developer ID Application sertifikası var mı otomatik bul
  CERT=$(security find-identity -v -p codesigning 2>/dev/null \
    | grep "Developer ID Application" \
    | head -1 \
    | sed 's/.*"\(.*\)"/\1/' || true)
fi

if [[ -n "$CERT" ]]; then
  echo "✍️   Signing driver with: $CERT"
  # No --options runtime: HAL plugins must NOT use hardened runtime (breaks loading on macOS 26)
  codesign --force --deep --strict \
    --sign "$CERT" \
    --timestamp \
    "$SRC" 2>/dev/null && echo "✅  Driver signed OK" || echo "⚠️  Signing failed, continuing anyway"
else
  echo "ℹ️   No Developer ID found — installing unsigned (may not load on Ventura+)"
fi

# ── Kopyala ───────────────────────────────────────────────────────────────────
echo "Installing VoiceBridgeAudio.driver → $DEST"
STAGING="/tmp/VoiceBridgeAudio-staging.driver"
rm -rf "$STAGING"
cp -R "$SRC" "$STAGING"
sudo rm -rf "$DEST"
sudo cp -R "$STAGING" "$DEST"
rm -rf "$STAGING"

# Re-sign installed copy (cp can break signatures on some macOS versions)
if [[ -n "$CERT" ]]; then
  echo "✍️   Re-signing installed driver at $DEST"
  if sudo codesign --force --deep --strict --sign "$CERT" --timestamp "$DEST" 2>/dev/null; then
    echo "✅  Installed driver signed"
  else
    echo "⚠️  Re-sign on $DEST failed"
  fi
fi

# ── coreaudiod yeniden başlat ─────────────────────────────────────────────────
echo "Reloading Core Audio..."
if sudo killall coreaudiod 2>/dev/null; then
  echo "✓ coreaudiod restarted"
elif sudo launchctl kickstart -kp system/com.apple.audio.coreaudiod 2>/dev/null; then
  echo "✓ coreaudiod kickstarted"
else
  echo "⚠ SIP blocked audio daemon restart (normal on modern macOS)"
fi

sleep 2

# Gatekeeper HAL plug-in'leri notarize olmadan yüklemeyebilir (macOS 13+)
SPCTL_OUT="$(spctl -a -vv -t install "$DEST" 2>&1 || true)"
if echo "$SPCTL_OUT" | grep -qi 'rejected'; then
  echo "🚫  Gatekeeper reddetti — driver dosyada ama CoreAudio yüklemiyor."
  echo "$SPCTL_OUT" | grep -E 'rejected|source=' | sed 's/^/    /'
  if echo "$SPCTL_OUT" | grep -qi 'no usable signature'; then
    echo "    Developer ID ile imzala: export DEVELOPER_ID_APP=\"Developer ID Application: ...\""
    echo "    Sonra tekrar: ./scripts/install-driver.sh"
  elif echo "$SPCTL_OUT" | grep -qi 'Unnotarized'; then
    echo "    Notarize + staple sonrası tekrar kur:"
    echo "      xcrun stapler staple \"$SRC\""
    echo "      ./scripts/install-driver.sh"
    echo "    Durum: xcrun notarytool history --apple-id ... --team-id ... --password ..."
  fi
elif system_profiler SPAudioDataType 2>/dev/null | grep -qi voicebridge; then
  echo "✅  VoiceBridge Microphone visible in system"
else
  echo "⚠  Driver installed but mic not listed yet."
  if [[ -z "$CERT" ]]; then
    echo "   → Driver is unsigned. Get Apple Developer ID to fix this."
  else
    echo "   → Try: sudo killall coreaudiod  or  restart Mac"
  fi
fi
