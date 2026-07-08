import React from 'react';

export default function VoiceGenderSelector({ voiceGender, onChange }) {
  const options = [
    { id: 'female', label: 'Female', icon: '👩', desc: 'Warm, natural female voice' },
    { id: 'male',   label: 'Male',   icon: '👨', desc: 'Clear, neutral male voice'  },
  ];

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI Voice</p>
        <span className="text-[10px] text-slate-600 bg-white/5 px-2 py-0.5 rounded-full">
          They hear this
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map(o => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl text-sm font-medium transition-all border ${
              voiceGender === o.id
                ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300 shadow-[0_0_20px_rgba(0,200,255,0.12)]'
                : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
            }`}
          >
            <span className="text-xl">{o.icon}</span>
            <span>{o.label}</span>
            <span className="text-[10px] opacity-60">{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
