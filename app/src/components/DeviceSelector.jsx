import React from 'react';

export default function DeviceSelector({ devices, inputIndex, onChange }) {
  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Microphone</p>

      <div>
        <label className="text-xs text-slate-500 block mb-1">Your voice input (headset mic)</label>
        <select
          value={inputIndex}
          onChange={e => onChange('inputDeviceIndex', Number(e.target.value))}
          className="w-full bg-white/5 text-sm text-white rounded-lg px-3 py-2 border border-white/10 focus:border-cyan-400/50 outline-none"
        >
          <option value={-1}>Default Microphone</option>
          {devices.map((name, i) => (
            <option key={i} value={i}>{name}</option>
          ))}
        </select>
        <p className="text-[11px] text-slate-500 mt-1.5">
          Use your <strong className="text-slate-300">headset mic</strong> — not VoiceBridge Microphone
        </p>
      </div>

      <div className="bg-cyan-500/8 border border-cyan-400/20 rounded-lg px-3 py-2">
        <p className="text-[11px] text-cyan-300/90 leading-relaxed">
          In Meet, Zoom, Teams, or WhatsApp: set microphone to
          <strong className="text-cyan-300"> VoiceBridge Microphone</strong>
        </p>
      </div>
    </div>
  );
}
