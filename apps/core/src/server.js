import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { SystemController } from '@mijarvis/system';
import { generate } from './ollama.js';

export async function startCore({
  port = 4317, token, model = process.env.OLLAMA_MODEL || 'llama3.2',
  ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  system = new SystemController(),
} = {}) {
  if (typeof token !== 'string' || token.length < 24) throw new Error('CORE_TOKEN must contain at least 24 characters');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid Core port');
  const server = http.createServer((req, res) => {
    res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.url === '/health' ? { status: 'ok' } : { error: 'Not found' }));
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });
  server.on('upgrade', (req, socket, head) => {
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
    const send = event => {
      if (ws.readyState === WebSocket.OPEN) {
        if (ws.bufferedAmount > 1024 * 1024) { ws.terminate(); return; }
        ws.send(JSON.stringify(event));
      }
    };
    send({ type: 'ready', model });
    const stats = setInterval(() => send({ type: 'stats', data: system.getSystemStats() }), 1000);
    ws.on('close', () => { clearInterval(stats); active?.abort(); });
    ws.on('error', () => { active?.abort(); });
    ws.on('message', async raw => {
      let id;
      try {
        const message = JSON.parse(raw.toString());
        if (!message || typeof message !== 'object') throw new Error('Invalid event');
        id = message.id;
        if (typeof id !== 'string' || id.length < 1 || id.length > 100) throw new Error('Invalid request id');
        if (message.type === 'cancel') { active?.abort(); return; }
        if (message.type === 'system.command') {
          const data = await system.runSystemCommand(message.command);
          send({ type: 'system.result', id, data });
          return;
        }
        if (message.type !== 'prompt') throw new Error('Unknown event type');
        if (active) throw new Error('A generation is already active');
        if (typeof message.prompt !== 'string' || !message.prompt.trim() || message.prompt.length > 16000) {
          throw new Error('Prompt must contain between 1 and 16000 characters');
        }
        const controller = new AbortController();
        active = controller;
        const timeout = setTimeout(() => controller.abort(new Error('Generation timed out')), 120000);
        send({ type: 'state', id, state: 'thinking' });
        try {
          for await (const text of generate({ baseUrl: ollamaUrl, model, prompt: message.prompt, signal: controller.signal })) {
            send({ type: 'token', id, text });
          }
          send({ type: 'done', id });
        } finally {
          clearTimeout(timeout);
          active = undefined;
          send({ type: 'state', id, state: 'idle' });
        }
      } catch (error) {
        send({ type: 'error', id, message: error.message });
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    async close() {
      for (const client of wss.clients) client.terminate();
      await new Promise(resolve => wss.close(resolve));
      await new Promise(resolve => server.close(resolve));
    },
  };
}
