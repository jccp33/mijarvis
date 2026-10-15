# Fase 1: validación y compatibilidad

Fecha local de la ejecución: 14 de octubre de 2026 (America/Hermosillo).

## Resultado

La base funciona en Windows y en Ubuntu 26.04.1 bajo WSL2/WSLg con Ollama real. Se completó la validación funcional disponible por X11 y Wayland. La certificación de sesiones completas Ubuntu Desktop/GNOME sigue pendiente; WSLg no la sustituye. La referencia estable en Git queda pendiente por decisión del usuario.

Al finalizar se encontró Git ya inicializado en la rama `main`, con `origin` configurado a `https://github.com/jccp33/mijarvis.git`, sin commits. Esta ejecución no inicializó Git, no cambió el remoto ni creó commits o publicaciones.

Entorno comprobado: Windows, compilación 26300.9711, DisplayVersion 26H2; Node.js 24.15.0; Electron 44.7.2; modelo `llama3.1:8b`. El campo heredado WindowsProductName informa Windows 10, pero la versión de compilación del sistema es 26300; se registra la compilación para evitar ambigüedad.

| Comprobación | Resultado y evidencia |
| --- | --- |
| Sintaxis | `npm run check`: correcto. |
| Regresión del Core | `npm test`: 6 pruebas aprobadas. |
| Conversación real por WebSocket | Respuesta en español, 28 eventos de token; primera prueba completada en aproximadamente 16,7 s, incluida carga del modelo. |
| Cancelación y recuperación | Cancelación después del primer token; solicitud posterior completada correctamente. |
| Servicio no disponible | Conexión a un puerto local cerrado: evento de error y vuelta a reposo. No se detuvo el servicio Ollama del usuario. |
| Modelo ausente | Ollama real respondió HTTP 404; el Core notificó el error. |
| Modelo incompatible | `nomic-embed-text:latest` respondió HTTP 400 por no admitir generación; el Core notificó el error. |
| Conversación desde el HUD | Envío mediante formulario real del renderer, respuesta visible y controles restaurados. |
| Cancelación desde el HUD | Botón Detener cancela la generación y restaura controles. |
| Aislamiento Electron | Preload operativo; sandbox y contextIsolation activos; nodeIntegration desactivado. |
| Métricas y conexión | HUD recibió CPU/RAM y mostró Core online. |
| Terminal Windows | Invocación real `window.jarvis.openTerminal()` mediante IPC: PowerShell iniciado. |
| Inspección visual | Captura del renderer inspeccionada: núcleo, texto, métricas, panel de conversación y controles legibles. |
| Ubuntu | Ubuntu 26.04.1/WSL2: sintaxis, 6 pruebas del Core, 5 casos con Ollama real y HUD por X11 y Wayland aprobados. |
| Ventana Windows | Arrastre real mediante eventos de ratón sobre el encabezado, minimizar desde el botón del HUD y restaurar comprobados. Se restauran cursor y posición de la ventana al terminar. |
| Transparencia Windows | Ventana sin título nativo, estilo de composición Windows y píxel transparente en esquina de captura comprobados. |
| Presentación de errores | Servicio no disponible, modelo ausente e incompatible mostrados en HUD; controles restaurados. Verificados en Windows y en ambos backends gráficos de WSLg. |

Las pruebas iniciales del HUD se ejecutaron con ventana oculta. Después se añadió una prueba Windows visible que arrastra el encabezado con el ratón y comprueba minimizar/restaurar y estilos nativos de composición. No se ha validado comportamiento con varios monitores. En Wayland se mostró brevemente la ventana para asegurar el repintado; las pruebas automatizadas de arrastre físico son específicas de Windows.

Evidencias regenerables, excluidas de Git: `artifacts/phase1-ollama.json` y `artifacts/phase1-hud.png`. El JSON registra tiempos y resultados, sin token de sesión.

