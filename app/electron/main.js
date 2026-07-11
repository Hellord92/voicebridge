'use strict';

const { app, BrowserWindow, ipcMain, shell, systemPreferences } = require('electron');
const path  = require('path');
const fs    = require('fs');
const http  = require('http');
const { execFile, execFileSync } = require('child_process');
const Store = require('electron-store');
const https = require('https');

const store    = new Store();
const isDev    = !app.isPackaged;
const VITE_DEV = 'http://localhost:5173';

/* ── Production local HTTP server (Firebase needs http://localhost, not file://) ── */
let prodServerPort = null;

function startProdServer() {
  return new Promise((resolve) => {
    const distDir = path.join(__dirname, '../dist');
    const mimeMap = {
      '.html': 'text/html',
      '.js':   'application/javascript',
      '.css':  'text/css',
      '.png':  'image/png',
      '.svg':  'image/svg+xml',
      '.ico':  'image/x-icon',
      '.woff2': 'font/woff2',
      '.woff':  'font/woff',
      '.ttf':   'font/ttf',
    };
    const server = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0];
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(distDir, urlPath);
      const ext = path.extname(filePath).toLowerCase();
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
          fs.createReadStream(filePath).pipe(res);
        } else {
          /* SPA fallback */
          res.writeHead(200, { 'Content-Type': 'text/html' });
          fs.createReadStream(path.join(distDir, 'index.html')).pipe(res);
        }
      } catch (e) {
        res.writeHead(500); res.end('Server error');
      }
    });
    server.listen(0, 'localhost', () => {
      prodServerPort = server.address().port;
      console.log(`[main] Prod server on http://localhost:${prodServerPort}`);
      resolve(prodServerPort);
    });
  });
}

const PROD_API = 'https://api.voicebridgeapps.com';

function getServerUrl() {
  const stored = store.get('serverUrl');
  /* Reject website / vite dev URLs mistakenly saved as API base */
  if (stored && (
    (stored.includes('voicebridgeapps.com') && !stored.includes('api.')) ||
    stored.includes(':5173')
  )) {
    console.warn('[main] Invalid serverUrl in store, using production API:', stored);
    return PROD_API;
  }
  if (isDev) {
    /* Dev builds talk to production API unless user set a custom backend */
    if (!stored || stored === PROD_API) return PROD_API;
    return stored;
  }
  const isLocal = stored && (stored.includes('127.0.0.1') || stored.includes('localhost'));
  if (stored && !isLocal) return stored;
  return PROD_API;
}

const DRIVER_DEST = '/Library/Audio/Plug-Ins/HAL/VoiceBridgeAudio.driver';
const DRIVER_BUNDLE_ID = 'com.voicebridge.audio.driver';

let core;
try {
  if (!isDev) {
    /* Packaged: try multiple possible unpacked paths */
    const candidates = [
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@voicebridge', 'core', 'index.js'),
      path.join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'node_modules', '@voicebridge', 'core', 'index.js'),
    ];
    let loaded = false;
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        core = require(p);
        loaded = true;
        console.log('[main] Core addon loaded from:', p);
        break;
      }
    }
    if (!loaded) {
      console.error('[main] Core addon not found in any candidate path:', candidates);
    }
  } else {
    core = require('@voicebridge/core');
  }
  if (core) {
    if (core._loadError) {
      console.error('[main] Core addon stub active — load error:', core._loadError);
    } else {
      console.log('[main] Core addon loaded OK');
    }
  }
} catch (e) {
  console.error('[main] Core addon failed to load:', e.message);
  core = null;
}

let win;

function createWindow(port) {
  win = new BrowserWindow({
    width:          540,
    height:         920,
    minWidth:       480,
    minHeight:      640,
    resizable:      true,
    titleBarStyle:  'hiddenInset',
    vibrancy:       'under-window',
    transparent:    false,
    backgroundColor: '#0a0a12',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  });

  /* Remove native title — hiddenInset title bar shows it clipped on narrow windows */
  win.setTitle('');
  win.on('page-title-updated', (e) => e.preventDefault());

  if (isDev) {
    win.loadURL(VITE_DEV);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    /* Load from local HTTP server so Firebase auth works (localhost is whitelisted) */
    win.loadURL(`http://localhost:${port}`);
  }
}

