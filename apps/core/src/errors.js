export function readableError(error, signal) {
  if (signal?.aborted) return signal.reason?.message === 'Generation timed out'
    ? 'La respuesta superó el tiempo límite. Puedes reintentar.' : 'Respuesta cancelada. El turno no se añadió al contexto.';
  const text = error?.message || String(error);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|Failed to fetch/i.test(text)) return 'No se pudo conectar con Ollama. Comprueba la dirección y que el servicio esté iniciado.';
  if (/Ollama HTTP 404/i.test(text)) return 'No se encontró el modelo o la API de Ollama. Revisa los modelos disponibles y la dirección configurada.';
  if (/does not support chat|does not support generate|not support.*completion/i.test(text)) return 'El modelo seleccionado no admite conversación. Selecciona otro modelo.';
  if (/before completion|stream ended|does not match/i.test(text)) return 'La respuesta llegó incompleta. El turno no se guardó; puedes reintentar.';
  if (error?.name === 'TimeoutError') return 'Ollama no respondió a tiempo. Comprueba el servicio y vuelve a diagnosticar.';
  return text.slice(0, 600);
}
