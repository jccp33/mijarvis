import { parseArgs } from 'node:util';
import { mkdir, mkdtemp, rename, rm, writeFile, stat, unlink, open } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { resolve, dirname, basename, join } from 'node:path';
import { speechCatalog, speechDirectory, runtimeVersion } from '../apps/core/src/speech/catalog.js';
import { sha256, inventory, verifySpeechAssets } from '../apps/core/src/speech/assets.js';
import { runNative } from '../apps/core/src/speech/native.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  directory: { type: 'string' }, cache: { type: 'string' }, platform: { type: 'string' }, arch: { type: 'string' },
} });
const platform = values.platform || process.platform;
const arch = values.arch || process.arch;
const root = resolve(values.directory || speechDirectory(process.env, platform, arch));
const cache = resolve(values.cache || '.cache/speech-downloads');
const mode = positionals[0];
if (!['install', 'verify'].includes(mode) || positionals.length !== 1) throw new Error('Uso: speech-assets.js install|verify [--directory RUTA] [--cache RUTA] [--platform win32|linux]');
const catalog = speechCatalog(platform, arch);
const compression = process.platform === 'linux' ? ['--use-compress-program=bzip2'] : [];

async function archive(asset) {
  await mkdir(cache, { recursive: true });
  const file = join(cache, asset.name);
  let exists;
  try { await stat(file); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!exists) {
    const partial = `${file}.${process.pid}.part`;
    try {
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(180000) });
      if (!response.ok || !response.body) throw new Error(`No se pudo descargar ${asset.name}: HTTP ${response.status}`);
      let received = 0;
      const limit = new Transform({ transform(chunk, _encoding, callback) {
        received += chunk.length;
        callback(received > asset.bytes ? new Error('Descarga demasiado grande.') : null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(partial, { flags: 'wx', mode: 0o600 }));
      if (received !== asset.bytes || await sha256(partial) !== asset.sha256) throw new Error(`La descarga no supera la verificación SHA-256: ${asset.name}`);
      await rename(partial, file);
    } finally { await unlink(partial).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  if ((await stat(file)).size !== asset.bytes || await sha256(file) !== asset.sha256) throw new Error(`Archivo alterado en caché: ${asset.name}. Retíralo y vuelve a descargarlo.`);
  return file;
}

if (mode === 'verify') {
  const verified = await verifySpeechAssets({ root, platform, arch });
  console.log(`Audio verificado: sherpa-onnx ${verified.runtimeVersion}, ${platform}-${arch}, ${root}`);
} else {
  try {
    await runNative('tar', ['--version']);
    if (process.platform === 'linux') await runNative('bzip2', ['--help']);
  } catch { throw new Error('Para instalar audio se requiere tar; en Ubuntu instala también bzip2 (sudo apt install bzip2).'); }
  await mkdir(dirname(root), { recursive: true });
  let existing;
  try { await stat(root); existing = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) throw new Error('La carpeta de instalación ya existe. Usa verify o elige una carpeta nueva; no se sobrescriben recursos.');
  const lock = `${root}.install.lock`;
  const handle = await open(lock, 'wx', 0o600);
  let staging;
  try {
    staging = await mkdtemp(join(dirname(root), '.speech-install-'));
    for (const asset of catalog) {
      console.log(`Verificando e instalando ${asset.name}`);
      const file = await archive(asset);
      const listing = await runNative('tar', [...compression, '-tf', file], { maxOutputBytes: 4 * 1024 * 1024 });
      for (const name of listing.stdout.split(/\r?\n/).filter(Boolean)) {
        const parts = name.replaceAll('\\', '/').split('/');
        if (parts[0] !== asset.folder || parts.some(part => part === '..' || part.includes(':'))) throw new Error('El paquete contiene una ruta inesperada.');
      }
      await runNative('tar', [...compression, '-xf', file, '-C', staging]);
    }
    const files = await inventory(staging);
    await writeFile(join(staging, 'speech-install.json'), JSON.stringify({ version: 1, runtimeVersion, platform, arch,
      installedAt: new Date().toISOString(), archives: catalog, files }, null, 2), { mode: 0o600 });
    await verifySpeechAssets({ root: staging, platform, arch });
    await rename(staging, root);
    staging = undefined;
    console.log(`Audio instalado y verificado en ${root}`);
  } finally {
    await handle.close(); await unlink(lock);
    if (staging) {
      if (dirname(staging) !== dirname(root) || !basename(staging).startsWith('.speech-install-')) throw new Error('Directorio de instalación temporal inesperado.');
      await rm(staging, { recursive: true, force: true });
    }
  }
}
