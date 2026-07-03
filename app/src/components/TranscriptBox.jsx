import React from 'react';

export default function TranscriptBox({ transcript, translation, sourceLang, targetLang }) {
  if (!transcript && !translation) {
    return (
      <div className="glass-card p-4 text-center">
        <p className="text-xs text-slate-500">Live transcript appears here when you speak</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-[10px] font-bold text-cyan-400/80 uppercase tracking-widest">Live</p>
      {transcript && (
        <div className="rounded-lg bg-white/[0.03] p-3 border border-white/5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">You said</span>
          <p className="text-sm text-slate-200 mt-1 leading-relaxed">{transcript}</p>
        </div>
      )}
      {translation && (
        <div className="rounded-lg bg-cyan-500/5 p-3 border border-cyan-400/15">
          <span className="text-[10px] text-cyan-400 uppercase tracking-wider">They hear</span>
          <p className="text-sm text-cyan-100 mt-1 leading-relaxed">{translation}</p>
        </div>
      )}
    </div>
  );
}
