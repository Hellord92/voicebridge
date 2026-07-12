'use strict';
/**
 * Isolated process for PortAudio device scan.
 * Pa_Initialize() can hang when CoreAudio is wedged — parent kills this after timeout.
 */
const DEFAULT = [{ index: -1, name: 'Default Microphone' }];
const corePath = process.env.VB_CORE_PATH;

function send(payload) {
  try {
    if (process.send) process.send(payload);
  } catch (_) {}
}

if (!corePath) {
  send({ ok: false, devices: DEFAULT, error: 'VB_CORE_PATH missing' });
  process.exit(0);
}

try {
  const core = require(corePath);
  const devices = typeof core.listInputDevices === 'function'
    ? core.listInputDevices()
    : DEFAULT;
  send({ ok: true, devices: Array.isArray(devices) && devices.length ? devices : DEFAULT });
} catch (e) {
  send({ ok: false, error: e.message, devices: DEFAULT });
}
process.exit(0);
