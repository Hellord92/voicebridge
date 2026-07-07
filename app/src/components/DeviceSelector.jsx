import React, { useState, useEffect, useCallback } from 'react';

export default function DeviceSelector({
  selectedDeviceId,
  selectedOutputDeviceId,
  driverInstalled,
  micVisible,
  blackHoleAvailable,
  onDeviceChange,
  onInstallDriver,
}) {
  const [inputs, setInputs]         = useState([]);
  const [outputs, setOutputs]       = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [permDenied, setPermDenied] = useState(false);

  const loadDevices = useCallback(async (requestPerm = false) => {
    try {
      if (requestPerm) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      }
      const all = await navigator.mediaDevices.enumerateDevices();
      setInputs(
        all.filter(d => d.kind === 'audioinput').map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone (${d.deviceId.slice(0, 8)}…)`,
        }))
      );
      setOutputs(
        all.filter(d => d.kind === 'audiooutput').map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker (${d.deviceId.slice(0, 8)}…)`,
        }))
      );
      setPermDenied(false);
    } catch (e) {
      if (e.name === 'NotAllowedError') setPermDenied(true);
      console.error('[DeviceSelector] enumerateDevices failed:', e);
    }
  }, []);

  useEffect(() => { loadDevices(true); }, [loadDevices]);

  /* Auto-select VoiceBridge Microphone as output when it becomes visible */
  useEffect(() => {
    if (!micVisible) return;
    const vb = outputs.find(d => /voicebridge/i.test(d.label));
    if (vb && !selectedOutputDeviceId) {
      onDeviceChange?.('outputDeviceId', vb.deviceId);
    }
  }, [micVisible, outputs, selectedOutputDeviceId, onDeviceChange]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadDevices(false);
      try {
        const mic = await window.vb.verifyDriverMic?.();
        if (mic?.micVisible !== undefined && onDeviceChange) {
          onDeviceChange('__micRefreshed', mic.micVisible);
        }
      } catch (_) {}
    } finally {
      setRefreshing(false);
    }
  };

  const handleInstall = async () => {
    if (installing || !onInstallDriver) return;
    setInstalling(true);
    try { await onInstallDriver(); } finally { setInstalling(false); }
  };

  /* Best output: prefer VoiceBridge, then BlackHole, then selected */
  const vbOutput    = outputs.find(d => /voicebridge/i.test(d.label));
  const bhOutput    = outputs.find(d => /blackhole/i.test(d.label));
  const bestOutputId = selectedOutputDeviceId
    || vbOutput?.deviceId
    || bhOutput?.deviceId
    || 'default';

  const outputLabel = outputs.find(d => d.deviceId === bestOutputId)?.label || 'Default';
  const isVb = /voicebridge/i.test(outputLabel);
  const isBh = /blackhole/i.test(outputLabel);

  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Audio Routing</p>

      <div className="grid grid-cols-2 gap-3">

        {/* ── Left: INPUT ── */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider">🎤 Input</span>
            <span className="text-[10px] text-slate-600">your mic</span>
          </div>

          {permDenied ? (
            <button
              onClick={() => loadDevices(true)}
              className="w-full rounded-lg px-2.5 py-2 border border-amber-500/40 bg-amber-500/8 text-[11px] text-amber-300 font-semibold"
            >
              Allow Microphone Access
            </button>
          ) : (
            <div className="flex gap-1.5">
              <select
                value={selectedDeviceId || 'default'}
                onChange={e => onDeviceChange?.('inputDeviceId', e.target.value)}
                className="flex-1 min-w-0 bg-white/5 text-xs text-white rounded-lg px-2.5 py-2 border border-white/10 focus:border-cyan-400/50 outline-none truncate"
              >
                <option value="default">Default Microphone</option>
                {inputs.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleRefresh}
                title="Refresh"
                className={`px-2 py-2 rounded-lg border border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-400/40 transition-colors text-sm flex-shrink-0 ${refreshing ? 'animate-spin' : ''}`}
              >
                ↻
              </button>
            </div>
          )}
          <p className="text-[10px] text-slate-600">Speak into this mic</p>
        </div>

        {/* ── Right: OUTPUT ── */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider">📡 Output</span>
            <span className="text-[10px] text-slate-600">to Meet/Zoom</span>
          </div>

          {outputs.length > 0 ? (
            <select
              value={bestOutputId}
              onChange={e => onDeviceChange?.('outputDeviceId', e.target.value)}
              className={`w-full bg-white/5 text-xs rounded-lg px-2.5 py-2 border outline-none truncate
                ${isVb ? 'text-emerald-300 border-emerald-500/40' : isBh ? 'text-sky-300 border-sky-500/40' : 'text-white border-white/10'}
              `}
            >
              <option value="default">Default Output</option>
              {outputs.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          ) : !driverInstalled ? (
            <button
              onClick={handleInstall}
              disabled={installing}
              className="w-full rounded-lg px-3 py-2 border border-violet-500/40 bg-violet-500/10 text-xs text-violet-300 font-semibold hover:bg-violet-500/20 transition-colors disabled:opacity-60"
            >
              {installing ? 'Installing…' : '⬇ Install Virtual Mic'}
            </button>
          ) : null}

          <p className="text-[10px] text-slate-600">
            {isVb ? '✓ VoiceBridge active' : isBh ? '✓ BlackHole active' : 'Select in Meet/Zoom'}
          </p>
        </div>
      </div>

      {/* Instruction bar */}
      <div className="bg-cyan-500/8 border border-cyan-400/20 rounded-lg px-3 py-2">
        <p className="text-[11px] text-cyan-300/90 leading-relaxed">
          In Meet, Zoom, Teams: set microphone to{' '}
          <strong className="text-cyan-300">
            {isVb ? 'VoiceBridge Microphone' : isBh ? 'BlackHole 2ch' : outputLabel}
          </strong>
        </p>
      </div>
    </div>
  );
}
