export function inspectWav(bytes, { maxSeconds = 30, sampleRate, maxBytes = 32 * 1024 * 1024 } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 44 || bytes.byteLength > maxBytes) throw new Error('Audio WAV vacío o demasiado grande.');
  const wav = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE' || wav.readUInt32LE(4) !== wav.length - 8) throw new Error('Cabecera WAV no válida.');
  let format; let data;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const name = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4); const start = offset + 8;
    if (start + size > wav.length) throw new Error('Audio WAV incompleto.');
    if (name === 'fmt ') {
      if (format || size < 16) throw new Error('Formato WAV no válido.');
      format = { encoding: wav.readUInt16LE(start), channels: wav.readUInt16LE(start + 2), sampleRate: wav.readUInt32LE(start + 4),
        byteRate: wav.readUInt32LE(start + 8), alignment: wav.readUInt16LE(start + 12), bits: wav.readUInt16LE(start + 14) };
    }
    if (name === 'data') { if (data) throw new Error('Audio WAV ambiguo.'); data = wav.subarray(start, start + size); }
    offset = start + size + (size % 2);
  }
  if (!format || !data?.length || format.encoding !== 1 || format.channels !== 1 || format.bits !== 16 || format.alignment !== 2 ||
      data.length % 2 || format.byteRate !== format.sampleRate * 2 || format.sampleRate < 8000 || format.sampleRate > 48000 ||
      (sampleRate && format.sampleRate !== sampleRate)) throw new Error('Se requiere WAV PCM de 16 bits, mono y frecuencia compatible.');
  const durationSeconds = data.length / format.byteRate;
  if (durationSeconds > maxSeconds) throw new Error(`El audio supera ${maxSeconds} segundos.`);
  let energy = 0;
  for (let offset = 0; offset < data.length; offset += 2) energy += (data.readInt16LE(offset) / 32768) ** 2;
  return { sampleRate: format.sampleRate, channels: 1, durationSeconds, rms: Math.sqrt(energy / (data.length / 2)) };
}
