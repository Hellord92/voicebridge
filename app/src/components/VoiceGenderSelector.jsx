import React from 'react';

export default function VoiceGenderSelector({ voiceGender, onChange, compact = false }) {
  const options = [
    { id: 'female', label: 'Female', icon: '👩', desc: 'Warm, natural' },
    { id: 'male',   label: 'Male',   icon: '👨', desc: 'Clear, neutral' },
  ];

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 uppercase tracking-wide flex-shrink-0">AI voice</span>
        <div className="flex flex-1 gap-1.5">
          {options.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all border ${
                voiceGender === o.id
                  ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
              }`}
            >
              <span>{o.icon}</span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-3 space-y-2">
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
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              voiceGender === o.id
                ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300 shadow-[0_0_20px_rgba(0,200,255,0.12)]'
                : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
            }`}
          >
            <span className="text-lg">{o.icon}</span>
            <div className="text-left">
              <div>{o.label}</div>
              <div className="text-[10px] opacity-60 font-normal">{o.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
