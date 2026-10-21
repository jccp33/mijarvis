import { MicrophoneCapture, AudioPlayback } from './audio-devices.js';
import { pcmWav, speechSegments, audioError } from './audio-pcm.js';
import { voicePreferences, voiceDefaults } from './voice-preferences.js';

const $ = id => document.getElementById(id);
const result = value => { if (!value.ok) throw new Error(value.error); return value.data; };

export class VoiceUI {
  state = 'idle'; epoch = 0; held = false; id; loaded;
  constructor({ api = window.jarvis, hostBusy, onChange, onSubmit, language }) {
    this.api = api; this.hostBusy = hostBusy; this.onChange = onChange; this.onSubmit = onSubmit; this.language = language;
    try { this.preferences = voicePreferences(JSON.parse(localStorage.getItem('mijarvis-voice') || '{}')); }
    catch { this.preferences = { ...voiceDefaults }; }
    this.capture = new MicrophoneCapture({ arm: kind => api.armAudio(kind), disarm: () => api.disarmAudio() });
    this.player = new AudioPlayback({ arm: kind => api.armAudio(kind), disarm: () => api.disarmAudio() });
    for (const [id, key] of [['voice-input', 'input'], ['voice-output', 'output'], ['voice-profile', 'voice'], ['voice-speed', 'speed'], ['voice-volume', 'volume'], ['voice-shortcut', 'shortcut'], ['voice-read', 'read']]) {
      if (key === 'read') $(id).checked = this.preferences[key]; else $(id).value = this.preferences[key];
      $(id).addEventListener('change', () => {
        const value = key === 'read' ? $(id).checked : ['speed', 'volume'].includes(key) ? Number($(id).value) : $(id).value;
        this.preferences = voicePreferences({ ...this.preferences, [key]: value }); this.save();
        if (key === 'read') {
          if (!value) void this.stop();
          else void this.player.unlock().then(() => this.engine()).catch(error => {
            this.preferences.read = false; $('voice-read').checked = false; this.save(); this.notice(audioError(error)); void this.player.close();
          });
        }
        this.render();
      });
    }
    $('voice-settings').onclick = () => { $('voice-dialog').showModal(); void this.devices(false); void this.engine().catch(error => this.notice(audioError(error))); };
    $('voice-dialog-close').onclick = () => $('voice-dialog').close();
    $('voice-refresh').onclick = () => void this.devices(true);
    $('voice-test-input').onclick = () => void this.record(true);
    $('voice-test-output').onclick = () => void this.testOutput();
    $('voice-stop').onclick = () => void this.stop();
    $('voice-talk').onpointerdown = event => {
      if (event.button !== 0) return;
      event.preventDefault(); $('voice-talk').setPointerCapture(event.pointerId);
      this.held = true; void this.record();
    };
    $('voice-talk').onpointerup = () => this.release();
    $('voice-talk').onpointercancel = () => void this.stop();
    $('voice-talk').onkeydown = event => {
      if (['Enter', ' '].includes(event.key) && !event.repeat) { event.preventDefault(); this.held = true; void this.record(); }
    };
    $('voice-talk').onkeyup = event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); this.release(); } };
    document.addEventListener('keydown', event => {
      if (event.repeat || $('voice-dialog').open || $('settings-dialog').open) return;
      const match = this.preferences.shortcut === 'Control+Shift+Space' ? event.ctrlKey && event.shiftKey && event.code === 'Space' : event.code === this.preferences.shortcut;
      if (match) { event.preventDefault(); this.key = event.code; this.held = true; void this.record(); }
    });
    document.addEventListener('keyup', event => { if (event.code === this.key) { event.preventDefault(); this.key = undefined; this.release(); } });
    window.addEventListener('blur', () => { if (this.held || this.capture.active) void this.stop(); });
    window.addEventListener('beforeunload', () => { void this.capture.cancel(); void this.player.close(); });
    navigator.mediaDevices?.addEventListener('devicechange', () => void this.devices(false));
    $('voice-send').onclick = () => {
      const text = $('voice-transcript').value.trim();
      if (text && !this.hostBusy() && !this.blocking && this.onSubmit(text)) this.clearReview();
    };
    $('voice-discard').onclick = () => this.clearReview();
    this.render();
  }
  get blocking() { return this.state !== 'idle'; }
  get label() { return ({ permission: 'PERMISO DE MICRÓFONO', recording: 'ESCUCHANDO', transcribing: 'TRANSCRIBIENDO', synthesizing: 'PREPARANDO VOZ', playing: 'HABLANDO', loading: 'CARGANDO VOZ', stopping: 'DETENIENDO VOZ' })[this.state]; }
  save() { try { localStorage.setItem('mijarvis-voice', JSON.stringify(this.preferences)); } catch { this.notice('No se pudieron guardar los ajustes de voz.'); } }
  clearReview() { $('voice-review').hidden = true; $('voice-transcript').value = ''; }
  notice(text) { $('voice-diagnostic').textContent = text; $('voice-status').textContent = text; }
  setState(state) { this.state = state; this.render(); this.onChange(); }
  render() {
    this.sync();
    $('voice-status').textContent = this.state === 'idle' ? `Micrófono apagado · ${this.preferences.shortcut}` : this.label;
    $('voice-talk').dataset.active = String(this.state === 'permission' || this.state === 'recording');
  }
  sync() {
    const busy = this.hostBusy();
    $('voice-talk').disabled = busy || ['transcribing', 'loading', 'stopping'].includes(this.state);
    $('voice-stop').disabled = !this.blocking;
    $('voice-send').disabled = busy || this.blocking;
    for (const id of ['voice-input', 'voice-output', 'voice-profile', 'voice-speed', 'voice-volume', 'voice-shortcut', 'voice-refresh', 'voice-test-input', 'voice-test-output']) $(id).disabled = this.blocking || busy;
  }
  async engine() {
    if (!this.loaded) this.loaded = this.api.voiceStatus().then(result).then(data => {
      $('voice-diagnostic').textContent = `Motor local listo · ${data.voices.map(voice => voice.label).join(', ')}`;
      return data;
    }).catch(error => { this.loaded = undefined; throw error; });
    return this.loaded;
  }
  async devices(armed) {
    try {
      if (armed) { await this.api.armAudio('microphone'); await this.api.armAudio('output'); }
      const items = await navigator.mediaDevices.enumerateDevices();
      for (const [id, kind, key] of [['voice-input', 'audioinput', 'input'], ['voice-output', 'audiooutput', 'output']]) {
        const select = $(id); const selected = this.preferences[key];
        select.replaceChildren(new Option('Predeterminado', ''));
        for (const [index, item] of items.filter(item => item.kind === kind).entries()) select.append(new Option(item.label || `${kind === 'audioinput' ? 'Micrófono' : 'Salida'} ${index + 1}`, item.deviceId));
        if (selected && !items.some(item => item.kind === kind && item.deviceId === selected)) select.append(new Option('Dispositivo guardado no disponible', selected));
        select.value = selected;
      }
    } catch (error) { this.notice(audioError(error)); }
    finally { if (armed) await this.api.disarmAudio().catch(() => {}); }
  }
  release() {
    this.held = false;
    if (this.intent) this.intent.released = true;
    if (this.capture.active) this.capture.finish();
    else if (this.state === 'loading') void this.stop();
  }
  async stop(preserveIntent = false) {
    const epoch = ++this.epoch; this.held = false;
    if (!preserveIntent) this.intent = undefined;
    const captureDone = this.capture.cancel(); const id = this.id; this.id = undefined;
    this.setState('stopping');
    await Promise.allSettled([captureDone, this.player.close(), this.api.cancelVoice(id), this.api.disarmAudio()]);
    if (epoch === this.epoch) this.setState('idle');
  }
  async record(test = false) {
    if (this.hostBusy() || ['permission', 'recording', 'transcribing', 'loading', 'stopping'].includes(this.state)) return;
    const intention = { released: !this.held && !test }; this.intent = intention;
    await this.stop(true);
    if (this.intent !== intention || intention.released) return;
    this.held = true;
    const epoch = ++this.epoch; const language = this.language(); let timer; let failure;
    try {
      this.clearReview();
      if (!test) { this.setState('loading'); await this.engine(); }
      if (epoch !== this.epoch || !this.held) return;
      const recording = this.capture.start({ deviceId: this.preferences.input,
        onState: state => { if (epoch === this.epoch) { this.setState(state); if (state === 'recording') { void this.devices(true); if (test) timer = setTimeout(() => this.capture.finish(), 2000); } } },
        onLevel: (level, seconds) => { $('voice-level').value = level; if (epoch === this.epoch && this.state === 'recording') $('voice-status').textContent = `MIC ACTIVO · ${seconds.toFixed(1)} s / 30 s`; },
      });
      const wav = await recording;
      if (epoch !== this.epoch) return;
      this.held = false;
      if (test) {
        this.setState('playing'); await this.player.play(wav, { deviceId: this.preferences.output, volume: this.preferences.volume });
      } else {
        this.setState('transcribing'); this.id = crypto.randomUUID();
        const transcript = result(await this.api.transcribe({ id: this.id, wav, language }));
        if (epoch !== this.epoch) return;
        $('voice-transcript').value = transcript.text; $('voice-review').hidden = false; $('voice-transcript').focus();
      }
    } catch (error) { if (epoch === this.epoch && error.name !== 'AbortError') failure = audioError(error); }
    finally {
      clearTimeout(timer);
      if (epoch === this.epoch) {
        this.id = undefined; this.held = false; await this.player.close();
        this.setState('idle');
        if (failure) this.notice(failure);
      }
    }
  }
  async testOutput() {
    if (this.blocking || this.hostBusy()) return;
    const epoch = ++this.epoch;
    try {
      this.setState('playing');
      const samples = Float32Array.from({ length: 6400 }, (_, index) => Math.sin(index * Math.PI * 2 * 440 / 16000) * 0.15);
      await this.player.play(pcmWav([samples], 16000), { deviceId: this.preferences.output, volume: this.preferences.volume });
    } catch (error) { if (epoch === this.epoch) this.notice(audioError(error)); }
    finally { if (epoch === this.epoch) { await this.player.close(); this.setState('idle'); } }
  }
  unlock() { if (this.preferences.read) void this.player.unlock().catch(error => this.notice(audioError(error))); }
  async speak(text) {
    if (!this.preferences.read || !text.trim()) return;
    const epoch = ++this.epoch;
    let failure;
    try {
      this.setState('loading'); await this.engine();
      for (const segment of speechSegments(text, this.language())) {
        if (epoch !== this.epoch) return;
        this.setState('synthesizing'); this.id = crypto.randomUUID();
        const audio = result(await this.api.synthesize({ id: this.id, text: segment, voice: this.preferences.voice, speed: this.preferences.speed }));
        if (epoch !== this.epoch) return;
        this.id = undefined; this.setState('playing');
        await this.player.play(audio.wav, { deviceId: this.preferences.output, volume: this.preferences.volume });
      }
    } catch (error) { if (epoch === this.epoch) failure = audioError(error); }
    finally { if (epoch === this.epoch) { this.id = undefined; await this.player.close(); this.setState('idle'); if (failure) this.notice(failure); } }
  }
}
