import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationHistory } from '../src/history.js';

test('History snapshots cannot change saved turns and rejected turns leave context intact', () => {
  const history = new ConversationHistory(12);
  history.complete('hola', 'sí');
  const snapshot = history.context('otra');
  snapshot[0].content = 'modificado';
  snapshot.push({ role: 'assistant', content: 'extra' });
  assert.throws(() => history.complete('otra', 'demasiado'), /límite/);
  assert.throws(() => history.context('demasiado largo'), /límite/);
  assert.deepEqual(history.context('otra'), [
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: 'sí' },
    { role: 'user', content: 'otra' },
  ]);
});

test('Context drops oldest complete pairs and preserves recent turns without changing history', () => {
  const history = new ConversationHistory();
  history.complete('a'.repeat(20), 'b'.repeat(20));
  history.complete('c'.repeat(20), 'd'.repeat(20));
  const limits = { contextTokens: 300, outputTokens: 64 };
  const selected = history.context('next', limits);
  assert.deepEqual(selected.map(message => message.content), ['c'.repeat(20), 'd'.repeat(20), 'next']);
  assert.equal(history.context('next').length, 5);
  assert.throws(() => history.context('á'.repeat(60), limits), /límite/);
  assert.equal(history.context('next').length, 5);
  assert.throws(() => history.context('hi', { contextTokens: 128, outputTokens: 64 }), /Invalid context/);
});

test('History evicts complete oldest pairs on success to keep memory bounded', () => {
  const history = new ConversationHistory(12);
  history.complete('aaaa', 'bbbb');
  history.complete('cc', 'dd');
  history.complete('ee', 'ff');
  assert.deepEqual(history.context('hi').map(message => message.content), ['cc', 'dd', 'ee', 'ff', 'hi']);
});
