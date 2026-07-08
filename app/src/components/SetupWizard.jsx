import React, { useEffect, useRef, useState } from 'react';

const STEPS = [
  { id: 'welcome', title: 'Welcome', icon: '🎙' },
  { id: 'driver',  title: 'Virtual Mic', icon: '🔊' },
  { id: 'mic',     title: 'Microphone', icon: '🎧' },
  { id: 'meet',    title: 'Meeting App', icon: '💬' },
];

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [driverOk, setDriverOk] = useState(null);
  const [micVisible, setMicVisible] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micHeard, setMicHeard] = useState(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  useEffect(() => {
    if (current.id === 'driver' && window.vb?.isDriverInstalled) {
      window.vb.isDriverInstalled().then(r => setDriverOk(r.installed));
      window.vb.verifyDriverMic?.().then(r => setMicVisible(r.visible));
    }
  }, [step, current.id]);

  const refreshDriverStatus = async () => {
    const check = await window.vb.isDriverInstalled();
    setDriverOk(check.installed);
    const mic = await window.vb.verifyDriverMic?.();
    setMicVisible(mic?.visible ?? null);
  };

  useEffect(() => () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks?.().forEach(t => t.stop());
  }, []);

  const stopMicTest = () => {
    setMicTesting(false);
    if (animRef.current) cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks?.().forEach(t => t.stop());
    streamRef.current = null;
  };

  const startMicTest = async () => {
    stopMicTest();
    setMicHeard(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      setMicTesting(true);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(100, Math.round(avg * 1.2)));
        animRef.current = requestAnimationFrame(tick);
      };
      tick();
      setTimeout(() => stopMicTest(), 3000);
    } catch {
      setMicHeard(false);
      await window.vb?.openSystemSettings?.('microphone');
    }
  };

  const handleInstallDriver = async () => {
    setInstalling(true);
    try {
      const r = await window.vb.installDriver();
      if (r.ok) {
        await refreshDriverStatus();
        if (r.micVisible === false) {
          await window.vb.openSystemSettings?.('sound');
        }
      }
    } finally {
      setInstalling(false);
    }
  };

  const body = {
    welcome: 'Speak any language — your audience hears theirs in real time. Let\'s set up in 30 seconds.',
    driver: driverOk
      ? (micVisible
        ? 'VoiceBridge Microphone is installed and visible in macOS. Select it in your meeting app.'
        : 'Driver files are installed. If VoiceBridge Microphone does not appear in Meet/Zoom, open Sound Settings or restart your Mac.')
      : 'Install the virtual microphone so Meet, Zoom, and WhatsApp hear translated speech.',
    mic: 'Use your headset mic here in VoiceBridge. In your meeting app, select VoiceBridge Microphone as input.',
    meet: 'Open Google Meet, Zoom, Teams, or WhatsApp Desktop and set microphone to VoiceBridge Microphone.',
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a12]">
      <div className="titlebar-drag h-8" />
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-3xl mb-6">
          {current.icon}
        </div>
        <h1 className="text-xl font-bold text-white mb-2">{current.title}</h1>
        <p className="text-sm text-slate-400 leading-relaxed max-w-xs">{body[current.id]}</p>

        {current.id === 'driver' && (
          <div className="mt-4 space-y-2 w-full max-w-xs">
            <div className={`text-xs px-3 py-2 rounded-lg border ${
              driverOk && micVisible ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' :
              driverOk ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' :
              driverOk === false ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' :
              'border-white/10 text-slate-500'
            }`}>
              {driverOk && micVisible ? '✓ Driver installed & mic visible' :
               driverOk ? '✓ Driver installed — checking mic visibility…' :
               driverOk === false ? 'Driver not detected' : 'Checking…'}
            </div>
            {driverOk && micVisible === false && (
              <button
                type="button"
                onClick={async () => {
                  await refreshDriverStatus();
                  await window.vb.openSystemSettings?.('sound');
                }}
                className="w-full py-2 rounded-xl text-xs font-medium border border-amber-500/30 text-amber-400"
              >
                Open Sound Settings & retry
              </button>
            )}
            {!driverOk && (
              <button
                type="button"
                disabled={installing}
                onClick={handleInstallDriver}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-white/10 border border-white/20 hover:bg-white/15 disabled:opacity-50"
              >
                {installing ? 'Installing…' : 'Install Virtual Microphone'}
              </button>
            )}
          </div>
        )}

        {current.id === 'mic' && (
          <div className="mt-4 w-full max-w-xs space-y-3">
            <button
              type="button"
              onClick={startMicTest}
              disabled={micTesting}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 disabled:opacity-50"
            >
              {micTesting ? 'Listening… speak now' : 'Test microphone (3 sec)'}
            </button>
            {(micTesting || micLevel > 0) && (
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-400 transition-all duration-75" style={{ width: `${micLevel}%` }} />
              </div>
            )}
            {!micTesting && micLevel > 8 && (
              <p className="text-xs text-emerald-400">✓ Microphone signal detected</p>
            )}
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => setMicHeard(true)}
                className={`flex-1 py-2 rounded-lg border ${micHeard === true ? 'border-emerald-500/40 text-emerald-400' : 'border-white/10 text-slate-500'}`}>
                Yes, I hear myself
              </button>
              <button type="button" onClick={() => window.vb?.openSystemSettings?.('microphone')}
                className="flex-1 py-2 rounded-lg border border-white/10 text-slate-400">
                Open settings
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-1.5 mt-8">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-cyan-400' : 'w-1.5 bg-white/20'}`}
            />
          ))}
        </div>
      </div>
      <div className="px-6 pb-8 flex gap-3">
        {step > 0 && (
          <button type="button" onClick={() => setStep(s => s - 1)}
            className="flex-1 py-3 rounded-xl text-sm font-medium text-slate-400 border border-white/10">
            Back
          </button>
        )}
        <button type="button"
          onClick={() => isLast ? onComplete() : setStep(s => s + 1)}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-black bg-gradient-to-r from-cyan-400 to-cyan-500">
          {isLast ? 'Start using VoiceBridge' : 'Next'}
        </button>
      </div>
    </div>
  );
}
