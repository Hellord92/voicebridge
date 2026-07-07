#!/usr/bin/env bash
# VoiceBridge — Apple Developer ID ile imzalama + notarization + DMG build
# Kullanım: ./scripts/sign-and-package.sh
#
# Önce .env.codesign dosyasını doldurun:
#   APPLE_ID, APPLE_TEAM_ID, APPLE_APP_PASSWORD, DEVELOPER_ID_APP, DEVELOPER_ID_INSTALLER

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.codesign"

# ── 1. Environment yükle ───────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌  $ENV_FILE bulunamadı."
  echo "    Önce: cp .env.codesign.example .env.codesign  ve doldurun."
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

required_vars=(APPLE_ID APPLE_TEAM_ID APPLE_APP_PASSWORD DEVELOPER_ID_APP)
for v in "${required_vars[@]}"; do
  [[ -z "${!v:-}" ]] && { echo "❌  $v eksik (.env.codesign)"; exit 1; }
done

echo "👤  Developer: $DEVELOPER_ID_APP"
echo "🆔  Team ID:   $APPLE_TEAM_ID"

# ── 2. Driver'ı derle (arm64) ──────────────────────────────────────────────────
DRIVER_SRC="$ROOT/drivers/macos"
DRIVER_BUILD="$DRIVER_SRC/build"
DRIVER_BUNDLE="$DRIVER_BUILD/VoiceBridgeAudio.driver"

echo ""
echo "🔨  Driver derleniyor..."
cmake -B "$DRIVER_BUILD" -S "$DRIVER_SRC" \
  -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64" \
  -DCMAKE_BUILD_TYPE=Release
cmake --build "$DRIVER_BUILD" --config Release

# ── 3. Driver'ı imzala ────────────────────────────────────────────────────────
echo ""
echo "✍️   Driver imzalanıyor..."
# Hardened Runtime + Info.plist bağlama ile imzala
codesign --force --deep --strict \
  --options runtime \
  --sign "$DEVELOPER_ID_APP" \
  --timestamp \
  "$DRIVER_BUNDLE"

# Doğrula
echo "🔍  İmza doğrulanıyor..."
codesign --verify --deep --strict --verbose=1 "$DRIVER_BUNDLE"
echo "✅  Driver imzası OK"

# ── 4. Driver'ı notarize et ───────────────────────────────────────────────────
# SKIP_NOTARIZE=1 → sadece imzalı driver (yerel geliştirme). Dağıtım için notarize gerekli.
NOTARY_TIMEOUT="${NOTARY_TIMEOUT:-2h}"

if [[ "${SKIP_NOTARIZE:-0}" == "1" ]]; then
  echo ""
  echo "⏭️   SKIP_NOTARIZE=1 — notarization atlandı (yerel test için imza yeterli)"
else
  echo ""
  echo "📤  Driver notarize ediliyor (max bekleme: $NOTARY_TIMEOUT)..."
  DRIVER_ZIP="/tmp/VoiceBridgeAudio-notarize.zip"
  ditto -c -k --sequesterRsrc --keepParent "$DRIVER_BUNDLE" "$DRIVER_ZIP"

  SUBMIT_OUT="$(mktemp)"
  set +e
  xcrun notarytool submit "$DRIVER_ZIP" \
    --apple-id "$APPLE_ID" \
    --team-id  "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_PASSWORD" \
    --wait \
    --timeout "$NOTARY_TIMEOUT" \
    2>&1 | tee "$SUBMIT_OUT"
  SUBMIT_RC=${PIPESTATUS[0]}
  set -e

  SUBMISSION_ID="$(grep -Eo 'id: [0-9a-f-]{36}' "$SUBMIT_OUT" | tail -1 | awk '{print $2}')"
  rm -f "$SUBMIT_OUT"

  if [[ $SUBMIT_RC -ne 0 ]]; then
    echo ""
    echo "⏳  Notarization henüz bitmedi veya zaman aşımı ($NOTARY_TIMEOUT)."
    [[ -n "$SUBMISSION_ID" ]] && echo "    Submission ID: $SUBMISSION_ID"
    echo "    Durum kontrolü:"
    echo "      xcrun notarytool info <id> --apple-id ... --team-id ... --password ..."
    echo "    Kabul edildikten sonra:"
    echo "      xcrun stapler staple \"$DRIVER_BUNDLE\""
    echo "    Yerel test için beklemeden devam:"
    echo "      SKIP_NOTARIZE=1 ./scripts/sign-and-package.sh"
    echo "      veya: ./scripts/install-driver.sh"
    exit 1
  fi

  xcrun stapler staple "$DRIVER_BUNDLE"
  echo "✅  Driver notarize OK"
fi

# ── 5. Electron app build + sign + notarize ───────────────────────────────────
echo ""
echo "🏗   Electron app build ediliyor..."
cd "$ROOT/app"

# electron-builder environment variables (otomatik kullanır)
export CSC_IDENTITY_AUTO_DISCOVERY=true
export APPLE_ID="$APPLE_ID"
export APPLE_APP_SPECIFIC_PASSWORD="${APPLE_APP_PASSWORD}"
export APPLE_TEAM_ID="$APPLE_TEAM_ID"

# Önce Vite build
npx vite build

# electron-builder (sign + notarize otomatik)
npx electron-builder --arm64 --mac dmg

echo ""
echo "✅  Tamamlandı!"
echo "📦  DMG: $ROOT/app/dist/VoiceBridge-*-arm64.dmg"
ls -lh "$ROOT/app/dist/"*arm64.dmg 2>/dev/null || true