app.whenReady().then(async () => {
  if (!isDev) {
    const port = await startProdServer();
    createWindow(port);
  } else {
    createWindow(null);
  }
});

app.on('window-all-closed', () => {
  realtimeActive = false;
  if (core) {
    try { core.stopRawStream(); } catch (e) { console.warn('[main] stopRawStream on quit:', e.message); }
    try { core.stopPipeline(); } catch (e) { console.warn('[main] stopPipeline on quit:', e.message); }
  }
  if (realtimeWs) {
    try { realtimeWs.close(); } catch (e) { console.warn('[main] WS close on quit:', e.message); }
    realtimeWs = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!app.isReady()) return;
  if (BrowserWindow.getAllWindows().length === 0) {
    if (!isDev && prodServerPort) {
      createWindow(prodServerPort);
    } else if (!isDev) {
      startProdServer().then(port => createWindow(port));
    } else {
      createWindow(null);
    }
  }
});

/* ─────────────────── driver helpers ─────────────────── */

function resolveDriverSourcePath() {
  const packaged = path.join(process.resourcesPath, 'VoiceBridgeAudio.driver');
  if (!isDev && fs.existsSync(packaged)) return packaged;
  const devBuilt = path.join(__dirname, '../../drivers/macos/build/VoiceBridgeAudio.driver');
  if (fs.existsSync(devBuilt)) return devBuilt;
  return null;
}

function isDriverInstalledSync() {
  if (process.platform !== 'darwin') return { installed: false, reason: 'not_macos' };
  if (!fs.existsSync(DRIVER_DEST)) return { installed: false, reason: 'missing' };
  try {
    const plist = path.join(DRIVER_DEST, 'Contents/Info.plist');
    const content = fs.readFileSync(plist, 'utf8');
    if (!content.includes(DRIVER_BUNDLE_ID)) return { installed: false, reason: 'wrong_bundle' };
    return { installed: true };
  } catch {
    return { installed: false, reason: 'invalid_bundle' };
  }
}

function verifyDriverMicSync() {
  if (process.platform !== 'darwin') {
    return { installed: false, visible: false, reason: 'not_macos' };
  }
  const installed = isDriverInstalledSync();
  if (!installed.installed) {
    return { installed: false, visible: false, reason: installed.reason || 'missing' };
  }
  try {
    const out = execFileSync('system_profiler', ['SPAudioDataType'], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const micVisible   = /voicebridge microphone/i.test(out);
    const blackHole2ch = /blackhole 2ch/i.test(out);
    return {
      installed:   true,
      visible:     micVisible,
      micVisible,
      blackHole2ch,
      reason:      micVisible ? 'ok' : (blackHole2ch ? 'use_blackhole' : 'not_in_system_profiler'),
    };
  } catch (e) {
    return { installed: true, visible: false, reason: 'profiler_failed', error: e.message };
  }
}

function verifyDriverMicAsync() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') {
      return resolve({ installed: false, visible: false, reason: 'not_macos' });
    }
    const installed = isDriverInstalledSync();
    if (!installed.installed) {
      return resolve({ installed: false, visible: false, reason: installed.reason || 'missing' });
    }
    execFile('system_profiler', ['SPAudioDataType'], {
      encoding: 'utf8',
      timeout: 6000,
      maxBuffer: 2 * 1024 * 1024,
    }, (err, out) => {
      if (err) return resolve({ installed: true, visible: false, reason: 'profiler_failed', error: err.message });
      const micVisible   = /voicebridge microphone/i.test(out);
      const blackHole2ch = /blackhole 2ch/i.test(out);
      resolve({
        installed: true,
        visible:   micVisible,
        micVisible,
        blackHole2ch,
        reason: micVisible ? 'ok' : (blackHole2ch ? 'use_blackhole' : 'not_in_system_profiler'),
      });
    });
  });
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

