import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useId } from 'react';
import { createPortal } from 'react-dom';

/**
 * DeviceSelector — uses PortAudio device list (window.vb.listDevices / refreshDevices)
 * so the selection actually maps to what C++ AudioCapture opens.
 *
 * inputDeviceIndex (-1 = system default) is saved to electron-store and passed to startPipeline.
 * outputDeviceId (Web Audio) is kept for the output side since TTS goes via shared-memory
 * to the virtual mic driver — no PortAudio output selection needed there.
 */
/* ── Custom dropdown — portal so menus aren't clipped by scroll parents ── */
function DeviceDropdown({ value, options, onChange, placeholder = 'Select…', className = '' }) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState(null);
  const portalId = useId();
  const ref = useRef(null);
  const btnRef = useRef(null);
  const selected = options.find(o => o.value === value);

  const updateMenuRect = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setMenuRect({
      top: r.bottom + 4,
      left: r.left,
      width: r.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuRect();
    window.addEventListener('resize', updateMenuRect);
    window.addEventListener('scroll', updateMenuRect, true);
    return () => {
      window.removeEventListener('resize', updateMenuRect);
      window.removeEventListener('scroll', updateMenuRect, true);
    };
  }, [open, updateMenuRect]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current?.contains(e.target)) return;
      const portal = document.getElementById(portalId);
      if (portal?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, portalId]);

  const menu = open && menuRect && createPortal(
    <div
      id={portalId}
      className="rounded-xl border border-white/10 shadow-2xl"
      style={{
        position: 'fixed',
        top: menuRect.top,
        left: menuRect.left,
        width: menuRect.width,
        zIndex: 10000,
        background: '#13131f',
        maxHeight: '220px',
        overflowY: 'auto',
      }}
    >
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => { onChange(o.value); setOpen(false); }}
          className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/10 flex items-center gap-2
            ${o.value === value ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-300'}`}
        >
          {o.value === value && <span className="text-cyan-400">✓</span>}
          <span className="truncate">{o.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 bg-white/5 text-xs text-white rounded-lg px-2.5 py-2 border border-white/10 hover:border-cyan-400/40 focus:border-cyan-400/50 outline-none transition-colors text-left"
      >
        <span className="truncate">{selected?.label || placeholder}</span>
        <span className="text-slate-500 flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {menu}
    </div>
  );
}

