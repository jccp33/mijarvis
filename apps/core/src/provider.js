/**
 * Provider: id, availability({signal}), listModels({signal}), converse(request).
 * request: {model, messages: [{role: system|user|assistant, content}], signal}.
 * converse yields {type:'delta', text}, then exactly one terminal event:
 * {type:'result', status: completed|cancelled|failed, text, error?}.
 * Only completed text is a complete assistant message. Other text is partial.
 * Errors are {message}; cancellation includes timeouts via AbortSignal.
 * Providers hold no conversation history. Callers supply all context explicitly.
 */
export async function* conversation(request, stream) {
  let text = '';
  try {
    if (typeof request.model !== 'string' || !request.model.trim()) throw new Error('Invalid model');
    if (!Array.isArray(request.messages) || !request.messages.length || request.messages.some(message =>
      !message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string')) {
      throw new Error('Invalid conversation messages');
    }
    request.signal?.throwIfAborted();
    for await (const part of stream(request)) {
      request.signal?.throwIfAborted();
      text += part;
      yield { type: 'delta', text: part };
    }
    request.signal?.throwIfAborted();
    yield { type: 'result', status: 'completed', text };
  } catch (error) {
    yield { type: 'result', status: request.signal?.aborted ? 'cancelled' : 'failed', text,
      error: { message: error.message || String(error) } };
  }
}