function installMacDriverAsync() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') {
      resolve({ ok: false, error: 'macOS only' });
      return;
    }
    const driverSrc = resolveDriverSourcePath();
    const macosDriverDir = path.join(__dirname, '../../drivers/macos');
    if (!driverSrc) {
      resolve({
        ok: false,
        error: isDev
          ? 'Build driver first: cd drivers/macos && cmake -B build && cmake --build build'
          : 'Driver bundle not found in app resources',
      });
      return;
    }

    const staging = '/tmp/VoiceBridgeAudio-staging.driver';
    try {
      fs.rmSync(staging, { recursive: true, force: true });
      fs.cpSync(driverSrc, staging, { recursive: true });
    } catch (e) {
      resolve({
        ok: false,
        error: `Driver hazırlanamadı: ${e.message}. Terminal: ./scripts/install-driver.sh`,
      });
      return;
    }

    /* Admin shell cannot read ~/Documents — stage under /tmp first (TCC) */
    const script = [
      `rm -rf ${shellQuote(DRIVER_DEST)}`,
      `cp -R ${shellQuote(staging)} ${shellQuote(DRIVER_DEST)}`,
      'killall coreaudiod 2>/dev/null || launchctl kickstart -kp system/com.apple.audio.coreaudiod 2>/dev/null || true',
      `rm -rf ${shellQuote(staging)}`,
    ].join(' && ');

    execFile(
      'osascript',
      ['-e', `do shell script ${JSON.stringify(script)} with administrator privileges`],
      (err, _stdout, stderr) => {
        fs.rmSync(staging, { recursive: true, force: true });
        if (err) {
          const msg = [err.message, stderr].filter(Boolean).join('\n');
          resolve({
            ok: false,
            error: msg.includes('Operation not permitted')
              ? `${msg}\n\nmacOS Documents klasörünü admin erişemez. Terminalde: ./scripts/install-driver.sh`
              : msg,
            needsLogout: false,
          });
          return;
        }
        const check = isDriverInstalledSync();
        verifyDriverMicAsync().then(mic => resolve({
          ok: check.installed,
          micVisible: mic.visible,
          error: check.installed ? null : 'Kopyalama başarısız — Terminal: ./scripts/install-driver.sh',
          needsLogout: check.installed && !mic.visible,
        }));
      }
    );
  });
}

/* ─────────────────── IPC ─────────────────── */

ipcMain.handle('is-driver-installed', async () => isDriverInstalledSync());

ipcMain.handle('verify-driver-mic', async () => verifyDriverMicAsync());

ipcMain.handle('install-driver', async () => installMacDriverAsync());

