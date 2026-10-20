# MiJarvis

Base de un asistente de escritorio para Windows 11 y Ubuntu, escrita en **JavaScript ESM con Node.js 24+, Electron y WebSocket**. Sin compilación ni servicios de nube obligatorios.

## Inicio

```sh
npm install
npm start
```

El escritorio inicia su propio Core en un puerto local libre y genera un token aleatorio por sesión. No hace falta iniciar `npm run core` en otra terminal. La aplicación puede abrirse sin Ollama: las métricas y los controles siguen disponibles y el chat informa el error de conexión.

Para conversar, instala Ollama por separado, descarga un modelo y verifica que el servicio esté escuchando:

```sh
ollama pull llama3.2
ollama serve
```

Si Ollama ya está ejecutándose, no inicies otro servidor. El modelo debe estar descargado antes de enviar el primer mensaje. El chat guarda localmente las conversaciones y restaura su contexto al seleccionarlas, incluso después de cerrar la app. Usa **Nueva**, el selector y **Borrar** para gestionar el historial. Los turnos cancelados, fallidos o incompletos se excluyen; **Reintentar** vuelve a enviar el último prompt fallido de la conversación actual. El contexto conserva los turnos completos más recientes que caben en un presupuesto conservador según el modelo, con espacio reservado para responder. Los mensajes demasiado grandes se rechazan sin perder el contexto anterior. El historial en memoria conserva hasta 128 000 caracteres, retirando pares antiguos al completar un turno. Detalles y limitaciones en [.initdocs/contexto-conversacion.md](.initdocs/contexto-conversacion.md).

Abre **Ajustes** para guardar modelo, servidor Ollama e idioma de las respuestas (español o inglés). **Comprobar conexión** muestra disponibilidad, modelos instalados y diagnóstico básico. También puedes definir `OLLAMA_MODEL` y `OLLAMA_URL` en el entorno antes de iniciar; tienen prioridad sobre los ajustes guardados al reiniciar. Ejemplo en PowerShell:

```powershell
$env:OLLAMA_MODEL = 'llama3.2'
npm start
```

En Git Bash (Windows):

```bash
OLLAMA_MODEL=llama3.1:8b npm start
```

O para mantener el modelo durante toda la sesión de Git Bash:

```bash
export OLLAMA_MODEL='llama3.1:8b'
npm start
```

En Bash de Ubuntu:

```sh
OLLAMA_MODEL=llama3.2 npm start
```

Si ya tienes otro modelo instalado, usa su nombre exacto de `ollama list`, por ejemplo `llama3.1:8b`, en lugar de descargar otro.

La sintaxis `$env:VARIABLE = 'valor'` corresponde a PowerShell; en Git Bash y Ubuntu usa `export VARIABLE='valor'` o `VARIABLE=valor comando`.

### Fallos de inicialización CUDA

Si Ollama devuelve HTTP 500 con `CUDA error: shared object initialization failed`, el proceso de inferencia falló al inicializar CUDA. Un reintento puede recuperarlo; el mensaje por sí solo no demuestra falta de VRAM ni permite atribuir una causa definitiva al controlador.

MiJarvis permite ajustar cada solicitud sin cambiar la configuración global de Ollama. Para probar un contexto menor en Git Bash:

```bash
OLLAMA_MODEL=llama3.1:8b OLLAMA_NUM_CTX=2048 npm start
```

Si persiste, puedes usar CPU (más lento):

```bash
OLLAMA_MODEL=llama3.1:8b OLLAMA_NUM_CTX=2048 OLLAMA_NUM_GPU=0 npm start
```

En PowerShell establece `$env:OLLAMA_NUM_CTX = '2048'` y `$env:OLLAMA_NUM_GPU = '0'` antes de `npm start`. Reinicia MiJarvis para aplicar cambios del entorno. El Core consulta los metadatos del modelo y envía `options.num_ctx` y `options.num_predict` acordes con su presupuesto. `OLLAMA_NUM_CTX` tiene prioridad sobre el parámetro del modelo, sin exceder su capacidad declarada; si faltan ambos se usan 2048 tokens. `OLLAMA_NUM_GPU` se envía sin cambios cuando se configura. Ambos modos cargan el `.env` de la raíz; las variables ya presentes en el proceso tienen prioridad.

