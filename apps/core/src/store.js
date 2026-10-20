import { mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateSettings } from './settings.js';

const MAX_CONVERSATIONS = 100;
const empty = () => ({ version: 1, settings: {}, conversations: [] });

function validateState(data) {
  if (!data || !Number.isInteger(data.version)) throw new Error('Formato de historial no válido');
  if (data.version !== 1) throw new Error('UNSUPPORTED_VERSION');
  validateSettings(data.settings);
  if (!Array.isArray(data.conversations) || data.conversations.length > MAX_CONVERSATIONS) throw new Error('Historial no válido');
  const ids = new Set();
  for (const item of data.conversations) {
    if (!item || typeof item.id !== 'string' || !/^[\da-f-]{36}$/.test(item.id) || ids.has(item.id) ||
        typeof item.title !== 'string' || item.title.length > 80 || !Number.isFinite(item.updatedAt) ||
        !Array.isArray(item.messages) || item.messages.length % 2) throw new Error('Conversación no válida');
    ids.add(item.id);
    let size = 0;
    for (let index = 0; index < item.messages.length; index++) {
      const message = item.messages[index];
      if (!message || message.role !== (index % 2 ? 'assistant' : 'user') || typeof message.content !== 'string') {
        throw new Error('Turno no válido');
      }
      size += message.content.length;
    }
    if (size > 128000 || item.messages.length > 16000) throw new Error('Historial demasiado grande');
  }
  return data;
}

export class LocalStore {
  #state = empty();
  #queue = Promise.resolve();
  constructor(directory) { this.directory = directory; this.warning = undefined; }

  async load() {
    if (!this.directory) return this;
    await mkdir(this.directory, { recursive: true });
    this.file = join(this.directory, 'state.json');
    this.lock = join(this.directory, 'state.lock');
    await this.#acquire();
    try {
      await this.#read();
      for (const name of await readdir(this.directory)) {
        if (/^state\.json\.[\da-f-]{36}\.tmp$/.test(name)) await unlink(join(this.directory, name));
      }
    } catch (error) { await this.close(); throw error; }
    return this;
  }

  async #acquire() {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await open(this.lock, 'wx', 0o600);
        this.ownsLock = true;
        try { await handle.writeFile(JSON.stringify({ pid: process.pid }), 'utf8'); }
        finally { await handle.close(); }
        return;
      } catch (error) {
        if (error.code !== 'EEXIST') { if (this.ownsLock) await this.close(); throw error; }
        // Serialize stale-lock recovery, then re-read the PID to avoid deleting a new owner's lock.
        let recovery;
        try { recovery = await open(`${this.lock}.recovery`, 'wx', 0o600); }
        catch { throw new Error('Otra instancia está recuperando el bloqueo. Reintenta; si persiste, revisa state.lock.recovery.'); }
        try {
          let pid;
          try { ({ pid } = JSON.parse(await readFile(this.lock, 'utf8'))); }
          catch (cause) {
            if (cause.code === 'ENOENT') continue;
            throw new Error('No se pudo leer state.lock. Comprueba que no haya otro Core antes de retirar ese archivo.');
          }
          if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('state.lock no válido. Comprueba que no haya otro Core antes de retirarlo.');
          try { process.kill(pid, 0); }
          catch (cause) {
            if (cause.code === 'ESRCH') { await unlink(this.lock); continue; }
            throw new Error('No se pudo comprobar el bloqueo del historial.');
          }
          throw new Error('Otro Core está usando este directorio de datos. Cierra esa instancia o usa MIJARVIS_DATA_DIR.');
        } finally {
          await recovery.close();
          await unlink(`${this.lock}.recovery`);
        }
      }
    }
    throw new Error('No se pudo bloquear el historial. Vuelve a iniciar MiJarvis.');
  }

  async #read() {
    try {
      if ((await stat(this.file)).size > 64 * 1024 * 1024) throw new Error('Historial demasiado grande');
      this.#state = validateState(JSON.parse(await readFile(this.file, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') return this;
      if (error.message === 'UNSUPPORTED_VERSION') throw new Error('El historial pertenece a otra versión de MiJarvis. No se modificó el archivo.');
      if (error.code && !(error instanceof SyntaxError)) throw error;
      const backup = `${this.file}.corrupt-${Date.now()}-${randomUUID()}`;
      await rename(this.file, backup);
      this.warning = 'Se detectó un historial dañado. Se conservó una copia .corrupt y se inició un historial vacío.';
      this.#state = empty();
    }
    return this;
  }

  settings() { return structuredClone(this.#state.settings); }
  list() {
    return this.#state.conversations.map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  get(id) {
    const item = this.#state.conversations.find(item => item.id === id);
    if (!item) throw new Error('La conversación ya no existe. Selecciona otra o crea una nueva.');
    return structuredClone(item);
  }
  #change(update) {
    const job = this.#queue.then(async () => {
      const next = structuredClone(this.#state);
      const result = update(next);
      validateState(next);
      if (this.file) {
        const serialized = JSON.stringify(next);
        if (Buffer.byteLength(serialized, 'utf8') > 64 * 1024 * 1024) throw new Error('El historial local alcanzó 64 MB. Borra conversaciones para liberar espacio.');
        const temporary = `${this.file}.${randomUUID()}.tmp`;
        try {
          const handle = await open(temporary, 'wx', 0o600);
          try { await handle.writeFile(serialized, 'utf8'); await handle.sync(); }
          finally { await handle.close(); }
          await rename(temporary, this.file);
        } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      }
      this.#state = next;
      return result;
    });
    this.#queue = job.catch(() => {});
    return job;
  }
  create() {
    return this.#change(state => {
      if (state.conversations.length >= MAX_CONVERSATIONS) throw new Error('Límite de 100 conversaciones. Borra alguna para crear otra.');
      const item = { id: randomUUID(), title: 'Nueva conversación', updatedAt: Date.now(), messages: [] };
      state.conversations.push(item);
      return structuredClone(item);
    });
  }
  saveTurn(id, expectedMessages, messages, prompt) {
    return this.#change(state => {
      const item = state.conversations.find(item => item.id === id);
      if (!item) throw new Error('La conversación fue borrada. No se guardó la respuesta.');
      if (JSON.stringify(item.messages) !== JSON.stringify(expectedMessages)) throw new Error('La conversación cambió desde otra conexión. Recárgala antes de reintentar.');
      item.messages = structuredClone(messages);
      item.updatedAt = Date.now();
      if (!expectedMessages.length) item.title = prompt.slice(0, 80);
      return structuredClone(item);
    });
  }
  delete(id) {
    return this.#change(state => {
      if (!state.conversations.some(item => item.id === id)) throw new Error('La conversación ya no existe.');
      state.conversations = state.conversations.filter(item => item.id !== id);
    });
  }
  saveSettings(settings) { return this.#change(state => { state.settings = validateSettings(settings); }); }
  async flush() { await this.#queue; }
  async close() {
    await this.flush();
    if (this.ownsLock) {
      await unlink(this.lock).catch(error => { if (error.code !== 'ENOENT') throw error; });
      this.ownsLock = false;
    }
  }
}
