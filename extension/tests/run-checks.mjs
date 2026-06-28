#!/usr/bin/env node
/**
 * LinguaMeet extension — statik kontroller ve birim testleri
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT = join(__dirname, '..');

const results = { pass: 0, fail: 0, warn: 0, items: [] };

function pass(name, detail = '') {
  results.pass++;
  results.items.push({ status: 'PASS', name, detail });
}

function fail(name, detail = '') {
  results.fail++;
  results.items.push({ status: 'FAIL', name, detail });
}

function warn(name, detail = '') {
  results.warn++;
  results.items.push({ status: 'WARN', name, detail });
}

function read(rel) {
  return readFileSync(join(EXT, rel), 'utf8');
}

function allFiles(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) allFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

// ── 1. Manifest JSON ──
try {
  const manifest = JSON.parse(read('manifest.json'));
  pass('manifest.json geçerli JSON');

  const required = ['manifest_version', 'name', 'background', 'content_scripts', 'permissions'];
  for (const k of required) {
    if (manifest[k]) pass(`manifest alan: ${k}`);
    else fail(`manifest eksik alan: ${k}`);
  }

  if (manifest.manifest_version === 3) pass('manifest_version = 3');
  else fail('manifest_version 3 olmalı', String(manifest.manifest_version));

  const sw = manifest.background?.service_worker;
  if (sw && existsSync(join(EXT, sw))) pass('service_worker dosyası mevcut', sw);
  else fail('service_worker bulunamadı', sw || '');

  for (const cs of manifest.content_scripts || []) {
    for (const js of cs.js || []) {
      if (existsSync(join(EXT, js))) pass(`content_script mevcut: ${js}`);
      else fail(`content_script eksik: ${js}`);
    }
    for (const css of cs.css || []) {
      if (existsSync(join(EXT, css))) pass(`content_css mevcut: ${css}`);
      else fail(`content_css eksik: ${css}`);
    }
  }

  const popup = manifest.action?.default_popup;
  if (popup && existsSync(join(EXT, popup))) pass('popup mevcut', popup);
  else fail('popup eksik', popup || '');

  for (const [size, path] of Object.entries(manifest.icons || {})) {
    if (existsSync(join(EXT, path))) pass(`icon ${size}px mevcut`);
    else fail(`icon eksik: ${path}`);
  }

  for (const war of manifest.web_accessible_resources || []) {
    for (const res of war.resources || []) {
      if (existsSync(join(EXT, res))) pass(`web_accessible: ${res}`);
      else fail(`web_accessible eksik: ${res}`);
    }
  }
} catch (e) {
  fail('manifest.json parse', e.message);
}

// ── 2. JS syntax (node --check) ──
const jsFiles = allFiles(EXT).filter(f => f.endsWith('.js') && !f.includes('run-checks'));
for (const f of jsFiles) {
  const rel = f.slice(EXT.length + 1);
  try {
    execSync(`node --check "${f}"`, { stdio: 'pipe' });
    pass(`JS syntax OK: ${rel}`);
  } catch (e) {
    fail(`JS syntax hatası: ${rel}`, e.stderr?.toString().slice(0, 200) || e.message);
  }
}

// ── 3. Mesaj tipi tutarlılığı ──
const MSG_TYPES = new Set([
  'LM_START', 'LM_STOP', 'LM_STATUS', 'LM_TRANSCRIPT_TR', 'LM_TRANSLATION_EN',
  'LM_PLAY_TTS', 'LM_TTS_DONE', 'LM_HOOK_READY', 'LM_GET_STATE', 'LM_STATE', 'LM_ERROR', 'LM_PHRASE',
  'LM_OFFSCREEN_READY', 'LM_BRIDGE_LOADED',
]);

const filesToScan = ['lib/shared.js', 'background/service-worker.js', 'content/content.js', 'offscreen/offscreen.js', 'injected/page-bridge.js', 'popup/popup.js'];
const foundMsgs = new Set();
for (const rel of filesToScan) {
  const src = read(rel);
  const matches = src.matchAll(/['"]LM_[A-Z_]+['"]/g);
  for (const m of matches) foundMsgs.add(m[0].slice(1, -1));
}

for (const msg of foundMsgs) {
  if (MSG_TYPES.has(msg) || msg === 'LM_BRIDGE_LOADED') pass(`Mesaj tipi tanımlı: ${msg}`);
  else warn(`Bilinmeyen mesaj tipi: ${msg}`);
}

// ── 4. shared.js birim testleri ──
try {
  const sharedSrc = read('lib/shared.js');
  const ctx = { fetch: async () => ({ ok: true, json: async () => [[['hello']], null, 'tr'] }) };
  vm.createContext(ctx);
  vm.runInContext(sharedSrc, ctx);

  const tests = [
    /* shouldSkipTts(sourceText, detectedLang, targetLang) */
    /* detected lang matches target → already in target language → skip */
    { fn: () => ctx.shouldSkipTts('hello world', 'en', 'en'),    expect: true,  name: 'shouldSkipTts: skip when detected=target' },
    /* detected lang differs from target → translate */
    { fn: () => ctx.shouldSkipTts('bugün hava güzel', 'tr', 'en'), expect: false, name: 'shouldSkipTts: translate TR→EN' },
    /* no detected lang → do not skip */
    { fn: () => ctx.shouldSkipTts('hello world', null, 'en'),    expect: false, name: 'shouldSkipTts: no lang → do not skip' },
    /* translateWithDetect returns object with text property */
    { fn: () => typeof ctx.translateWithDetect, expect: 'function', name: 'translateWithDetect is function' },
    /* synthesizeTtsProxy is defined */
    { fn: () => typeof ctx.synthesizeTtsProxy, expect: 'function', name: 'synthesizeTtsProxy is function' },
  ];

  for (const t of tests) {
    const got = t.fn();
    if (got === t.expect) pass(`unit: ${t.name}`);
    else fail(`unit: ${t.name}`, `beklenen ${t.expect}, alınan ${got}`);
  }
} catch (e) {
  fail('shared.js unit testleri', e.message);
}

