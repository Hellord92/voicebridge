'use strict';

const path = require('path');

let native;

function tryLoad(addonPath) {
  return require(addonPath);
}

try {
  /* Try normal path first (dev mode) */
  native = tryLoad(path.join(__dirname, 'build/Release/voicebridge_core.node'));
} catch (e1) {
  try {
    /* Packaged Electron: .node lives in app.asar.unpacked, not app.asar */
    const unpackedDir = __dirname.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
    native = tryLoad(path.join(unpackedDir, 'build/Release/voicebridge_core.node'));
  } catch (e2) {
    console.error('[core] Native addon load failed:', e1.message);
    console.error('[core] Unpacked path also failed:', e2.message);
    native = {
      startPipeline:    () => { console.warn('[core] Using stub'); return -99; },
      stopPipeline:     () => {},
      setLanguages:     () => {},
      setVoiceGender:   () => {},
      listInputDevices: () => [],
      refreshDevices:   () => [],
    };
  }
}

module.exports = native;