ipcMain.handle('open-system-settings', async (_e, pane) => {
  if (process.platform !== 'darwin') return { ok: false };
  const urls = {
    microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    sound:      'x-apple.systempreferences:com.apple.preference.sound',
  };
  const url = urls[pane] || urls.sound;
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('detect-meeting-apps', async () => {
  if (process.platform !== 'darwin') return { apps: [] };
  return new Promise((resolve) => {
    execFile('ps', ['-ax', '-o', 'comm='], (err, stdout) => {
      if (err) { resolve({ apps: [] }); return; }
      const procs = stdout.toLowerCase();
      const apps = [];
      if (procs.includes('zoom.us') || procs.includes('zoom')) apps.push('Zoom');
      if (procs.includes('meet') || procs.includes('google chrome helper')) apps.push('Google Meet');
      if (procs.includes('teams') || procs.includes('microsoft teams')) apps.push('Teams');
      if (procs.includes('whatsapp')) apps.push('WhatsApp');
      resolve({ apps });
    });
  });
});

ipcMain.handle('get-settings', async () => ({
  licenseKey:        store.get('licenseKey', ''),
  serverUrl:         getServerUrl(),
  sourceLang:        store.get('sourceLang', 'auto'),
  targetLang:        store.get('targetLang', 'en'),
  voiceGender:       store.get('voiceGender', 'female'),
  inputDeviceIndex:  store.get('inputDeviceIndex', -1),
  inputDeviceName:   store.get('inputDeviceName', ''),
  outputDeviceIndex: store.get('outputDeviceIndex', -1),
  monitorEnabled:    store.get('monitorEnabled', false),
  onboardingDone:    store.get('onboardingDone', false),
  setupDone:         store.get('setupDone', false),
  glossary:          store.get('glossary', []),
  referralCode:      store.get('referralCode', ''),
}));

ipcMain.handle('get-stored-user', async () => refreshStoredUser());

ipcMain.handle('save-firebase-user', async (_e, userData) => {
  store.set('firebaseUser', userData);
  return { ok: true };
});

ipcMain.handle('sign-out', async () => {
  store.delete('firebaseUser');
  store.delete('licenseKey');
  return { ok: true };
});

ipcMain.handle('firebase-post-login', async (_e, idToken) => {
  const serverUrl = getServerUrl();
  const result = await httpPost(`${serverUrl}/api/auth/me`, null, {
    Authorization: `Bearer ${idToken}`,
  });
  /* Persist the fresh license key immediately */
  if (result.ok && result.data?.license?.key) {
    store.set('licenseKey', result.data.license.key);
    console.log('[main] License stored on login:', result.data.license.key);
  }
  return result;
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
  if (!core) return [{ index: -1, name: 'Default Microphone' }];
  return core.listInputDevices();
});

ipcMain.handle('refresh-devices', async () => {
  if (!core) return ['Default Microphone'];
  try {
    return core.refreshDevices();
  } catch (e) {
    console.warn('[main] refreshDevices failed:', e.message);
    return core.listInputDevices();
  }
});

ipcMain.handle('start-pipeline', async (_e, opts) => {
  if (!core) return { ok: false, error: 'Audio engine could not be loaded. Please reinstall VoiceBridge.' };
  try { core.stopPipeline(); } catch (_) {}

  /* Sync license from server before pipeline auth (prevents stale-key 403) */
  await refreshStoredUser();

  const storedKey = store.get('licenseKey', '');
  if (storedKey) opts.licenseKey = storedKey;

  if (!opts.licenseKey) {
    const user = store.get('firebaseUser');
    if (user) await syncAccountLicense(user);
    opts.licenseKey = store.get('licenseKey', '');
  }
  if (!opts.licenseKey) {
    return { ok: false, error: 'No license key — sign out and sign in again.' };
  }

  /* Request microphone permission on macOS before touching audio */
  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    if (micStatus === 'not-determined') {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      if (!granted) {
        return { ok: false, error: 'Microphone access denied. Please allow microphone access in System Settings → Privacy & Security → Microphone.' };
      }
    } else if (micStatus === 'denied') {
      return { ok: false, error: 'Microphone access denied. Open System Settings → Privacy & Security → Microphone and enable VoiceBridge.' };
    }
  }

  const serverUrl = getServerUrl();
  const rc = core.startPipeline({
    ...opts,
    serverUrl,
    onTranscript:        (t) => win?.webContents.send('transcript', t),
    onPartialTranscript: (t) => win?.webContents.send('partial-transcript', t),
    onTranslation:       (t) => win?.webContents.send('translation', t),
    onError:             (m) => win?.webContents.send('error', m),
    onLatency:           (ms) => win?.webContents.send('latency', ms),
  });
  if (rc === 0) return { ok: true };
  const errors = {
    '-1':  'Could not open microphone — allow Microphone access in System Settings → Privacy & Security → Microphone.',
    '-2':  'Microphone stream failed to start. Try selecting a different input device.',
    '-99': `Audio engine failed to load. ${core?._loadError ? 'Reason: ' + core._loadError.slice(0, 120) : 'Please reinstall VoiceBridge.'}`,
  };
  return { ok: false, error: errors[String(rc)] || `Pipeline error (${rc})`, code: rc };
});

ipcMain.handle('stop-pipeline', () => {
  // Fire-and-forget in background so IPC returns immediately
  setImmediate(() => {
    try { if (core) core.stopPipeline(); } catch (_) {}
  });
  return { ok: true };
});

ipcMain.handle('mute-input', () => {
  try { if (core) core.muteInput(); } catch (_) {}
  return { ok: true };
});

ipcMain.handle('unmute-input', () => {
  try { if (core) core.unmuteInput(); } catch (_) {}
  return { ok: true };
});

function httpPostBinary(url, body, extraHeaders = {}) {
  return new Promise((resolve) => {
    const parsed  = new URL(url);
    const bodyStr = body ? JSON.stringify(body) : '';
    const headers = {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      ...extraHeaders,
    };
    const mod = parsed.protocol === 'https:' ? https : require('http');
    const req = mod.request(
      { hostname: parsed.hostname, port: parsed.port || undefined, path: parsed.pathname + (parsed.search || ''), method: 'POST', headers },
      (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body: buf,
            processingMs: res.headers['x-processing-ms'] ? parseInt(res.headers['x-processing-ms'], 10) : null,
          });
        });
      }
    );
    req.on('error', e => resolve({ ok: false, error: e.message, body: Buffer.alloc(0) }));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/* ── OpenAI Realtime WebSocket Pipeline ────────────────────────────────────── */
