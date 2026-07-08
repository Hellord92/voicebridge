import React, { useMemo, useEffect, useState } from 'react';

export default function SessionSummary({ exchanges, durationMs, latencyMs, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const stats = useMemo(() => {
    const phrases    = exchanges.filter(e => e.transcript);
    const translated = exchanges.filter(e => e.translation);
    const words      = phrases.reduce((n, e) => n + (e.transcript || '').split(/\s+/).filter(Boolean).length, 0);
    const durationSec = Math.round((durationMs || 0) / 1000);
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    const avgLat = latencyMs;
    return { phrases: phrases.length, translated: translated.length, words, avgLat, mins, secs };
  }, [exchanges, durationMs, latencyMs]);

  const handleExport = () => {
    if (!exchanges.length) return;
    const lines = exchanges.map((e, i) =>
      `[${i + 1}] ${e.transcript || ''}\n     → ${e.translation || ''}`
    ).join('\n\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `voicebridge-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasActivity = stats.phrases > 0;

  return (
    <div className={`fixed inset-0 z-50 flex items-end justify-center transition-all duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>

      <div className={`w-full max-w-md transition-all duration-500 ${visible ? 'translate-y-0' : 'translate-y-12'}`}
        style={{ borderRadius: '24px 24px 0 0', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none', overflow: 'hidden' }}>

        {/* Gradient top bar */}
        <div style={{ height: 4, background: 'linear-gradient(90deg, #06b6d4, #818cf8, #06b6d4)', backgroundSize: '200% 100%', animation: 'shimmer 2s linear infinite' }} />

        {/* Header */}
        <div className="px-6 pt-6 pb-2 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{hasActivity ? '🎉' : '⏱'}</span>
              <h2 className="text-xl font-extrabold text-white tracking-tight">
                {hasActivity ? 'Session Complete' : 'Session Ended'}
              </h2>
            </div>
            <p className="text-sm text-slate-400">
              {hasActivity
                ? `You spoke ${stats.words} words across ${stats.phrases} phrases`
                : 'No translations this session'}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-all text-lg mt-1">
            ✕
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 px-6 py-4">
          <BigStat value={`${stats.mins}:${String(stats.secs).padStart(2,'0')}`} label="Duration" color="text-cyan-400" />
          <BigStat value={stats.phrases} label="Phrases" color="text-violet-400" />
          <BigStat value={stats.words} label="Words" color="text-emerald-400" />
          <BigStat value={stats.avgLat ? `${stats.avgLat}` : '—'} label="ms avg" color="text-amber-400" />
        </div>

        {/* Last translations */}
        {exchanges.length > 0 && (
          <div className="px-6 pb-3">
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">Last translations</p>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {exchanges.slice(-3).map((e, i) => (
                <div key={i} className="rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-xs text-slate-300 truncate leading-relaxed">{e.transcript}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: '#67e8f9' }}>→ {e.translation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 py-4 flex gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {exchanges.length > 0 && (
            <button onClick={handleExport}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold text-slate-300 transition-all hover:bg-white/10"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              Export transcript
            </button>
          )}
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl text-sm font-bold text-[#0a0a12] transition-all hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #06b6d4, #818cf8)' }}>
            Done
          </button>
        </div>

        {/* Bottom safe area */}
        <div className="h-2" />
      </div>
    </div>
  );
}

function BigStat({ value, label, color }) {
  return (
    <div className="flex flex-col items-center py-3 rounded-2xl"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span className={`text-xl font-extrabold tabular-nums ${color}`}>{value}</span>
      <span className="text-[10px] text-slate-600 mt-0.5 font-medium">{label}</span>
    </div>
  );
}
