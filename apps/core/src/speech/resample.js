import { inspectWav } from './wav.js';

// Offline conversion for validation and future capture adapters; averaging reduces aliasing.
export function toMono16k(bytes) {
  const info = inspectWav(bytes, { maxSeconds: 30 });
  const input = Buffer.from(bytes);
  let offset = 12;
  while (input.toString('ascii', offset, offset + 4) !== 'data') offset += 8 + input.readUInt32LE(offset + 4) + (input.readUInt32LE(offset + 4) % 2);
  const data = input.subarray(offset + 8, offset + 8 + input.readUInt32LE(offset + 4));
  const count = Math.floor((data.length / 2) * 16000 / info.sampleRate);
  const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  const ratio = info.sampleRate / 16000;
  for (let index = 0; index < count; index++) {
    const start = Math.floor(index * ratio); const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let at = start; at < end; at++) sum += data.readInt16LE(at * 2);
    wav.writeInt16LE(Math.round(sum / (end - start)), 44 + index * 2);
  }
  return wav;
}
