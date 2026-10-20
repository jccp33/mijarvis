import { generate, generationOptions } from './ollama.js';
import { conversation } from './provider.js';

export function createOllamaProvider({ baseUrl = 'http://127.0.0.1:11434', options } = {}) {
  async function listModels({ signal } = {}) {
    const response = await fetch(new URL('/api/tags', baseUrl), { signal });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.models) || data.models.some(model => typeof model.name !== 'string')) {
      throw new Error('Invalid Ollama model list');
    }
    return data.models.map(model => ({ id: model.name }));
  }
  return {
    id: 'ollama',
    listModels,
    async contextLimits({ model, signal }) {
      const configured = options ?? generationOptions();
      const response = await fetch(new URL('/api/show', baseUrl), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }), signal,
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: no se pudo consultar el contexto del modelo`);
      const data = await response.json();
      const info = data.model_info ?? {};
      const maximum = info[`${info['general.architecture']}.context_length`];
      const declared = Number(/^\s*num_ctx\s+(\d+)\s*$/m.exec(data.parameters ?? '')?.[1]);
      const requested = configured.num_ctx ?? (Number.isSafeInteger(declared) && declared > 0 ? declared : 2048);
      const contextTokens = Number.isSafeInteger(maximum) && maximum > 0 ? Math.min(requested, maximum) : requested;
      return { contextTokens, outputTokens: Math.min(512, Math.floor(contextTokens / 4)) };
    },
    async availability({ signal } = {}) {
      try {
        await listModels({ signal });
        return { available: true };
      } catch (error) {
        if (signal?.aborted) throw error;
        return { available: false, error: { message: error.message } };
      }
    },
    converse(request) {
      return conversation(request, input => generate({ ...input, baseUrl, options: {
        ...(options ?? generationOptions()),
        ...(request.limits ? { num_ctx: request.limits.contextTokens, num_predict: request.limits.outputTokens } : {}),
      } }));
    },
  };
}
