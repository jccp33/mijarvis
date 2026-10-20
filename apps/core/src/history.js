// In-memory history for one connection. Only complete user/assistant pairs enter context.
export class ConversationHistory {
  #messages = [];
  #characters = 0;

  constructor(maxCharacters = 128000, messages = []) {
    this.maxCharacters = maxCharacters;
    for (let index = 0; index < messages.length; index += 2) this.complete(messages[index].content, messages[index + 1].content);
  }

  snapshot() { return this.#messages.map(message => ({ ...message })); }

  context(prompt, { contextTokens = 2048, outputTokens = 512 } = {}, instruction = '') {
    if (!Number.isSafeInteger(contextTokens) || !Number.isSafeInteger(outputTokens) ||
        outputTokens < 1 || contextTokens <= outputTokens + 128) throw new Error('Invalid context limits');
    const current = { role: 'user', content: prompt };
    // Conservative estimate without a model tokenizer: UTF-8 bytes plus role overhead.
    const cost = message => Buffer.byteLength(message.content, 'utf8') + 16;
    const system = instruction ? [{ role: 'system', content: instruction }] : [];
    const budget = contextTokens - outputTokens - 128 - system.reduce((sum, message) => sum + cost(message), 0);
    if (cost(current) > budget || prompt.length > this.maxCharacters) {
      throw new Error('El mensaje supera el límite de contexto del modelo. Acorta el mensaje.');
    }
    let used = cost(current);
    let start = this.#messages.length;
    while (start >= 2) {
      const pairCost = cost(this.#messages[start - 2]) + cost(this.#messages[start - 1]);
      if (used + pairCost > budget) break;
      used += pairCost;
      start -= 2;
    }
    // Selection never changes saved history: a failed request must not discard turns.
    return [...system, ...this.#messages.slice(start).map(message => ({ ...message })), current];
  }

  complete(prompt, reply) {
    if (prompt.length + reply.length > this.maxCharacters) {
      throw new Error('La respuesta supera el límite del historial; este turno no se incluirá en el contexto.');
    }
    this.#messages.push({ role: 'user', content: prompt }, { role: 'assistant', content: reply });
    this.#characters += prompt.length + reply.length;
    while (this.#characters > this.maxCharacters || this.#messages.length > 16000) {
      this.#characters -= this.#messages.shift().content.length;
      this.#characters -= this.#messages.shift().content.length;
    }
  }
}