// ── 5. Offscreen HTML script referansı ──
const offHtml = read('offscreen/offscreen.html');
if (offHtml.includes('offscreen.js')) pass('offscreen.html → offscreen.js');
else fail('offscreen.html script referansı eksik');

// ── 6. importScripts yolu ──
const sw = read('background/service-worker.js');
if (sw.includes("importScripts('../lib/shared.js')")) pass('service-worker importScripts yolu');
else fail('service-worker importScripts yolu hatalı');

// ── 7. Bilinen mantık kontrolleri (statik analiz) ──
const bridge = read('injected/page-bridge.js');
if (bridge.includes('getUserMedia')) pass('page-bridge getUserMedia hook var');
else fail('page-bridge hook eksik');

if (bridge.includes('origGetUserMedia') && bridge.includes('navigator.mediaDevices.getUserMedia = origGetUserMedia')) {
  pass('removeHook getUserMedia geri yüklüyor');
} else {
  warn('removeHook getUserMedia geri yüklemiyor');
}

const swSrc = read('background/service-worker.js');
if (swSrc.includes('closeOffscreen') && swSrc.match(/stopSession[\s\S]*closeOffscreen/)) {
  pass('stopSession offscreen belgesini kapatıyor');
} else {
  warn('closeOffscreen tanımlı ama stopSession çağırmıyor');
}

if (swSrc.includes('ttsPrefetchKey === text') && swSrc.indexOf('ttsQueue.shift()') < swSrc.indexOf('ttsPrefetchKey === text')) {
  pass('TTS prefetch mevcut cümle shift sonrası doğru eşleşiyor');
} else {
  warn('TTS prefetch sırası riskli');
}

if (swSrc.includes('waitForOffscreenReady')) {
  pass('Offscreen hazır olma beklemesi var');
} else {
  warn('Offscreen START race riski');
}

// ── 9. Google Translate ağ smoke testi ──
try {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&dt=ld&q=' + encodeURIComponent('merhaba dünya');
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) fail('Google Translate erişilebilir', `HTTP ${res.status}`);
  else {
    const data = await res.json();
    const en = data[0]?.map(x => x[0]).filter(Boolean).join(' ') || '';
    if (/hello/i.test(en)) pass('Google Translate smoke test', en);
    else fail('Google Translate beklenmeyen yanıt', en || JSON.stringify(data).slice(0, 80));
  }
} catch (e) {
  fail('Google Translate ağ testi', e.message);
}

// ── 10. PNG icon doğrulama ──
for (const size of [16, 48, 128]) {
  const p = join(EXT, `icons/icon${size}.png`);
  const buf = readFileSync(p);
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (isPng && buf.length > 100) pass(`icon${size}.png geçerli PNG (${buf.length} byte)`);
  else fail(`icon${size}.png geçersiz`, String(buf.length));
}

// ── Rapor ──
console.log('\n═══════════════════════════════════════');
console.log(' LinguaMeet Extension Test Raporu');
console.log('═══════════════════════════════════════\n');

for (const item of results.items) {
  const icon = item.status === 'PASS' ? '✓' : item.status === 'FAIL' ? '✗' : '⚠';
  console.log(`${icon} [${item.status}] ${item.name}${item.detail ? ' — ' + item.detail : ''}`);
}

console.log('\n───────────────────────────────────────');
console.log(`PASS: ${results.pass}  FAIL: ${results.fail}  WARN: ${results.warn}`);
console.log('───────────────────────────────────────\n');

process.exit(results.fail > 0 ? 1 : 0);
