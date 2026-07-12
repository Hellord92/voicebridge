'use strict';

const path = require('path');
const fs   = require('fs');

let native;
let _loadError = null;

const p1 = path.join(__dirname, 'build/Release/voicebridge_core.node');
const unpackedDir = __dirname.replace(/app\.asar([/\\])/g, 'app.asar.unpacked$1');
const p2 = path.join(unpackedDir, 'build/Release/voicebridge_core.node');

function tryLoad(addonPath) {
  const exists = fs.existsSync(addonPath);
  console.log(`[core] tryLoad exists=${exists} path=${addonPath}`);
  if (!exists) throw new Error(`File not found: ${addonPath}`);
  return require(addonPath);
}

try {
  native = tryLoad(p1);
  console.log('[core] Loaded from primary path');
} catch (e1) {
  try {
    native = tryLoad(p2);
    console.log('[core] Loaded from unpacked path');
  } catch (e2) {
    _loadError = `path1: ${e1.message} | path2: ${e2.message}`;
    console.error('[core] Native addon load FAILED:', _loadError);
    native = {
      startPipeline:    () => { console.warn('[core] stub startPipeline'); return -99; },
      stopPipeline:     () => {},
      setLanguages:     () => {},
      setVoiceGender:   () => {},
      muteInput:        () => {},
      unmuteInput:      () => {},
      startRawStream:   () => false,
      stopRawStream:    () => {},
      openVirtualMic:   () => -99,
      playMp3ToShm:     () => -99,
      listInputDevices: () => [],
      refreshDevices:   () => [],
    };
  }
}

native._loadError = _loadError;
module.exports = native;