let realtimeWs      = null;
let realtimeActive  = false;
let realtimeOpts    = null;
let phraseStartMs   = 0;
const ttsQueue      = [];
let ttsBusy         = false;

async function syncAccountLicense(user) {
  if (!user?.idToken) return user;
  const serverUrl = getServerUrl();
  try {
    const acctResp = await httpPost(`${serverUrl}/api/auth/me`, null, {
      Authorization: `Bearer ${user.idToken}`,
    });
    if (acctResp.ok && acctResp.data?.license?.key) {
      user.account = acctResp.data;
      store.set('licenseKey', acctResp.data.license.key);
      store.set('firebaseUser', user);
      console.log('[main] License synced:', acctResp.data.license.key);
    } else if (!acctResp.ok) {
      console.warn('[main] auth/me sync failed:', acctResp.status, acctResp.error || acctResp.data?.detail);
    }
  } catch (e) {
    console.warn('[main] syncAccountLicense error:', e.message);
  }
  return user;
}

async function refreshStoredUser() {
  const user = store.get('firebaseUser', null);
  if (!user) return null;

  const needsRefresh = !user.tokenExpiry || Date.now() > user.tokenExpiry - 120_000;
  if (needsRefresh && user.refreshToken && user.firebaseApiKey) {
    try {
      const refreshUrl = `https://securetoken.googleapis.com/v1/token?key=${user.firebaseApiKey}`;
      const refreshResult = await httpPost(refreshUrl, {
        grant_type:    'refresh_token',
        refresh_token: user.refreshToken,
      });
      if (refreshResult.ok && refreshResult.data?.id_token) {
        user.idToken      = refreshResult.data.id_token;
        user.refreshToken = refreshResult.data.refresh_token || user.refreshToken;
        user.tokenExpiry  = Date.now() + 3500 * 1000;
        store.set('firebaseUser', user);
      }
    } catch (e) {
      console.warn('[main] Token refresh error:', e.message);
    }
  }

  /* Always sync license from server so UID/key stay linked */
  await syncAccountLicense(user);
  return user;
}

function realtimeAuthHeaders() {
  const licenseKey = store.get('licenseKey') || '';
  const stored     = store.get('firebaseUser') || {};
  const idToken    = stored.idToken || '';
  /* Prefer VB key — avoids no_active_license when UID not yet linked in DB */
  if (licenseKey) return { Authorization: `Bearer ${licenseKey}` };
  if (idToken) return { Authorization: `Bearer ${idToken}` };
  return {};
}

async function drainTtsQueue() {
  if (ttsBusy) return;
  ttsBusy = true;
  while (ttsQueue.length > 0) {
    const job = ttsQueue.shift();
    await playTranslationTts(job.text, job.opts, job.startedAt);
  }
  ttsBusy = false;
}

