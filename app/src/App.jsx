import React, { useState, useEffect, useCallback } from 'react';
import SignIn          from './components/SignIn.jsx';
import DeviceSelector   from './components/DeviceSelector.jsx';
import LanguageSelector from './components/LanguageSelector.jsx';
import LicenseGate      from './components/LicenseGate.jsx';
import StatusPanel      from './components/StatusPanel.jsx';
import TranscriptBox    from './components/TranscriptBox.jsx';

const FREE_TRIAL_SECONDS = 300; // 5 minutes

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(undefined); // undefined = checking, null = signed out
  const [account,  setAccount]      = useState(null);
  const [settings, setSettings]     = useState(null);
  const [devices,  setDevices]      = useState([]);
  const [running,  setRunning]      = useState(false);
  const [licensed, setLicensed]     = useState(false);
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [trialLeft, setTrialLeft]   = useState(FREE_TRIAL_SECONDS);
  const [trialActive, setTrialActive] = useState(false);
  const [status,   setStatus]       = useState('idle');
  const [statusMsg, setStatusMsg]   = useState('Ready');
  const [transcript, setTranscript] = useState('');
  const [translation, setTranslation] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  /* Check stored Firebase session on mount */
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
        // Check if legacy license key is stored
        const s = await window.vb.getSettings();
        if (s.licenseKey) {
          setFirebaseUser(null); // skip sign-in, go to app with key
        } else {
          setFirebaseUser(null); // will show sign-in screen
        }
      }
    })();
  }, []);

  /* Load settings after auth is determined */
  useEffect(() => {
    if (firebaseUser === undefined) return; // still checking
    (async () => {
      const s = await window.vb.getSettings();
      setSettings(s);
      if (!account && s.licenseKey) {
        const r = await window.vb.validateLicense(s.licenseKey);
        setLicensed(r.ok);
        if (r.ok) setLicenseInfo(r.data);
      }
      const devs = await window.vb.listDevices();
      setDevices(devs);
    })();

    window.vb.onTranscript(t  => setTranscript(t));
    window.vb.onTranslation(t => setTranslation(t));
    window.vb.onError(m => { setStatus('error'); setStatusMsg(m); });
  }, [firebaseUser]);

  /* Trial countdown */
  useEffect(() => {
    if (!trialActive || licensed) return;
    if (trialLeft <= 0) { handleStop(); setStatusMsg('Free trial ended — enter license key'); return; }
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
    });

    if (res.ok) {
      setRunning(true);
      setStatus('active');
      setStatusMsg('Translating…');
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

  /* Still checking stored session */
  if (firebaseUser === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  /* Show sign-in screen if not authenticated and no stored license key */
  const hasLegacyKey = settings?.licenseKey;
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

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Titlebar drag area */}
      <div className="titlebar-drag h-8 bg-slate-900/80" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sky-400 font-bold text-lg tracking-tight">VoiceBridge</span>
          {!licensed && (
            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
              {trialLeft > 0 ? `Free ${Math.floor(trialLeft/60)}:${String(trialLeft%60).padStart(2,'0')}` : 'Trial ended'}
            </span>
          )}
          {licensed && licenseInfo && (
            <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full">
              {licenseInfo.minutes_left ?? '∞'} min
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {firebaseUser && (
            <span className="text-xs text-slate-500 max-w-[80px] truncate" title={firebaseUser.email}>
              {firebaseUser.email?.split('@')[0]}
            </span>
          )}
          <button
            onClick={() => setShowSettings(s => !s)}
            className="text-slate-400 hover:text-white text-lg transition-colors"
            title="Settings"
          >⚙</button>
        </div>
      </div>

      {/* Status */}
      <StatusPanel status={status} message={statusMsg} />

      {/* Settings panel */}
      {showSettings && (
        <LicenseGate
          settings={settings}
          licensed={licensed}
          licenseInfo={licenseInfo}
          onActivate={handleLicenseActivate}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-5 space-y-4 py-3">
        <DeviceSelector
          devices={devices}
          inputIndex={settings.inputDeviceIndex}
          outputIndex={settings.outputDeviceIndex}
          onChange={handleDeviceChange}
        />

        <LanguageSelector
          sourceLang={settings.sourceLang}
          targetLang={settings.targetLang}
          onChange={handleLangChange}
        />

        <TranscriptBox transcript={transcript} translation={translation} />
      </div>

      {/* Start / Stop */}
      <div className="px-5 pb-6 pt-2">
        {!running ? (
          <button
            onClick={handleStart}
            className="w-full py-3 rounded-xl font-semibold text-white bg-sky-500 hover:bg-sky-400 active:scale-95 transition-all shadow-lg shadow-sky-500/25"
          >
            Start Translation
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="w-full py-3 rounded-xl font-semibold text-white bg-rose-500 hover:bg-rose-400 active:scale-95 transition-all shadow-lg shadow-rose-500/25"
          >
            Stop
          </button>
        )}
        <p className="text-center text-xs text-slate-500 mt-2">
          Select <strong className="text-slate-300">VoiceBridge Microphone</strong> in Zoom / Meet / Teams
        </p>
      </div>
    </div>
  );
}
