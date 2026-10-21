export const voiceDefaults = { version: 1, input: '', output: '', voice: 'es_MX-claude-high', speed: 1, volume: 0.8, shortcut: 'F8', read: false };
export function voicePreferences(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value.version !== undefined && value.version !== 1)) throw new Error('Preferencias de voz no válidas.');
  const settings = { ...voiceDefaults };
  for (const field of ['input', 'output']) {
    if (value[field] !== undefined) {
      if (typeof value[field] !== 'string' || value[field].length > 256) throw new Error('Dispositivo no válido.');
      settings[field] = value[field];
    }
  }
  if (value.voice !== undefined && value.voice !== voiceDefaults.voice) throw new Error('Voz no disponible.');
  for (const [field, min, max] of [['speed', 0.5, 2], ['volume', 0, 1]]) {
    if (value[field] !== undefined) {
      if (!Number.isFinite(value[field]) || value[field] < min || value[field] > max) throw new Error('Ajuste de voz fuera de rango.');
      settings[field] = value[field];
    }
  }
  if (value.shortcut !== undefined) {
    if (!['F8', 'F9', 'Control+Shift+Space'].includes(value.shortcut)) throw new Error('Atajo de voz no válido.');
    settings.shortcut = value.shortcut;
  }
  if (value.read !== undefined) {
    if (typeof value.read !== 'boolean') throw new Error('Lectura automática no válida.');
    settings.read = value.read;
  }
  return settings;
}
