import React from 'react';
import { LANGUAGES } from '../languages.js';

export default function LanguageSelector({ sourceLang, targetLang, onChange }) {
  return (
    <div className="bg-slate-800/60 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Language</p>

      <div className="grid grid-cols-[1fr_28px_1fr] gap-2 items-center">
        {/* Source */}
        <div>
          <p className="text-xs text-slate-500 mb-1">I speak</p>
          <select
            value={sourceLang}
            onChange={e => onChange(e.target.value, targetLang)}
            className="w-full bg-slate-700 text-sm text-white rounded-lg px-2 py-1.5 border border-slate-600 focus:border-sky-400 outline-none"
          >
            <option value="auto">Auto detect</option>
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
            ))}
          </select>
        </div>

        {/* Arrow */}
        <div className="text-center text-slate-400 text-lg mt-4">→</div>

        {/* Target */}
        <div>
          <p className="text-xs text-slate-500 mb-1">They hear</p>
          <select
            value={targetLang}
            onChange={e => onChange(sourceLang, e.target.value)}
            className="w-full bg-slate-700 text-sm text-white rounded-lg px-2 py-1.5 border border-slate-600 focus:border-sky-400 outline-none"
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
