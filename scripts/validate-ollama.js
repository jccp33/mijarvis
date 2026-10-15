import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { startCore } from '../apps/core/src/server.js';

const { WebSocket } = createRequire(new URL('../apps/core/package.json', import.meta.url))('ws');

const baseUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const results = [];

async function connect(options) {
  const token = randomBytes(32).toString('hex');
  const core = await startCore({ port: 0, token, ...options });
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws?token=${token}`, { origin: 'file://' });
  const listeners = new Set();
  const history = [];
  ws.on('message', raw => {
    const event = JSON.parse(raw);
    history.push(event);
    for (const listener of listeners) listener(event);
  });
  function wait(predicate, timeout = 125000) {
    const previous = history.find(predicate);
    if (previous) return Promise.resolve(previous);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { listeners.delete(listener); reject(new Error('Event timeout')); }, timeout);
      function listener(event) {
        if (!predicate(event)) return;
        clearTimeout(timer);
        listeners.delete(listener);
        resolve(event);
      }
      listeners.add(listener);
    });
  }
  await wait(event => event.type === 'ready', 10000);
  return {
    wait, history,
    send: event => ws.send(JSON.stringify(event)),
    close: () => core.close(),
  };
}

async function check(name, run) {
  const started = Date.now();
  try {
    const evidence = await run();
    results.push({ name, passed: true, elapsedMs: Date.now() - started, evidence });
    console.log(`PASS ${name}: ${JSON.stringify(evidence)}`);
  } catch (error) {
    results.push({ name, passed: false, elapsedMs: Date.now() - started, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

await check('real generation and streaming through Core', async () => {
  const client = await connect({ ollamaUrl: baseUrl, model });
  try {
    client.send({ type: 'prompt', id: 'generation', prompt: 'Responde en español con una frase breve: ¿qué es un asistente de escritorio?' });
    const end = await client.wait(event => event.id === 'generation' && ['done', 'error'].includes(event.type));
    assert.equal(end.type, 'done', end.message);
    const tokens = client.history.filter(event => event.type === 'token' && event.id === 'generation');
    assert.ok(tokens.length > 1, 'Expected multiple streaming tokens');
    const text = tokens.map(event => event.text).join('');
    assert.ok(text.trim());
    return { model, tokenEvents: tokens.length, text };
  } finally { await client.close(); }
});

await check('real cancellation and subsequent recovery', async () => {
  const client = await connect({ ollamaUrl: baseUrl, model });
  try {
    client.send({ type: 'prompt', id: 'cancel', prompt: 'Escribe una lista detallada de 100 consejos para organizar archivos.' });
    await client.wait(event => event.id === 'cancel' && ['token', 'error'].includes(event.type));
    client.send({ type: 'cancel', id: 'cancel' });
    const cancelled = await client.wait(event => event.id === 'cancel' && ['done', 'error'].includes(event.type));
    assert.equal(cancelled.type, 'error', 'Generation completed before cancellation');
    await client.wait(event => event.id === 'cancel' && event.type === 'state' && event.state === 'idle');
    client.send({ type: 'prompt', id: 'recovery', prompt: 'Responde únicamente: listo' });
    const recovered = await client.wait(event => event.id === 'recovery' && ['done', 'error'].includes(event.type));
    assert.equal(recovered.type, 'done', recovered.message);
    return { cancelled: cancelled.message, recovery: recovered.type };
  } finally { await client.close(); }
});

async function errorCase(options, expected) {
  const client = await connect(options);
  try {
    client.send({ type: 'prompt', id: 'failure', prompt: 'Hola' });
    const event = await client.wait(item => item.id === 'failure' && ['done', 'error'].includes(item.type));
    assert.equal(event.type, 'error');
    assert.match(event.message, expected);
    assert.ok(client.history.some(item => item.type === 'state' && item.state === 'idle'));
    return { message: event.message };
  } finally { await client.close(); }
}

await check('unavailable service without stopping user Ollama', async () => {
  const unused = http.createServer();
  unused.listen(0, '127.0.0.1');
  await once(unused, 'listening');
  const port = unused.address().port;
  await new Promise(resolve => unused.close(resolve));
  return errorCase({ ollamaUrl: `http://127.0.0.1:${port}`, model }, /fetch failed|ECONNREFUSED/i);
});
await check('missing model against real Ollama', () => errorCase({
  ollamaUrl: baseUrl, model: 'mijarvis-model-that-does-not-exist:phase1',
}, /404|not found/i));
await check('incompatible embedding model against real Ollama', () => errorCase({
  ollamaUrl: baseUrl, model: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text:latest',
}, /does not support|not supported|400/i));

const artifactDirectory = process.env.MIJARVIS_ARTIFACT_DIR || 'artifacts';
await mkdir(artifactDirectory, { recursive: true });
await writeFile(`${artifactDirectory}/phase1-ollama.json`, JSON.stringify({
  executedAt: new Date().toISOString(), platform: process.platform, node: process.version, model, results,
}, null, 2) + '\n');