export default function DeviceSelector({
  selectedDeviceIndex,
  selectedOutputDeviceId,
  driverInstalled,
  micVisible,
  blackHoleAvailable,
  onDeviceChange,
  onInstallDriver,
  running = false,
}) {
  const [paInputs, setPaInputs]     = useState([]);   /* PortAudio {index, name}[] */
  const [virtualMics, setVirtualMics] = useState([]); /* VoiceBridge / BlackHole as system inputs */
  const [refreshing, setRefreshing] = useState(false);
  const [installing, setInstalling] = useState(false);

  const loadDevices = useCallback(async (requestMicPermission = false) => {
    try {
      /* PortAudio input list — what C++ actually sees */
      const pa = await window.vb.listDevices();
      if (Array.isArray(pa) && pa.length > 0 && typeof pa[0] === 'object') {
        setPaInputs(pa);
      } else if (Array.isArray(pa) && pa.length > 0 && typeof pa[0] === 'string') {
        /* Legacy string array from stub */
        setPaInputs(pa.map((name, i) => ({ index: i, name })));
      }
    } catch (e) {
      console.error('[DeviceSelector] listDevices failed:', e);
    }

    try {
      /* getUserMedia on mount can hang when CoreAudio is wedged — only on explicit refresh */
      if (requestMicPermission) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop());
        } catch (_) { /* permission denied — labels may be empty, continue anyway */ }
      }

      const all = await navigator.mediaDevices.enumerateDevices();
      /* Meet/WhatsApp pick VoiceBridge as MICROPHONE (audioinput), not output */
      const vms = all
        .filter(d => d.kind === 'audioinput' && /voicebridge|blackhole/i.test(d.label || ''))
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || 'Virtual Microphone',
        }));
      setVirtualMics(vms);
    } catch (_) {}
  }, []);

  /* Defer device scan so first paint stays interactive */
  useEffect(() => {
    const t = setTimeout(() => { loadDevices(false); }, 800);
    return () => clearTimeout(t);
  }, [loadDevices]);

  /* Auto-select VoiceBridge Microphone when visible */
  useEffect(() => {
    if (!micVisible && virtualMics.length === 0) return;
    const vb = virtualMics.find(d => /voicebridge/i.test(d.label));
    if (vb && !selectedOutputDeviceId) {
      onDeviceChange?.('outputDeviceId', vb.deviceId);
    }
  }, [micVisible, virtualMics, selectedOutputDeviceId, onDeviceChange]);

  const handleRefresh = async () => {
    if (refreshing || running) return; /* Pa_Terminate while pipeline runs = crash */
    setRefreshing(true);
    try {
      const pa = await window.vb.refreshDevices?.();
      if (Array.isArray(pa) && pa.length > 0 && typeof pa[0] === 'object') {
        setPaInputs(pa);
      }
      try {
        const mic = await window.vb.verifyDriverMic?.();
        if (mic?.micVisible !== undefined) onDeviceChange?.('__micRefreshed', mic.micVisible);
      } catch (_) {}
      await loadDevices(true);
    } finally {
      setRefreshing(false);
    }
  };

  const handleInstall = async () => {
    if (installing || !onInstallDriver) return;
    setInstalling(true);
    try { await onInstallDriver(); } finally { setInstalling(false); }
  };

  /* Resolve display label for the currently selected input */
  const selectedInput = paInputs.find(d => d.index === selectedDeviceIndex);
  const inputLabel = selectedDeviceIndex === -1 || selectedDeviceIndex == null
    ? 'Default Microphone'
    : (selectedInput?.name || `Device #${selectedDeviceIndex}`);

  /* Virtual mic (system input device for Meet/WhatsApp) */
  const vbOutput    = virtualMics.find(d => /voicebridge/i.test(d.label));
  const bhOutput    = virtualMics.find(d => /blackhole/i.test(d.label));
  const bestOutputId = selectedOutputDeviceId || vbOutput?.deviceId || bhOutput?.deviceId || 'default';
  const outputLabel  = virtualMics.find(d => d.deviceId === bestOutputId)?.label
    || (micVisible ? 'VoiceBridge Microphone' : blackHoleAvailable ? 'BlackHole 2ch' : 'Default');
  const isVb = micVisible || /voicebridge/i.test(outputLabel);
  const isBh = !isVb && (blackHoleAvailable || /blackhole/i.test(outputLabel));
  const showVirtualMicReady = driverInstalled && (micVisible || isVb || virtualMics.length > 0);

  return (
    <div className="glass-card p-3 space-y-2 overflow-visible">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Audio Routing</p>

      <div className="grid grid-cols-2 gap-3 overflow-visible">

        {/* ── Left: INPUT (PortAudio) ── */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider">Input</span>
            <span className="text-[10px] text-slate-600">your mic</span>
          </div>

          <div className="flex gap-1.5">
            <DeviceDropdown
              className="flex-1 min-w-0"
              value={selectedDeviceIndex ?? -1}
              options={[
                { value: -1, label: 'Default Microphone' },
                ...paInputs.map(d => ({ value: d.index, label: d.name })),
              ]}
              onChange={idx => {
                const dev = paInputs.find(d => d.index === idx);
                onDeviceChange?.({
                  inputDeviceIndex: idx,
                  inputDeviceName: dev?.name || '',
                });
              }}
              placeholder="Default Microphone"
            />
            <button
              type="button"
              onClick={handleRefresh}
              disabled={running || refreshing}
              title={running ? 'Stop translation before refreshing devices' : 'Refresh devices'}
              className={`px-2 py-2 rounded-lg border border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-400/40 transition-colors text-sm flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${refreshing ? 'animate-spin' : ''}`}
            >
              ↻
            </button>
          </div>
          <p className="text-[10px] text-slate-600">Speak into this mic</p>
        </div>

        {/* ── Right: OUTPUT (virtual mic) ── */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider">Output</span>
            <span className="text-[10px] text-slate-600">to Meet/Zoom/WhatsApp</span>
          </div>

          {showVirtualMicReady ? (
            <div className="w-full rounded-lg px-3 py-2 border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300 font-semibold">
              ✓ {isVb ? 'VoiceBridge Microphone' : isBh ? 'BlackHole 2ch' : 'Virtual mic ready'}
            </div>
          ) : !driverInstalled ? (
            <button
              onClick={handleInstall}
              disabled={installing}
              className="w-full rounded-lg px-3 py-2 border border-violet-500/40 bg-violet-500/10 text-xs text-violet-300 font-semibold hover:bg-violet-500/20 transition-colors disabled:opacity-60"
            >
              {installing ? 'Installing…' : 'Install Virtual Mic'}
            </button>
          ) : (
            <div className="w-full rounded-lg px-3 py-2 border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
              Driver installed — restart Mac if mic missing
            </div>
          )}

          <p className="text-[10px] text-slate-600">
            {isVb ? '✓ VoiceBridge active' : isBh ? '✓ BlackHole active' : 'Select in Meet/Zoom/WhatsApp'}
          </p>
        </div>
      </div>

      {/* Instruction bar */}
      <div className="bg-cyan-500/8 border border-cyan-400/20 rounded-lg px-3 py-2">
        <p className="text-[11px] text-cyan-300/90 leading-relaxed">
          In Meet, Zoom, Teams, or WhatsApp: set microphone to{' '}
          <strong className="text-cyan-300">
            {isVb ? 'VoiceBridge Microphone' : isBh ? 'BlackHole 2ch' : outputLabel}
          </strong>
        </p>
      </div>
    </div>
  );
}
