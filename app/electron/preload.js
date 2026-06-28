'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vb', {
  /* Settings */
  getSettings:      ()       => ipcRenderer.invoke('get-settings'),
  saveSettings:     (s)      => ipcRenderer.invoke('save-settings', s),
  listDevices:      ()       => ipcRenderer.invoke('list-devices'),

  /* Pipeline */
  startPipeline:    (opts)   => ipcRenderer.invoke('start-pipeline', opts),
  stopPipeline:     ()       => ipcRenderer.invoke('stop-pipeline'),

  /* License */
  validateLicense:  (key)    => ipcRenderer.invoke('validate-license', key),

  /* Firebase auth (sign-in handled in renderer via Firebase SDK, then stored) */
  getStoredUser:      ()          => ipcRenderer.invoke('get-stored-user'),
  saveFirebaseUser:   (userData)  => ipcRenderer.invoke('save-firebase-user', userData),
  firebasePostLogin:  (idToken)   => ipcRenderer.invoke('firebase-post-login', idToken),
  signOut:            ()          => ipcRenderer.invoke('sign-out'),

  /* Pipeline events */
  onTranscript:  (cb) => { ipcRenderer.on('transcript',  (_e, t) => cb(t)); },
  onTranslation: (cb) => { ipcRenderer.on('translation', (_e, t) => cb(t)); },
  onError:       (cb) => { ipcRenderer.on('error',       (_e, m) => cb(m)); },
});
