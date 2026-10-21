import { createReadStream } from 'node:fs';
import { readFile, readdir, readlink, realpath, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { runtimeVersion, speechPaths, speechDirectory, speechCatalog } from './catalog.js';

export async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function inside(root, path) {
  const delta = relative(resolve(root), resolve(path));
  return delta !== '' && delta !== '..' && !delta.startsWith(`..${sep}`) && !isAbsolute(delta);
}

export async function inventory(root) {
  const files = [];
  async function walk(directory) {
    for (const name of (await readdir(directory)).sort()) {
      if (directory === root && name === 'speech-install.json') continue;
      const path = resolve(directory, name);
      const metadata = await lstat(path);
      const key = relative(root, path).split(sep).join('/');
      if (metadata.isSymbolicLink()) {
        if (!inside(root, await realpath(path))) throw new Error('El paquete de audio contiene un enlace externo.');
        files.push({ path: key, link: await readlink(path) });
      } else if (metadata.isDirectory()) await walk(path);
      else if (metadata.isFile()) files.push({ path: key, sha256: await sha256(path) });
      else throw new Error('Tipo de archivo de audio no admitido.');
    }
  }
  await walk(root);
  return files;
}

export async function verifySpeechAssets({ root = speechDirectory(), platform = process.platform, arch = process.arch } = {}) {
  root = resolve(root);
  speechCatalog(platform, arch);
  let manifest;
  try {
    const file = resolve(root, 'speech-install.json');
    if ((await lstat(file)).size > 2 * 1024 * 1024) throw new Error('Manifest too large');
    manifest = JSON.parse(await readFile(file, 'utf8'));
  } catch { throw new Error('Audio local no instalado o manifiesto dañado. Ejecuta npm run speech:install.'); }
  if (manifest.version !== 1 || manifest.runtimeVersion !== runtimeVersion || manifest.platform !== platform || manifest.arch !== arch ||
      !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('La instalación de audio no corresponde a esta plataforma o versión.');
  const seen = new Set();
  for (const item of manifest.files) {
    if (!item || typeof item.path !== 'string' || !inside(root, resolve(root, item.path)) || seen.has(item.path) ||
        (!/^[a-f0-9]{64}$/.test(item.sha256 || '') && typeof item.link !== 'string')) throw new Error('Inventario de audio no válido.');
    seen.add(item.path);
  }
  const actual = await inventory(root);
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new Error('Los archivos de audio cambiaron o están dañados. Reinstala en una carpeta nueva.');
  const paths = speechPaths(root, platform);
  for (const [key, path] of Object.entries(paths)) {
    if (key === 'voiceData') {
      if (!seen.has(relative(root, resolve(path, 'phontab')).split(sep).join('/'))) throw new Error('Faltan los datos de pronunciación.');
    } else if (!seen.has(relative(root, path).split(sep).join('/'))) throw new Error(`Falta un archivo de audio: ${key}.`);
  }
  return { root, paths, runtimeVersion, platform, arch };
}
