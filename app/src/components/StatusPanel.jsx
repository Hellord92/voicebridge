import React from 'react';

export default function StatusPanel({ status, message }) {
  const dotColor = {
    idle:   'bg-slate-500',
    active: 'bg-emerald-500 dot-active',
    error:  'bg-rose-500',
  }[status] || 'bg-slate-500';

  const barColor = {
    idle:   'bg-slate-800',
    active: 'bg-emerald-500/10 border-emerald-500/20',
    error:  'bg-rose-500/10 border-rose-500/20',
  }[status] || 'bg-slate-800';

  return (
    <div className={`mx-5 mb-3 px-3 py-2 rounded-lg border ${barColor} flex items-center gap-2`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
      <span className="text-xs text-slate-300 truncate">{message}</span>
    </div>
  );
}
