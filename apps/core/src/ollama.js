export function generationOptions(env = process.env) {
  const options = {};
  for (const [variable, field, minimum] of [
    ['OLLAMA_NUM_CTX', 'num_ctx', 1],
    ['OLLAMA_NUM_GPU', 'num_gpu', 0],
  ]) {
    const raw = env[variable];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < minimum) {
      throw new Error(`${variable} debe ser un entero mayor o igual a ${minimum}`);
    }
    options[field] = value;
  }
  return options;
}

export async function* generate({ baseUrl, model, prompt, messages, signal, options = generationOptions() }) {
  const response = await fetch(new URL(messages ? '/api/chat' : '/api/generate', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, ...(messages ? { messages } : { prompt }), stream: true, ...(Object.keys(options).length ? { options } : {}) }),
    signal,
  });
  if (!response.ok) {
    const details = await response.text();
    if (/CUDA error: shared object initialization failed/i.test(details)) {
      throw new Error(`Ollama HTTP ${response.status}: Falló la inicialización de CUDA. Puedes reintentar o iniciar MiJarvis con OLLAMA_NUM_GPU=0 y OLLAMA_NUM_CTX=2048 para usar CPU.`);
    }
    throw new Error(`Ollama HTTP ${response.status}: ${details.slice(0, 300)}`);
  }
  if (!response.body) throw new Error('Ollama returned an empty body');
  const decoder = new TextDecoder();
  let pending = '';
  let done = false;
  function parse(line) {
    const event = JSON.parse(line);
    if (event.error) throw new Error(String(event.error));
    if (event.done) done = true;
    const text = messages ? event.message?.content : event.response;
    return typeof text === 'string' ? text : '';
  }
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });
    if (pending.length > 1024 * 1024) throw new Error('Ollama frame too large');
    let newline;
    while ((newline = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, newline).trim();
      pending = pending.slice(newline + 1);
      if (line) { const token = parse(line); if (token) yield token; }
    }
  }
  pending += decoder.decode();
  if (pending.trim()) { const token = parse(pending); if (token) yield token; }
  if (!done) throw new Error('Ollama stream ended before completion');
}
