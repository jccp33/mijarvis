import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaGate, createVoiceService } from '../../desktop/src/voice-service.js';
import { MicrophoneCapture } from '../../desktop/src/audio-devices.js';
import { pcmWav, speechSegments } from '../../desktop/src/audio-pcm.js';
import { voicePreferences } from '../../desktop/src/voice-preferences.js';
import { inspectWav } from '../src/speech/wav.js';
import { SystemController } from '../../../packages/system/src/index.js';

test('Microphone permission is scoped to audio, main page, explicit action and time window', () => {
  let now = 100; const page = 'file:///app/index.html'; const gate = new MediaGate(page, () => now);
  const audio = { requestingUrl: page, isMainFrame: true, mediaType: 'audio', mediaTypes: ['audio'] };
  assert.equal(gate.allows('media', audio), false);
  gate.arm('microphone');
  assert.equal(gate.allows('media', audio), true);
  assert.equal(gate.allows('media', audio, true), true);
  assert.equal(gate.allows('media', { ...audio, mediaType: 'video' }), false);
  assert.equal(gate.allows('media', { ...audio, mediaTypes: ['audio', 'video'] }, true), false);
  assert.equal(gate.allows('media', { ...audio, isMainFrame: false }), false);
  assert.equal(gate.allows('media', { ...audio, requestingUrl: 'https://other.test' }), false);
  assert.equal(gate.allows('notifications', audio), false);
  now += 15001; assert.equal(gate.allows('media', audio), false);
  gate.arm('output'); assert.equal(gate.allows('speaker-selection', audio), true);
  gate.disarm(); assert.equal(gate.allows('speaker-selection', audio), false);
});

test('Voice IPC service validates data, cancels loading jobs and allows recovery', async () => {
  let loadFinished;
  const loading = new Promise(resolve => { loadFinished = resolve; });
  let transcribed = 0; let closed = 0;
  const provider = { voices: [], transcribe: async () => { transcribed++; return { text: 'hola' }; }, close: async () => { closed++; } };
  const service = createVoiceService({ load: () => loading });
  assert.throws(() => service.transcribe({ id: 'invalid', wav: new Uint8Array(9) }), /WAV/);
  const wav = pcmWav([new Float32Array(8000).fill(0.1)], 16000);
  const request = service.transcribe({ id: 'first', wav });
  assert.throws(() => service.transcribe({ id: 'second', wav }), /actual/);
  const cancelled = service.cancel('first'); loadFinished(provider);
  await assert.rejects(request, { name: 'AbortError' }); await cancelled;
  assert.equal(transcribed, 0);
  assert.equal((await service.transcribe({ id: 'again', wav })).text, 'hola');
  await service.close(); assert.ok(closed >= 1);
});

test('Completed replies split at sentence/word boundaries and skip fenced code', () => {
  assert.deepEqual(speechSegments('Hola mundo. Segunda frase. ```js\nalert(1)\n```'), ['Hola mundo.', 'Segunda frase.']);
  const text = 'palabra '.repeat(100);
  const segments = speechSegments(text);
  assert.ok(segments.length > 1);
  assert.ok(segments.every(part => part.length <= 240 && !part.includes('palab ')));
  assert.equal(segments.join(' '), text.trim());
  assert.ok(speechSegments('x'.repeat(1100)).length === 0);
});

test('Voice preferences reject invalid devices, volumes and shortcuts', () => {
  assert.equal(voicePreferences().read, false);
  assert.throws(() => voicePreferences({ shortcut: 'Alt+F4' }), /Atajo/);
  assert.throws(() => voicePreferences({ volume: 3 }), /rango/);
  assert.throws(() => voicePreferences({ speed: NaN }), /rango/);
  assert.throws(() => voicePreferences({ input: 'a'.repeat(257) }), /Dispositivo/);
  assert.throws(() => voicePreferences({ version: 2 }), /Preferencias/);
});

test('Capture never requests a microphone at construction and releases late grants after cancel', async () => {
  let resolveMedia; let calls = 0; let stopped = 0;
  const track = { stop() { stopped++; } };
  const media = { getUserMedia() { calls++; return new Promise(resolve => { resolveMedia = resolve; }); } };
  const capture = new MicrophoneCapture({ media, arm: async () => {}, disarm: async () => {} });
  assert.equal(calls, 0);
  const result = capture.start(); await Promise.resolve();
  const cancel = capture.cancel();
  await assert.rejects(result, { name: 'AbortError' }); await cancel;
  resolveMedia({ getTracks: () => [track] }); await Promise.resolve();
  assert.equal(stopped, 1); assert.equal(capture.active, undefined);
});

test('Capture handles denied permissions, valid PCM finish, silence and disconnected track', async () => {
  const denied = new MicrophoneCapture({ media: { getUserMedia: async () => { throw new DOMException('denied', 'NotAllowedError'); } }, arm: async () => {}, disarm: async () => {} });
  await assert.rejects(denied.start(), { name: 'NotAllowedError' }); assert.equal(denied.active, undefined);
  let stopped = 0; let closed = 0; let track;
  let ready; let nextReady;
  const node = { port: {}, connect() {}, disconnect() {} };
  const context = { sampleRate: 16000, audioWorklet: { addModule: async () => {} }, createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
    createGain: () => ({ gain: {}, connect() {} }), destination: {}, resume: async () => {}, close: async () => { closed++; } };
  const capture = new MicrophoneCapture({
    media: { getUserMedia: async () => { track = { stop() { stopped++; } }; return { getTracks: () => [track], getAudioTracks: () => [track] }; } },
    context: () => context, worklet: () => node, arm: async () => {}, disarm: async () => {},
  });
  for (const mode of ['finish', 'silence', 'disconnect', 'limit']) {
    ready = new Promise(resolve => { nextReady = resolve; });
    const result = capture.start({ onState: state => { if (state === 'recording') nextReady(); } });
    await ready;
    if (mode === 'finish') {
      node.port.onmessage({ data: new Float32Array(8000).fill(0.1) }); capture.finish();
      assert.equal(inspectWav(await result).durationSeconds, 0.5);
    } else if (mode === 'silence') {
      node.port.onmessage({ data: new Float32Array(48000) });
      await assert.rejects(result, /señal/);
    } else if (mode === 'limit') {
      node.port.onmessage({ data: new Float32Array(480000).fill(0.1) });
      assert.equal(inspectWav(await result).durationSeconds, 30);
    } else { track.onended(); await assert.rejects(result, /desconectó/); }
    assert.equal(capture.active, undefined);
  }
  assert.equal(closed, 4); assert.equal(stopped, 4);
});

test('Windows terminal uses a visible independent launcher and rejects false success', async () => {
  let invocation;
  const system = new SystemController('win32', { executeFile: async (...args) => { invocation = args; return { stdout: '{"opened":true,"pid":123}' }; } });
  assert.deepEqual(await system.openTerminal(), { opened: true, pid: 123 });
  const script = Buffer.from(invocation[1].at(-1), 'base64').toString('utf16le');
  assert.match(script, /Start-Process/); assert.match(script, /-WindowStyle Normal/); assert.match(script, /HasExited/);
  assert.equal(invocation[2].windowsHide, true); assert.equal(invocation[2].shell, false);
  const broken = new SystemController('win32', { executeFile: async () => ({ stdout: '{"opened":true}' }) });
  await assert.rejects(broken.openTerminal(), /No se pudo abrir PowerShell/);
});
