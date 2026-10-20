# Contexto de conversación

Implementado el 20 de octubre de 2026. Archivos: history.js, ollama-provider.js y server.js.

## Presupuesto

Antes de cada generación el Core consulta POST /api/show con el mismo AbortSignal y plazo de 120 segundos de la generación. La conexión queda ocupada durante la consulta para evitar solicitudes simultáneas. Fallos y cancelación liberan el estado activo.

Prioridad: OLLAMA_NUM_CTX (o num_ctx inyectado en el proveedor), parámetro num_ctx del modelo, o 2048. Se limita a model_info[general.architecture + '.context_length'] si hay una capacidad válida. El Core envía explícitamente el resultado como num_ctx para alinear recorte y ejecución, sin asignar automáticamente la ventana máxima de modelos grandes. Puede variar el comportamiento de configuraciones que dependían de los valores globales del servidor Ollama; configurar OLLAMA_NUM_CTX para elegir la ventana deseada.

Se reservan min(512, floor(ventana / 4)) tokens para salida y se aplica num_predict con ese valor. Además se reservan 128 para formato. El presupuesto de entrada restante descuenta la instrucción de idioma y usa bytes UTF-8 + 16 por mensaje como estimación conservadora. No es tokenización exacta: plantillas o mensajes de sistema incluidos en el modelo pueden consumir más; no se garantiza el ajuste exacto de modelos personalizados. Ventanas que no permiten una reserva válida se rechazan. Proveedores inyectados sin contextLimits usan 2048/512 como presupuesto local.

Referencia de los campos y opciones: [detalles del modelo](https://docs.ollama.com/api-reference/show-model-details) y [parámetros de Ollama](https://docs.ollama.com/modelfile).

## Recorte y memoria

Siempre se conserva el prompt actual entero. Se incorporan hacia atrás pares usuario/asistente completos hasta alcanzar el presupuesto; al no caber un par se omiten ese y los anteriores. Se preservan orden y roles. No se generan resúmenes ni solicitudes adicionales al modelo. El texto visible en el HUD no se borra al omitir contexto antiguo.

Un prompt que no cabe se rechaza con un error comprensible; no se trunca. Preparar contexto no modifica el historial, por lo que errores o cancelaciones mantienen los turnos previos. Solo al completar correctamente una respuesta se añade el par y se retiran pares antiguos para mantener un máximo de 128 000 caracteres guardados. Un par individual que exceda ese máximo no se guarda. Permanece el límite defensivo de 64 000 caracteres por respuesta.

El recorte puede hacer que el modelo olvide detalles antiguos. El historial se guarda por conversación; el HUD selecciona la conversación recordada durante la reconexión o la más reciente al reiniciar. Una conexión de protocolo sin selección inicia otra conversación al enviar el primer prompt. Persistencia, configuración y verificación de la Fase 2: validacion-fase-2.md.

## Verificación

Validación inicial del recorte: 16 pruebas aprobadas y sintaxis validada. Cobertura nueva: recorte por pares, prioridad de opciones y capacidad del modelo, presupuesto enviado a Ollama, UTF-8, prompt demasiado largo, memoria acotada, historial intacto tras error y recuperación tras fallo/cancelación durante descubrimiento. Validación real del Core con llama3.2:latest en CPU (num_gpu=0): ventana 2048 y reserva 512, primer turno OK y segundo turno recordó la clave naranja73. La validación gráfica posterior y el cierre completo están registrados en validacion-fase-2.md.
