import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { inventory, verifySpeechAssets } from '../src/speech/assets.js';
import { speechPaths, speechCatalog, runtimeVersion, voiceId } from '../src/speech/catalog.js';
import { runNative } from '../src/speech/native.js';
import { createSherpaSpeech } from '../src/speech/sherpa.js';
import { inspectWav } from '../src/speech/wav.js';
import { toMono16k } from '../src/speech/resample.js';

function wave({ sampleRate = 16000, seconds = 0.1, silent = false } = {}) {
  const length = Math.round(sampleRate * seconds);
  const bytes = Buffer.alloc(44 + length * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(length * 2, 40);
  for (let index = 0; index < length; index++) bytes.writeInt16LE(silent ? 0 : Math.round(Math.sin(index * 0.2) * 8000), 44 + index * 2);
  return bytes;
}

async function folder(t) {
  const path = await mkdtemp(join(tmpdir(), 'mijarvis-speech-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
async function installation(t) {
  const root = await folder(t);
  const paths = speechPaths(root);
  for (const [key, path] of Object.entries(paths)) {
    if (key === 'voiceData') { await mkdir(path, { recursive: true }); await writeFile(join(path, 'phontab'), 'fixture'); }
    else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, 'fixture'); }
  }
  const manifest = { version: 1, runtimeVersion, platform: process.platform, arch: process.arch, files: await inventory(root) };
  await writeFile(join(root, 'speech-install.json'), JSON.stringify(manifest));
  return { root, paths, manifest };
}

test('Speech catalog pins both platforms and rejects unsupported architectures', () => {
  for (const platform of ['win32', 'linux']) {
    const assets = speechCatalog(platform, 'x64');
    assert.equal(assets.length, 3);
    for (const asset of assets) { assert.match(asset.sha256, /^[a-f0-9]{64}$/); assert.ok(asset.bytes > 0); assert.ok(asset.url.startsWith('https://github.com/k2-fsa/')); }
  }
  assert.throws(() => speechCatalog('linux', 'arm64'), /x64/);
});

test('Speech installation detects tampering, foreign platforms and traversal manifests', async t => {
  const { root, paths, manifest } = await installation(t);
  assert.equal((await verifySpeechAssets({ root })).runtimeVersion, runtimeVersion);
  await assert.rejects(verifySpeechAssets({ root, platform: process.platform === 'win32' ? 'linux' : 'win32' }), /plataforma/);
  await writeFile(paths.encoder, 'modified');
  await assert.rejects(verifySpeechAssets({ root }), /cambiaron/);
  manifest.files[0].path = '../outside';
  await writeFile(join(root, 'speech-install.json'), JSON.stringify(manifest));
  await assert.rejects(verifySpeechAssets({ root }), /Inventario/);
});

test('WAV validation rejects truncation, compression, oversize and invalid rates', () => {
  assert.equal(inspectWav(wave()).sampleRate, 16000);
  assert.throws(() => inspectWav(wave().subarray(0, 50)), /Cabecera/);
  const compressed = wave(); compressed.writeUInt16LE(3, 20);
  assert.throws(() => inspectWav(compressed), /PCM/);
  assert.throws(() => inspectWav(wave({ seconds: 1 }), { maxSeconds: 0.5 }), /segundos/);
  assert.throws(() => inspectWav(wave({ sampleRate: 22050 }), { sampleRate: 16000 }), /PCM/);
  assert.equal(inspectWav(wave({ silent: true })).rms, 0);
});

test('Resampling keeps PCM duration and produces the 16 kHz STT format', () => {
  for (const sampleRate of [8000, 16000, 22050, 44100, 48000]) {
    const result = inspectWav(toMono16k(wave({ sampleRate })));
    assert.equal(result.sampleRate, 16000);
    assert.ok(Math.abs(result.durationSeconds - 0.1) < 0.001);
    assert.ok(result.rms > 0.01);
  }
});

test('Native speech process receives literal arguments and bounds output and lifetime', { timeout: 10000 }, async () => {
  const literal = '--config=malicious & $(echo unsafe); "hola, áéíóú Ñ"';
  const result = await runNative(process.execPath, ['-e', 'console.log(process.argv[1])', '--', literal]);
  assert.equal(result.stdout.trim(), literal);
  await assert.rejects(runNative(process.execPath, ['-e', 'process.stdout.write("x".repeat(20000))'], { maxOutputBytes: 1000 }), /límite/);
  await assert.rejects(runNative(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 50 }), /tiempo/);
  await assert.rejects(runNative(process.execPath, ['-e', 'process.exit(7)']), /código 7/);
  await assert.rejects(runNative(join(tmpdir(), 'mijarvis-missing-executable-716b6e'), []), /No se pudo iniciar/);
});

test('Cancelling native speech waits for process exit', { timeout: 5000 }, async () => {
  const controller = new AbortController();
  const job = runNative(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: controller.signal });
  controller.abort();
  await assert.rejects(job, { name: 'AbortError' });
});

test('Speech adapters preserve text as data, validate audio and clean temporary files', async t => {
  const { root, paths } = await installation(t);
  const temporaryDirectory = await folder(t);
  const calls = [];
  const speech = await createSherpaSpeech({ root, temporaryDirectory, run: async (executable, args) => {
    calls.push({ executable, args });
    if (executable === paths.asr) {
      assert.equal(inspectWav(await readFile(args.at(-1))).sampleRate, 16000);
      return { stdout: '{"text":" Hola Jarvis "}' };
    }
    const output = args.find(arg => arg.startsWith('--output-filename=')).slice('--output-filename='.length);
    await writeFile(output, wave({ sampleRate: 22050 }));
    return { stdout: '' };
  } });
  await assert.rejects(speech.transcribe({ wav: wave({ silent: true }) }), /señal/);
  assert.equal(calls.length, 0);
  assert.equal((await speech.transcribe({ wav: wave() })).text, 'Hola Jarvis');
  const text = '--config=bad & "prueba"';
  const result = await speech.synthesize({ text });
  assert.equal(result.voice, voiceId); assert.equal(result.sampleRate, 22050);
  assert.deepEqual(calls.at(-1).args.slice(-2), ['--', text]);
  await assert.rejects(speech.synthesize({ text: 'hi', speed: 9 }), /Velocidad/);
  await assert.rejects(speech.synthesize({ text: 'hi', voice: 'unknown' }), /Voz/);
  assert.deepEqual(await readdir(temporaryDirectory), []);
  await speech.close();
  await assert.rejects(speech.synthesize({ text: 'hi' }), /cerrado/);
});

test('Speech cancellation and malformed engine output do not poison later requests', async t => {
  const { root } = await installation(t);
  const temporaryDirectory = await folder(t);
  let started; const start = new Promise(resolve => { started = resolve; });
  let blocking = true;
  const speech = await createSherpaSpeech({ root, temporaryDirectory, run: async (_executable, _args, { signal }) => {
    if (blocking) {
      started();
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      signal.throwIfAborted();
    }
    return { stdout: 'invalid JSON' };
  } });
  const job = speech.transcribe({ wav: wave() });
  await start;
  await assert.rejects(speech.transcribe({ wav: wave() }), /activa/);
  speech.cancel(); await assert.rejects(job, { name: 'AbortError' });
  assert.deepEqual(await readdir(temporaryDirectory), []);
  blocking = false;
  await assert.rejects(speech.transcribe({ wav: wave() }), /no válida/);
  assert.deepEqual(await readdir(temporaryDirectory), []);
  await speech.close();
});