Evidencia adicional de esta ejecución: `artifacts/error-{offline,missing,incompatible}/phase1-hud.png` en Windows, y `artifacts/wsl/ubuntu26-{x11,wayland}/` con capturas de conversación/cancelación y los tres errores. El reporte Linux está en `artifacts/wsl/ubuntu26-wslg/phase1-ollama.json`.

## Comandos de reproducción

```sh
npm ci
npm run check
npm test
npm run test:desktop
npm run validate:ollama
npm run validate:desktop
npm run validate:errors
npm run validate:window
```

- `test:desktop` no requiere Ollama: comprueba conexión y métricas y genera una captura.
- `validate:ollama` requiere Ollama real y los modelos `llama3.1:8b` y `nomic-embed-text:latest` por defecto. No descarga modelos. Acepta `OLLAMA_URL`, `OLLAMA_MODEL` y `OLLAMA_EMBED_MODEL` desde el entorno.
- `validate:desktop` requiere entorno gráfico y Ollama; usa `llama3.1:8b` por defecto o `OLLAMA_MODEL`. Prueba conversación y cancelación, captura el HUD y abre una terminal interactiva que puede cerrarse después de la prueba.
- La validación del servicio no disponible usa un puerto cerrado, sin modificar el servicio del usuario.
- Los scripts de validación fallan con código distinto de cero ante errores; no convierten ausencia de dependencias en aprobación.
- `validate:errors` comprueba los tres errores desde el formulario del HUD y conserva capturas separadas. Requiere Ollama para los casos de modelos ausente/incompatible.
- `validate:window` es exclusivo de Windows: muestra la ventana, mueve brevemente el cursor y comprueba arrastre, minimizar/restaurar, ausencia de marco nativo y transparencia. Restaura el cursor y la posición al finalizar.
- `MIJARVIS_ARTIFACT_DIR` permite separar evidencias por plataforma/caso. No debe apuntarse al mismo directorio desde pruebas simultáneas.

## Matriz Ubuntu definida para la fase 1

Alcance objetivo: Ubuntu Desktop amd64, usuario sin privilegios, Node.js 24+, escritorio GNOME y terminal instalada. Definir un objetivo no certifica que ya funcione.

| Versión | Sesión | Nivel objetivo | Validación actual |
| --- | --- | --- | --- |
| Ubuntu 24.04 LTS | X11 con compositor | Base de compatibilidad | Pendiente |
| Ubuntu 24.04 LTS | Wayland | Compatibilidad de escritorio; comprobar restricciones del compositor | Pendiente |
| Ubuntu 26.04 LTS | Wayland | Versión LTS adicional objetivo | Pendiente |
| Ubuntu 26.04 LTS | X11, si la sesión está disponible | Verificación adicional, sin exigir instalar otro escritorio | Pendiente |
| Ubuntu 26.04.1 / WSL2 + WSLg 1.0.79 | X11 mediante XWayland | Validación funcional adicional | Aprobada con limitaciones indicadas abajo |
| Ubuntu 26.04.1 / WSL2 + WSLg 1.0.79 | Wayland nativo | Validación funcional adicional | Aprobada con advertencias GPU |

Otras versiones, arquitecturas, servidores sin escritorio y WSL no forman parte de la certificación inicial. WSL con un servidor gráfico tampoco sustituye por sí solo las pruebas de Ubuntu Desktop.

WSLg se incorpora como entorno adicional de validación funcional, sin ampliar por ello la certificación a GNOME ni a todas las versiones objetivo.

## Ejecución real en WSL

Entorno: usuario Linux normal `jccp33`, Ubuntu 26.04.1 LTS amd64, kernel `6.18.54.1-microsoft-standard-WSL2`, WSLg 1.0.79, `DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`. Node.js nativo 24.15.0 y Electron Linux 44.7.2; sandbox activo durante todas las pruebas.

