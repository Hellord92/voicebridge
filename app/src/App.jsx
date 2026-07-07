import React, { useState, useEffect, useCallback, useRef } from 'react';
import SignIn from './components/SignIn.jsx';
import SetupWizard from './components/SetupWizard.jsx';
import DeviceSelector from './components/DeviceSelector.jsx';
import LanguageSelector from './components/LanguageSelector.jsx';
import VoiceGenderSelector from './components/VoiceGenderSelector.jsx';
import PlatformGuide from './components/PlatformGuide.jsx';
import LicenseGate from './components/LicenseGate.jsx';
import StatusPanel from './components/StatusPanel.jsx';
import LiveConversationPanel from './components/LiveConversationPanel.jsx';
import GlossaryEditor from './components/GlossaryEditor.jsx';
import SessionSummary from './components/SessionSummary.jsx';
import { useModal } from './components/ui/ModalProvider.jsx';

const FREE_TRIAL_SECONDS = 300;
const PRICING_URL = 'https://voicebridgeapps.com/pricing';

function trialSecondsFromLicense(data) {
  if (!data?.free_trial) return null;
  if (typeof data.trial_seconds_left === 'number') return Math.max(0, data.trial_seconds_left);
  if (typeof data.minutes_left === 'number') return Math.max(0, data.minutes_left * 60);
  return FREE_TRIAL_SECONDS;
}

