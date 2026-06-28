importScripts('../lib/shared.js');

const OFFSCREEN_URL = 'offscreen/offscreen.html';
let offscreenReady = false;

function waitForOffscreenReady(timeoutMs = 4000) {
  if (offscreenReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (offscreenReady) return resolve();
      if (Date.now() >= deadline) return reject(new Error('Offscreen document not ready'));
      setTimeout(tick, 50);
    };
    tick();
  });
}

let ttsQueue          = [];
let ttsPlaying        = false;
let ttsPrefetchPromise = null;
let ttsPrefetchKey    = '';
let ttsCooldownUntil  = 0;
const recentPhrases   = new Set();

/* Active session settings (source/target lang, license key) */
let sessionSettings = null;

/* ── Offscreen document management ─────────────────────────────────────── */

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  if (existing.length > 0) { offscreenReady = true; return; }
  await chrome.offscreen.createDocument({
    url:           OFFSCREEN_URL,
    reasons:       ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    justification: 'Microphone capture (STT) and TTS playback for voice translation.',
  });
  offscreenReady = true;
}

async function closeOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  if (existing.length > 0) await chrome.offscreen.closeDocument();
  offscreenReady = false;
}

/* ── Tab broadcasting ───────────────────────────────────────────────────── */

function broadcastToMeetTabs(message) {
  chrome.tabs.query({ url: 'https://meet.google.com/*' }, tabs => {
    for (const tab of tabs)
      if (tab.id) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  });
}

function sendStatus(status, detail = '') {
  broadcastToMeetTabs({ type: LM.MSG.STATUS, status, detail });
}

/* ── Session start / stop ───────────────────────────────────────────────── */

async function startSession(settings) {
  sessionSettings = settings || await getSettings();
  await ensureOffscreen();
  await waitForOffscreenReady();
  await setEnabled(true);
  chrome.runtime.sendMessage({
    type:   LM.MSG.START,
    target: 'offscreen',
    sourceLang: sessionSettings.sourceLang,
  }).catch(() => {});
  broadcastToMeetTabs({ type: LM.MSG.START });
  sendStatus('active', `Translating ${sessionSettings.sourceLang} → ${sessionSettings.targetLang}`);
}

async function stopSession() {
  await setEnabled(false);
  chrome.runtime.sendMessage({ type: LM.MSG.STOP, target: 'offscreen' }).catch(() => {});
  await closeOffscreen();
  offscreenReady    = false;
  sessionSettings   = null;
  ttsQueue          = [];
  ttsPlaying        = false;
  ttsPrefetchPromise = null;
  ttsPrefetchKey    = '';
  broadcastToMeetTabs({ type: LM.MSG.STOP });
  sendStatus('idle', 'Stopped');
}

/* ── Phrase processing ──────────────────────────────────────────────────── */

async function processPhrase(phrase) {
  phrase = phrase.trim();
  const key = phrase.toLowerCase();
  if (!phrase || phrase.length < 2 || recentPhrases.has(key)) return;
  recentPhrases.add(key);
  setTimeout(() => recentPhrases.delete(key), 30_000);

  const s      = sessionSettings || await getSettings();
  const tgtLang = s.targetLang || 'en';
  const srcLang = s.sourceLang || 'auto';

  broadcastToMeetTabs({ type: LM.MSG.TRANSCRIPT_TR, text: phrase });

  try {
    const { text: translated, detectedLang } = await translateWithDetect(phrase, srcLang, tgtLang);
    if (shouldSkipTts(phrase, detectedLang, tgtLang)) {
      ttsCooldownUntil = Date.now() + 1500;
      return;
    }
    if (!translated?.trim()) return;

    broadcastToMeetTabs({ type: LM.MSG.TRANSLATION_EN, text: translated });
    enqueueTts(translated, tgtLang, s.licenseKey, s.serverBase);
  } catch (err) {
    console.error('[VoiceBridge]', err);
    broadcastToMeetTabs({ type: LM.MSG.ERROR, message: err.message });
  }
}

/* ── TTS queue ──────────────────────────────────────────────────────────── */

function enqueueTts(text, targetLang, licenseKey, serverBase) {
  const t = text.trim();
  if (!t) return;
  ttsQueue.push({ text: t, targetLang, licenseKey, serverBase });
  if (ttsQueue.length === 1 && !ttsPrefetchPromise) {
    ttsPrefetchKey     = t;
    ttsPrefetchPromise = prefetchTts(t, targetLang, licenseKey, serverBase);
  }
  if (!ttsPlaying) processNextTts();
}

async function prefetchTts(text, targetLang, licenseKey, serverBase) {
  try {
    return await synthesizeTtsProxy(text, targetLang, licenseKey, serverBase);
  } catch {
    return null;
  }
}

async function processNextTts() {
  if (ttsQueue.length === 0) {
    ttsPlaying        = false;
    ttsCooldownUntil  = Date.now() + LM.TTS_COOLDOWN_MS;
    return;
  }

  ttsPlaying = true;
  const { text, targetLang, licenseKey, serverBase } = ttsQueue.shift();

  let buffer = null;
  try {
    if (ttsPrefetchKey === text && ttsPrefetchPromise) {
      buffer = await ttsPrefetchPromise;
      ttsPrefetchPromise = null;
      ttsPrefetchKey = '';
    }
    if (!buffer) buffer = await prefetchTts(text, targetLang, licenseKey, serverBase);

    if (ttsQueue.length > 0) {
      const next = ttsQueue[0];
      ttsPrefetchKey     = next.text;
      ttsPrefetchPromise = prefetchTts(next.text, next.targetLang, next.licenseKey, next.serverBase);
    } else {
      ttsPrefetchKey     = '';
      ttsPrefetchPromise = null;
    }

    if (buffer) broadcastToMeetTabs({ type: LM.MSG.PLAY_TTS, buffer, mime: 'audio/mpeg' });
  } catch (err) {
    broadcastToMeetTabs({ type: LM.MSG.ERROR, message: 'TTS: ' + err.message });
  }

  await processNextTts();
}

/* ── Message router ─────────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === LM.MSG.START && !msg.target) {
        await startSession(msg.settings || null);
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === LM.MSG.STOP && !msg.target) {
        await stopSession();
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === LM.MSG.GET_STATE) {
        const s = await getSettings();
        sendResponse({ ok: true, enabled: s.enabled });
        return;
      }
      if (msg.type === 'LM_PHRASE' && msg.text) {
        await processPhrase(msg.text);
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'LM_OFFSCREEN_READY') {
        offscreenReady = true;
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === LM.MSG.HOOK_READY) {
        sendStatus('hook-ready', 'Meet microphone bridge ready');
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === LM.MSG.ERROR && msg.message) {
        broadcastToMeetTabs({ type: LM.MSG.ERROR, message: msg.message });
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[VoiceBridge] Extension installed v0.2');
});
