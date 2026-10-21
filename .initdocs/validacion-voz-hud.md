# Voz bajo demanda y reparación de terminal

Validación del 21 de octubre de 2026. La Fase 3 ya tiene captura, permisos bajo demanda, revisión de transcripción y lectura local conectados al HUD. No hay escucha permanente.

## Uso

Instalar los recursos con `npm run speech:install` y comprobarlos con `npm run speech:verify`. Mantener el botón para hablar o F8 mientras la ventana tiene foco; soltar para transcribir. Revisar/corregir y pulsar «Enviar texto revisado». «Leer respuestas» habilita TTS tras completar la respuesta del modelo. «Detener voz» interrumpe captura, síntesis o reproducción; «Detener» cancela la generación.

«Ajustes de voz» permite elegir y probar entrada/salida, voz instalada, velocidad, volumen y atajo F8/F9/Control+Shift+Space. Las preferencias tienen formato versionado en almacenamiento local del renderer. El atajo global pertenece a Fase 4.

## Implementación y protección

- Captura mediante AudioWorklet, mono PCM16 a 16 kHz, máximo 30 segundos; silencio tras señal durante 1.5 s o ausencia de señal durante 3 s finaliza la captura. Al soltar se vacía el último bloque de audio.
- Permisos de audio restringidos a la página principal, ventana propia y acción explícita con vigencia corta. Cámara y páginas ajenas permanecen denegadas. Seleccionar/listar dispositivos no inicia captura.
- La transcripción nunca se envía automáticamente. Las respuestas completas se segmentan por frases/palabras; los bloques de código se omiten al leer.
- Hablar interrumpe reproducción; TTS no activa el micrófono. Cancelación, pérdida de foco durante captura y cierre liberan tracks, contextos y procesos; se descartan resultados tardíos.
- IPC valida origen, tamaño y parámetros; no expone ejecutables ni rutas arbitrarias. Los motores se cargan bajo demanda y conservan los contratos de `voz-fase-3.md`.

## Evidencia y alcance

`npm run check` y 42 pruebas aprobadas en Windows y Ubuntu. Incluyen permiso denegado, concesión tardía tras cancelar, silencio, desconexión simulada, límite de duración, parámetros, cancelación nativa y recuperación.

`npm run validate:voice -- --real-ollama --show-test-window` valida Windows con Ollama real, STT/TTS nativos, micrófono sintético y reproducción silenciada. Comprueba revisión antes de enviar, lectura completa, permisos revocados, dispositivos enumerados, detener/pérdida de foco y controles accesibles a 760×600. Genera JSON y capturas de revisión/ajustes en `artifacts/voice-hud/`.

Ubuntu 26.04.1/WSLg ejecuta el mismo escenario con Node/Electron y motores nativos por X11 y Wayland; el proveedor LLM del escenario Linux es simulado. Evidencia en `artifacts/voice-ui-linux-x11/` y `artifacts/voice-ui-linux-wayland/`. La conversación con Ollama real en Linux conserva la validación previa de Fase 2.

También pasó `npm run validate:phase2`. Los perfiles de Electron y los datos de estas pruebas están aislados del usuario.

Pendiente de aceptación física: voz humana en micrófono real, escucha de altavoces, desconexión física y cambios de privacidad del sistema. Los errores correspondientes tienen cobertura simulada, que no certifica hardware. Ubuntu Desktop/GNOME sigue sin certificar. Whisper tiny puede confundir «Jarvis»; la revisión permite corregirlo.

## Abrir Terminal

En Windows el lanzador anterior podía informar éxito aunque no quedara una consola utilizable. Ahora PowerShell inicia una consola independiente visible, verifica un PID y devuelve errores al HUD; el botón muestra apertura, éxito o fallo y evita dobles clics mientras espera.

`node scripts/smoke-desktop.js --validate-terminal --show-test-window` pasó al pulsar el botón real, recorrer IPC y comprobar una nueva ventana visible titulada «MiJarvis Terminal» mediante la API de Windows. La prueba deja la terminal abierta. Las pruebas unitarias también rechazan respuestas de apertura incompletas. Linux conserva su adaptador `x-terminal-emulator`.
