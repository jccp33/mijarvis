import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalStore } from '../src/store.js';
import { execFileSync } from 'node:child_process';

async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), 'mijarvis-store-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test('Store persists complete turns and settings, serializes writes and deletes without resurrection', async t => {
  const dir = await directory(t);
  const store = await new LocalStore(dir).load();
  const [first, second] = await Promise.all([store.create(), store.create()]);
  const messages = [{ role: 'user', content: 'clave única' }, { role: 'assistant', content: 'guardada' }];
  await store.saveTurn(first.id, [], messages, 'clave única');
  await store.saveSettings({ model: 'test', endpoint: 'http://localhost:11434', language: 'en' });
  await assert.rejects(new LocalStore(dir).load(), /Otro Core/);
  await store.close();
  const reopened = await new LocalStore(dir).load();
  assert.deepEqual(reopened.get(first.id).messages, messages);
  assert.equal(reopened.settings().language, 'en');
  await assert.rejects(reopened.saveTurn(first.id, [], messages, 'stale'), /cambió/);
  await reopened.delete(first.id);
  assert.throws(() => reopened.get(first.id), /no existe/);
  await assert.rejects(reopened.saveTurn(first.id, messages, messages, 'stale'), /borrada/);
  assert.equal((await readFile(join(dir, 'state.json'), 'utf8')).includes('clave única'), false);
  assert.equal(reopened.list()[0].id, second.id);
  await reopened.close();
  const final = await new LocalStore(dir).load();
  assert.equal(final.list().length, 1);
  assert.throws(() => final.get(first.id), /no existe/);
  await final.close();
});

test('Corrupt state is quarantined and unsupported versions are preserved untouched', async t => {
  const dir = await directory(t);
  const path = join(dir, 'state.json');
  await writeFile(path, '{broken');
  const store = await new LocalStore(dir).load();
  assert.match(store.warning, /dañado/);
  assert.deepEqual(store.list(), []);
  const backup = (await readdir(dir)).find(name => name.includes('.corrupt-'));
  assert.equal(await readFile(join(dir, backup), 'utf8'), '{broken');
  await store.create();
  await store.close();
  const newer = JSON.stringify({ version: 2 });
  await writeFile(path, newer);
  await assert.rejects(new LocalStore(dir).load(), /otra versión/);
  assert.equal(await readFile(path, 'utf8'), newer);
  assert.equal((await readdir(dir)).includes('state.lock'), false);
});

test('Write failure leaves memory unchanged and does not prevent later operations', async t => {
  const dir = await directory(t);
  const store = await new LocalStore(dir).load();
  await mkdir(join(dir, 'state.json'));
  await assert.rejects(store.create());
  assert.deepEqual(store.list(), []);
  await rm(join(dir, 'state.json'), { recursive: true });
  await store.create();
  assert.equal(store.list().length, 1);
  assert.equal((await readdir(dir)).some(name => name.endsWith('.tmp')), false);
  await store.close();
});

test('Malformed roles and oversized histories are recovered as corrupt data', async t => {
  const dir = await directory(t);
  const store = await new LocalStore(dir).load();
  await store.create(); await store.close();
  const path = join(dir, 'state.json');
  const data = JSON.parse(await readFile(path, 'utf8'));
  data.conversations[0].messages = [{ role: 'assistant', content: 'bad' }, { role: 'user', content: 'bad' }];
  await writeFile(path, JSON.stringify(data));
  const recovered = await new LocalStore(dir).load();
  assert.match(recovered.warning, /dañado/);
  assert.deepEqual(recovered.list(), []);
  await recovered.close();
});

test('Store recovers a lock left by an exited process', async t => {
  const dir = await directory(t);
  const pid = Number(execFileSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }).trim());
  await writeFile(join(dir, 'state.lock'), JSON.stringify({ pid }));
  const store = await new LocalStore(dir).load();
  await store.create();
  assert.equal(store.list().length, 1);
  await store.close();
  assert.equal((await readdir(dir)).some(name => name.startsWith('state.lock')), false);
});

test('Store discards uncommitted temporary files without replaying deleted history', async t => {
  const dir = await directory(t);
  const temporary = 'state.json.00000000-0000-0000-0000-000000000000.tmp';
  await writeFile(join(dir, temporary), 'uncommitted-private-history');
  await writeFile(join(dir, 'unrelated.tmp'), 'keep');
  const store = await new LocalStore(dir).load();
  assert.deepEqual(store.list(), []);
  assert.equal((await readdir(dir)).includes(temporary), false);
  assert.equal(await readFile(join(dir, 'unrelated.tmp'), 'utf8'), 'keep');
  await store.close();
});
