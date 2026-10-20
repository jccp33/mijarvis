import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadEnvironment() {
  try { process.loadEnvFile(process.env.MIJARVIS_ENV_FILE || fileURLToPath(new URL('../../../.env', import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export const defaults = { model: 'llama3.2', endpoint: 'http://127.0.0.1:11434', language: 'es' };

export function validateSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !Object.hasOwn(defaults, key))) throw new Error('Configuración no válida.');
  const settings = { ...defaults, ...value };
  if (typeof settings.model !== 'string' || !settings.model.trim() || settings.model.length > 256 || /[\x00-\x1f]/.test(settings.model)) {
    throw new Error('Indica un nombre de modelo válido (hasta 256 caracteres).');
  }
  settings.model = settings.model.trim();
  if (typeof settings.endpoint !== 'string' || settings.endpoint.length > 2048) throw new Error('Dirección de Ollama no válida.');
  let url;
  try { url = new URL(settings.endpoint); } catch { throw new Error('La dirección de Ollama debe ser una URL http:// o https://.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Usa una dirección http:// o https:// sin credenciales, rutas, parámetros ni fragmentos.');
  }
  settings.endpoint = url.origin;
  if (!['es', 'en'].includes(settings.language)) throw new Error('Idioma no válido: elige español o inglés.');
  return settings;
}

export function resolveSettings(saved = {}, env = process.env, explicit = {}) {
  const environment = {};
  if (env.OLLAMA_MODEL) environment.model = env.OLLAMA_MODEL;
  if (env.OLLAMA_URL) environment.endpoint = env.OLLAMA_URL;
  if (env.MIJARVIS_LANGUAGE) environment.language = env.MIJARVIS_LANGUAGE;
  return validateSettings({ ...defaults, ...saved, ...environment, ...explicit });
}

export function dataDirectory(env = process.env, platform = process.platform, home = homedir()) {
  if (env.MIJARVIS_DATA_DIR) return resolve(env.MIJARVIS_DATA_DIR);
  return platform === 'win32'
    ? join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'MiJarvis')
    : join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'mijarvis');
}

export function languageInstruction(language) {
  return language === 'en' ? 'Respond in English unless the user explicitly requests another language.'
    : 'Responde en español salvo que el usuario pida explícitamente otro idioma.';
}
