#!/usr/bin/env bash
# VoiceBridge — tek komutla imzalı DMG (vite + core + driver + electron-builder)
# Kullanım: ./scripts/build-dmg.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/_codesign-env.sh"
load_codesign_env "$ROOT"

ARCH="${ARCH:-arm64}"
SKIP_CORE="${SKIP_CORE:-0}"
SKIP_DRIVER="${SKIP_DRIVER:-0}"

echo ""
echo "══════════════════════════════════════════"
echo "  VoiceBridge DMG build ($ARCH)"
echo "══════════════════════════════════════════"

if [[ "$SKIP_CORE" != "1" ]]; then
  echo ""
  echo "🔨  C++ core (PortAudio addon)..."
  (cd "$ROOT/core" && npm run build)
else
  echo ""
  echo "⏭️   SKIP_CORE=1 — core build atlandı"
fi

DRIVER_SRC="$ROOT/drivers/macos/build/VoiceBridgeAudio.driver"
if [[ "$SKIP_DRIVER" != "1" ]]; then
  if [[ ! -d "$DRIVER_SRC/Contents/MacOS" ]]; then
    echo ""
    echo "🔨  Sanal mikrofon driver..."
    cmake -B "$ROOT/drivers/macos/build" -S "$ROOT/drivers/macos" \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64"
    cmake --build "$ROOT/drivers/macos/build"
  else
    echo ""
    echo "✅  Driver zaten derlenmiş: $DRIVER_SRC"
  fi
else
  echo ""
  echo "⏭️   SKIP_DRIVER=1 — driver build atlandı"
fi

cd "$ROOT/app"

echo ""
echo "🔨  Vite (React UI → dist/index.html)..."
npx vite build

if [[ ! -f dist/index.html ]]; then
  echo "❌  dist/index.html yok — vite build başarısız"
  exit 1
fi

echo ""
echo "🧹  Önceki yarım mac build temizleniyor..."
rm -rf dist/mac-arm64

echo ""
echo "📦  electron-builder (imza + DMG)..."
npx electron-builder --"$ARCH" --mac dmg

echo ""
echo "✅  Tamamlandı!"
ls -lh "$ROOT/app/dist/"VoiceBridge-*-"$ARCH".dmg 2>/dev/null || ls -lh "$ROOT/app/dist/"*.dmg
echo ""
echo "Kurulum: open app/dist/VoiceBridge-*-${ARCH}.dmg"
