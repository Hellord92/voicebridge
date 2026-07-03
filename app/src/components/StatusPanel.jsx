import React from 'react';

const BARS = [0, 1, 2, 3, 4, 5, 6, 7];

export default function StatusPanel({ status, message }) {
  const isActive = status === 'active';

  const dotColor = {
    idle:   'bg-slate-500',
    active: 'bg-cyan-400 dot-active',
    error:  'bg-rose-500',
  }[status] || 'bg-slate-500';

  const barColor = {
    idle:   'border-white/10 bg-white/[0.02]',
    active: 'border-cyan-400/25 bg-cyan-500/5',
    error:  'border-rose-500/25 bg-rose-500/5',
  }[status] || 'border-white/10';

  return (
    <div className={`mx-5 mb-3 px-3 py-2.5 rounded-xl border ${barColor} flex items-center gap-3`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
      <span className="text-xs text-slate-300 truncate flex-1">{message}</span>
      {isActive && (
        <div className="flex items-end gap-0.5 h-4 flex-shrink-0">
          {BARS.map(i => (
            <span
              key={i}
              className="w-0.5 bg-cyan-400 rounded-full wave-bar"
              style={{ height: '100%', animationDelay: `${i * 0.08}s` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
