import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const runtimeVersion = '1.13.8';
const runtime = platform => `sherpa-onnx-v${runtimeVersion}-${platform === 'win32' ? 'win-x64-shared-MT-Release' : 'linux-x64-shared'}`;
export const modelFolder = 'sherpa-onnx-whisper-tiny';
export const voiceFolder = 'vits-piper-es_MX-claude-high';
export const voiceId = 'es_MX-claude-high';
const asset = (tag, folder, sha256, bytes) => ({
  folder, name: `${folder}.tar.bz2`, sha256, bytes,
  url: `https://github.com/k2-fsa/sherpa-onnx/releases/download/${tag}/${folder}.tar.bz2`,
});

export function speechCatalog(platform = process.platform, arch = process.arch) {
  if (!['win32', 'linux'].includes(platform) || arch !== 'x64') throw new Error('Audio local disponible inicialmente para Windows/Linux x64.');
  return [
    asset(`v${runtimeVersion}`, runtime(platform), platform === 'win32'
      ? '6dffdc715a4465b989446a6105265d2cb345e7101591a17d35534b6758f6e8df'
      : 'c0bdb7907d3a74bba1d55d22bf4d9fa75586cf1530614ebe88a27b9118e015c4', platform === 'win32' ? 24805859 : 28156791),
    // The old ASR release has no publisher digest. This digest was measured from the official HTTPS download.
    asset('asr-models', modelFolder, 'c46116994e539aa165266d96b325252728429c12535eb9d8b6a2b10f129e66b1', 116204861),
    asset('tts-models', voiceFolder, 'ec33fb689c248fe64810aab564cba97babf0f506672cfd404928d46e751a4721', 67207890),
  ];
}

export function speechDirectory(env = process.env, platform = process.platform, arch = process.arch) {
  const project = fileURLToPath(new URL('../../../../', import.meta.url));
  return env.MIJARVIS_SPEECH_DIR ? resolve(project, env.MIJARVIS_SPEECH_DIR) : resolve(project, '.cache', 'speech', `${platform}-${arch}`);
}

export function speechPaths(root, platform = process.platform) {
  const executable = name => resolve(root, runtime(platform), 'bin', `${name}${platform === 'win32' ? '.exe' : ''}`);
  return {
    asr: executable('sherpa-onnx-offline'), tts: executable('sherpa-onnx-offline-tts'),
    encoder: resolve(root, modelFolder, 'tiny-encoder.int8.onnx'),
    decoder: resolve(root, modelFolder, 'tiny-decoder.int8.onnx'),
    tokens: resolve(root, modelFolder, 'tiny-tokens.txt'),
    voice: resolve(root, voiceFolder, `${voiceId}.onnx`),
    voiceTokens: resolve(root, voiceFolder, 'tokens.txt'),
    voiceData: resolve(root, voiceFolder, 'espeak-ng-data'),
  };
}
