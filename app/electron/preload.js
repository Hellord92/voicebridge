'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vb', {
  getSettings:      ()       => ipcRenderer.invoke('get-settings'),
  saveSettings:     (s)      => ipcRenderer.invoke('save-settings', s),
  listDevices:      ()       => ipcRenderer.invoke('list-devices'),
  refreshDevices:   ()       => ipcRenderer.invoke('refresh-devices'),

  startPipeline:    (opts)   => ipcRenderer.invoke('start-pipeline', opts),
  stopPipeline:     ()       => ipcRenderer.invoke('stop-pipeline'),
  muteInput:        ()       => ipcRenderer.invoke('mute-input'),
  unmuteInput:      ()       => ipcRenderer.invoke('unmute-input'),

  validateLicense:  (key)    => ipcRenderer.invoke('validate-license', key),

  getStoredUser:      ()          => ipcRenderer.invoke('get-stored-user'),
  saveFirebaseUser:   (userData)  => ipcRenderer.invoke('save-firebase-user', userData),
  firebasePostLogin:  (idToken)   => ipcRenderer.invoke('firebase-post-login', idToken),
  signOut:            ()          => ipcRenderer.invoke('sign-out'),

  isDriverInstalled:  ()          => ipcRenderer.invoke('is-driver-installed'),
  verifyDriverMic:    ()          => ipcRenderer.invoke('verify-driver-mic'),
  installDriver:      ()          => ipcRenderer.invoke('install-driver'),
  openSystemSettings: (pane)      => ipcRenderer.invoke('open-system-settings', pane),
  detectMeetingApps:  ()          => ipcRenderer.invoke('detect-meeting-apps'),
  exportSession:      (data)      => ipcRenderer.invoke('export-session', data),

  onTranscript:        (cb) => { ipcRenderer.removeAllListeners('transcript');         ipcRenderer.on('transcript',         (_e, t)  => cb(t));  },
  onPartialTranscript: (cb) => { ipcRenderer.removeAllListeners('partial-transcript'); ipcRenderer.on('partial-transcript', (_e, t)  => cb(t));  },
  onTranslation:       (cb) => { ipcRenderer.removeAllListeners('translation');        ipcRenderer.on('translation',        (_e, t)  => cb(t));  },
  onError:             (cb) => { ipcRenderer.removeAllListeners('error');              ipcRenderer.on('error',              (_e, m)  => cb(m));  },
  onLatency:           (cb) => { ipcRenderer.removeAllListeners('latency');            ipcRenderer.on('latency',            (_e, ms) => cb(ms)); },
});
