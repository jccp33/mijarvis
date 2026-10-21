export function pcmWav(chunks, rate) {
  const length = chunks.reduce((sum, part) => sum + part.length, 0);
  if (!Number.isFinite(rate) || rate < 8000 || rate > 96000 || length < rate * 0.25 || length > rate * 30) throw new Error('Graba entre 0.25 y 30 segundos.');
  const input = new Float32Array(length); let at = 0;
  for (const part of chunks) { input.set(part, at); at += part.length; }
  const count = Math.floor(length * 16000 / rate);
  const buffer = new ArrayBuffer(44 + count * 2); const view = new DataView(buffer);
  const word = (offset, text) => { for (let index = 0; index < text.length; index++) view.setUint8(offset + index, text.charCodeAt(index)); };
  word(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); word(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  word(36, 'data'); view.setUint32(40, count * 2, true);
  const ratio = rate / 16000;
  for (let index = 0; index < count; index++) {
    const first = Math.floor(index * ratio), end = Math.max(first + 1, Math.floor((index + 1) * ratio));
    let sum = 0; for (let offset = first; offset < end; offset++) sum += input[offset];
    const value = Math.max(-1, Math.min(1, sum / (end - first)));
    view.setInt16(44 + index * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return new Uint8Array(buffer);
}

export function speechSegments(text, language = 'es') {
  const plain = text.replace(/```[\s\S]*?```/g, '').replace(/[*_`#]/g, '').trim();
  const output = [];
  for (const { segment } of new Intl.Segmenter(language, { granularity: 'sentence' }).segment(plain)) {
    let current = '';
    for (const word of segment.trim().split(/\s+/)) {
      if (word.length > 1000) continue;
      if (current && current.length + word.length + 1 > 240) { output.push(current); current = ''; }
      current += `${current ? ' ' : ''}${word}`;
    }
    if (current) output.push(current);
  }
  return output;
}

export function audioError(error) {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Permiso de audio denegado. Revisa los permisos de micrófono de Windows/Ubuntu e inténtalo de nuevo.';
  if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'El dispositivo de audio ya no está disponible. Selecciona otro.';
  if (error.name === 'NotReadableError') return 'No se puede usar el micrófono. Puede estar ocupado o desconectado.';
  return error.message || 'No se pudo completar la operación de audio.';
}
