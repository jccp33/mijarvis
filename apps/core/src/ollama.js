export async function* generate({ baseUrl, model, prompt, signal }) {
  const response = await fetch(new URL('/api/generate', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: true }),
    signal,
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  if (!response.body) throw new Error('Ollama returned an empty body');
  const decoder = new TextDecoder();
  let pending = '';
  let done = false;
  function parse(line) {
    const event = JSON.parse(line);
    if (event.error) throw new Error(String(event.error));
    if (event.done) done = true;
    return typeof event.response === 'string' ? event.response : '';
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
