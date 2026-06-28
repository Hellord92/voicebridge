/**
 * LinguaMeet Content Script — Meet sayfası UI + page-bridge köprüsü
 */
'use strict';

const MSG = {
  START: 'LM_START',
  STOP: 'LM_STOP',
  STATUS: 'LM_STATUS',
  TRANSCRIPT_TR: 'LM_TRANSCRIPT_TR',
  TRANSLATION_EN: 'LM_TRANSLATION_EN',
  PLAY_TTS: 'LM_PLAY_TTS',
  ERROR: 'LM_ERROR',
  HOOK_READY: 'LM_HOOK_READY',
  GET_STATE: 'LM_GET_STATE',
};

const EXT_SOURCE = 'linguameet-ext';
const PAGE_SOURCE = 'linguameet-page';

let panelEl = null;
let bridgeInjected = false;
let sessionActive = false;

function injectPageBridge() {
  if (bridgeInjected) return;
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected/page-bridge.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
  bridgeInjected = true;
}

function relayToPage(message) {
  window.postMessage({ source: EXT_SOURCE, ...message }, '*');
}

function ensurePanel() {
  if (panelEl) return panelEl;

  panelEl = document.createElement('div');
  panelEl.id = 'linguameet-panel';
  panelEl.innerHTML = `
    <div class="lm-header">
      <span class="lm-logo">LinguaMeet</span>
      <span class="lm-status-dot" id="lm-dot"></span>
      <button class="lm-toggle" id="lm-toggle" title="Başlat / Durdur">▶</button>
      <button class="lm-minimize" id="lm-minimize" title="Küçült">−</button>
    </div>
    <div class="lm-body" id="lm-body">
      <div class="lm-row"><span class="lm-label">TR</span><p id="lm-tr" class="lm-text">—</p></div>
      <div class="lm-row"><span class="lm-label">EN</span><p id="lm-en" class="lm-text">—</p></div>
      <p class="lm-hint" id="lm-hint">BlackHole gerekmez — Meet mikrofonu otomatik köprülenir.</p>
    </div>
  `;

  const mount = () => {
    if (document.body) {
      document.body.appendChild(panelEl);
      bindPanelEvents();
    } else {
      requestAnimationFrame(mount);
    }
  };
  mount();
  return panelEl;
}

function bindPanelEvents() {
  document.getElementById('lm-toggle')?.addEventListener('click', () => {
    sessionActive ? stopSession() : startSession();
  });
  document.getElementById('lm-minimize')?.addEventListener('click', () => {
    document.getElementById('lm-body')?.classList.toggle('lm-hidden');
  });
}

function setDot(state) {
  const dot = document.getElementById('lm-dot');
  if (!dot) return;
  dot.className = 'lm-status-dot lm-' + state;
}

function setHint(text) {
  const el = document.getElementById('lm-hint');
  if (el) el.textContent = text;
}

function appendLine(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.textContent === '—') el.textContent = '';
  const line = document.createElement('span');
  line.className = 'lm-line';
  line.textContent = text + ' ';
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  while (el.children.length > 12) el.removeChild(el.firstChild);
}

function updateToggleBtn() {
  const btn = document.getElementById('lm-toggle');
  if (!btn) return;
  btn.textContent = sessionActive ? '■' : '▶';
  btn.classList.toggle('lm-active', sessionActive);
}

async function startSession() {
  injectPageBridge();
  const res = await chrome.runtime.sendMessage({ type: MSG.START });
  if (!res?.ok) {
    setHint(res?.error || 'Başlatılamadı');
    setDot('err');
    return;
  }
  sessionActive = true;
  relayToPage({ type: MSG.START });
  setDot('active');
  setHint('Aktif — Türkçe konuş, Meet İngilizce duysun.');
  updateToggleBtn();
}

async function stopSession() {
  await chrome.runtime.sendMessage({ type: MSG.STOP });
  relayToPage({ type: MSG.STOP });
  sessionActive = false;
  setDot('idle');
  setHint('Durduruldu.');
  updateToggleBtn();
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== PAGE_SOURCE) return;

  if (data.type === 'LM_HOOK_READY' || data.type === 'LM_BRIDGE_LOADED') {
    chrome.runtime.sendMessage({ type: MSG.HOOK_READY }).catch(() => {});
    if (sessionActive) relayToPage({ type: MSG.START });
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  ensurePanel();

  switch (msg.type) {
    case MSG.START:
      sessionActive = true;
      relayToPage({ type: MSG.START });
      setDot('active');
      updateToggleBtn();
      break;
    case MSG.STOP:
      sessionActive = false;
      relayToPage({ type: MSG.STOP });
      setDot('idle');
      updateToggleBtn();
      break;
    case MSG.STATUS:
      setHint(msg.detail || msg.status || '');
      if (msg.status === 'active') setDot('active');
      break;
    case MSG.TRANSCRIPT_TR:
      appendLine('lm-tr', msg.text);
      break;
    case MSG.TRANSLATION_EN:
      appendLine('lm-en', msg.text);
      break;
    case MSG.PLAY_TTS:
      relayToPage({ type: MSG.PLAY_TTS, buffer: msg.buffer, mime: msg.mime });
      break;
    case MSG.ERROR:
      setHint('Hata: ' + msg.message);
      setDot('err');
      break;
    default:
      break;
  }
});

injectPageBridge();

chrome.runtime.sendMessage({ type: MSG.GET_STATE }).then((res) => {
  ensurePanel();
  if (res?.enabled) {
    sessionActive = true;
    relayToPage({ type: MSG.START });
    setDot('active');
    updateToggleBtn();
    setHint('Çeviri aktif');
  } else {
    setDot('idle');
    updateToggleBtn();
  }
}).catch(() => {
  ensurePanel();
  setDot('idle');
});
