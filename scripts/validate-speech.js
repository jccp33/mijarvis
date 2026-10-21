import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createSherpaSpeech } from '../apps/core/src/speech/sherpa.js';
import { speechDirectory } from '../apps/core/src/speech/catalog.js';

const artifacts = resolve(process.env.MIJARVIS_ARTIFACT_DIR || 'artifacts/speech');
await mkdir(artifacts, { recursive: true });
const directory = await mkdtemp(join(artifacts, 'validation-'));
const jobs = join(directory, 'temporary'); await mkdir(jobs);
const speech = await createSherpaSpeech({ root: speechDirectory(), temporaryDirectory: jobs });
const report = { platform: process.platform, arch: process.arch, runtime: 'sherpa-onnx 1.13.8', results: [] };
try {
  const start = performance.now();
  const audio = await speech.synthesize({ text: 'Hola Jarvis, recuerda que mi color favorito es el azul.' });
  const elapsedMs = performance.now() - start;
  await writeFile(join(directory, 'es-MX-synthesis.wav'), audio.wav);
  report.results.push({ name: 'local Spanish TTS', elapsedMs, audioSeconds: audio.durationSeconds, sampleRate: audio.sampleRate,
    realTimeFactor: elapsedMs / (audio.durationSeconds * 1000) });
  // Convert generated mono PCM to the 16 kHz input contract using deterministic averaging.
  const { toMono16k } = await import('../apps/core/src/speech/resample.js');
  const wav = toMono16k(audio.wav);
  const transcribeStart = performance.now();
  const transcription = await speech.transcribe({ wav, language: 'es' });
  assert.match(transcription.text.toLowerCase(), /azul/);
  report.results.push({ name: 'local Spanish STT from synthetic speech', elapsedMs: performance.now() - transcribeStart, text: transcription.text });
  const controller = new AbortController();
  const cancelled = speech.synthesize({ text: 'Esta operación se cancelará antes de completar la síntesis.', signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(cancelled, { name: 'AbortError' });
  report.results.push({ name: 'native cancellation', passed: true });
  const recovery = await speech.synthesize({ text: 'Listo.' });
  assert.ok(recovery.wav.length > 44);
  assert.deepEqual(await readdir(jobs), []);
  report.results.push({ name: 'recovery and temporary cleanup', passed: true });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await speech.close();
  await writeFile(join(directory, 'speech-validation.json'), JSON.stringify(report, null, 2));
}
console.log(`Evidencia: ${directory}`);
