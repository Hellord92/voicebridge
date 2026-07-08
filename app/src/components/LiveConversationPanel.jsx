import React, { useEffect, useRef } from 'react';

const PHASE_LABELS = {
  idle:         { text: 'Ready',          color: 'text-slate-500', dot: 'bg-slate-500' },
  listening:    { text: 'Listening…',     color: 'text-amber-400', dot: 'bg-amber-400 animate-pulse' },
  transcribing: { text: 'Transcribing…',  color: 'text-cyan-400',  dot: 'bg-cyan-400 animate-pulse' },
  translating:  { text: 'Translating…',   color: 'text-violet-400',dot: 'bg-violet-400 animate-pulse' },
  done:         { text: 'Sent ✓',         color: 'text-emerald-400',dot: 'bg-emerald-400' },
  error:        { text: 'Error — retry',  color: 'text-rose-400',  dot: 'bg-rose-500' },
};

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export default function LiveConversationPanel({
  running,
  phase,
  lastHeardAt,
  partialTranscript,
  exchanges,
  sourceLang,
  targetLang,
  latencyMs,
}) {
  const scrollRef = useRef(null);
  const phaseInfo = PHASE_LABELS[phase] || PHASE_LABELS.idle;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [exchanges, partialTranscript, phase]);

  return (
    <div className="flex flex-col min-h-0 flex-1 border-t border-white/10 bg-[#080810]">
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center justify-between gap-2 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-white">Live session</span>
          <span className={`flex items-center gap-1.5 text-[10px] ${phaseInfo.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${phaseInfo.dot}`} />
            {phaseInfo.text}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {running && lastHeardAt && (
            <span className="text-[10px] text-slate-500">🎤 {timeAgo(lastHeardAt)}</span>
          )}
          {latencyMs != null && running && (
            <span className={`text-[10px] font-mono ${
              latencyMs < 500 ? 'text-emerald-500' :
              latencyMs < 900 ? 'text-amber-500' : 'text-rose-500'
            }`}>
              {latencyMs}ms
            </span>
          )}
        </div>
      </div>

      {/* Partial transcript bar */}
      {running && (partialTranscript || phase === 'listening') && (
        <div className="px-4 py-2 bg-white/[0.02] border-b border-white/5 flex-shrink-0">
          {partialTranscript ? (
            <div>
              <span className="text-[10px] text-amber-400/90 uppercase tracking-wider">Live</span>
              <p className="text-sm text-slate-200 mt-0.5 leading-snug">{partialTranscript}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Speak — mic is listening…</p>
          )}
        </div>
      )}

      {/* Two-column column headers */}
      <div className="grid grid-cols-2 border-b border-white/5 flex-shrink-0">
        <div className="px-4 py-1.5 border-r border-white/5">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            YOU ({sourceLang})
          </span>
        </div>
        <div className="px-4 py-1.5">
          <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">
            THEY HEAR ({targetLang})
          </span>
        </div>
      </div>

      {/* Scrollable two-column exchange list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-[140px]">
        {!running && exchanges.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center py-6">
            <p className="text-sm text-slate-400">Press Start Translation</p>
            <p className="text-xs text-slate-600 mt-1 max-w-[240px]">
              Every sentence you speak and its translation will appear here
            </p>
          </div>
        )}

        {running && exchanges.length === 0 && !partialTranscript && (
          <div className="h-full flex flex-col items-center justify-center py-8">
            <div className="flex gap-1 mb-3">
              {[0, 1, 2, 3, 4].map(i => (
                <span key={i} className="w-1 h-6 bg-cyan-500/40 rounded-full wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
            <p className="text-xs text-slate-500">No speech yet — speak up</p>
          </div>
        )}

        {exchanges.map((ex) => (
          <div key={ex.id} className="grid grid-cols-2 border-b border-white/[0.04] animate-fade-in">
            {/* Left: transcript */}
            <div className="px-4 py-3 border-r border-white/[0.06]">
              <p className="text-sm text-slate-200 leading-relaxed">{ex.transcript || '…'}</p>
              {ex.latencyMs != null && (
                <span className={`text-[10px] mt-1 block ${
                  ex.latencyMs < 500 ? 'text-emerald-600' :
                  ex.latencyMs < 900 ? 'text-amber-600' : 'text-rose-600'
                }`}>
                  {ex.latencyMs < 500 ? '⚡' : ex.latencyMs < 900 ? '●' : '⚠'} {ex.latencyMs}ms
                </span>
              )}
            </div>
            {/* Right: translation */}
            <div className="px-4 py-3">
              {ex.translation ? (
                <p className="text-sm text-cyan-100 leading-relaxed">{ex.translation}</p>
              ) : (
                <p className="text-[11px] text-violet-400/70 italic">Translating…</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