Para volver al comportamiento predeterminado, elimina las variables de tu sesión (`unset OLLAMA_NUM_CTX OLLAMA_NUM_GPU` en Bash o `Remove-Item Env:OLLAMA_NUM_CTX,Env:OLLAMA_NUM_GPU -ErrorAction SilentlyContinue` en PowerShell) y reinicia MiJarvis. Los registros Windows están en `%LOCALAPPDATA%\Ollama\server.log`; consulta la [guía oficial de diagnóstico](https://docs.ollama.com/troubleshooting) si el fallo se repite.

## Core independiente

Copia `.env.example` a `.env`, reemplaza `CORE_TOKEN` por un secreto de al menos 24 caracteres y ejecuta:

```sh
npm run core
```

El escritorio y el Core independiente comparten carga de `.env`, validación, formato de datos y precedencia de ajustes: valores iniciales < archivo guardado < `.env` < entorno del proceso < parámetros explícitos del Core. Guardar desde la interfaz aplica los cambios de inmediato y los persiste; las variables vuelven a tener prioridad al reiniciar. El endpoint `http://127.0.0.1:4317/health` comprueba que el Core está activo, sin comprobar Ollama.

## Conversaciones y datos locales

El archivo versionado `state.json` guarda ajustes y pares usuario/asistente completos en texto local. Windows usa `%LOCALAPPDATA%\MiJarvis`; Linux usa `$XDG_DATA_HOME/mijarvis` o `~/.local/share/mijarvis`. `MIJARVIS_DATA_DIR` permite elegir otra carpeta y `MIJARVIS_ENV_FILE` otro archivo de entorno. Solo un Core puede usar la misma carpeta simultáneamente.

El guardado usa un archivo temporal, sincronización y reemplazo atómico. Si se detecta corrupción, se conserva una copia `.corrupt-*`, se inicia un historial vacío y se avisa en el HUD. Una versión desconocida detiene el arranque sin sobrescribirla. Borrar elimina la conversación del archivo activo y del contexto; las copias de corrupción se conservan para recuperación manual. No equivale a borrado seguro del soporte.

Se admiten hasta 100 conversaciones, 128 000 caracteres y 16 000 mensajes por conversación y 64 MB de estado total. El idioma configura las respuestas del asistente; la interfaz permanece en español. Cambiar servidor o modelo afecta las próximas respuestas y conserva el historial seleccionado. La conversación se envía únicamente al servidor configurado, sin fallback automático.

Procedimiento, protocolo y evidencias: [.initdocs/validacion-fase-2.md](.initdocs/validacion-fase-2.md).

## Estructura

```text
apps/core/src/         Servidor local, protocolo WebSocket y cliente Ollama
apps/core/test/        Pruebas de sistema e integración con Ollama simulado
apps/desktop/src/     Electron, preload aislado y HUD HTML/CSS/JS
packages/system/src/  SystemController y adaptadores Windows/Linux
scripts/              Verificación de sintaxis
.initdocs/            Requisitos originales
```

El escritorio aloja el servidor Core dentro del proceso principal en esta fase. Los módulos están separados para permitir trasladarlo a un proceso independiente después.

## Capacidades implementadas

- Ventana sin marco y con fondo transparente; cerrar, minimizar y mover desde el encabezado.
- HUD con núcleo animado según actividad y métricas CPU/RAM cada segundo.
- Proveedor Ollama `/api/chat` con contexto de conversación con streaming NDJSON, cancelación y tiempo máximo de 120 segundos.
- Conversaciones persistentes con selección, creación, borrado y reconexión al contexto guardado.
- Ajustes desde el HUD, descubrimiento de modelos, diagnóstico y reintento manual.
- `SystemController.openTerminal()`, `getSystemStats()` y `runSystemCommand(command)`.
- Adaptadores PowerShell para Windows y `x-terminal-emulator` para Ubuntu.

`runSystemCommand` acepta únicamente los identificadores `hostname` y `whoami`, sin parámetros ni shell. Para ampliar capacidades, añade acciones explícitas al adaptador y su validación. Las respuestas del LLM se muestran como texto y no ejecutan acciones. Abrir terminal requiere una acción explícita del usuario mediante IPC; no se expone por WebSocket.

La terminal de Windows abre una ventana interactiva de PowerShell. En Ubuntu se requiere escritorio gráfico y una alternativa `x-terminal-emulator` instalada. La transparencia depende del compositor y debe validarse en los entornos X11/Wayland objetivo.

## Protocolo

Conexión: `ws://127.0.0.1:<puerto>/ws?token=<secreto>`. El token no se escribe en los logs. El servidor limita tamaño de mensajes, valida orígenes y acepta una generación activa por conexión.

```json
{"type":"prompt","id":"request-1","prompt":"Hola Jarvis"}
{"type":"cancel","id":"request-1"}
{"type":"system.command","id":"request-2","command":"hostname"}
```

Eventos del servidor: `ready` (modelo), `stats` (métricas), `state` (`thinking`/`idle`), `token` (texto incremental), `done`, `error` y `system.result`. Las respuestas a solicitudes incluyen `id`; los errores de mensajes que no se pueden interpretar pueden omitirlo. Cancelar produce un evento `error` y devuelve el estado a `idle`.

## Verificación

```sh
npm run check
npm test
npm run test:desktop
npm run validate:phase2
```

Las pruebas no requieren Ollama, no abren terminales y usan servidores HTTP simulados. `validate:phase2` ejecuta dos arranques del HUD con datos aislados: ajustes, cambio de servidor/modelo/idioma, selección, reintento, cancelación, borrado y recuperación tras reiniciar. Incluyen respuestas fragmentadas, UTF-8, errores HTTP, streams incompletos, autenticación, cancelación y comandos permitidos. `test:desktop` requiere un entorno gráfico y comprueba con una ventana oculta el preload, la conexión WebSocket y la recepción de métricas. No sustituye una prueba visual de Electron ni una validación en ambos sistemas operativos.

Validación adicional con Ollama real:

```sh
npm run validate:ollama
npm run validate:desktop
```

Estos dos comandos requieren modelos ya instalados. El segundo también abre una terminal interactiva y guarda una captura del HUD. Resultados, requisitos, matriz Ubuntu y verificaciones manuales en [.initdocs/validacion-fase-1.md](.initdocs/validacion-fase-1.md). Las evidencias se generan en `artifacts/` y se excluyen de Git.

Para verificar errores visibles en el HUD: `npm run validate:errors`. Para comprobar arrastre real, minimizar/restaurar y transparencia nativa en Windows: `npm run validate:window` (muestra una ventana de prueba y mueve brevemente el cursor).

Ubuntu 26.04.1 fue validado bajo WSL2/WSLg mediante X11 y Wayland, con Node/Electron nativos de Linux y sandbox activo. Usa dependencias separadas de Windows; no compartas `node_modules` entre ambos sistemas. La preparación, evidencias, comandos Wayland y limitaciones de GPU y red están en el documento de validación. La certificación en Ubuntu Desktop/GNOME sigue pendiente.

## Próximas fases

Pendientes: micrófono, wake word, STT/TTS, métricas GPU, bandeja de sistema/ejecución residente, proveedores de nube e instaladores. Al cerrar la ventana, termina la aplicación y su Core. No hay activación por voz ni ejecución autónoma de comandos en esta fase.

Referencias: [seguridad de Electron](https://www.electronjs.org/docs/latest/tutorial/security), [API de generación de Ollama](https://docs.ollama.com/api/generate) y [ws](https://github.com/websockets/ws).
