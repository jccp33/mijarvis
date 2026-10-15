import { spawn } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';

const unused = http.createServer();
unused.listen(0, '127.0.0.1');
await once(unused, 'listening');
const port = unused.address().port;
await new Promise(resolve => unused.close(resolve));
for (const [name, settings] of [
  ['offline', { OLLAMA_URL: `http://127.0.0.1:${port}`, MIJARVIS_EXPECT_ERROR: 'fetch failed|ECONNREFUSED' }],
  ['missing', { OLLAMA_MODEL: 'mijarvis-model-that-does-not-exist:phase1', MIJARVIS_EXPECT_ERROR: '404' }],
  ['incompatible', { OLLAMA_MODEL: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text:latest', MIJARVIS_EXPECT_ERROR: '400|does not support' }],
]) {
  const child = spawn(process.execPath, ['scripts/smoke-desktop.js', '--validate-error', ...process.argv.slice(2)], {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, ...settings, MIJARVIS_ARTIFACT_DIR: join(process.env.MIJARVIS_ARTIFACT_DIR || 'artifacts', `error-${name}`) },
  });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`Desktop error validation failed: ${name} (${code})`);
  console.log(`PASS desktop error case: ${name}`);
}
