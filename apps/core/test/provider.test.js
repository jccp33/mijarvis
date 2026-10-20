import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createOllamaProvider } from '../src/ollama-provider.js';
import { conversation } from '../src/provider.js';

const request = { model: 'test', messages: [{ role: 'user', content: 'hola' }] };
const collect = async stream => { const events = []; for await (const event of stream) events.push(event); return events; };

test('contract retains partial text on failure and cancellation', async () => {
  const failed = await collect(conversation(request, async function* () { yield 'partial'; throw new Error('offline'); }));
  assert.deepEqual(failed.at(-1), { type: 'result', status: 'failed', text: 'partial', error: { message: 'offline' } });
  const controller = new AbortController();
  const cancelled = await collect(conversation({ ...request, signal: controller.signal }, async function* () {
    yield 'partial'; controller.abort(); yield 'late';
  }));
  assert.equal(cancelled.length, 2);
  assert.equal(cancelled.at(-1).status, 'cancelled');
  assert.equal(cancelled.at(-1).text, 'partial');
  const invalid = await collect(conversation({ ...request, messages: [{ role: 'invalid', content: '' }] }, () => { throw new Error('must not run'); }));
  assert.match(invalid[0].error.message, /Invalid conversation/);
});

test('Ollama context policy respects model capacity, explicit settings and generation budget', async t => {
  let metadata = { model_info: { 'general.architecture': 'llama', 'llama.context_length': 4096 }, parameters: 'num_ctx 3072' };
  let received;
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    if (req.url === '/api/show') {
      assert.equal(JSON.parse(body).model, 'test');
      res.end(JSON.stringify(metadata));
    } else {
      received = JSON.parse(body);
      res.end('{"message":{"content":"ok"},"done":true}');
    }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const provider = createOllamaProvider({ baseUrl, options: { num_ctx: 8192, num_gpu: 0 } });
  const limits = await provider.contextLimits({ model: 'test' });
  assert.deepEqual(limits, { contextTokens: 4096, outputTokens: 512 });
  await collect(provider.converse({ ...request, limits }));
  assert.deepEqual(received.options, { num_ctx: 4096, num_predict: 512, num_gpu: 0 });
  const automatic = createOllamaProvider({ baseUrl, options: {} });
  assert.equal((await automatic.contextLimits({ model: 'test' })).contextTokens, 3072);
  metadata = {};
  assert.deepEqual(await automatic.contextLimits({ model: 'test' }), { contextTokens: 2048, outputTokens: 512 });
  const small = createOllamaProvider({ baseUrl, options: { num_ctx: 1024 } });
  assert.deepEqual(await small.contextLimits({ model: 'test' }), { contextTokens: 1024, outputTokens: 256 });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(automatic.contextLimits({ model: 'test', signal: controller.signal }), { name: 'AbortError' });
});

test('Ollama provider discovers models, forwards roles and options, handles truncated streams', async t => {
  let mode = 'ok';
  const server = http.createServer(async (req, res) => {
    if (mode === 'offline') { res.writeHead(503); res.end(); return; }
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'test' }] })); return; }
    assert.equal(req.url, '/api/chat');
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    assert.deepEqual(input.messages, messages);
    assert.deepEqual(input.options, { num_gpu: 0 });
    res.end('{"message":{"content":"Sí"}}\n' + (mode === 'ok' ? '{"done":true}' : ''));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const provider = createOllamaProvider({ baseUrl: `http://127.0.0.1:${server.address().port}`, options: { num_gpu: 0 } });
  assert.deepEqual(await provider.availability(), { available: true });
  assert.deepEqual(await provider.listModels(), [{ id: 'test' }]);
  const messages = [{ role: 'system', content: 'Español' }, ...request.messages, { role: 'assistant', content: 'Hola' }];
  assert.deepEqual((await collect(provider.converse({ ...request, messages }))).at(-1), { type: 'result', status: 'completed', text: 'Sí' });
  mode = 'truncated';
  const result = (await collect(provider.converse({ ...request, messages }))).at(-1);
  assert.equal(result.status, 'failed'); assert.equal(result.text, 'Sí');
  mode = 'offline';
  assert.equal((await provider.availability()).available, false);
  await assert.rejects(provider.listModels(), /503/);
});
