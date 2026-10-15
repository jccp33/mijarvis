import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startCore } from '../src/server.js';
import { SystemController } from '@mijarvis/system';
import { generate, generationOptions } from '../src/ollama.js';

const token = 'test-session-token-at-least-24-characters';

test('Ollama options preserve defaults and allow explicit CPU configuration', () => {
  assert.deepEqual(generationOptions({}), {});
  assert.deepEqual(generationOptions({ OLLAMA_NUM_CTX: '2048', OLLAMA_NUM_GPU: '0' }), { num_ctx: 2048, num_gpu: 0 });
  for (const value of ['-1', '1.5', 'abc', 'Infinity']) {
    assert.throws(() => generationOptions({ OLLAMA_NUM_GPU: value }), /OLLAMA_NUM_GPU/);
  }
  assert.throws(() => generationOptions({ OLLAMA_NUM_CTX: '0' }), /OLLAMA_NUM_CTX/);
});

test('Ollama forwards CPU options and explains CUDA initialization errors', async t => {
  const baseUrl = await mockOllama(t, async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    assert.deepEqual(JSON.parse(body).options, { num_gpu: 0, num_ctx: 2048 });
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'llama-server process has terminated: ' + 'details '.repeat(60) + 'CUDA error: shared object initialization failed' }));
  });
  await assert.rejects(async () => {
    for await (const _part of generate({ baseUrl, model: 'test', prompt: 'hi', options: { num_gpu: 0, num_ctx: 2048 } })) { /* consume */ }
  }, /Ollama HTTP 500:.*CUDA.*OLLAMA_NUM_GPU=0/);
});

async function mockOllama(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

function events(ws) {
  const queue = [];
  const waiting = [];
  ws.on('message', raw => {
    const value = JSON.parse(raw);
    const resolve = waiting.shift();
    if (resolve) resolve(value); else queue.push(value);
  });
  return async type => {
    for (;;) {
      const value = queue.length ? queue.shift() : await new Promise(resolve => waiting.push(resolve));
      if (value.type === type) return value;
    }
  };
}

test('system stats and allowlisted commands', async () => {
  const system = new SystemController();
  const stats = system.getSystemStats();
  assert.ok(stats.cpuPercent >= 0 && stats.cpuPercent <= 100);
  assert.ok(stats.memory.total > 0);
  assert.ok((await system.runSystemCommand('hostname')).stdout);
  await assert.rejects(system.runSystemCommand('hostname; whoami'), /not allowed/);
  await assert.rejects(system.runSystemCommand('toString'), /not allowed/);
  assert.throws(() => new SystemController('unsupported'), /Unsupported/);
});

test('Ollama parses split UTF-8 NDJSON and final line without newline', { timeout: 5000 }, async t => {
  const baseUrl = await mockOllama(t, (_req, res) => {
    const bytes = Buffer.from('{"response":"Sí"}\n{"response":" listo","done":true}');
    res.write(bytes.subarray(0, 16));
    setTimeout(() => res.end(bytes.subarray(16)), 10);
  });
  let text = '';
  for await (const part of generate({ baseUrl, model: 'test', prompt: 'hola' })) text += part;
  assert.equal(text, 'Sí listo');
});

test('Ollama rejects incomplete streams and HTTP errors', async t => {
  let fail = false;
  const baseUrl = await mockOllama(t, (_req, res) => {
    if (fail) { res.writeHead(404); res.end('missing model'); }
    else res.end('{"response":"partial"}\n');
  });
  const consume = async () => { for await (const _part of generate({ baseUrl, model: 'test', prompt: 'hi' })) { /* consume */ } };
  await assert.rejects(consume(), /before completion/);
  fail = true;
  await assert.rejects(consume(), /HTTP 404/);
});

test('Core streams replies, reports invalid messages and serves health', { timeout: 10000 }, async t => {
  const ollamaUrl = await mockOllama(t, async (req, res) => {
    assert.equal(req.url, '/api/generate');
    let body = '';
    for await (const chunk of req) body += chunk;
    assert.equal(JSON.parse(body).prompt, 'hola');
    res.end('{"response":"Hola"}\n{"response":" mundo","done":true}\n');
  });
  const core = await startCore({ port: 0, token, ollamaUrl });
  t.after(() => core.close());
  const response = await fetch(`http://127.0.0.1:${core.port}/health`);
  assert.deepEqual(await response.json(), { status: 'ok' });
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws?token=${token}`, { origin: 'file://' });
  const next = events(ws);
  await next('ready');
  ws.send(JSON.stringify({ id: 'a', type: 'prompt', prompt: 'hola' }));
  assert.equal((await next('token')).text, 'Hola');
  assert.equal((await next('token')).text, ' mundo');
  assert.equal((await next('done')).id, 'a');
  ws.send('not json');
  assert.equal((await next('error')).type, 'error');
  ws.send(JSON.stringify({ id: 'b', type: 'system.command', command: 'invalid' }));
  assert.match((await next('error')).message, /not allowed/);
});

test('Core rejects invalid token and browser origins', { timeout: 5000 }, async t => {
  const core = await startCore({ port: 0, token });
  t.after(() => core.close());
  for (const [credential, origin] of [['wrong', 'null'], [token, 'https://example.com']]) {
    const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws?token=${credential}`, { origin });
    await new Promise((resolve, reject) => {
      ws.once('open', () => reject(new Error('Unauthorized connection accepted')));
      ws.once('error', error => { assert.match(error.message, /401/); resolve(); });
    });
  }
});

test('Core cancels generation and accepts another request', { timeout: 10000 }, async t => {
  const ollamaUrl = await mockOllama(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.write('{"response":"start"}\n');
  });
  const core = await startCore({ port: 0, token, ollamaUrl });
  t.after(() => core.close());
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws?token=${token}`);
  const next = events(ws);
  await next('ready');
  ws.send(JSON.stringify({ type: 'prompt', id: 'first', prompt: 'hi' }));
  await next('token');
  ws.send(JSON.stringify({ type: 'cancel', id: 'first' }));
  assert.equal((await next('error')).id, 'first');
  ws.send(JSON.stringify({ type: 'prompt', id: 'second', prompt: 'hi again' }));
  assert.equal((await next('token')).id, 'second');
  ws.send(JSON.stringify({ type: 'cancel', id: 'second' }));
  await next('error');
});