Se creó una copia de código bajo `~/.cache/mijarvis-phase1.*/project`, con dependencias Linux propias. La ubicación exacta queda en `~/.cache/mijarvis-phase1-current`. No se reutilizaron ni modificaron los `node_modules` Windows. El archivo de Node descargado de nodejs.org se verificó contra su SHA-256 publicado.

Bibliotecas instaladas mediante apt: `libnss3`, `libasound2t64` y `xterm`, con sus dependencias. El adaptador `x-terminal-emulator` quedó resuelto a `/usr/bin/lxterm`; su apertura real mediante IPC pasó en X11 y Wayland. La primera prueba de Electron detectó bibliotecas ausentes y pasó después de instalarlas.

Resultados Linux:

- Sintaxis y 6 pruebas del Core: aprobadas.
- Generación real: 65 eventos de token, respuesta en español, aproximadamente 22,8 s en esta ejecución.
- Cancelación y solicitud posterior: aprobadas.
- Conexión no disponible, HTTP 404 por modelo ausente y HTTP 400 por modelo de embeddings: aprobados.
- Conversación y cancelación desde HUD, métricas CPU/RAM, aislamiento Electron y apertura de terminal: aprobados por X11 y Wayland.
- Presentación de los tres errores y recuperación de controles: aprobadas por ambos backends; capturas guardadas e inspeccionadas.

Ollama permaneció en Windows. WSL estaba en red NAT y su localhost no alcanzaba el localhost del host. Para esta ejecución se usó un puente temporal en la interfaz privada WSL, limitado a la IP del invitado y a los endpoints necesarios. Se detuvo al terminar; no se alteró la configuración de Ollama ni se abrió su escucha a la red general. El reporte valida el Core y HUD Linux contra inferencia real en Windows; no certifica instalación ni aceleración de Ollama dentro de Linux.

Para repetir en la copia Linux existente:

```bash
validation_dir=$(cat "$HOME/.cache/mijarvis-phase1-current")
export PATH="$validation_dir/node-v24.15.0-linux-x64/bin:$PATH"
cd "$validation_dir/project"
npm run check
npm test
# Configurar un endpoint Ollama real y alcanzable antes de los siguientes comandos.
export OLLAMA_URL='http://127.0.0.1:11434'
export OLLAMA_MODEL='llama3.1:8b'
MIJARVIS_ARTIFACT_DIR=artifacts/linux-core npm run validate:ollama
MIJARVIS_ARTIFACT_DIR=artifacts/linux-x11 node scripts/smoke-desktop.js --ozone-platform=x11 --validate-ollama --validate-terminal
MIJARVIS_ARTIFACT_DIR=artifacts/linux-wayland node scripts/smoke-desktop.js --ozone-platform=wayland --show-test-window --validate-ollama --validate-terminal
MIJARVIS_ARTIFACT_DIR=artifacts/linux-x11 npm run validate:errors -- --ozone-platform=x11
MIJARVIS_ARTIFACT_DIR=artifacts/linux-wayland npm run validate:errors -- --ozone-platform=wayland --show-test-window
```

El ejemplo de localhost requiere Ollama en Linux o una configuración de red que lo haga alcanzable. El puente usado en esta ejecución ya no está activo. Esta copia es una instantánea: sincronizar cambios de código antes de repetir, conservando las dependencias Linux separadas de las Windows.

Limitaciones observadas:

- En Wayland, la ventana oculta podía suspender el repintado y agotar la prueba. Se acotó la espera de `requestAnimationFrame` y la validación Wayland se completó con ventana visible mediante `--show-test-window`.
- Wayland emitió advertencias EGL por permisos de `/dev/dri/card0` y `renderD128`; también hubo mensajes de caché de GPU. La aplicación completó los casos, pero no se certifica aceleración GPU ni rendimiento gráfico. No se desactivó sandbox ni se cambiaron permisos globales para ocultar advertencias.
- WSLg valida aplicaciones Linux integradas en Windows, no una sesión completa de GNOME. Arrastre, composición y restricciones particulares de un Ubuntu Desktop nativo siguen sujetos a la matriz de certificación.
- Quedan sin ejecutar Ubuntu 24.04 y Ubuntu 26.04 en escritorio GNOME nativo/VM. No se registran como aprobados.

