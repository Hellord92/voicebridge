#!/usr/bin/env bash
# VoiceBridge — sign + notarize + staple HAL driver, then install.
# Requires .env.codesign (APPLE_ID, APPLE_TEAM_ID, APPLE_APP_SPECIFIC_PASSWORD, DEVELOPER_ID_APP)
#
# Usage:
#   ./scripts/notarize-driver.sh
#   DRIVER_ONLY=1 ./scripts/notarize-driver.sh   # skip install, only notarize build output
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/_codesign-env.sh"
load_codesign_env "$ROOT" || exit 1

[[ -z "${DEVELOPER_ID_APP:-}" ]] && { echo "❌  DEVELOPER_ID_APP eksik (.env.codesign)"; exit 1; }
[[ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]] && {
  echo "❌  APPLE_APP_SPECIFIC_PASSWORD eksik — appleid.apple.com → App-Specific Passwords"
  exit 1
}

DRIVER_SRC="$ROOT/drivers/macos"
DRIVER_BUILD="$DRIVER_SRC/build"
DRIVER_BUNDLE="$DRIVER_BUILD/VoiceBridgeAudio.driver"
NOTARY_TIMEOUT="${NOTARY_TIMEOUT:-2h}"

if [[ ! -d "$DRIVER_BUNDLE/Contents/MacOS" ]]; then
  echo "🔨  Driver derleniyor..."
  cmake -B "$DRIVER_BUILD" -S "$DRIVER_SRC" \
    -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64" \
    -DCMAKE_BUILD_TYPE=Release
  cmake --build "$DRIVER_BUILD" --config Release
fi

echo "✍️   Driver imzalanıyor (HAL — hardened runtime YOK)..."
codesign --force --deep --strict \
  --sign "$DEVELOPER_ID_APP" \
  --timestamp \
  "$DRIVER_BUNDLE"
codesign --verify --deep --strict --verbose=1 "$DRIVER_BUNDLE"
echo "✅  İmza OK"

echo "📤  Notarize gönderiliyor (bekleme: $NOTARY_TIMEOUT)..."
DRIVER_ZIP="/tmp/VoiceBridgeAudio-notarize.zip"
rm -f "$DRIVER_ZIP"
ditto -c -k --sequesterRsrc --keepParent "$DRIVER_BUNDLE" "$DRIVER_ZIP"

SUBMIT_OUT="$(mktemp)"
set +e
xcrun notarytool submit "$DRIVER_ZIP" \
  --apple-id "$APPLE_ID" \
  --team-id  "$APPLE_TEAM_ID" \
  --password "${APPLE_APP_SPECIFIC_PASSWORD}" \
  --wait \
  --timeout "$NOTARY_TIMEOUT" \
  2>&1 | tee "$SUBMIT_OUT"
SUBMIT_RC=${PIPESTATUS[0]}
set -e

SUBMISSION_ID="$(grep -Eo 'id: [0-9a-f-]{36}' "$SUBMIT_OUT" | tail -1 | awk '{print $2}')"
rm -f "$SUBMIT_OUT" "$DRIVER_ZIP"

if [[ $SUBMIT_RC -ne 0 ]]; then
  echo ""
  echo "❌  Notarization başarısız veya zaman aşımı."
  [[ -n "$SUBMISSION_ID" ]] && echo "    Submission ID: $SUBMISSION_ID"
  echo "    Log: xcrun notarytool log $SUBMISSION_ID --apple-id ... --team-id ... --password ..."
  exit 1
fi

echo "📎  Staple..."
xcrun stapler staple "$DRIVER_BUNDLE"
spctl --assess --type execute -v "$DRIVER_BUNDLE" 2>&1 | sed 's/^/    /' || true
echo "✅  Driver notarize + staple OK"

if [[ "${DRIVER_ONLY:-0}" == "1" ]]; then
  echo "⏭️   DRIVER_ONLY=1 — kurulum atlandı. Şimdi: sudo ./scripts/install-driver.sh"
  exit 0
fi

echo ""
echo "📥  Kurulum..."
sudo "$ROOT/scripts/install-driver.sh"
