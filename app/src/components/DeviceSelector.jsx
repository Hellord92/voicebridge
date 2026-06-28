import React from 'react';

export default function DeviceSelector({ devices, inputIndex, outputIndex, onChange }) {
  return (
    <div className="bg-slate-800/60 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Audio Devices</p>

      {/* Microphone input */}
      <div>
        <label className="text-xs text-slate-500 block mb-1">
          🎤 Microphone input (your voice)
        </label>
        <select
          value={inputIndex}
          onChange={e => onChange('inputDeviceIndex', Number(e.target.value))}
          className="w-full bg-slate-700 text-sm text-white rounded-lg px-2 py-1.5 border border-slate-600 focus:border-sky-400 outline-none"
        >
          <option value={-1}>Default Microphone</option>
          {devices.map((name, i) => (
            <option key={i} value={i}>{name}</option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">
          Use your <strong className="text-slate-300">headset mic</strong> — NOT "VoiceBridge Microphone"
        </p>
      </div>

      {/* Output hint */}
      <div className="bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-2">
        <p className="text-xs text-sky-300">
          🔊 In Zoom / Meet / Teams: set microphone to
          <strong className="text-sky-200"> "VoiceBridge Microphone"</strong>
        </p>
      </div>
    </div>
  );
}
