import React from 'react';

export default function VoiceGenderSelector({ voiceGender, onChange }) {
  const options = [
    { id: 'female', label: 'Female', icon: '♀' },
    { id: 'male',   label: 'Male',   icon: '♂' },
  ];

  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Voice</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map(o => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              voiceGender === o.id
                ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300 shadow-[0_0_20px_rgba(0,200,255,0.12)]'
                : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
            }`}
          >
            <span className="text-base">{o.icon}</span>
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">Translated speech uses this voice in the meeting.</p>
    </div>
  );
}
