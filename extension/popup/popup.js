'use strict';

const LANGUAGES = [
  { code: 'auto', name: 'Auto detect' },
  { code: 'en',   name: '🇬🇧 English' },
  { code: 'tr',   name: '🇹🇷 Turkish' },
  { code: 'fr',   name: '🇫🇷 French' },
  { code: 'de',   name: '🇩🇪 German' },
  { code: 'es',   name: '🇪🇸 Spanish' },
  { code: 'it',   name: '🇮🇹 Italian' },
  { code: 'pt',   name: '🇵🇹 Portuguese' },
  { code: 'nl',   name: '🇳🇱 Dutch' },
  { code: 'pl',   name: '🇵🇱 Polish' },
  { code: 'ru',   name: '🇷🇺 Russian' },
  { code: 'uk',   name: '🇺🇦 Ukrainian' },
  { code: 'ar',   name: '🇸🇦 Arabic' },
  { code: 'hi',   name: '🇮🇳 Hindi' },
  { code: 'zh',   name: '🇨🇳 Chinese' },
  { code: 'ja',   name: '🇯🇵 Japanese' },
  { code: 'ko',   name: '🇰🇷 Korean' },
  { code: 'th',   name: '🇹🇭 Thai' },
  { code: 'vi',   name: '🇻🇳 Vietnamese' },
  { code: 'id',   name: '🇮🇩 Indonesian' },
  { code: 'ms',   name: '🇲🇾 Malay' },
  { code: 'sv',   name: '🇸🇪 Swedish' },
  { code: 'da',   name: '🇩🇰 Danish' },
  { code: 'fi',   name: '🇫🇮 Finnish' },
  { code: 'no',   name: '🇳🇴 Norwegian' },
  { code: 'cs',   name: '🇨🇿 Czech' },
  { code: 'ro',   name: '🇷🇴 Romanian' },
  { code: 'hu',   name: '🇭🇺 Hungarian' },
  { code: 'el',   name: '🇬🇷 Greek' },
  { code: 'he',   name: '🇮🇱 Hebrew' },
  { code: 'fa',   name: '🇮🇷 Persian' },
  { code: 'bn',   name: '🇧🇩 Bengali' },
  { code: 'ur',   name: '🇵🇰 Urdu' },
  { code: 'ta',   name: '🇮🇳 Tamil' },
  { code: 'sw',   name: '🇰🇪 Swahili' },
];

/* Populate language dropdowns */
function buildLangOptions(selectEl, currentVal, excludeAuto) {
  selectEl.innerHTML = '';
  for (const lang of LANGUAGES) {
    if (excludeAuto && lang.code === 'auto') continue;
    const opt = document.createElement('option');
    opt.value       = lang.code;
    opt.textContent = lang.name;
    if (lang.code === currentVal) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

async function loadSettings() {
  const data = await chrome.storage.local.get([
    'licenseKey', 'sourceLang', 'targetLang', 'enabled',
  ]);
  document.getElementById('license-key').value = data.licenseKey || '';

  buildLangOptions(document.getElementById('src-lang'), data.sourceLang || 'auto', false);
  buildLangOptions(document.getElementById('tgt-lang'), data.targetLang || 'en',   true);
}

async function saveSettings() {
  const licenseKey = document.getElementById('license-key').value.trim();
  const sourceLang = document.getElementById('src-lang').value;
  const targetLang = document.getElementById('tgt-lang').value;

  await chrome.storage.local.set({ licenseKey, sourceLang, targetLang });

  const s = document.getElementById('status');
  s.className = 'status ok';
  s.textContent = '✓ Settings saved';
  setTimeout(() => { s.className = 'status'; s.textContent = 'Ready.'; }, 1500);
}

async function sendToMeet(msg, extra = {}) {
  const [tab] = await chrome.tabs.query({ active: true, url: 'https://meet.google.com/*' });
  if (!tab) {
    const s = document.getElementById('status');
    s.className = 'status err';
    s.textContent = '✗ Open a Google Meet tab first';
    return false;
  }
  const settings = {
    licenseKey: document.getElementById('license-key').value.trim(),
    sourceLang: document.getElementById('src-lang').value,
    targetLang: document.getElementById('tgt-lang').value,
  };
  await chrome.runtime.sendMessage({ ...msg, settings, ...extra });
  return true;
}

document.getElementById('btn-start').addEventListener('click', async () => {
  await saveSettings();
  const ok = await sendToMeet({ type: 'LM_START' });
  if (ok) {
    const s = document.getElementById('status');
    s.className = 'status ok';
    s.textContent = '● Translating… (watch the Meet panel)';
  }
});

document.getElementById('btn-stop').addEventListener('click', async () => {
  await sendToMeet({ type: 'LM_STOP' });
  const s = document.getElementById('status');
  s.className = 'status';
  s.textContent = 'Stopped.';
});

document.getElementById('btn-save').addEventListener('click', saveSettings);

loadSettings();
