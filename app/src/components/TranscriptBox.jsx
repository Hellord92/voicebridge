import React from 'react';

export default function TranscriptBox({ transcript, translation }) {
  if (!transcript && !translation) return null;
  return (
    <div className="bg-slate-800/60 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Live</p>
      {transcript && (
        <div>
          <span className="text-xs text-slate-500 uppercase tracking-wider">You said</span>
          <p className="text-sm text-slate-200 mt-1 leading-relaxed">{transcript}</p>
        </div>
      )}
      {translation && (
        <div className="border-t border-slate-700 pt-3">
          <span className="text-xs text-sky-500 uppercase tracking-wider">Translated</span>
          <p className="text-sm text-sky-200 mt-1 leading-relaxed">{translation}</p>
        </div>
      )}
    </div>
  );
}
