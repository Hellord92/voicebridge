import React, { useState } from 'react';

const PLATFORMS = [
  {
    id: 'meet',
    name: 'Google Meet',
    icon: '📹',
    steps: ['Join your meeting', 'Click microphone settings', 'Select VoiceBridge Microphone'],
  },
  {
    id: 'zoom',
    name: 'Zoom',
    icon: '💻',
    steps: ['Join meeting', 'Audio settings → Microphone', 'Select VoiceBridge Microphone'],
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    icon: '👥',
    steps: ['Join call', 'Device settings → Microphone', 'Select VoiceBridge Microphone'],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: '💬',
    steps: [
      'Open WhatsApp Desktop (recommended)',
      'Settings → Audio → Microphone',
      'Select VoiceBridge Microphone',
      'Start your voice call',
    ],
    note: 'WhatsApp Mobile does not support virtual microphones — use Desktop on Mac/Windows.',
  },
];

export default function PlatformGuide({ compact = false }) {
  const [active, setActive] = useState('whatsapp');

  const platform = PLATFORMS.find(p => p.id === active) || PLATFORMS[0];

  if (compact) {
    return (
      <p className="text-center text-[11px] text-slate-500 mt-2">
        Select <strong className="text-cyan-400/90">VoiceBridge Microphone</strong> in Meet, Zoom, Teams, or WhatsApp
      </p>
    );
  }

  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Meeting App Setup</p>
      <div className="grid grid-cols-4 gap-1.5">
        {PLATFORMS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActive(p.id)}
            className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-medium transition-all border ${
              active === p.id
                ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300'
                : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className="text-lg">{p.icon}</span>
            {p.name.split(' ')[0]}
          </button>
        ))}
      </div>
      <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
        <p className="text-sm font-medium text-white mb-2">{platform.icon} {platform.name}</p>
        <ol className="space-y-1.5">
          {platform.steps.map((s, i) => (
            <li key={s} className="text-xs text-slate-400 flex gap-2">
              <span className="text-cyan-500 font-bold">{i + 1}.</span>
              {s}
            </li>
          ))}
        </ol>
        {platform.note && (
          <p className="text-[11px] text-amber-400/80 mt-2 border-t border-white/5 pt-2">{platform.note}</p>
        )}
      </div>
    </div>
  );
}