Referencias de reproducción: [aplicaciones gráficas WSL](https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps) y [redes de WSL](https://learn.microsoft.com/en-us/windows/wsl/networking).

Las versiones LTS se eligen como política del proyecto por su ciclo de mantenimiento. Referencia: [ciclo oficial de Ubuntu](https://ubuntu.com/about/release-cycle). Las capacidades de ventana se contrastan con la [documentación de Electron](https://www.electronjs.org/docs/latest/api/browser-window); el resultado depende de la sesión gráfica y debe registrarse en cada ejecución.

## Procedimiento manual Windows/Ubuntu

1. Registrar sistema, compilación/versión, CPU/GPU, memoria, versión de Node y Electron. En Ubuntu registrar `echo "$XDG_SESSION_TYPE"` y `echo "$XDG_CURRENT_DESKTOP"`.
2. Instalar dependencias con `npm ci`, usando usuario normal. Comprobar Ollama y modelos con `ollama list`.
3. Ejecutar sintaxis, pruebas del Core y los tres scripts de escritorio/Ollama anteriores; guardar evidencias por versión y sesión sin sobrescribir las de otras máquinas.
4. Iniciar el escritorio según el shell descrito en README. Verificar ausencia de marco, mover por el encabezado, redimensionar, minimizar/restaurar y observar transparencia sobre el escritorio real.
5. Verificar que CPU/RAM cambian durante actividad y que el texto sigue legible al tamaño mínimo y con el escalado del sistema.
6. Consultar equipo y comparar con `hostname`. Pulsar Abrir terminal y comprobar que aparece una terminal interactiva utilizable; cerrarla al terminar.
7. Enviar una pregunta corta en español y observar texto incremental, estado de procesamiento y retorno a reposo. El chat de fase 1 no conserva contexto entre mensajes.
8. Solicitar una respuesta larga y pulsar Detener. Confirmar que cesan los tokens y se puede enviar otra pregunta.
9. Probar endpoint sin servicio y modelos ausente/incompatible mediante el script de validación. Verificar también presentación del error en la UI al iniciar con esos ajustes; restaurar después el modelo válido.
10. Cerrar la ventana y comprobar que el proceso de la aplicación y el Core terminan sin dejar el puerto abierto. No cerrar procesos ajenos de Electron u Ollama.
11. Registrar aprobado/fallido, evidencia y limitación por caso. Corregir fallos y repetir solo los casos afectados y su regresión.

En Ubuntu, comprobar `command -v x-terminal-emulator`; si falta, configurar una terminal compatible antes de validar. No desactivar el sandbox para ocultar problemas de instalación. Registrar fallos de librerías del sistema, GPU o permisos tal como ocurran.

## Criterio de cierre y pendientes

- [x] Conversación, streaming y cancelación contra Ollama real por Core y HUD.
- [x] Errores de conexión y modelos verificados.
- [x] Captura del HUD, métricas y lanzamiento de terminal comprobados en Windows.
- [x] Matriz Ubuntu y comandos por shell definidos.
- [x] Completar interacción nativa de ventana Windows y comprobar presentación visual de errores.
- [x] Ejecutar y registrar validación funcional Ubuntu 26.04.1/WSLg por X11 y Wayland, con limitaciones.
- [ ] Certificar la matriz Ubuntu Desktop/GNOME, incluidas las versiones aún no ejecutadas.
- [ ] Crear referencia estable en Git: pospuesto por el usuario; repositorio y `origin` ya existentes, sin commits.

Las tareas de validación funcional pendientes se completaron en los entornos disponibles. Git continúa explícitamente pospuesto. El cierre de la certificación multiplataforma completa sigue condicionado a la matriz Ubuntu Desktop/GNOME; no confundir validación funcional WSLg con esa certificación.
