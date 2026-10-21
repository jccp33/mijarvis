import { spawn } from 'node:child_process';

// Arguments are always separate strings; this helper never invokes a shell.
export function runNative(executable, args, { cwd, signal, timeoutMs = 120000, maxOutputBytes = 256 * 1024 } = {}) {
  signal?.throwIfAborted();
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 || !Number.isInteger(maxOutputBytes) || maxOutputBytes < 1) throw new Error('Límites del proceso de audio no válidos.');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = []; const stderr = [];
    let bytes = 0; let failure; let force;
    function stop(error) {
      if (failure) return;
      failure = error;
      child.kill();
      force = setTimeout(() => child.kill('SIGKILL'), 500);
    }
    const abort = () => stop(signal.reason || new DOMException('Audio cancelado', 'AbortError'));
    const timer = setTimeout(() => stop(new Error('El motor de audio superó el tiempo límite.')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    function collect(target, chunk) {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) { stop(new Error('El motor de audio excedió el límite de salida.')); return; }
      if (!failure) target.push(chunk);
    }
    child.stdout.on('data', chunk => collect(stdout, chunk));
    child.stderr.on('data', chunk => collect(stderr, chunk));
    child.once('error', error => { failure ||= new Error(`No se pudo iniciar el motor de audio (${error.code || 'error'}).`); });
    child.once('close', code => {
      clearTimeout(timer); clearTimeout(force); signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`El motor de audio falló (código ${code}). Comprueba binarios y modelos.`));
      else resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
    });
  });
}
