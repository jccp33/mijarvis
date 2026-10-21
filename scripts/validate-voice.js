import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createSherpaSpeech } from '../apps/core/src/speech/sherpa.js';
import { speechDirectory } from '../apps/core/src/speech/catalog.js';
import { toMono16k } from '../apps/core/src/speech/resample.js';

const root = resolve(process.env.MIJARVIS_ARTIFACT_DIR || 'artifacts/voice-hud'); await mkdir(root, { recursive: true });
const directory = await mkdtemp(join(root, 'run-'));
const fixture = join(directory, 'microphone.wav');
const engine = await createSherpaSpeech({ root: speechDirectory() });
try { await writeFile(fixture, toMono16k((await engine.synthesize({ text: 'Hola Jarvis, recuerda que mi color favorito es el azul.' })).wav)); }
finally { await engine.close(); }
const server = http.createServer(async (req, res) => {
  if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'test' }] })); return; }
  if (req.url === '/api/show') { res.end('{}'); return; }
  for await (const _chunk of req) { /* drain fixture request */ }
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.write('{"message":{"content":"Tu color favorito "}}\n');
  setTimeout(() => res.end('{"message":{"content":"es azul."},"done":true}\n'), 100);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
try {
  const actual = process.argv.includes('--real-ollama');
  const env = { ...process.env, MIJARVIS_TEST_DATA_DIR: join(directory, 'history'), MIJARVIS_ENV_FILE: join(directory, 'isolated.env'),
    MIJARVIS_ARTIFACT_DIR: directory, MIJARVIS_SPEECH_DIR: speechDirectory(),
    OLLAMA_URL: actual ? process.env.OLLAMA_URL || 'http://127.0.0.1:11434' : `http://127.0.0.1:${server.address().port}`,
    OLLAMA_MODEL: actual ? process.env.OLLAMA_MODEL || 'llama3.2:latest' : 'test', OLLAMA_NUM_CTX: '2048', OLLAMA_NUM_GPU: '0',
  };
  const args = ['scripts/smoke-desktop.js', '--validate-voice', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fixture}`, '--mute-audio',
    ...process.argv.slice(2).filter(arg => arg !== '--real-ollama')];
  const child = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`Voice HUD validation failed (${code})`);
  console.log(`Voice HUD passed (${actual ? 'real Ollama' : 'simulated LLM'}, synthetic microphone, muted playback). Evidence: ${directory}`);
} finally { await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); }
