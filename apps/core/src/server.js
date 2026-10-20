import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { SystemController } from '@mijarvis/system';
import { createOllamaProvider } from './ollama-provider.js';
import { ConversationHistory } from './history.js';
import { LocalStore } from './store.js';
import { resolveSettings, validateSettings, languageInstruction } from './settings.js';
import { readableError } from './errors.js';
export { dataDirectory, loadEnvironment } from './settings.js';

export async function startCore({
  port = 4317, token, model, ollamaUrl, language, dataDir, env = process.env,
  system = new SystemController(),
  provider: suppliedProvider,
} = {}) {
  if (typeof token !== 'string' || token.length < 24) throw new Error('CORE_TOKEN must contain at least 24 characters');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid Core port');
  const store = await new LocalStore(dataDir).load();
  let settings;
  try { settings = resolveSettings(store.settings(), env, {
    ...(model === undefined ? {} : { model }), ...(ollamaUrl === undefined ? {} : { endpoint: ollamaUrl }),
    ...(language === undefined ? {} : { language }),
  }); } catch (error) { await store.close(); throw error; }
  let provider = suppliedProvider ?? createOllamaProvider({ baseUrl: settings.endpoint });
  const locks = new Map();
  const pending = new Set();
  const sessions = new Set();
  let generations = 0;
  let changingSettings = false;
  let closing = false;
  const broadcast = (event, exclude) => { for (const session of sessions) if (session !== exclude) session.send(event); };
  const server = http.createServer((req, res) => {
    res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.url === '/health' ? { status: 'ok' } : { error: 'Not found' }));
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });
  server.on('upgrade', (req, socket, head) => {
    if (closing) { socket.destroy(); return; }
    const url = new URL(req.url, 'http://127.0.0.1');
    const candidate = Buffer.from(url.searchParams.get('token') || '');
    const secret = Buffer.from(token);
    const origin = req.headers.origin;
    if (url.pathname !== '/ws' || (origin && origin !== 'null' && origin !== 'file://') ||
        candidate.length !== secret.length || !timingSafeEqual(candidate, secret)) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    let active;
    let activeId;
    let selected;
    let managing = false;
    const send = event => {
      if (ws.readyState === WebSocket.OPEN) {
        if (ws.bufferedAmount > 1024 * 1024) { ws.terminate(); return; }
        ws.send(JSON.stringify(event));
      }
    };
    const snapshot = id => send({ type: 'conversation', id, conversation: selected ? store.get(selected) : null, conversations: store.list() });
    const session = { send, abort() { active?.abort(); }, clear(id) { if (selected === id) { selected = undefined; snapshot(); } } };
    sessions.add(session);
    send({ type: 'ready', model: settings.model, settings, conversations: store.list(), warning: store.warning, persistent: Boolean(dataDir) });
    const stats = setInterval(() => send({ type: 'stats', data: system.getSystemStats() }), 1000);
    ws.on('close', () => { clearInterval(stats); active?.abort(); sessions.delete(session); });
    ws.on('error', () => { active?.abort(); });
    async function handle(raw) {
      let id;
      let requestSignal;
      try {
        const message = JSON.parse(raw.toString());
        if (!message || typeof message !== 'object') throw new Error('Invalid event');
        id = message.id;
        if (typeof id !== 'string' || id.length < 1 || id.length > 100) throw new Error('Invalid request id');
        if (message.type === 'cancel') { if (id === activeId) active?.abort(); return; }
        if (closing) throw new Error('El Core se está cerrando.');
        if (message.type === 'system.command') {
          const data = await system.runSystemCommand(message.command);
          send({ type: 'system.result', id, data });
          return;
        }
        if (message.type === 'conversations.list') { send({ type: 'conversations', id, conversations: store.list() }); return; }
        if (['conversation.create', 'conversation.select', 'conversation.delete', 'settings.get', 'settings.update', 'diagnostics'].includes(message.type)) {
          if (active || managing) throw new Error('Espera a que termine la operación actual o cancela la respuesta.');
          managing = true;
          try {
            if (message.type === 'conversation.create') { selected = (await store.create()).id; snapshot(id); }
            if (message.type === 'conversation.select') { store.get(message.conversationId); selected = message.conversationId; snapshot(id); }
            if (message.type === 'conversation.delete') {
              if (locks.has(message.conversationId)) throw new Error('Cancela la respuesta de esa conversación antes de borrarla.');
              const deletion = {};
              locks.set(message.conversationId, deletion);
              try { await store.delete(message.conversationId); }
              finally { if (locks.get(message.conversationId) === deletion) locks.delete(message.conversationId); }
              for (const client of sessions) client.clear(message.conversationId);
              snapshot(id);
            }
            if (['conversation.create', 'conversation.delete'].includes(message.type)) broadcast({ type: 'conversations', conversations: store.list() });
            if (message.type === 'settings.update') {
              if (generations || changingSettings) throw new Error('Espera a que terminen las operaciones antes de cambiar la configuración.');
              if (suppliedProvider) throw new Error('Este Core usa un proveedor inyectado y no permite cambiar su configuración.');
              const next = validateSettings(message.settings);
              changingSettings = true;
              try {
                await store.saveSettings(next);
                settings = next;
                provider = createOllamaProvider({ baseUrl: settings.endpoint });
                send({ type: 'settings', id, settings });
                broadcast({ type: 'settings', settings }, session);
              } finally { changingSettings = false; }
            }
            if (message.type === 'settings.get') send({ type: 'settings', id, settings });
            if (message.type === 'diagnostics') {
              const current = { ...settings };
              let models = []; let error;
              try {
                if (!provider.listModels) throw new Error('El proveedor no permite consultar modelos.');
                models = await provider.listModels({ signal: AbortSignal.timeout(8000) });
              } catch (cause) { error = readableError(cause); }
              send({ type: 'diagnostics', id, settings: current, available: !error, models,
                selectedModelAvailable: models.some(item => item.id === current.model || item.id === `${current.model}:latest`),
                error, persistent: Boolean(dataDir), warning: store.warning });
            }
          } finally { managing = false; }
          return;
        }
        if (message.type !== 'prompt') throw new Error('Unknown event type');
        if (active || managing || changingSettings) throw new Error('Espera a que termine la operación actual.');
        if (typeof message.prompt !== 'string' || !message.prompt.trim() || message.prompt.length > 16000) {
          throw new Error('Prompt must contain between 1 and 16000 characters');
        }
        const controller = new AbortController();
        active = controller;
        activeId = id;
        requestSignal = controller.signal;
        generations++;
        const timeout = setTimeout(() => controller.abort(new Error('Generation timed out')), 120000);
        send({ type: 'state', id, state: 'thinking' });
        let conversationId;
        try {
          if (!selected) { selected = (await store.create()).id; snapshot(); }
          conversationId = selected;
          if (locks.has(conversationId)) throw new Error('Esta conversación ya está generando una respuesta en otra conexión.');
          locks.set(conversationId, controller);
          const saved = store.get(conversationId);
          const history = new ConversationHistory(128000, saved.messages);
          const current = { ...settings };
          const currentProvider = provider;
          const limits = currentProvider.contextLimits
            ? await currentProvider.contextLimits({ model: current.model, signal: controller.signal })
            : { contextTokens: 2048, outputTokens: 512 };
          controller.signal.throwIfAborted();
          const messages = history.context(message.prompt, limits, languageInstruction(current.language));
          let reply = '';
          let result;
          for await (const event of currentProvider.converse({ model: current.model, messages, limits, signal: controller.signal })) {
            controller.signal.throwIfAborted();
            if (result) throw new Error('Provider emitted events after completion');
            if (event.type === 'delta') {
              reply += event.text;
              if (reply.length > 64000) throw new Error('La respuesta supera el límite de esta sesión.');
              send({ type: 'token', id, text: event.text });
            } else if (event.type === 'result') result = event;
            else throw new Error('Invalid provider event');
          }
          controller.signal.throwIfAborted();
          if (result?.status !== 'completed') throw new Error(result?.error?.message || 'Provider stream ended before completion');
          if (result.text !== reply) throw new Error('Provider result does not match streamed reply');
          history.complete(message.prompt, reply);
          await store.saveTurn(conversationId, saved.messages, history.snapshot(), message.prompt);
          send({ type: 'done', id, conversationId });
          broadcast({ type: 'conversations', conversations: store.list() });
        } finally {
          clearTimeout(timeout);
          active = undefined;
          activeId = undefined;
          generations--;
          if (locks.get(conversationId) === controller) locks.delete(conversationId);
          send({ type: 'state', id, state: 'idle' });
        }
      } catch (error) {
        send({ type: 'error', id, message: readableError(error, requestSignal) });
      }
    }
    ws.on('message', raw => {
      const job = handle(raw);
      pending.add(job);
      job.finally(() => pending.delete(job));
    });
  });
  try { await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  }); } catch (error) { await store.close(); throw error; }
  return {
    port: server.address().port,
    async close() {
      closing = true;
      for (const session of sessions) session.abort();
      for (const client of wss.clients) client.terminate();
      await Promise.allSettled([...pending]);
      await store.close();
      await new Promise(resolve => wss.close(resolve));
      await new Promise(resolve => server.close(resolve));
    },
  };
}
