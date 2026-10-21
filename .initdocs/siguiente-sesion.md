# Continuidad: siguiente sesión

## Estado al 21 de octubre de 2026

Fases 1 y 2 con aceptación funcional documentada. Fase 3 implementada en el HUD: permisos bajo demanda, selección/prueba de dispositivos, pulsar para hablar, revisión antes de enviar, STT/TTS local, cancelación y liberación de recursos. Ver validacion-voz-hud.md y voz-fase-3.md. Pendiente aceptación con audio físico y Ubuntu Desktop/GNOME.

Motores elegidos para esta primera integración: sherpa-onnx 1.13.8 CPU, Whisper tiny multilingüe INT8 y VITS/Piper es_MX-claude-high. Ejecutables oficiales Windows/Linux x64 como procesos separados, sin Python ni addon de Electron. Catálogo con URLs/tamaños/hashes; instalación opcional y manifiesto de integridad local. Código: apps/core/src/speech/. Scripts: speech-assets.js y validate-speech.js.

## Próxima tarea

Completar aceptación de Fase 3 con voz humana, altavoces, permisos del sistema y desconexión física. Después continuar Fase 4: bandeja, ciclo de ventana, instancia única y atajo global antes de escucha opcional/wake word. El atajo actual F8/F9/Control+Shift+Space requiere foco.

El HUD tiene IPC de voz validado, permisos de audio temporales limitados a la página propia y reproducción por Web Audio. Mantener sandbox, revisión explícita de transcripción y separación entre captura y TTS. El botón «Abrir Terminal» fue corregido en Windows y validado contra una nueva ventana visible desde el clic real del HUD.

## Verificación de voz

Sintaxis y 42 pruebas en Windows y Linux. Flujo HUD con micrófono sintético y salida silenciada aprobado en Windows con Ollama real y Ubuntu/WSLg X11 y Wayland con LLM simulado; STT/TTS nativos en todos. Evidencia Windows final: artifacts/voice-hud/run-zwpSqb; Linux: run-8H53He (X11) y run-aQPtUF (Wayland), bajo artifacts/voice-ui-linux-*/voice-*/. También pasó validate:phase2. No se capturó voz humana ni se reprodujo sonido audible. Whisper tiny puede confundir Jarvis (Jardis/Harvys): mantener revisión.

Primera medición Windows: TTS 5.60 s para 3.53 s de audio, STT 1.82 s. Linux: TTS 1.20 s para 3.49 s de audio, STT 0.90 s. Variabilidad observada; no garantiza tiempo real. Memoria y límites detallados en voz-fase-3.md.

En WSL faltaba el descompresor; se instaló bzip2 y su dependencia libbz2-1.0. El instalador ahora verifica tar/bzip2 y fuerza el descompresor explícito en Linux. Recursos Windows en .cache/speech/win32-x64. Copia Linux en la ruta guardada en ~/.cache/mijarvis-phase3-current. Dependencias y binarios separados por plataforma.

## Contexto que conservar

- Regla NO ROMPER LO QUE YA FUNCIONA. Leer reglas.md, tareas.md y Git antes de editar.
- Fase 2: validacion-fase-2.md, contexto-conversacion.md y contrato-proveedores.md. Conversaciones y ajustes persistentes, turnos completos, recorte, diagnóstico y reintento.
- Ambos modos cargan .env raíz o MIJARVIS_ENV_FILE; entorno existente prevalece. Arranque: iniciales < guardados < .env < entorno < opciones explícitas. Guardar desde UI aplica de inmediato.
- Los scripts de audio leen variables del proceso, sin cargar .env. MIJARVIS_SPEECH_DIR elige otra instalación; no se cargan motores en el arranque actual del chat.
- Catálogo STT antiguo sin digest de upstream: hash medido de descarga HTTPS y fijado. Los otros hashes proceden de metadatos oficiales. No confundir integridad local con firma del editor.
- Licencias de runtime, dependencias y voces separadas: sherpa Apache-2.0, Whisper MIT, eSpeak NG GPL-3.0; Piper voices declara MIT y ficha Claude indica dataset Apache-2.0. Redistribución en instaladores sigue para Fase 8.
- Datos del chat Windows LOCALAPPDATA/MiJarvis; Linux XDG_DATA_HOME/mijarvis o ~/.local/share/mijarvis, sustituibles por MIJARVIS_DATA_DIR. Un Core por directorio.
- Electron requiere ejecución de pruebas fuera del aislamiento de herramientas en este entorno Windows; mantener sandbox de Electron activo. Ubuntu Desktop/GNOME y 24.04 siguen sin certificar.
- Alternativa CUDA en Git Bash: OLLAMA_MODEL=llama3.1:8b OLLAMA_NUM_CTX=2048 OLLAMA_NUM_GPU=0 npm start
- Git partió limpio en 314d9b1. No se crearon commits ni se modificaron remotos en esta continuación.
