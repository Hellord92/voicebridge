/**
 * LinguaMeet Offscreen — Web Speech API ile TR dinleme
 * Gerçek mikrofon burada yakalanır; Meet'e giden ses page-bridge üzerinden gider.
 */
'use strict';

const MSG = {
  START: 'LM_START',
  STOP: 'LM_STOP',
};

const PHRASE_STABLE_MS = 380;
const PHRASE_MIN_WORDS = 4;
const PHRASE_MIN_CHARS = 10;

let recognition = null;
let micStream = null;
let running = false;
let streamCommittedTr = '';
let interimStableTimer = null;
let lastInterimSnapshot = '';
const recentLocal = new Set();

const SR = self.SpeechRecognition || self.webkitSpeechRecognition;

function createRecognition() {
  if (!SR) throw new Error('Web Speech API desteklenmiyor');
  const r = new SR();
  r.lang = 'tr-TR';
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  return r;
}

function getPendingTr(full) {
  if (!streamCommittedTr) return full.trim();
  if (full.startsWith(streamCommittedTr)) {
    return full.slice(streamCommittedTr.length).trim();
  }
  const tail = streamCommittedTr.slice(-28);
  const idx = tail.length > 4 ? full.indexOf(tail) : -1;
  if (idx >= 0) return full.slice(idx + tail.length).trim();
  return full;
}

function extractCompletePhrases(pending) {
  const committed = [];
  let rest = pending;
  const sentenceRe = /^([\s\S]*?[.!?…]+)\s*/;
  while (rest) {
    const m = rest.match(sentenceRe);
    if (!m) break;
    const phrase = m[1].trim();
    if (phrase.length >= 2) committed.push(phrase);
    rest = rest.slice(m[0].length).trim();
  }
  const clauseRe = /^(.+[,;])\s+(.+)$/;
  const cm = rest.match(clauseRe);
  if (cm && cm[1].split(/\s+/).filter(Boolean).length >= PHRASE_MIN_WORDS) {
    committed.push(cm[1].trim());
    rest = cm[2].trim();
  }
  return { committed, remainder: rest };
}

async function commitPhrase(phrase) {
  const p = phrase.trim();
  const key = p.toLowerCase();
  if (!p || p.length < 2 || recentLocal.has(key)) return;
  recentLocal.add(key);
  setTimeout(() => recentLocal.delete(key), 30000);
  streamCommittedTr = (streamCommittedTr + ' ' + p).trim();
  await chrome.runtime.sendMessage({ type: 'LM_PHRASE', text: p });
}

function scheduleStableInterim(fullText, remainder) {
  clearTimeout(interimStableTimer);
  const snapshot = fullText;
  interimStableTimer = setTimeout(async () => {
    if (snapshot !== lastInterimSnapshot) return;
    const pending = getPendingTr(snapshot);
    if (!pending || !pending.includes(remainder.split(/\s+/).slice(0, 2).join(' '))) return;
    const words = remainder.split(/\s+/).filter(Boolean);
    if (words.length < PHRASE_MIN_WORDS) return;
    const toCommit = words.length > 3 ? words.slice(0, -2).join(' ') : words.join(' ');
    if (toCommit.length < PHRASE_MIN_CHARS) return;
    await commitPhrase(toCommit);
  }, PHRASE_STABLE_MS);
}

async function flushFromText(fullText, flushRemainder) {
  const pending = getPendingTr(fullText);
  if (!pending) return;
  const { committed, remainder } = extractCompletePhrases(pending);
  for (const phrase of committed) await commitPhrase(phrase);
  if (flushRemainder && remainder.trim().length >= 2) {
    await commitPhrase(remainder.trim());
  } else if (remainder.trim()) {
    scheduleStableInterim(fullText, remainder.trim());
  }
}

async function startListening() {
  if (running) return;
  running = true;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    recognition = createRecognition();

    recognition.onresult = async (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript.trim();
        if (!text) continue;
        if (res.isFinal) {
          await flushFromText(text, true);
        } else {
          lastInterimSnapshot = text;
          await flushFromText(text, false);
        }
      }
    };

    recognition.onerror = (e) => {
      console.warn('[LinguaMeet offscreen] SR error:', e.error);
      if (e.error === 'not-allowed') {
        chrome.runtime.sendMessage({ type: 'LM_ERROR', message: 'Mikrofon izni reddedildi' }).catch(() => {});
      }
    };

    recognition.onend = () => {
      if (running) {
        try { recognition.start(); } catch (_) {}
      }
    };

    recognition.start();
    console.log('[LinguaMeet offscreen] Dinleme başladı');
  } catch (err) {
    running = false;
    throw err;
  }
}

function stopListening() {
  running = false;
  clearTimeout(interimStableTimer);
  if (recognition) {
    recognition.onend = null;
    try { recognition.stop(); } catch (_) {}
    recognition = null;
  }
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  streamCommittedTr = '';
  lastInterimSnapshot = '';
  console.log('[LinguaMeet offscreen] Durduruldu');
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === MSG.START) startListening().catch(err => {
    chrome.runtime.sendMessage({ type: 'LM_ERROR', message: err.message }).catch(() => {});
  });
  if (msg.type === MSG.STOP) stopListening();
});

chrome.runtime.sendMessage({ type: 'LM_OFFSCREEN_READY' }).catch(() => {});
