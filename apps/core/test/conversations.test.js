import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { startCore } from '../src/server.js';

const token = 'conversation-integration-token-2026';
async function connect(core) {
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws?token=${token}`);
  const queue = []; const listeners = new Set();
  ws.on('message', raw => {
    const event = JSON.parse(raw);
    const match = [...listeners].find(listener => listener.predicate(event));
    if (match) { listeners.delete(match); clearTimeout(match.timer); match.resolve(event); }
    else queue.push(event);
  });
  function wait(predicate) {
    const index = queue.findIndex(predicate);
    if (index !== -1) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const listener = { predicate, resolve, timer: setTimeout(() => { listeners.delete(listener); reject(new Error('Protocol event timed out')); }, 4000) };
      listeners.add(listener);
    });
  }
  const ready = await wait(event => event.type === 'ready');
  let sequence = 0;
  return { ws, ready, wait,
    send(type, fields = {}) { const id = `request-${++sequence}`; ws.send(JSON.stringify({ type, id, ...fields })); return id; },
    async command(type, fields = {}) {
      const id = this.send(type, fields);
      return wait(event => event.id === id && !['state', 'token'].includes(event.type));
    },
  };
}

test('Core restores selected history after restart and permanently deletes it', { timeout: 15000 }, async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mijarvis-conversations-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const calls = [];
  const provider = { async *converse({ messages }) {
    calls.push(messages);
    yield { type: 'delta', text: 'saved-reply' };
    yield { type: 'result', status: 'completed', text: 'saved-reply' };
  } };
  let core = await startCore({ port: 0, token, provider, dataDir, env: {} });
  t.after(() => core.close());
  let client = await connect(core);
  const created = await client.command('conversation.create');
  const id = created.conversation.id;
  assert.equal((await client.command('prompt', { prompt: 'first-secret' })).type, 'done');
  await client.command('conversation.create');
  await client.command('prompt', { prompt: 'isolated-secret' });
  assert.deepEqual(calls.at(-1).filter(message => message.role === 'user').map(message => message.content), ['isolated-secret']);
  await core.close();
  core = await startCore({ port: 0, token, provider, dataDir, env: {} });
  client = await connect(core);
  assert.equal(client.ready.conversations.length, 2);
  const restored = await client.command('conversation.select', { conversationId: id });
  assert.equal(restored.conversation.messages[0].content, 'first-secret');
  await client.command('prompt', { prompt: 'continue' });
  assert.deepEqual(calls.at(-1).filter(message => message.role === 'user').map(message => message.content), ['first-secret', 'continue']);
  await client.command('conversation.delete', { conversationId: id });
  assert.equal((await client.command('conversation.select', { conversationId: id })).type, 'error');
  assert.equal((await readFile(join(dataDir, 'state.json'), 'utf8')).includes('first-secret'), false);
});

test('Concurrent clients cannot generate or delete the same active conversation', { timeout: 10000 }, async t => {
  const provider = { async *converse({ signal }) {
    yield { type: 'delta', text: 'partial' };
    await new Promise(resolve => { if (signal.aborted) resolve(); else signal.addEventListener('abort', resolve, { once: true }); });
    signal.throwIfAborted();
  } };
  const core = await startCore({ port: 0, token, provider, env: {} });
  t.after(() => core.close());
  const first = await connect(core); const second = await connect(core);
  const id = (await first.command('conversation.create')).conversation.id;
  await second.command('conversation.select', { conversationId: id });
  const request = first.send('prompt', { prompt: 'blocked' });
  await first.wait(event => event.type === 'token');
  assert.equal((await second.command('prompt', { prompt: 'other' })).type, 'error');
  assert.equal((await second.command('conversation.delete', { conversationId: id })).type, 'error');
  first.ws.send(JSON.stringify({ type: 'cancel', id: request }));
  assert.match((await first.wait(event => event.type === 'error' && event.id === request)).message, /cancelada/);
  await second.command('conversation.delete', { conversationId: id });
  const snapshot = await first.wait(event => event.type === 'conversation' && !event.conversation);
  assert.deepEqual(snapshot.conversations, []);
  assert.equal((await first.command('conversation.select', { conversationId: id })).type, 'error');
});

test('Settings update changes endpoint/model/language, diagnostics and persisted startup configuration', { timeout: 10000 }, async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mijarvis-settings-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const requests = [];
  const mock = http.createServer(async (req, res) => {
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'configured:latest' }] })); return; }
    if (req.url === '/api/show') { res.end('{}'); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body)); res.end('{"message":{"content":"hello"},"done":true}');
  });
  mock.listen(0, '127.0.0.1'); await once(mock, 'listening');
  t.after(() => new Promise(resolve => { mock.closeAllConnections(); mock.close(resolve); }));
  let core = await startCore({ port: 0, token, dataDir, env: {} });
  t.after(() => core.close());
  const client = await connect(core);
  const settings = { endpoint: `http://127.0.0.1:${mock.address().port}`, model: 'configured', language: 'en' };
  assert.equal((await client.command('settings.update', { settings })).type, 'settings');
  const diagnostics = await client.command('diagnostics');
  assert.equal(diagnostics.available, true); assert.equal(diagnostics.selectedModelAvailable, true);
  assert.equal(diagnostics.persistent, true);
  assert.equal((await client.command('prompt', { prompt: 'hello' })).type, 'done');
  assert.equal(requests[0].model, 'configured');
  assert.match(requests[0].messages[0].content, /English/);
  assert.equal((await client.command('settings.update', { settings: { ...settings, endpoint: 'file:///tmp' } })).type, 'error');
  await core.close();
  core = await startCore({ port: 0, token, dataDir, env: {} });
  assert.deepEqual((await connect(core)).ready.settings, settings);
  await core.close();
  core = await startCore({ port: 0, token, dataDir, env: { OLLAMA_MODEL: 'environment' } });
  assert.equal((await connect(core)).ready.settings.model, 'environment');
});
