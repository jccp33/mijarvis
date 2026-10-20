import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, resolveSettings, validateSettings, dataDirectory } from '../src/settings.js';

test('Both entrypoints share defaults < saved < environment < explicit settings', () => {
  assert.deepEqual(resolveSettings({}, {}), defaults);
  const saved = { model: 'saved', endpoint: 'http://localhost:11434', language: 'en' };
  assert.deepEqual(resolveSettings(saved, {}), saved);
  const env = { OLLAMA_MODEL: 'environment', OLLAMA_URL: 'http://localhost:1234', MIJARVIS_LANGUAGE: 'es' };
  assert.deepEqual(resolveSettings(saved, env, { model: 'explicit' }), { model: 'explicit', endpoint: 'http://localhost:1234', language: 'es' });
  assert.equal(dataDirectory({ MIJARVIS_DATA_DIR: process.cwd() }), process.cwd());
  assert.match(dataDirectory({ LOCALAPPDATA: 'C:/Local' }, 'win32', 'C:/User'), /MiJarvis$/);
  assert.match(dataDirectory({ XDG_DATA_HOME: '/data' }, 'linux', '/home/user'), /mijarvis$/);
});

test('Settings reject unsafe URL forms, unknown fields and unsupported language', () => {
  for (const endpoint of ['file:///tmp', 'javascript:alert(1)', 'http://user:secret@localhost', 'http://localhost/path', 'http://localhost?secret=1', 'http://localhost/#x', null]) {
    assert.throws(() => validateSettings({ endpoint }));
  }
  for (const model of ['', '  ', 'bad\nmodel', 'a'.repeat(257)]) assert.throws(() => validateSettings({ model }));
  assert.throws(() => validateSettings({ language: 'unknown' }));
  assert.throws(() => validateSettings({ token: 'not-allowed' }));
  assert.equal(validateSettings({ endpoint: 'http://localhost:11434/', model: ' test ' }).model, 'test');
});
