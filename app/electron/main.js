'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path  = require('path');
const Store = require('electron-store');
const https = require('https');

const store    = new Store();
const isDev    = !app.isPackaged;
const VITE_DEV = 'http://localhost:5173';
const SERVER_URL = store.get('serverUrl', 'https://api.voicebridgeapps.com');

let core;
try {
  core = require('../../core/index.js');
} catch (e) {
  console.warn('[main] Core not loaded:', e.message);
  core = null;
}

/* ─────────────────── window ─────────────────── */

let win;

function createWindow() {
  win = new BrowserWindow({
    width:          480,
    height:         760,
    resizable:      false,
    titleBarStyle:  'hiddenInset',
    vibrancy:       'under-window',   /* macOS frosted glass */
    transparent:    false,
    backgroundColor: '#0a0a12',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  });

  if (isDev) {
    win.loadURL(VITE_DEV);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  /* macOS driver install check */
  if (process.platform === 'darwin') {
    const fs = require('fs');
    const driverPath = '/Library/Audio/Plug-Ins/HAL/VoiceBridgeAudio.driver';
    if (!fs.existsSync(driverPath)) {
      dialog.showMessageBox(win, {
        type:    'warning',
        title:   'Virtual Mic Driver Not Installed',
        message: 'VoiceBridge Microphone driver is not installed.\nInstall it now?',
        buttons: ['Install', 'Skip'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) installMacDriver();
      });
    }
  }
});

app.on('window-all-closed', () => {
  if (core) core.stopPipeline();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

/* ─────────────────── driver install (macOS) ─────────────────── */

function installMacDriver() {
  const { execFile } = require('child_process');
  const driverSrc = path.join(process.resourcesPath, 'VoiceBridgeAudio.driver');
  const script = `
    cp -R "${driverSrc}" /Library/Audio/Plug-Ins/HAL/VoiceBridgeAudio.driver
    launchctl kickstart -kp system/com.apple.audio.coreaudiod
  `;
  // Use osascript to request admin
  execFile('osascript', ['-e', `do shell script "${script.replace(/"/g,'\\"')}" with administrator privileges`],
    (err) => {
      if (err) {
        dialog.showErrorBox('Install Failed', err.message);
      } else {
        dialog.showMessageBox(win, { type: 'info', message: 'VoiceBridge Microphone installed! Select it in System Settings → Sound → Input.' });
      }
    }
  );
}

/* ─────────────────── IPC ─────────────────── */

ipcMain.handle('get-settings', async () => {
  return {
    licenseKey:        store.get('licenseKey', ''),
    serverUrl:         store.get('serverUrl', 'https://api.voicebridgeapps.com'),
    sourceLang:        store.get('sourceLang', 'auto'),
    targetLang:        store.get('targetLang', 'en'),
    voiceGender:       store.get('voiceGender', 'female'),
    inputDeviceIndex:  store.get('inputDeviceIndex', -1),
    outputDeviceIndex: store.get('outputDeviceIndex', -1),
    monitorEnabled:    store.get('monitorEnabled', false),
    onboardingDone:    store.get('onboardingDone', false),
  };
});

/* ─────────────────── Firebase auth (via renderer Firebase SDK) ─────────────── */

ipcMain.handle('get-stored-user', async () => {
  return store.get('firebaseUser', null);
});

ipcMain.handle('save-firebase-user', async (_e, userData) => {
  store.set('firebaseUser', userData);
  return { ok: true };
});

ipcMain.handle('sign-out', async () => {
  store.delete('firebaseUser');
  store.delete('licenseKey');
  return { ok: true };
});

/**
 * Called by renderer after Firebase signInWithPopup succeeds.
 * Sends idToken to backend to get/create account info.
 */
ipcMain.handle('firebase-post-login', async (_e, idToken) => {
  const serverUrl = store.get('serverUrl', 'https://api.voicebridgeapps.com');
  return await httpPost(`${serverUrl}/api/auth/me`, null, {
    Authorization: `Bearer ${idToken}`,
  });
});

ipcMain.handle('save-settings', async (_e, settings) => {
  for (const [k, v] of Object.entries(settings)) store.set(k, v);
  if (core) {
    core.setLanguages(settings.sourceLang, settings.targetLang);
    if (settings.voiceGender) core.setVoiceGender(settings.voiceGender);
  }
  return { ok: true };
});

ipcMain.handle('list-devices', async () => {
  if (!core) return ['Default Microphone (native addon not built)'];
  return core.listInputDevices();
});

ipcMain.handle('start-pipeline', async (_e, opts) => {
  if (!core) return { ok: false, error: 'Native addon not built' };
  const rc = core.startPipeline({
    ...opts,
    onTranscript:  (t) => win?.webContents.send('transcript', t),
    onTranslation: (t) => win?.webContents.send('translation', t),
    onError:       (m) => win?.webContents.send('error', m),
  });
  return { ok: rc === 0 };
});

ipcMain.handle('stop-pipeline', async () => {
  if (core) core.stopPipeline();
  return { ok: true };
});

ipcMain.handle('validate-license', async (_e, licenseKey) => {
  const serverUrl = store.get('serverUrl', 'https://api.voicebridgeapps.com');
  return await httpPost(`${serverUrl}/api/license/validate`, { licenseKey });
});

/* ─────────────────── helpers ─────────────────── */

function httpPost(url, body, extraHeaders = {}) {
  return new Promise((resolve) => {
    const parsed   = new URL(url);
    const bodyStr  = body ? JSON.stringify(body) : '';
    const headers  = {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      ...extraHeaders,
    };
    const mod = parsed.protocol === 'https:' ? https : require('http');
    const req = mod.request(
      { hostname: parsed.hostname, port: parsed.port || undefined, path: parsed.pathname, method: 'POST', headers },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end',  () => {
          try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(data) }); }
          catch { resolve({ ok: false, error: 'Invalid JSON' }); }
        });
      }
    );
    req.on('error', e => resolve({ ok: false, error: e.message }));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}