export default function App() {
  const { alert, confirm, toast } = useModal();
  const [firebaseUser, setFirebaseUser] = useState(undefined);
  const [account, setAccount] = useState(null);
  const [settings, setSettings] = useState(null);
  const [devices, setDevices] = useState([]);
  const [running, setRunning] = useState(false);
  const [licensed, setLicensed] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [trialLeft, setTrialLeft] = useState(FREE_TRIAL_SECONDS);
  const [trialActive, setTrialActive] = useState(false);
  const [status, setStatus] = useState('idle');
  const [statusMsg, setStatusMsg] = useState('Ready');
  const [latencyMs, setLatencyMs] = useState(null);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [exchanges, setExchanges] = useState([]);
  const [pipelinePhase, setPipelinePhase] = useState('idle');
  const [lastHeardAt, setLastHeardAt] = useState(null);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showPlatform, setShowPlatform] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [driverInstalled, setDriverInstalled] = useState(false);
  const [micVisible, setMicVisible] = useState(false);
  const [blackHoleAvailable, setBlackHoleAvailable] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [sessionLines, setSessionLines] = useState([]);
  const trialModalShown = useRef(false);
  const errorCount = useRef(0);
  const reconnectAttempt = useRef(0);
  const topUpModalShown = useRef(false);
  const lastSpeechAt = useRef(Date.now());
  const pendingExchangeId = useRef(null);
  const lastErrorToastAt = useRef(0);
  const lastLatencyRef = useRef(null);

  const sessionStartRef = useRef(null);

  const handleStop = useCallback(async () => {
    try { await window.vb?.stopPipeline?.(); } catch (_) {}
    setRunning(false);
    setTrialActive(false);
    setStatus('idle');
    setStatusMsg('Ready');
    setPartialTranscript('');
    setPipelinePhase('idle');
    setShowControls(true);
    setShowSummary(true);
  }, []);

  const showTrialEndedModal = useCallback(async () => {
    if (trialModalShown.current) return;
    trialModalShown.current = true;
    await alert({
      title: 'Free trial ended',
      message: 'Upgrade to continue translating in your meetings.',
      detail: 'Minutes never expire. All 50 languages included.',
      variant: 'warning',
    });
    setShowSettings(true);
  }, [alert]);

  useEffect(() => {
    if (!window.vb) {
      setFirebaseUser(null);
      return;
    }
    (async () => {
      try {
        const stored = await window.vb.getStoredUser();
        if (stored?.uid) {
          setFirebaseUser(stored);
          setAccount(stored.account);
          if (stored.account?.license) {
            setLicenseInfo(stored.account.license);
            setLicensed(stored.account.license.active && !stored.account.license.free_trial);
            const secs = trialSecondsFromLicense(stored.account.license);
            if (secs != null) setTrialLeft(secs);
          }
          if (stored.account?.referral_code) {
            const s = await window.vb.getSettings();
            if (s.referralCode !== stored.account.referral_code) {
              await window.vb.saveSettings({ ...s, referralCode: stored.account.referral_code });
            }
          }
          if (stored.account?.license?.key) {
            const s = await window.vb.getSettings();
            /* Always sync licenseKey from fresh server account data */
            if (s.licenseKey !== stored.account.license.key) {
              await window.vb.saveSettings({ ...s, licenseKey: stored.account.license.key });
            }
          }
        } else {
          setFirebaseUser(null);
        }
      } catch (e) {
        setLoadError(e.message);
        setFirebaseUser(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (firebaseUser === undefined || !window.vb) return;
    (async () => {
      try {
        const s = await window.vb.getSettings();
        setSettings(s);
        if (!s.setupDone) setShowSetup(true);
        if (!account && s.licenseKey) {
          const r = await window.vb.validateLicense(s.licenseKey);
          setLicensed(r.ok && !r.data?.free_trial);
          if (r.ok) {
            setLicenseInfo(r.data);
            const secs = trialSecondsFromLicense(r.data);
            if (secs != null) setTrialLeft(secs);
          }
        }
        setDevices(await window.vb.listDevices());
        // Driver / virtual mic status — async, doesn't block startup
        window.vb.isDriverInstalled().then(drv => {
          setDriverInstalled(!!drv?.installed);
        }).catch(() => {});
        window.vb.verifyDriverMic().then(mic => {
          setMicVisible(!!mic?.micVisible);
          setBlackHoleAvailable(!!mic?.blackHole2ch);
        }).catch(() => {});
        setLoadError(null);
      } catch (e) {
        setLoadError(e.message);
      }
    })();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, account]);

  /* IPC listener registration — run ONCE, use refs to access latest state */
  const settingsRef = useRef(settings);
  const licensedRef = useRef(licensed);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { licensedRef.current = licensed; }, [licensed]);

  useEffect(() => {
    if (!window.vb) return;

    window.vb.onPartialTranscript(t => {
      setPartialTranscript(t);
      setPipelinePhase('listening');
      setLastHeardAt(Date.now());
      lastSpeechAt.current = Date.now();
    });
    window.vb.onTranscript(t => {
      if (!t?.trim()) return;
      lastSpeechAt.current = Date.now();
      setLastHeardAt(Date.now());
      setPartialTranscript('');
      setPipelinePhase('translating');
      const id = Date.now();
      pendingExchangeId.current = id;
      setExchanges(lines => [...lines.slice(-99), { id, transcript: t, translation: '', at: Date.now() }]);
      setSessionLines(lines => [...lines.slice(-199), { type: 'transcript', text: t, at: Date.now() }]);
    });
    window.vb.onTranslation(t => {
      lastSpeechAt.current = Date.now();
      setPipelinePhase('done');
      const exId = pendingExchangeId.current;
      const lat = lastLatencyRef.current;
      setExchanges(lines => {
        const copy = [...lines];
        const idx = copy.findIndex(e => e.id === exId);
        if (idx >= 0) copy[idx] = { ...copy[idx], translation: t, latencyMs: lat };
        else copy.push({ id: Date.now(), transcript: '', translation: t, latencyMs: lat, at: Date.now() });
        return copy;
      });
      setSessionLines(lines => [...lines.slice(-199), { type: 'translation', text: t, at: Date.now() }]);
      setTimeout(() => {
        setPipelinePhase(p => (p === 'done' ? 'listening' : p));
      }, 1500);
    });
    window.vb.onLatency(ms => {
      lastLatencyRef.current = ms;
      setLatencyMs(ms);
      const exId = pendingExchangeId.current;
      if (exId) {
        setExchanges(lines => lines.map(e => e.id === exId ? { ...e, latencyMs: ms } : e));
      }
    });
    window.vb.onError(async (m) => {
      setPipelinePhase('error');
      errorCount.current += 1;
      setStatusMsg(m);
      if (m === 'Server error' || m === 'minutes_exhausted') {
        const now = Date.now();
        if (now - lastErrorToastAt.current > 15000) {
          lastErrorToastAt.current = now;
          toast(
            m === 'minutes_exhausted'
              ? 'Trial/minutes exhausted'
              : 'ElevenLabs TTS failed — transcript visible but no audio. Check API key.',
            'error',
            6000,
          );
        }
        setStatus('active');
        setPipelinePhase('done');
        return;
      }
      setStatus('error');
      setRunning(false);
      setTrialActive(false);
      if (errorCount.current <= 3) {
        await alert({ title: 'Translation error', message: m, variant: 'error' });
      }
      const currentSettings = settingsRef.current;
      if (reconnectAttempt.current < 3 && currentSettings) {
        reconnectAttempt.current += 1;
        const delay = 1000 * Math.pow(2, reconnectAttempt.current - 1);
        toast(`Reconnecting in ${delay / 1000}s…`, 'warning', delay);
        setTimeout(async () => {
          const res = await window.vb.startPipeline({
            inputDeviceIndex: currentSettings.inputDeviceIndex,
            licenseKey:       currentSettings.licenseKey,
            sourceLang:       currentSettings.sourceLang,
            targetLang:       currentSettings.targetLang,
            voiceGender:      currentSettings.voiceGender || 'female',
            glossaryJson:     JSON.stringify(currentSettings.glossary || []),
          });
          if (res.ok) {
            setRunning(true);
            setStatus('active');
            setStatusMsg('Translating…');
            reconnectAttempt.current = 0;
            if (!licensedRef.current) setTrialActive(true);
            toast('Reconnected', 'success');
          }
        }, delay);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!trialActive || licensed) return;
    if (trialLeft <= 0) {
      handleStop();
      showTrialEndedModal();
      return;
    }
    const t = setTimeout(() => setTrialLeft(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [trialActive, trialLeft, licensed, handleStop, showTrialEndedModal]);

  useEffect(() => {
    if (!trialActive || licensed || !settings?.licenseKey) return;
    const syncTrial = async () => {
      const r = await window.vb.validateLicense(settings.licenseKey);
      if (!r.ok || !r.data?.free_trial) return;
      const left = trialSecondsFromLicense(r.data);
      if (left != null) setTrialLeft(left);
      if (left != null && left <= 0) {
        handleStop();
        showTrialEndedModal();
      }
    };
    const iv = setInterval(syncTrial, 45000);
    return () => clearInterval(iv);
  }, [trialActive, licensed, settings?.licenseKey, handleStop, showTrialEndedModal]);

  useEffect(() => {
    if (!running || !window.vb?.detectMeetingApps) return;
    const iv = setInterval(async () => {
      const { apps } = await window.vb.detectMeetingApps();
      if (apps.length > 0) {
        const driver = await window.vb.isDriverInstalled();
        if (!driver.installed) {
          toast(`${apps[0]} detected — install VoiceBridge Microphone first`, 'warning', 6000);
        }
      }
    }, 30000);
    return () => clearInterval(iv);
  }, [running, toast]);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      if (Date.now() - lastSpeechAt.current > 45000 && pipelinePhase !== 'listening') {
        toast('45s without speech — check mic and volume', 'warning', 5000);
        lastSpeechAt.current = Date.now();
      }
    }, 15000);
    return () => clearInterval(iv);
  }, [running, pipelinePhase, toast]);

  useEffect(() => {
    if (!licensed || !licenseInfo?.minutes_total) return;
    const pct = Math.round((licenseInfo.minutes_left / licenseInfo.minutes_total) * 100);
    if (pct <= 20 && !topUpModalShown.current && licenseInfo.minutes_left > 0) {
      topUpModalShown.current = true;
      confirm({
        title: 'Running low on minutes',
        message: `${licenseInfo.minutes_left} minutes left (${pct}%).`,
        detail: 'Top up anytime — minutes stack and never expire.',
        confirmLabel: 'View pricing',
        cancelLabel: 'Later',
      }).then(ok => { if (ok) window.open(PRICING_URL, '_blank'); });
    }
  }, [licensed, licenseInfo, confirm]);

  const handleStart = useCallback(async () => {
    if (!settings) return;

    if (!licensed && settings.licenseKey) {
      const vr = await window.vb.validateLicense(settings.licenseKey);
      if (vr.ok) {
        setLicenseInfo(vr.data);
        const secs = trialSecondsFromLicense(vr.data);
        if (secs != null) setTrialLeft(secs);
        if (vr.data?.free_trial && secs != null && secs <= 0) {
          await showTrialEndedModal();
          return;
        }
      }
    }

    if (!licensed && trialLeft <= 0) {
      await showTrialEndedModal();
      return;
    }

    const driver = await window.vb.isDriverInstalled();
    if (!driver.installed) {
      const install = await confirm({
        title: 'Virtual microphone required',
        message: 'VoiceBridge Microphone is not installed.',
        detail: 'Meet and Zoom need this driver to hear translated speech.',
        confirmLabel: 'Install now',
        cancelLabel: 'Continue anyway',
      });
      if (install) {
        const r = await window.vb.installDriver();
        if (!r.ok) {
          await alert({ title: 'Install failed', message: r.error || 'Unknown error', variant: 'error' });
          if (r.needsLogout) {
            await alert({ title: 'Restart required', message: 'Log out and back in to activate the driver.', variant: 'warning' });
          }
        } else if (r.micVisible === false) {
          await alert({
            title: 'Driver installed — mic not visible yet',
            message: 'VoiceBridge Microphone may need a moment to appear.',
            detail: 'Open Sound Settings or restart your Mac if it does not show in Meet/Zoom.',
            variant: 'warning',
          });
          await window.vb.openSystemSettings('sound');
        }
      }
    } else {
      const mic = await window.vb.verifyDriverMic();
      if (mic.installed && !mic.visible) {
        const openSound = await confirm({
          title: 'VoiceBridge Microphone not detected',
          message: 'The driver is installed but macOS has not loaded it into the audio device list.',
          detail: 'Open Sound Settings and check Input devices, or log out and back in.',
          confirmLabel: 'Open Sound Settings',
          cancelLabel: 'Continue anyway',
        });
        if (openSound) await window.vb.openSystemSettings('sound');
      }
    }

    const res = await window.vb.startPipeline({
      inputDeviceIndex: settings.inputDeviceIndex,
      licenseKey:       settings.licenseKey,
      sourceLang:       settings.sourceLang,
      targetLang:       settings.targetLang,
      voiceGender:      settings.voiceGender || 'female',
      glossaryJson:     JSON.stringify(settings.glossary || []),
    });

    if (res.ok) {
      sessionStartRef.current = Date.now();
      setRunning(true);
      setStatus('active');
      setStatusMsg('Translating…');
      setExchanges([]);
      setPartialTranscript('');
      setPipelinePhase('listening');
      setShowControls(false);
      errorCount.current = 0;
      if (!licensed) setTrialActive(true);
      toast('Translation started', 'success');
    } else {
      setStatus('error');
      setStatusMsg(res.error || 'Failed to start');
      if (res.code === -1) {
        await alert({
          title: 'Microphone access needed',
          message: res.error,
          detail: 'System Settings → Privacy & Security → Microphone → enable Electron',
          variant: 'error',
        });
        await window.vb.openSystemSettings('microphone');
      } else {
        await alert({ title: 'Could not start', message: res.error || 'Failed to start', variant: 'error' });
      }
    }
  }, [settings, licensed, trialLeft, confirm, alert, toast, showTrialEndedModal]);

  const finishSetup = useCallback(async () => {
    setShowSetup(false);
    if (settings) {
      const s = { ...settings, setupDone: true, onboardingDone: true };
      setSettings(s);
      await window.vb.saveSettings(s);
    }
  }, [settings]);

  const handleLicenseActivate = useCallback(async (key) => {
    const r = await window.vb.validateLicense(key);
    if (r.ok) {
      const s = { ...settings, licenseKey: key };
      setSettings(s);
      await window.vb.saveSettings(s);
      setLicensed(!r.data?.free_trial);
      setLicenseInfo(r.data);
      const secs = trialSecondsFromLicense(r.data);
      if (secs != null) setTrialLeft(secs);
      setTrialActive(false);
      trialModalShown.current = false;
      toast('License activated', 'success');
    } else {
      toast(r.data?.reason || r.error || 'Invalid key', 'error');
    }
    return r;
  }, [settings, toast]);

  const handleExportSession = useCallback(async () => {
    const text = sessionLines.map(l => `[${l.type}] ${l.text}`).join('\n');
    const r = await window.vb.exportSession(text || 'No transcript yet.');
    if (r.ok) toast('Session exported', 'success');
  }, [sessionLines, toast]);

  if (firebaseUser === undefined && !loadError) return <LoadingScreen />;

  if (loadError) {
    return (
      <Shell>
        <p className="text-rose-400 text-sm">{loadError}</p>
        <button type="button" onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-xl bg-cyan-500 text-black text-sm font-semibold">
          Retry
        </button>
      </Shell>
    );
  }

  if (!window.vb) {
    return (
      <Shell>
        <p className="text-slate-400 text-sm text-center px-6">Open with Electron, not the browser.</p>
        <p className="text-slate-500 text-xs text-center px-6 mt-2">
          Run: <code className="text-cyan-400">cd app && npm run dev</code>
        </p>
      </Shell>
    );
  }

  const isGuest = firebaseUser?.uid === '__manual__';
  const hasLegacyKey = settings?.licenseKey;

  if (showSetup && settings && firebaseUser !== undefined && (firebaseUser || isGuest || hasLegacyKey)) {
    return <SetupWizard onComplete={finishSetup} />;
  }

  if (!firebaseUser && !hasLegacyKey && !isGuest && !settings) return <LoadingScreen />;

  if (!firebaseUser && !hasLegacyKey && !isGuest) {
    return (
      <SignIn onSignIn={async (user, acc) => {
        setFirebaseUser(user);
        if (acc) {
          setAccount(acc);
          setLicenseInfo(acc.license);
          setLicensed(acc.license?.active && !acc.license?.free_trial);
          const secs = trialSecondsFromLicense(acc.license);
          if (secs != null) setTrialLeft(secs);
          if (acc.license?.key) {
            const s = await window.vb.getSettings();
            await window.vb.saveSettings({ ...s, licenseKey: acc.license.key });
            setSettings(prev => ({ ...(prev || s), licenseKey: acc.license.key, setupDone: false }));
            setShowSetup(true);
          }
        }
      }} />
    );
  }

  if (!settings) return <LoadingScreen />;

  const minutesLeft = licenseInfo?.minutes_left;
  const minutesTotal = licenseInfo?.minutes_total;
  const minutesPct = minutesTotal ? Math.round((minutesLeft / minutesTotal) * 100) : 100;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0a0a12]">
      <div className="titlebar-drag h-8" />

      <div className="flex items-center justify-between px-5 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-base tracking-tight">
            <span className="text-white">Voice</span><span className="text-cyan-400">Bridge</span>
          </span>
          {!licensed && (
            <span className="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20">
              {trialLeft > 0 ? `${Math.floor(trialLeft / 60)}:${String(trialLeft % 60).padStart(2, '0')}` : 'Trial ended'}
              <span className="opacity-70 ml-1">· Groq</span>
            </span>
          )}
          {licensed && licenseInfo && (
            <span className="text-[10px] bg-violet-500/10 text-violet-300 px-2 py-0.5 rounded-full border border-violet-400/20">
              Premium · OpenAI+Gemini
            </span>
          )}
          {licensed && licenseInfo && minutesLeft != null && (
            <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-400/20">
              {minutesLeft} min
            </span>
          )}
          {latencyMs != null && running && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
              latencyMs < 800 ? 'text-emerald-400 border-emerald-500/30' : 'text-amber-400 border-amber-500/30'
            }`}>
              {latencyMs}ms
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowPlatform(p => !p)} className="text-slate-500 hover:text-cyan-400 text-xs px-2 py-1 rounded-lg hover:bg-white/5">Setup</button>
          {firebaseUser?.email && (
            <span className="text-[10px] text-slate-600 max-w-[72px] truncate">{firebaseUser.email.split('@')[0]}</span>
          )}
          <button onClick={() => setShowSettings(true)} className="text-slate-500 hover:text-white text-lg px-1" title="License">⚙</button>
        </div>
      </div>

      {licensed && minutesLeft != null && minutesTotal && (
        <div className="px-5 pb-2">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-cyan-500 transition-all" style={{ width: `${minutesPct}%` }} />
          </div>
        </div>
      )}

      <StatusPanel status={status} message={statusMsg} />

      {showSettings && (
        <LicenseGate
          settings={settings}
          licensed={licensed}
          licenseInfo={licenseInfo}
          onActivate={handleLicenseActivate}
          onClose={() => setShowSettings(false)}
          onSignOut={async () => {
            await window.vb.signOut();
            setFirebaseUser(null);
            setShowSettings(false);
          }}
        />
      )}

      {/* Collapsible controls */}
      <div className="px-5 flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => setShowControls(c => !c)}
          className="text-xs text-slate-500 hover:text-cyan-400 px-2 py-1 rounded-lg border border-white/10"
        >
          {showControls ? '▲ Hide settings' : '▼ Settings'}
        </button>
        {running && (
          <span className="text-[10px] text-slate-600">
            {settings.sourceLang} → {settings.targetLang}
          </span>
        )}
      </div>

      {showControls && (
        <div className="flex-shrink-0 max-h-[38vh] overflow-y-auto px-5 space-y-3 py-2 border-b border-white/5">
          {showPlatform && <PlatformGuide />}
          <DeviceSelector
            selectedDeviceId={settings.inputDeviceId || 'default'}
            selectedOutputDeviceId={settings.outputDeviceId || ''}
            driverInstalled={driverInstalled}
            micVisible={micVisible}
            blackHoleAvailable={blackHoleAvailable}
            onDeviceChange={async (field, value) => {
              if (field === '__micRefreshed') {
                setMicVisible(!!value);
                return;
              }
              const s = { ...settings, [field]: value };
              setSettings(s);
              await window.vb.saveSettings(s);
            }}
            onInstallDriver={async () => {
              try {
                await window.vb.installDriver?.();
                const drv = await window.vb.isDriverInstalled();
                setDriverInstalled(!!drv);
                const mic = await window.vb.verifyDriverMic();
                setMicVisible(!!mic?.micVisible);
              } catch (err) {
                toast.error('Driver install failed: ' + err.message);
              }
            }}
          />
          <LanguageSelector sourceLang={settings.sourceLang} targetLang={settings.targetLang} onChange={async (src, tgt) => {
            const s = { ...settings, sourceLang: src, targetLang: tgt };
            setSettings(s);
            await window.vb.saveSettings(s);
          }} />
          <VoiceGenderSelector voiceGender={settings.voiceGender || 'female'} onChange={async (g) => {
            const s = { ...settings, voiceGender: g };
            setSettings(s);
            await window.vb.saveSettings(s);
          }} />
          {!running && (
            <GlossaryEditor
              items={settings.glossary || []}
              onChange={async (glossary) => {
                const s = { ...settings, glossary };
                setSettings(s);
                await window.vb.saveSettings(s);
              }}
            />
          )}
        </div>
      )}

      {/* Live conversation — always visible, takes remaining space */}
      <LiveConversationPanel
        running={running}
        phase={pipelinePhase}
        lastHeardAt={lastHeardAt}
        partialTranscript={partialTranscript}
        exchanges={exchanges}
        sourceLang={settings.sourceLang}
        targetLang={settings.targetLang}
        latencyMs={latencyMs}
      />

      <div className="px-5 pb-5 pt-2 space-y-2 flex-shrink-0 border-t border-white/5 bg-[#0a0a12]">
        {!running ? (
          <button onClick={handleStart} className="btn-primary btn-pulse w-full">Start Translation</button>
        ) : (
          <button onClick={handleStop} className="btn-stop w-full">Stop</button>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={handleExportSession}
            className="flex-1 text-xs py-2 rounded-lg border border-white/10 text-slate-500 hover:text-cyan-400">
            Export session
          </button>
          {!licensed && trialLeft <= 120 && (
            <a href={PRICING_URL} target="_blank" rel="noreferrer"
              className="flex-1 text-xs py-2 rounded-lg text-center bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Buy minutes
            </a>
          )}
        </div>
      </div>

      {showSummary && (
        <SessionSummary
          exchanges={exchanges}
          durationMs={sessionStartRef.current ? Date.now() - sessionStartRef.current : 0}
          latencyMs={latencyMs}
          onClose={() => setShowSummary(false)}
        />
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <Shell>
      <div className="w-8 h-8 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
      <p className="text-slate-500 text-sm">Loading…</p>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a12] gap-3">
      {children}
    </div>
  );
}
