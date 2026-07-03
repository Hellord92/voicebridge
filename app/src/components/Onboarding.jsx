import React, { useState } from 'react';

const STEPS = [
  {
    title: 'Welcome to VoiceBridge',
    body: 'Speak any language — your audience hears theirs in real time.',
    icon: '🎙',
  },
  {
    title: 'Use headphones',
    body: 'Headphones prevent echo. Never use speakers during a call.',
    icon: '🎧',
  },
  {
    title: 'Virtual microphone',
    body: 'VoiceBridge installs a virtual mic. Your meeting app will use it for translated speech.',
    icon: '🔊',
  },
  {
    title: 'Pick your meeting app',
    body: 'Works with Google Meet, Zoom, Teams, and WhatsApp Desktop.',
    icon: '💬',
  },
];

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="flex flex-col h-full bg-[#0a0a12]">
      <div className="titlebar-drag h-8" />
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-3xl mb-6">
          {current.icon}
        </div>
        <h1 className="text-xl font-bold text-white mb-2">{current.title}</h1>
        <p className="text-sm text-slate-400 leading-relaxed max-w-xs">{current.body}</p>
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
          <button
            type="button"
            onClick={() => setStep(s => s - 1)}
            className="flex-1 py-3 rounded-xl text-sm font-medium text-slate-400 border border-white/10 hover:border-white/20"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={() => isLast ? onComplete() : setStep(s => s + 1)}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-black bg-gradient-to-r from-cyan-400 to-cyan-500 hover:brightness-110 active:scale-[0.98] transition-all"
        >
          {isLast ? 'Get Started' : 'Next'}
        </button>
      </div>
    </div>
  );
}
