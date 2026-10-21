import { createSherpaSpeech } from '../../core/src/speech/sherpa.js';
import { inspectWav } from '../../core/src/speech/wav.js';

export class MediaGate {
  constructor(page, now = Date.now) { this.page = page; this.now = now; this.microphone = 0; this.output = 0; }
  arm(kind) {
    if (!['microphone', 'output'].includes(kind)) throw new Error('Permiso de audio no válido.');
    this[kind] = this.now() + 15000;
  }
  disarm() { this.microphone = 0; this.output = 0; }
  allows(permission, details = {}, request = false) {
    if (details.requestingUrl !== this.page || details.isMainFrame === false) return false;
    if (permission === 'speaker-selection') return this.output > this.now();
    if (permission !== 'media' || this.microphone <= this.now()) return false;
    if (request) return Array.isArray(details.mediaTypes) && details.mediaTypes.length === 1 && details.mediaTypes[0] === 'audio';
    return details.mediaType === 'audio';
  }
}

export function createVoiceService({ load = createSherpaSpeech } = {}) {
  let engine; let loading; let active; let closed = false;
  async function get() {
    if (closed) throw new Error('Servicio de voz cerrado.');
    if (!loading) loading = load().then(value => { engine = value; return value; }).catch(error => { loading = undefined; throw error; });
    const value = await loading;
    if (closed) { await value.close(); throw new Error('Servicio de voz cerrado.'); }
    return value;
  }
  function job(kind, input) {
    if (!input || typeof input.id !== 'string' || !/^[\w-]{1,100}$/.test(input.id)) throw new Error('Solicitud de voz no válida.');
    if (closed || active) throw new Error('Espera a que termine la operación de voz actual.');
    if (kind === 'transcribe') inspectWav(input.wav, { sampleRate: 16000, maxSeconds: 30, maxBytes: 960044 });
    else if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 1000) throw new Error('Segmento de voz no válido.');
    const controller = new AbortController();
    const current = { id: input.id, controller };
    active = current;
    current.promise = (async () => {
      try {
        const provider = await get(); controller.signal.throwIfAborted();
        return await provider[kind]({ ...(kind === 'transcribe' ? { wav: input.wav, language: input.language } : { text: input.text, voice: input.voice, speed: input.speed }), signal: controller.signal });
      } finally { if (active === current) active = undefined; }
    })();
    return current.promise;
  }
  return {
    async status() { const provider = await get(); return { voices: provider.voices }; },
    transcribe(input) { return job('transcribe', input); },
    synthesize(input) { return job('synthesize', input); },
    async cancel(id) { if (active && (id === undefined || id === active.id)) { const current = active; current.controller.abort(); await current.promise.catch(() => {}); } },
    async close() {
      closed = true;
      if (active) { active.controller.abort(); await active.promise.catch(() => {}); }
      if (loading) await loading.catch(() => {});
      await engine?.close();
    },
  };
}

export async function voiceResult(operation) {
  try { return { ok: true, data: await operation() }; }
  catch (error) { return { ok: false, error: error.name === 'AbortError' ? 'Operación de voz cancelada.' : String(error.message).slice(0, 400) }; }
}
