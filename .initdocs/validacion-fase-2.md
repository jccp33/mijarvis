# Fase 2: conversación y configuración

Fecha: 20 de octubre de 2026. Implementación y aceptación funcional completadas en Windows y Ubuntu 26.04.1/WSL2/WSLg. No equivale a certificación Ubuntu Desktop/GNOME ni Ubuntu 24.04.

## Funciones entregadas

- Crear, seleccionar y borrar conversaciones desde el HUD. Los títulos se toman del primer prompt completado.
- Guardar conversaciones y configuración localmente y restaurar los turnos completados tras reiniciar.
- Recortar el contexto por pares completos según el presupuesto del modelo, reservando espacio para la respuesta y la instrucción de idioma.
- Excluir de disco y contexto los turnos fallidos, cancelados e incompletos. El texto parcial puede verse hasta cambiar de conversación, marcado visualmente y acompañado de error.
- Configurar modelo, dirección de Ollama e idioma de las respuestas, español o inglés. La interfaz permanece en español.
- Mostrar disponibilidad, modelo seleccionado, modelos instalados, almacenamiento y avisos de recuperación. El diagnóstico se consulta al abrir la sesión y tras guardar ajustes, o manualmente con Comprobar conexión; no hay sondeo periódico.
- Reintentar manualmente el último prompt fallido de la conversación actual. El reintento no duplica turnos en el historial guardado. Ante desconexión se recupera el historial antes de permitir decidir qué enviar, sin reintento automático.

## Datos y recuperación

Ambos puntos de entrada usan `dataDirectory`, `loadEnvironment` y `resolveSettings`. Windows: `%LOCALAPPDATA%\MiJarvis`; Linux: `$XDG_DATA_HOME/mijarvis` o `~/.local/share/mijarvis`. `MIJARVIS_DATA_DIR` puede sustituir la carpeta. No hay migración de historial previo, porque antes solo existía en memoria.

`state.json` contiene:

```json
{
  "version": 1,
  "settings": {"model": "llama3.2", "endpoint": "http://127.0.0.1:11434", "language": "es"},
  "conversations": [
    {"id": "UUID", "title": "Primer mensaje", "updatedAt": 1792450800000,
      "messages": [{"role": "user", "content": "Hola"}, {"role": "assistant", "content": "Hola"}]}
  ]
}
```

El estado inicial admite `settings: {}`. Se validan versión, ajustes, identificadores únicos, roles alternados y tamaños. Los archivos están en texto local, sin cifrado. No se guardan tokens del Core ni credenciales de URL. Los límites son 100 conversaciones, 128 000 caracteres y 16 000 mensajes por conversación, y 64 MB serializados totales. Cada respuesta mantiene el límite defensivo de 64 000 caracteres. Estos límites no equivalen a tokens; la política de contexto está en `contexto-conversacion.md`.

Las escrituras se serializan: se valida una copia, se escribe un temporal exclusivo, se sincroniza, se reemplaza el archivo activo mediante rename y solo entonces se publica el estado en memoria. Una escritura fallida conserva el estado anterior. `done` se envía después de guardar. Cancelar antes de la confirmación del proveedor excluye el turno; una vez iniciada la confirmación en disco, la operación se completa como un turno guardado.

Un archivo dañado se mueve a `state.json.corrupt-*` y el Core arranca vacío con un aviso. Una versión desconocida se conserva intacta y detiene el arranque. Un error de permisos o lectura no se presenta como corrupción ni sobrescribe datos. Los temporales reconocidos de escrituras interrumpidas se descartan al arrancar, sin reproducirlos. No se tocan temporales ajenos.

`state.lock` impide dos procesos usando la misma carpeta. Si el PID propietario ya terminó, el bloqueo se recupera; si es ilegible o quedó `state.lock.recovery`, el error pide comprobar las instancias antes de retirar el archivo. Para escritorio y Core simultáneos, elegir directorios distintos. Los bloqueos por conversación impiden generar o borrar mientras otra conexión responde; guardar verifica además que no cambió el historial esperado.

Borrar retira la conversación del estado activo en disco, del selector y de las selecciones conectadas. No puede reaparecer por una respuesta tardía. Las copias de corrupción se conservan deliberadamente para recuperación manual y pueden contener conversaciones antiguas; no es borrado seguro del soporte ni de copias externas.

## Configuración compartida

Ambos modos cargan el `.env` de la raíz del proyecto, o el archivo indicado por `MIJARVIS_ENV_FILE`. La carga no sustituye variables que ya estén en el proceso. Precedencia de arranque, de menor a mayor:

1. Valores iniciales: llama3.2, http://127.0.0.1:11434, es.
2. Ajustes guardados en state.json.
3. Variables de `.env`.
4. Variables del entorno del proceso: OLLAMA_MODEL, OLLAMA_URL, MIJARVIS_LANGUAGE.
5. Opciones explícitas al invocar startCore.

