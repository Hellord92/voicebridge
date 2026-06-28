/* VoiceBridge Chrome Extension — shared constants and helpers */

const LM = {
  MSG: {
    START:          'LM_START',
    STOP:           'LM_STOP',
    STATUS:         'LM_STATUS',
    TRANSCRIPT_TR:  'LM_TRANSCRIPT_TR',
    TRANSLATION_EN: 'LM_TRANSLATION_EN',
    PLAY_TTS:       'LM_PLAY_TTS',
    TTS_DONE:       'LM_TTS_DONE',
    HOOK_READY:     'LM_HOOK_READY',
    GET_STATE:      'LM_GET_STATE',
    STATE:          'LM_STATE',
    ERROR:          'LM_ERROR',
    OFFSCREEN_READY:'LM_OFFSCREEN_READY',
  },
  GT_BASE:     'https://translate.googleapis.com/translate_a/single',
  SERVER_BASE: 'https://api.voicebridgeapps.com',   /* TTS proxy — key stays on server */
  PHRASE_STABLE_MS: 380,
  PHRASE_MIN_WORDS: 4,
  PHRASE_MIN_CHARS: 10,
  TTS_COOLDOWN_MS:  250,
};

/* ── Language helpers ───────────────────────────────────────────────────── */

/**
 * Returns true if the text is likely already in the target language
 * (skip TTS to avoid speaking already-correct audio).
 */
function shouldSkipTts(sourceText, detectedLang, targetLang) {
  if (!detectedLang) return false;
  // If detected language starts with the target lang code → already in target
  return detectedLang.toLowerCase().startsWith(targetLang.toLowerCase());
}

/* ── Translation (Google Translate, free tier) ──────────────────────────── */

async function translateWithDetect(text, sourceLang, targetLang) {
  if (!text.trim()) return { text: '', detectedLang: null };
  const sl  = (sourceLang && sourceLang !== 'auto') ? sourceLang : 'auto';
  const url = `${LM.GT_BASE}?client=gtx&sl=${sl}&tl=${targetLang}&dt=t&dt=ld&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Translation error: ' + res.status);
  const data = await res.json();
  const translation  = data[0].map(x => x[0]).filter(Boolean).join(' ');
  const detectedLang = data[2] || null;
  return { text: translation, detectedLang };
}

/* ── TTS via VoiceBridge proxy (API key stays on server) ────────────────── */

/**
 * Call VoiceBridge TTS proxy.
 * Returns ArrayBuffer of MP3 audio.
 */
async function synthesizeTtsProxy(text, targetLang, licenseKey, serverBase) {
  const base = serverBase || LM.SERVER_BASE;
  const res  = await fetch(`${base}/api/tts`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${licenseKey}`,
    },
    body: JSON.stringify({ text, target_lang: targetLang }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS proxy ${res.status}: ${err.slice(0, 120)}`);
  }
  return res.arrayBuffer();
}

/* ── Settings ────────────────────────────────────────────────────────────── */

async function getSettings() {
  const data = await chrome.storage.local.get([
    'licenseKey', 'serverBase', 'enabled', 'sourceLang', 'targetLang',
  ]);
  return {
    licenseKey: data.licenseKey  || '',
    serverBase: data.serverBase  || LM.SERVER_BASE,
    enabled:    !!data.enabled,
    sourceLang: data.sourceLang  || 'auto',
    targetLang: data.targetLang  || 'en',
  };
}

async function setEnabled(enabled) {
  await chrome.storage.local.set({ enabled });
}
