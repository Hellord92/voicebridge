import React from 'react';
import { LANGUAGES } from '../languages.js';

export default function LanguageSelector({ sourceLang, targetLang, onChange, compact = false }) {
  const selectClass = compact
    ? 'w-full bg-white/5 text-xs text-white rounded-lg px-2 py-1.5 border border-white/10 focus:border-cyan-400/50 outline-none'
    : 'w-full bg-white/5 text-sm text-white rounded-lg px-2 py-2 border border-white/10 focus:border-cyan-400/50 outline-none';

  return (
    <div className={compact ? 'space-y-2' : 'glass-card p-3 space-y-2'}>
      {!compact && (
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Language</p>
      )}

      <div className="grid grid-cols-[1fr_20px_1fr] gap-2 items-end">
        <div>
          <p className="text-[10px] text-slate-500 mb-1">I speak</p>
          <select
            value={sourceLang}
            onChange={e => onChange(e.target.value, targetLang)}
            className={selectClass}
          >
            <option value="auto">Auto detect</option>
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
            ))}
          </select>
        </div>

        <div className="text-center text-cyan-500/60 text-sm pb-1.5">→</div>

        <div>
          <p className="text-[10px] text-slate-500 mb-1">They hear</p>
          <select
            value={targetLang}
            onChange={e => onChange(sourceLang, e.target.value)}
            className={selectClass}
          >
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
