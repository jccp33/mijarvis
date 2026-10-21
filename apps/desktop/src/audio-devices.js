import { pcmWav } from './audio-pcm.js';

const aborted = () => new DOMException('Captura cancelada.', 'AbortError');
export class MicrophoneCapture {
  active;
  constructor({ media = navigator.mediaDevices, context = options => new AudioContext(options), worklet = context => new AudioWorkletNode(context, 'mijarvis-capture'), arm, disarm } = {}) {
    this.media = media; this.context = context; this.arm = arm; this.disarm = disarm;
    this.worklet = worklet;
  }
  start({ deviceId = '', onLevel = () => {}, onState = () => {} } = {}) {
    if (this.active) throw new Error('Ya hay una captura activa.');
    let resolveStop;
    const current = { chunks: [], count: 0, stop: new Promise(resolve => { resolveStop = resolve; }), resolve: reason => resolveStop(reason) };
    this.active = current;
    const task = (async () => {
      let timer;
      try {
        onState('permission');
        await this.arm('microphone');
        if (current.cancelled) throw aborted();
        const pending = this.media.getUserMedia({ audio: { ...(deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        pending.then(stream => { if (current.cancelled || this.active !== current) stream.getTracks().forEach(track => track.stop()); }, () => {});
        let waitingPermission = true;
        const cancelled = current.stop.then(() => { if (waitingPermission) { current.cancelled = true; throw aborted(); } });
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => { current.cancelled = true; reject(new Error('No se obtuvo permiso de micrófono a tiempo.')); }, 15000); });
        current.stream = await Promise.race([pending, cancelled, timeout]);
        waitingPermission = false;
        clearTimeout(timer); await this.disarm();
        current.context = this.context({ sampleRate: 16000 });
        await current.context.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url).href);
        if (current.cancelled) throw aborted();
        current.node = this.worklet(current.context);
        current.source = current.context.createMediaStreamSource(current.stream);
        const mute = current.context.createGain(); mute.gain.value = 0;
        current.source.connect(current.node); current.node.connect(mute); mute.connect(current.context.destination);
        let heard = false; let lastVoice = 0;
        current.node.port.onmessage = ({ data }) => {
          if (this.active !== current || current.cancelled) return;
          if (data?.type === 'flushed') { clearTimeout(current.flushTimer); current.resolve('finish'); return; }
          const maximum = Math.floor(current.context.sampleRate * 30);
          const chunk = data.subarray(0, Math.max(0, maximum - current.count));
          if (chunk.length) { current.chunks.push(chunk); current.count += chunk.length; }
          let energy = 0; for (const value of chunk) energy += value * value;
          const level = Math.sqrt(energy / (chunk.length || 1));
          const seconds = current.count / current.context.sampleRate;
          onLevel(Math.min(1, level * 6), seconds);
          if (level > 0.008) { heard = true; lastVoice = seconds; }
          if (!heard && seconds >= 3) current.resolve(new Error('No se detectó señal. Revisa el micrófono y vuelve a grabar.'));
          if ((heard && seconds - lastVoice > 1.5) || current.count >= maximum) current.resolve('finish');
        };
        for (const track of current.stream.getAudioTracks()) track.onended = () => current.resolve(new Error('El micrófono se desconectó durante la captura.'));
        await current.context.resume(); onState('recording');
        timer = setTimeout(() => current.resolve('finish'), 30000);
        const reason = await current.stop;
        if (reason instanceof Error) throw reason;
        if (current.cancelled) throw aborted();
        if (!heard) throw new Error('No se detectó señal de voz suficiente.');
        return pcmWav(current.chunks, current.context.sampleRate);
      } finally {
        clearTimeout(timer); clearTimeout(current.flushTimer); current.cancelled = true;
        current.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
        current.node?.disconnect(); current.source?.disconnect();
        await current.context?.close().catch(() => {});
        await this.disarm().catch(() => {});
        if (this.active === current) this.active = undefined;
        onLevel(0, 0);
      }
    })();
    current.task = task;
    return task;
  }
  finish() {
    const current = this.active;
    if (!current || current.finishing) return;
    current.finishing = true;
    if (current.node?.port.postMessage) {
      current.node.port.postMessage('flush');
      current.flushTimer = setTimeout(() => current.resolve('finish'), 250);
    } else current.resolve('finish');
  }
  cancel() {
    if (!this.active) return Promise.resolve();
    const current = this.active;
    current.cancelled = true; current.resolve('cancel');
    current.stream?.getTracks().forEach(track => track.stop());
    return current.task?.catch(() => {}) || Promise.resolve();
  }
}

export class AudioPlayback {
  context;
  source;
  finish;
  constructor({ arm, disarm } = {}) { this.arm = arm; this.disarm = disarm; }
  async unlock() {
    if (!this.context || this.context.state === 'closed') this.context = new AudioContext();
    await this.context.resume();
  }
  async play(wav, { deviceId = '', volume = 0.8 } = {}) {
    await this.unlock();
    const context = this.context;
    if (deviceId && deviceId !== 'default') {
      if (!context.setSinkId) throw new Error('Esta versión no permite seleccionar salida. Usa la predeterminada.');
      await this.arm('output');
      try { await context.setSinkId(deviceId); } finally { await this.disarm(); }
    }
    const bytes = new Uint8Array(wav);
    const decoded = await context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    if (context !== this.context || context.state === 'closed') throw new DOMException('Reproducción cancelada.', 'AbortError');
    const gain = context.createGain(); gain.gain.value = Math.max(0, Math.min(1, volume));
    const source = context.createBufferSource(); this.source = source;
    source.buffer = decoded; source.connect(gain); gain.connect(context.destination);
    await new Promise(resolve => {
      this.finish = resolve;
      source.onended = () => { source.disconnect(); gain.disconnect(); if (this.source === source) this.source = undefined; resolve(); };
      source.start();
    });
    this.finish = undefined;
  }
  async close() {
    const context = this.context; this.context = undefined;
    try { this.source?.stop(); } catch { /* already stopped */ }
    this.source = undefined; this.finish?.(); this.finish = undefined;
    if (context && context.state !== 'closed') await context.close();
  }
}
