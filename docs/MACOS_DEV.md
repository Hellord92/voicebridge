# macOS Local Development

## Prerequisites

- **Node.js 20** (Electron 31 is built on Node 20 — Node 24 will fail)
- Homebrew: `portaudio`, `cmake`, `openssl@3`

```bash
brew install portaudio cmake openssl@3
```

If you use nvm:

```bash
nvm install    # reads .nvmrc → Node 20
nvm use
```

## Build order

Run from the repo root:

```bash
# 1. Virtual audio driver (optional for first UI test; required for Meet/WhatsApp mic)
cd drivers/macos && cmake -B build && cmake --build build && cd ../..

# Install driver (admin password required):
#   cd drivers/macos && sudo cmake --install build
#
# If VoiceBridge Microphone does not appear in System Settings, rebuild and
# reinstall after any Info.plist change, then log out and back in.

# 2. C++ native addon (bundles libfvad; needs PortAudio)
cd core && npm install && npm run build && cd ..

# 3. Electron app
cd app && npm install && npm run dev
```

## Troubleshooting

### `Cannot find module 'node-addon-api'`

Do **not** run `npm install` only from `app/` before building `core/`. Build core first (step 2 above).

### `pkg-config: portaudio-2.0 not found`

```bash
brew install portaudio
export PKG_CONFIG_PATH="$(brew --prefix portaudio)/lib/pkgconfig:$PKG_CONFIG_PATH"
```

### `'functional' file not found` (macOS 26+)

Command Line Tools sometimes omit libc++ headers from the default search path. Reinstall CLT if needed:

```bash
xcode-select --install
```

The build script adds the SDK C++ include path automatically via `xcrun --show-sdk-path`.

### Native addon loads in Node but not in Electron

Rebuild core with Node 20, then restart the app:

```bash
cd core && npm run rebuild
```

### Driver not visible in System Settings

Install the driver bundle from `drivers/macos/build/VoiceBridgeAudio.driver` (see `drivers/macos/README.md`).
