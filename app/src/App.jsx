import React, { useState, useEffect, useCallback } from 'react';
import SignIn            from './components/SignIn.jsx';
import Onboarding        from './components/Onboarding.jsx';
import DeviceSelector    from './components/DeviceSelector.jsx';
import LanguageSelector  from './components/LanguageSelector.jsx';
import VoiceGenderSelector from './components/VoiceGenderSelector.jsx';
import PlatformGuide     from './components/PlatformGuide.jsx';
import LicenseGate       from './components/LicenseGate.jsx';
import StatusPanel       from './components/StatusPanel.jsx';
import TranscriptBox     from './components/TranscriptBox.jsx';

const FREE_TRIAL_SECONDS = 300;

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(undefined);
  const [account, setAccount]           = useState(null);
  const [settings, setSettings]         = useState(null);
  const [devices, setDevices]           = useState([]);
  const [running, setRunning]           = useState(false);
  const [licensed, setLicensed]         = useState(false);
  const [licenseInfo, setLicenseInfo]   = useState(null);
  const [trialLeft, setTrialLeft]       = useState(FREE_TRIAL_SECONDS);
  const [trialActive, setTrialActive]   = useState(false);
  const [status, setStatus]             = useState('idle');
  const [statusMsg, setStatusMsg]       = useState('Ready');
  const [transcript, setTranscript]     = useState('');
  const [translation, setTranslation]   = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showPlatform, setShowPlatform] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await window.vb.getStoredUser();
      if (stored?.uid) {
        setFirebaseUser(stored);
        setAccount(stored.account);
        if (stored.account?.license) {
          setLicenseInfo(stored.account.license);
          setLicensed(stored.account.license.active && !stored.account.license.free_trial);
        }
      } else {
        setFirebaseUser(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (firebaseUser === undefined) return;
    (async () => {
      const s = await window.vb.getSettings();
      setSettings(s);
      if (!s.onboardingDone) setShowOnboarding(true);
      if (!account && s.licenseKey) {
        const r = await window.vb.validateLicense(s.licenseKey);
        setLicensed(r.ok);
        if (r.ok) setLicenseInfo(r.data);
      }
      setDevices(await window.vb.listDevices());
    })();

    window.vb.onTranscript(t  => setTranscript(t));
    window.vb.onTranslation(t => setTranslation(t));
    window.vb.onError(m => { setStatus('error'); setStatusMsg(m); });
  }, [firebaseUser]);

  useEffect(() => {
    if (!trialActive || licensed) return;
    if (trialLeft <= 0) { handleStop(); setStatusMsg('Free trial ended — upgrade at voicebridgeapps.com'); return; }
    const t = setTimeout(() => setTrialLeft(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [trialActive, trialLeft, licensed]);

  const handleStart = useCallback(async () => {
    if (!settings) return;
    if (!licensed && trialLeft <= 0) { setStatus('error'); setStatusMsg('License required'); return; }

    const res = await window.vb.startPipeline({
      inputDeviceIndex: settings.inputDeviceIndex,
      serverUrl:        settings.serverUrl,
      licenseKey:       settings.licenseKey,
      sourceLang:       settings.sourceLang,
      targetLang:       settings.targetLang,
      voiceGender:      settings.voiceGender || 'female',
    });

    if (res.ok) {
      setRunning(true);
      setStatus('active');
      setStatusMsg('Translating…');
      setTranscript('');
      setTranslation('');
      if (!licensed) setTrialActive(true);
    } else {
      setStatus('error');
      setStatusMsg(res.error || 'Failed to start');
    }
  }, [settings, licensed, trialLeft]);

  const handleStop = useCallback(async () => {
    await window.vb.stopPipeline();
    setRunning(false);
    setTrialActive(false);
    setStatus('idle');
    setStatusMsg('Ready');
  }, []);

  const handleLangChange = useCallback(async (src, tgt) => {
    const s = { ...settings, sourceLang: src, targetLang: tgt };
    setSettings(s);
    await window.vb.saveSettings(s);
  }, [settings]);

  const handleVoiceChange = useCallback(async (gender) => {
    const s = { ...settings, voiceGender: gender };
    setSettings(s);
    await window.vb.saveSettings(s);
  }, [settings]);

  const handleDeviceChange = useCallback(async (field, index) => {
    const s = { ...settings, [field]: index };
    setSettings(s);
    await window.vb.saveSettings(s);
  }, [settings]);

  const handleLicenseActivate = useCallback(async (key) => {
    const r = await window.vb.validateLicense(key);
    if (r.ok) {
      const s = { ...settings, licenseKey: key };
      setSettings(s);
      await window.vb.saveSettings(s);
      setLicensed(true);
      setLicenseInfo(r.data);
      setTrialActive(false);
    }
    return r;
  }, [settings]);

  const finishOnboarding = useCallback(async () => {
    setShowOnboarding(false);
    if (settings) {
      const s = { ...settings, onboardingDone: true };
      setSettings(s);
      await window.vb.saveSettings(s);
    }
  }, [settings]);

  if (firebaseUser === undefined) {
    return <LoadingScreen />;
  }

  if (showOnboarding && settings) {
    return <Onboarding onComplete={finishOnboarding} />;
  }

  const hasLegacyKey = settings?.licenseKey;
  if (!firebaseUser && !hasLegacyKey && !settings) {
    return <LoadingScreen />;
  }

  if (!firebaseUser && !hasLegacyKey) {
    return (
      <SignIn onSignIn={(user, acc) => {
        setFirebaseUser(user);
        if (acc) {
          setAccount(acc);
          setLicenseInfo(acc.license);
          setLicensed(acc.license?.active && !acc.license?.free_trial);
        }
      }} />
    );
  }

  if (!settings) return <LoadingScreen />;

  return (
    <div className="flex flex-col h-full bg-[#0a0a12]">
      <div className="titlebar-drag h-8" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-base tracking-tight">
            <span className="text-white">Voice</span><span className="text-cyan-400">Bridge</span>
          </span>
          {!licensed && (
            <span className="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20">
              {trialLeft > 0 ? `${Math.floor(trialLeft / 60)}:${String(trialLeft % 60).padStart(2, '0')}` : 'Trial ended'}
            </span>
          )}
          {licensed && licenseInfo && (
            <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-400/20">
              {licenseInfo.minutes_left ?? '∞'} min
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowPlatform(p => !p)}
            className="text-slate-500 hover:text-cyan-400 text-xs px-2 py-1 rounded-lg hover:bg-white/5 transition"
            title="Setup guide"
          >Setup</button>
          {firebaseUser && (
            <span className="text-[10px] text-slate-600 max-w-[72px] truncate" title={firebaseUser.email}>
              {firebaseUser.email?.split('@')[0]}
            </span>
          )}
          <button
            onClick={() => setShowSettings(s => !s)}
            className="text-slate-500 hover:text-white text-lg px-1 transition"
            title="Settings"
          >⚙</button>
        </div>
      </div>

      <StatusPanel status={status} message={statusMsg} />

      {showSettings && (
        <LicenseGate
          settings={settings}
          licensed={licensed}
          licenseInfo={licenseInfo}
          onActivate={handleLicenseActivate}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto px-5 space-y-3 py-2">
        {showPlatform && <PlatformGuide />}

        <DeviceSelector
          devices={devices}
          inputIndex={settings.inputDeviceIndex}
          onChange={handleDeviceChange}
        />

        <LanguageSelector
          sourceLang={settings.sourceLang}
          targetLang={settings.targetLang}
          onChange={handleLangChange}
        />

        <VoiceGenderSelector
          voiceGender={settings.voiceGender || 'female'}
          onChange={handleVoiceChange}
        />

        <TranscriptBox
          transcript={transcript}
          translation={translation}
          sourceLang={settings.sourceLang}
          targetLang={settings.targetLang}
        />
      </div>

      <div className="px-5 pb-6 pt-2">
        {!running ? (
          <button onClick={handleStart} className="btn-primary btn-pulse">
            Start Translation
          </button>
        ) : (
          <button onClick={handleStop} className="btn-stop">
            Stop
          </button>
        )}
        <PlatformGuide compact />
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-full bg-[#0a0a12]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
        <p className="text-slate-500 text-sm">Loading…</p>
      </div>
    </div>
  );
}
