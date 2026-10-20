import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

let failedOnce = false;
function mock(name) {
  return http.createServer(async (req, res) => {
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'test' }, { name: 'test-alternate' }] })); return; }
    if (req.url === '/api/show') { res.end(JSON.stringify({ model_info: { 'general.architecture': 'test', 'test.context_length': 8192 } })); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    const prompt = input.messages.at(-1).content;
    res.setHeader('Content-Type', 'application/x-ndjson');
    if (prompt === 'cancel-me') { res.write('{"message":{"content":"partial"}}\n'); return; }
    if (prompt === 'fail-once' && !failedOnce) { failedOnce = true; res.end('{"message":{"content":"incomplete"}}\n'); return; }
    const users = input.messages.filter(item => item.role === 'user').map(item => item.content);
    if (users.filter(text => text === 'fail-once').length > 1) { res.writeHead(500); res.end('{"error":"Failed turn leaked"}'); return; }
    const language = input.messages[0].content.includes('English') ? 'English' : 'Español';
    const text = `${name}|${input.model}|${language}|${users.join(',')}|${prompt === 'fail-once' ? 'retry-ok' : '<b>safe text</b>'}`;
    res.end(JSON.stringify({ message: { content: text }, done: true }));
  });
}
const first = mock('first-endpoint');
const second = mock('second-endpoint');
const artifactRoot = resolve(process.env.MIJARVIS_ARTIFACT_DIR || 'artifacts');
await mkdir(artifactRoot, { recursive: true });
const directory = await mkdtemp(join(artifactRoot, 'phase2-'));
try {
  for (const server of [first, second]) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); }
  const endpoint = `http://127.0.0.1:${second.address().port}`;
  for (const stage of ['initial', 'restore']) {
    const env = { ...process.env, MIJARVIS_TEST_DATA_DIR: directory, MIJARVIS_ENV_FILE: join(directory, 'isolated.env'),
      MIJARVIS_PHASE2_STAGE: stage, MIJARVIS_TEST_ENDPOINT: endpoint, MIJARVIS_ARTIFACT_DIR: join(directory, stage) };
    delete env.OLLAMA_MODEL; delete env.OLLAMA_URL; delete env.MIJARVIS_LANGUAGE;
    if (stage === 'initial') { env.OLLAMA_MODEL = 'test'; env.OLLAMA_URL = `http://127.0.0.1:${first.address().port}`; }
    const child = spawn(process.execPath, ['scripts/smoke-desktop.js', '--validate-phase2', ...process.argv.slice(2)], { env, windowsHide: true, stdio: 'inherit' });
    const [code] = await once(child, 'exit');
    if (code !== 0) throw new Error(`Desktop phase 2 ${stage} failed (${code})`);
  }
  const state = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
  if (state.conversations.length !== 1 || JSON.stringify(state).includes('secret-two') || JSON.stringify(state).includes('cancel-me')) {
    throw new Error('Unexpected saved history after desktop validation');
  }
  console.log(`Phase 2 desktop validation passed. Evidence: ${directory}`);
} finally {
  for (const server of [first, second]) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
}
