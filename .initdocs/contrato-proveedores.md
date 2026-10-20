# Contrato de proveedores LLM

Implementado el 20 de octubre de 2026. Referencia: `apps/core/src/provider.js` y `ollama-provider.js`.

Un proveedor expone `id`, `availability({signal})`, `listModels({signal})` y `converse({model, messages, signal})`. La disponibilidad devuelve `{available, error?}`; listar modelos devuelve objetos `{id}` o rechaza ante fallo. La cancelación de estas consultas rechaza la operación. El llamador debe proporcionar un AbortSignal con plazo cuando necesite limitar la espera.

Los mensajes contienen `role` (`system`, `user`, `assistant`) y `content` de texto. No se incluyen herramientas ni contenido multimedia en esta versión. Cada invocación recibe su contexto completo y el proveedor no guarda historial.

`converse` es un iterable asíncrono. Emite eventos `{type: 'delta', text}` y un único evento terminal `{type: 'result', status, text, error?}` al consumirlo hasta el final. Los estados son `completed`, `cancelled` y `failed`. `text` acumula los fragmentos emitidos; en cancelación o fallo representa contenido parcial y no una respuesta completa. `error` contiene `{message}`. Un cierre del transporte sin confirmación de finalización es fallo. AbortSignal determina la cancelación, incluidos plazos vencidos; abandonar el iterable antes del final no produce un evento terminal para el consumidor.

## Integración y migración

El Core admite inyección de `provider` en `startCore`; por defecto construye el proveedor Ollama. El adaptador usa `/api/tags` para descubrimiento y `/api/chat` para conversación. Conserva opciones `OLLAMA_NUM_CTX`/`OLLAMA_NUM_GPU`, diagnóstico CUDA, parsing incremental UTF-8 y cancelación HTTP. `generate` conserva su entrada histórica `prompt` y `/api/generate` para consumidores existentes; si recibe `messages`, usa `/api/chat`.

El protocolo WebSocket permanece igual: cada solicitud incluye una instrucción `system` de idioma, los pares `user`/`assistant` completados de la conversación seleccionada y el nuevo mensaje `user`; los deltas se traducen a `token`, el resultado completado a `done` y los resultados cancelados o fallidos a `error`. Se conservan el plazo de 120 segundos y los estados del HUD. No requiere migración de datos. Las pruebas o proxies que intercepten la conversación del Core deben permitir `/api/chat` en lugar de `/api/generate`.

El Core mantiene historial persistente por conversación y selección independiente por conexión. Solo guarda pares completos tras verificar finalización y coherencia del streaming. Cancelación, fallo, stream incompleto o límite excedido excluyen el par completo y conservan el contexto previo. El HUD restaura la selección tras reconectar; el protocolo permite recuperar cualquier conversación por identificador.

El presupuesto según el modelo y el recorte por pares están implementados; ver contexto-conversacion.md. Se conservan límites defensivos de 128 000 caracteres de historial y 64 000 por respuesta. Almacenamiento y gestión están implementados; ver validacion-fase-2.md. Las integraciones en nube siguen pendientes para la Fase 6.

## Ampliación: presupuesto de contexto

El proveedor puede exponer contextLimits({model, signal}) y devolver {contextTokens, outputTokens}. El Core valida el presupuesto al construir el contexto y entrega limits junto con model, messages y signal a converse. Ollama usa limits para num_ctx y num_predict; sin limits conserva el comportamiento del adaptador anterior. El contrato básico sigue siendo válido para proveedores sin descubrimiento de contexto. Política implementada en [contexto-conversacion.md](contexto-conversacion.md).