function enqueueTranslationTts(text, opts, startedAt) {
  const trimmed = (text || '').trim();
  if (!trimmed || trimmed.length <= 1) return;
  ttsQueue.push({ text: trimmed, opts, startedAt });
  drainTtsQueue().catch(err => {
    console.error('[main] TTS queue error:', err.message);
    if (win) win.webContents.send('error', `TTS error: ${err.message}`);
  });
}

async function playTranslationTts(text, opts, startedAt) {
  const serverUrl = getServerUrl();
  try {
    if (core?.muteInput) core.muteInput();
    const ttsRes = await httpPostBinary(
      `${serverUrl}/api/tts`,
      {
        text,
        target_lang: opts.targetLang || 'en',
        voice_gender: opts.voiceGender || 'female',
      },
      realtimeAuthHeaders(),
    );
    if (!ttsRes.ok || !ttsRes.body?.length) {
      const errMsg = ttsRes.error || `TTS HTTP ${ttsRes.status || 0}`;
      console.warn('[main] TTS failed:', errMsg);
      if (win) win.webContents.send('error', `ElevenLabs TTS failed (${errMsg})`);
      return;
    }
    if (core?.playMp3ToShm) {
      const frames = core.playMp3ToShm(ttsRes.body);
      if (frames < 0) {
        console.warn('[main] playMp3ToShm failed:', frames);
        if (win) win.webContents.send('error', 'Virtual mic write failed');
        return;
      }
    }
    const latency = Date.now() - (startedAt || phraseStartMs || Date.now());
    if (win) win.webContents.send('latency', latency);
  } catch (e) {
    console.error('[main] playTranslationTts:', e.message);
    if (win) win.webContents.send('error', `TTS error: ${e.message}`);
  } finally {
    if (core?.unmuteInput) core.unmuteInput();
  }
}

