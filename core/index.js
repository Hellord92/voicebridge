'use strict';

let native;
try {
  native = require('./build/Release/voicebridge_core.node');
} catch (_) {
  /* Development fallback — stub so Electron can load without built native addon */
  native = {
    startPipeline:    (opts) => { console.warn('[core] Native addon not built — using stub'); return 0; },
    stopPipeline:     ()     => {},
    setLanguages:     (s, t) => {},
    listInputDevices: ()     => ['Default Microphone (stub)'],
  };
}

module.exports = native;
