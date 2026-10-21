import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { verifySpeechAssets } from './assets.js';
import { voiceId } from './catalog.js';
import { runNative } from './native.js';
import { inspectWav } from './wav.js';

// STT: transcribe({wav, language, signal}) -> {text, language, durationSeconds}.
// TTS: synthesize({text, voice, speed, signal}) -> {wav, voice, sampleRate, durationSeconds}.
// No capture, playback, implicit network calls or chat submission occurs in this adapter.
export async function createSherpaSpeech({ root, temporaryDirectory = tmpdir(), run = runNative } = {}) {
  const assets = await verifySpeechAssets({ root });
  const paths = assets.paths;
  let active; let closed = false; let finishing;
  async function job(signal, operation) {
    if (closed) throw new Error('El servicio de audio está cerrado.');
    if (active) throw new Error('Ya hay una operación de audio activa.');
    signal?.throwIfAborted();
    const controller = new AbortController(); active = controller;
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    let release;
    finishing = new Promise(resolve => { release = resolve; });
    let directory;
    try {
      directory = await mkdtemp(join(resolve(temporaryDirectory), 'mijarvis-speech-'));
      combined.throwIfAborted();
      const result = await operation(directory, combined);
      combined.throwIfAborted();
      return result;
    } finally {
      try {
        if (directory) {
          if (dirname(directory) !== resolve(temporaryDirectory) || !basename(directory).startsWith('mijarvis-speech-')) throw new Error('Directorio temporal inesperado.');
          await rm(directory, { recursive: true, force: true });
        }
      } finally { active = undefined; release(); }
    }
  }
  const common = ['--provider=cpu', '--num-threads=2', '--debug=false', '--print-args=false'];
  return {
    id: 'sherpa-onnx',
    voices: [{ id: voiceId, language: 'es-MX', label: 'Claude · español de México' }],
    async transcribe({ wav, language = 'es', signal } = {}) {
      if (!['es', 'en'].includes(language)) throw new Error('Idioma de transcripción no válido.');
      const info = inspectWav(wav, { maxSeconds: 30, sampleRate: 16000, maxBytes: 960044 });
      if (info.rms < 0.001) throw new Error('No se detectó señal de voz suficiente. Revisa el micrófono.');
      const inputWav = Buffer.from(wav);
      return job(signal, async (directory, currentSignal) => {
        const input = join(directory, 'input.wav');
        await writeFile(input, inputWav, { mode: 0o600 });
        const result = await run(paths.asr, [...common, `--whisper-encoder=${paths.encoder}`, `--whisper-decoder=${paths.decoder}`,
          `--tokens=${paths.tokens}`, `--whisper-language=${language}`, '--whisper-task=transcribe', '--', input], { cwd: directory, signal: currentSignal });
        currentSignal.throwIfAborted();
        let output;
        try { output = JSON.parse(result.stdout.trim()); } catch { throw new Error('El motor devolvió una transcripción no válida.'); }
        if (typeof output.text !== 'string' || !output.text.trim() || output.text.length > 16000) throw new Error('Transcripción vacía o demasiado larga.');
        return { text: output.text.trim(), language, durationSeconds: info.durationSeconds };
      });
    },
    async synthesize({ text, voice = voiceId, speed = 1, signal } = {}) {
      if (typeof text !== 'string' || !text.trim() || text.length > 1000 || text.includes('\0')) throw new Error('Cada segmento de voz debe contener entre 1 y 1000 caracteres sin NUL.');
      if (voice !== voiceId) throw new Error('Voz no instalada.');
      if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) throw new Error('Velocidad de voz fuera de rango (0.5–2).');
      return job(signal, async (directory, currentSignal) => {
        const output = join(directory, 'speech.wav');
        await run(paths.tts, [...common, `--vits-model=${paths.voice}`, `--vits-tokens=${paths.voiceTokens}`,
          `--vits-data-dir=${paths.voiceData}`, `--speed=${speed}`, `--output-filename=${output}`, '--', text], { cwd: directory, signal: currentSignal });
        currentSignal.throwIfAborted();
        let size;
        try { size = (await stat(output)).size; } catch { throw new Error('El motor terminó sin generar un archivo de audio.'); }
        if (size > 32 * 1024 * 1024) throw new Error('El audio generado es demasiado grande.');
        const wav = await readFile(output);
        const info = inspectWav(wav, { maxSeconds: 180 });
        return { wav, voice, sampleRate: info.sampleRate, durationSeconds: info.durationSeconds };
      });
    },
    cancel() { active?.abort(); },
    async close() { closed = true; active?.abort(); await finishing; },
  };
}
