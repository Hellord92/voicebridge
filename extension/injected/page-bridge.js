/**
 * LinguaMeet Page Bridge — MAIN world
 * Meet'in getUserMedia çağrısını yakalar; sentetik mikrofon track'i sağlar.
 * TTS sesi bu track üzerinden Meet'e gider (BlackHole gerekmez).
 */
(function () {
  'use strict';

  if (window.__linguaMeetBridge) return;
  window.__linguaMeetBridge = true;

  const SOURCE = 'linguameet-page';
  const audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();
  let syntheticTrack = destination.stream.getAudioTracks()[0];
  let hookActive = false;
  let origGetUserMedia = null;
  let ttsPlaying = false;
  const ttsQueue = [];

  syntheticTrack.enabled = true;

  function resumeCtx() {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  }

  async function decodeAndPlay(arrayBuffer) {
    resumeCtx();
    const abCopy = arrayBuffer.slice(0);
    const audioBuffer = await audioCtx.decodeAudioData(abCopy);
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(destination);
    return new Promise((resolve) => {
      source.onended = () => resolve();
      source.start(0);
    });
  }

  async function processTtsQueue() {
    if (ttsPlaying || ttsQueue.length === 0) return;
    ttsPlaying = true;
    while (ttsQueue.length > 0) {
      const item = ttsQueue.shift();
      try {
        await decodeAndPlay(item);
      } catch (err) {
        console.error('[LinguaMeet] TTS decode hatası:', err);
      }
    }
    ttsPlaying = false;
  }

  function playTtsBuffer(arrayBuffer) {
    ttsQueue.push(arrayBuffer);
    processTtsQueue();
  }

  function installGetUserMediaHook() {
    if (hookActive) return;
    origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia = async function (constraints) {
      const stream = await origGetUserMedia(constraints);
      if (!constraints || !constraints.audio) return stream;

      resumeCtx();

      const out = new MediaStream();
      stream.getVideoTracks().forEach((t) => out.addTrack(t));

      if (syntheticTrack.readyState === 'ended') {
        const dest = audioCtx.createMediaStreamDestination();
        syntheticTrack = dest.stream.getAudioTracks()[0];
      }
      out.addTrack(syntheticTrack);

      stream.getAudioTracks().forEach((t) => t.stop());
      console.log('[LinguaMeet] Meet mikrofon track değiştirildi → sentetik çeviri çıkışı');
      return out;
    };

    hookActive = true;
    window.postMessage({ source: SOURCE, type: 'LM_HOOK_READY' }, '*');
  }

  function removeHook() {
    if (!hookActive || !origGetUserMedia) return;
    navigator.mediaDevices.getUserMedia = origGetUserMedia;
    hookActive = false;
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'linguameet-ext') return;

    switch (data.type) {
      case 'LM_START':
        installGetUserMediaHook();
        resumeCtx();
        break;
      case 'LM_STOP':
        removeHook();
        break;
      case 'LM_PLAY_TTS':
        if (data.buffer) playTtsBuffer(data.buffer);
        break;
      default:
        break;
    }
  });

  window.postMessage({ source: SOURCE, type: 'LM_BRIDGE_LOADED' }, '*');
})();
