import React, { useState } from 'react';

export default function GlossaryEditor({ items = [], onChange, bare = false }) {
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');

  const add = () => {
    const s = source.trim();
    const t = target.trim();
    if (!s || !t) return;
    onChange([...items, { source: s, target: t }]);
    setSource('');
    setTarget('');
  };

  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div className={bare ? 'pt-2 space-y-2' : 'rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2'}>
      {!bare && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">Glossary</span>
          <span className="text-[10px] text-slate-500">Proper nouns & terms</span>
        </div>
      )}
      {items.length > 0 && (
        <ul className="space-y-1 max-h-24 overflow-y-auto">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between text-xs bg-black/20 rounded-lg px-2 py-1">
              <span className="text-slate-300 truncate">
                <span className="text-cyan-400">{item.source}</span>
                <span className="text-slate-600 mx-1">→</span>
                {item.target}
              </span>
              <button type="button" onClick={() => remove(i)} className="text-slate-500 hover:text-rose-400 ml-2">×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={source}
          onChange={e => setSource(e.target.value)}
          placeholder="Original"
          className="flex-1 bg-slate-800/80 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-400/50"
        />
        <input
          value={target}
          onChange={e => setTarget(e.target.value)}
          placeholder="Translation"
          className="flex-1 bg-slate-800/80 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-400/50"
        />
        <button type="button" onClick={add} className="px-2 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
          Add
        </button>
      </div>
    </div>
  );
}