ipcMain.handle('start-realtime', async (_e, opts) => {
  if (realtimeActive) return { ok: false, error: 'Already running' };

  await refreshStoredUser();

  if (!store.get('licenseKey')) {
    const user = store.get('firebaseUser');
    if (user) await syncAccountLicense(user);
  }

  const serverUrl  = getServerUrl();
  const authHdrs   = realtimeAuthHeaders();
  if (!authHdrs.Authorization) {
    return { ok: false, error: 'Not signed in — log out and sign in again.' };
  }

  realtimeOpts = {
    inputDeviceIndex: opts.inputDeviceIndex ?? -1,
    sourceLang:       opts.sourceLang || 'auto',
    targetLang:       opts.targetLang || 'en',
    voiceGender:      opts.voiceGender || 'female',
  };

  const sessionRes = await httpPost(
    `${serverUrl}/api/realtime/session`,
    {
      source_lang: realtimeOpts.sourceLang,
      target_lang: realtimeOpts.targetLang,
      voice:       'alloy',
    },
    authHdrs,
  );
  if (!sessionRes.ok) {
    const msg = sessionRes.data?.detail || sessionRes.error || `Session error (HTTP ${sessionRes.status || 0})`;
    console.warn('[main] realtime/session failed:', sessionRes.status, msg);
    return { ok: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg) };
  }

  const { client_secret } = sessionRes.data || {};
  if (!client_secret) return { ok: false, error: 'No session token returned' };

  if (core?.openVirtualMic) {
    const shmRc = core.openVirtualMic();
    if (shmRc !== 0) console.warn('[main] openVirtualMic returned', shmRc);
  }

  const WebSocket = require('ws');
  const ws = new WebSocket(
    'wss://api.openai.com/v1/realtime?model=gpt-realtime-mini',
    { headers: {
        Authorization: `Bearer ${client_secret}`,
    }}
  );

  ws.on('open', () => {
    realtimeActive = true;
    if (core) {
      core.startRawStream({
        inputDeviceIndex: realtimeOpts.inputDeviceIndex,
        onAudio: (pcm16Buffer) => {
          if (!realtimeActive || ws.readyState !== 1) return;
          const b64 = pcm16Buffer.toString('base64');
          ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
        },
      });
    }
    if (win) win.webContents.send('realtime-status', { connected: true });
  });

  ws.on('message', (raw) => {
    let ev;
    try { ev = JSON.parse(raw); } catch { return; }

    switch (ev.type) {
      case 'input_audio_buffer.speech_started':
        phraseStartMs = Date.now();
        break;

      case 'conversation.item.input_audio_transcription.delta':
        if (win && ev.delta) win.webContents.send('partial-transcript', ev.delta);
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (win && ev.transcript) win.webContents.send('transcript', ev.transcript);
        break;

      case 'response.text.delta':
      case 'response.output_text.delta':
        if (win && ev.delta) win.webContents.send('realtime-translation-delta', ev.delta);
        break;

      case 'response.text.done':
      case 'response.output_text.done':
        if (win && ev.text) {
          win.webContents.send('translation', ev.text);
          enqueueTranslationTts(ev.text, realtimeOpts, phraseStartMs || Date.now());
        }
        break;

      case 'response.done': {
        /* GA: translation may arrive inside response.output */
        const parts = ev.response?.output || [];
        for (const part of parts) {
          if (part.type === 'message' && Array.isArray(part.content)) {
            for (const c of part.content) {
              if (c.type === 'output_text' && c.text) {
                win.webContents.send('translation', c.text);
                enqueueTranslationTts(c.text, realtimeOpts, phraseStartMs || Date.now());
              }
            }
          }
        }
        break;
      }

      case 'error':
        if (win) win.webContents.send('error', ev.error?.message || 'Realtime error');
        break;
    }
  });

  ws.on('close', () => {
    realtimeActive = false;
    ttsQueue.length = 0;
    try { if (core) core.stopRawStream(); } catch (e) { console.warn('[main] stopRawStream:', e.message); }
    if (win) win.webContents.send('realtime-status', { connected: false });
  });

  ws.on('error', (err) => {
    console.error('[main] Realtime WS error:', err.message);
    if (win) win.webContents.send('error', `Realtime WS: ${err.message}`);
  });

  realtimeWs = ws;
  return { ok: true };
});

ipcMain.handle('stop-realtime', () => {
  realtimeActive = false;
  ttsQueue.length = 0;
  try { if (core) core.stopRawStream(); } catch (e) { console.warn('[main] stopRawStream:', e.message); }
  if (realtimeWs) {
    try { realtimeWs.close(); } catch (e) { console.warn('[main] WS close:', e.message); }
    realtimeWs = null;
  }
  return { ok: true };
});

ipcMain.handle('validate-license', async (_e, licenseKey) => {
  const serverUrl = getServerUrl();
  return await httpPost(`${serverUrl}/api/license/validate`, { licenseKey });
});

ipcMain.handle('export-session', async (_e, data) => {
  const { dialog } = require('electron');
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    defaultPath: `voicebridge-session-${Date.now()}.txt`,
    filters: [{ name: 'Text', extensions: ['txt'] }],
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, data, 'utf8');
  return { ok: true, path: filePath };
});

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
      { hostname: parsed.hostname, port: parsed.port || undefined, path: parsed.pathname + (parsed.search || ''), method: 'POST', headers },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          const processingMs = res.headers['x-processing-ms'];
          if (!data.trim()) {
            resolve({
              ok: false,
              status: res.statusCode,
              error: `Empty response (HTTP ${res.statusCode})`,
            });
            return;
          }
          try {
            const parsedJson = JSON.parse(data);
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              data: parsedJson,
              processingMs: processingMs ? parseInt(processingMs, 10) : null,
            });
          } catch {
            const preview = data.replace(/\s+/g, ' ').slice(0, 160);
            resolve({
              ok: false,
              status: res.statusCode,
              error: `Server returned non-JSON (HTTP ${res.statusCode}): ${preview}`,
            });
          }
        });
      }
    );
    req.on('error', e => resolve({ ok: false, error: e.message }));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}