Guardar desde el HUD valida, persiste y aplica de inmediato. Si hay variables configuradas, vuelven a prevalecer al reiniciar; el diálogo lo indica. `OLLAMA_NUM_CTX` y `OLLAMA_NUM_GPU` mantienen su validación y comportamiento documentado. No se permite cambiar ajustes durante una generación. Los proveedores inyectados de prueba mantienen su configuración fija.

Las direcciones deben ser HTTP(S) sin credenciales, rutas, query ni fragmentos; se normalizan como origen. Guardar una dirección remota es una elección explícita del usuario y el diálogo indica que se enviará allí la conversación. No hay fallback ni integración de proveedor de nube. Cambiar idioma agrega una instrucción system dentro del presupuesto; el cumplimiento depende del modelo. Cambiar ajustes no borra ni separa automáticamente la conversación actual.

## Protocolo añadido

Se conservan prompt, cancel, token, state, done, error, stats y system.command. `done` agrega conversationId; `ready` incluye settings, conversations, persistent y warning opcional. Las solicitudes siguen usando id y el WebSocket autenticado existente.

| Solicitud | Campos adicionales | Respuesta |
| --- | --- | --- |
| conversations.list | ninguno | conversations: lista de id, title, updatedAt |
| conversation.create | ninguno | conversation: nueva conversación y lista |
| conversation.select | conversationId | conversation: historial y lista |
| conversation.delete | conversationId | conversation: selección actual o null y lista |
| settings.get | ninguno | settings |
| settings.update | settings: model, endpoint, language | settings tras guardado |
| diagnostics | ninguno | diagnostics: available, models, selectedModelAvailable, error, persistent, warning, settings |

Las modificaciones notifican la lista de conversaciones a las conexiones. Borrar también limpia cualquier selección de ese identificador. Cada conexión elige su conversación; sin selección, el primer prompt crea una. El HUD recuerda la selección durante su sesión y elige la conversación más reciente al reiniciar. El contenido mostrado se refresca al seleccionar; los turnos nuevos siempre reconstruyen el contexto desde el estado actual del Core. El diagnóstico tiene un plazo de ocho segundos y la generación de 120 segundos, incluyendo la consulta del contexto.

## Validación y evidencias

- `npm run check` y `npm test`: sintaxis y 27 pruebas en Windows y Linux. Cubren continuidad, aislamiento, reconexión, exclusión de turnos incompletos, límites, prioridades, errores de escritura, bloqueo activo/abandonado, corrupción, versión futura y borrado sin resurrección.
- `npm run validate:phase2`: dos arranques reales de Electron con servidores HTTP simulados y datos aislados. Comprueba cambio de servidor/modelo/idioma, listado, rechazo de ajustes inválidos, texto seguro, selección, reintento, cancelación, borrado y recuperación tras reiniciar. No modifica el historial del usuario. Sandbox, contextIsolation y ausencia de nodeIntegration se comprueban en el mismo arranque.
- Windows: escenario del HUD aprobado, con ventana oculta y visible; capturas de ventana y diálogo inspeccionadas. Evidencia visible final: `artifacts/phase2-gQsh50/`; primera revisión visual: `artifacts/phase2-RLYqVR/`.
- Windows con Ollama real, llama3.2:latest, CPU, contexto 2048: streaming, cancelación y recuperación, recuerdo de `azul7319` tras reiniciar el Core, servicio no disponible y modelos ausente/incompatible aprobados. Evidencia: `artifacts/phase2-real-core/` y `artifacts/phase2-real-hud/`.
- Ubuntu 26.04.1/WSLg: Node 24.15.0 y dependencias Linux separadas bajo `~/.cache/mijarvis-phase2.ix0aFy/project`. Escenario completo aprobado por X11 y Wayland, con reinicio en ambos. Captura del diálogo Wayland inspeccionada. Evidencias copiadas a `artifacts/linux-mijarvis-phase2.ix0aFy/`; ejecución final: X11 `phase2-yq33M8` y Wayland `phase2-x43wzY`.

El runner admite `npm run validate:phase2 -- --ozone-platform=x11` y `npm run validate:phase2 -- --ozone-platform=wayland --show-test-window`. Cada ejecución genera su propio directorio phase2-* con state.json sintético y capturas initial/restore. La prueba oculta puede capturar una imagen anterior al diálogo; para revisar visualmente, usar --show-test-window.

En Windows se concedió lectura/ejecución a ALL APPLICATION PACKAGES exclusivamente en node_modules/electron/dist, según el diagnóstico de Electron. Las pruebas gráficas aún requirieron ejecutarse fuera del aislamiento de herramientas de Codex; el sandbox de Electron permaneció activo. Wayland sigue emitiendo advertencias de permisos EGL sobre /dev/dri; no se cambiaron permisos de GPU. No se certifica aceleración gráfica ni Ubuntu Desktop/GNOME.

## Continuación

La Fase 2 cumple su aceptación funcional en los entornos disponibles. La próxima tarea es comparar y seleccionar STT/TTS para la Fase 3, considerando español, latencia, memoria, licencia y Windows/Ubuntu. No se añadieron voz, proveedores de nube ni acciones autónomas. No se crearon commits ni se modificaron remotos.
