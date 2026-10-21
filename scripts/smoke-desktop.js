import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const executable = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (process.argv.includes('--validate-ollama')) env.OLLAMA_MODEL ||= 'llama3.1:8b';
const child = spawn(executable, ['apps/desktop', '--smoke-test', ...process.argv.slice(2)], {
  env, windowsHide: true, stdio: 'inherit',
});
let timedOut = false;
const timeout = setTimeout(() => {
  timedOut = true;
  console.error('Desktop smoke test timed out');
  child.kill();
  process.exitCode = 1;
}, process.argv.includes('--validate-voice') ? 180000 : process.argv.includes('--validate-ollama') ? 150000 : 30000);
child.on('error', error => { clearTimeout(timeout); console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { clearTimeout(timeout); process.exitCode = timedOut ? 1 : (code ?? 1); });
