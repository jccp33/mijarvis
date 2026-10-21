# Fase 3: base local de voz

Actualización: 21 de octubre de 2026. Selección de motores, instalación verificable y contratos con adaptadores STT/TTS. La integración de captura, permisos, dispositivos, pulsar para hablar, revisión y reproducción en el HUD ya está implementada; ver [validacion-voz-hud.md](validacion-voz-hud.md). Este documento conserva la comparación y las mediciones iniciales de los motores. La aceptación con audio físico sigue pendiente.

## Selección técnica

Se selecciona **sherpa-onnx 1.13.8, CPU, Windows/Linux x64**, usando Whisper tiny multilingüe INT8 para STT y VITS/Piper `es_MX-claude-high` para TTS. Una distribución nativa ofrece ambos ejecutables y evita incorporar Python o un addon con ABI de Electron. La ejecución se aísla en procesos cancelables; no se usa GPU ni un servicio en nube. Los binarios para otras arquitecturas existen en upstream, pero no se han incorporado al catálogo del proyecto.

La elección es una base de integración, no una comparación experimental exhaustiva de todos los motores. Hay que evaluar precisión con voz humana, ruido y acentos antes de cerrar la aceptación de la fase. En las pruebas sintéticas tiny confundió el nombre Jarvis; la revisión del texto antes de enviarlo será necesaria.

| Opción | Español y plataforma | Latencia/memoria y decisión |
| --- | --- | --- |
| sherpa-onnx + Whisper tiny INT8 | Multilingüe; ejecutables Windows/Linux; runtime Apache-2.0 y Whisper MIT | Seleccionado: modelos encoder/decoder INT8 de unos 98 MiB combinados; memoria real depende del runtime. Mediciones locales abajo. Unifica ejecución con TTS. |
| whisper.cpp | Multilingüe, CPU, Windows/Linux; MIT | Alternativa válida. La documentación publica unos 273 MB de memoria para tiny; ese dato no se extrapola a sherpa. No se añade un segundo runtime STT en este primer paso. |
| Vosk small-es-0.42 | Español, modelo de 39 MB; Apache-2.0 | Alternativa para reconocimiento incremental. Su catálogo estima unos 300 MB de RAM para modelos pequeños en general. No se midió aquí ni se compara su precisión con nuestro fixture. |
| faster-whisper | Whisper mediante CTranslate2; MIT, paquete Python | Alternativa con INT8. Añadiría otro entorno de ejecución; no se midió en este equipo. |
| Piper actual como CLI independiente | Voces españolas; motor GPL-3.0; CLI Python | Se utiliza una voz compatible mediante sherpa en lugar de incorporar también este runtime. No se atribuye la licencia del motor a las voces. |

Fuentes primarias: [sherpa y binarios Windows](https://k2-fsa.github.io/sherpa/onnx/install/windows/generated/download/windows_x64.html), [licencia sherpa](https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.8/LICENSE), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [Vosk y sus modelos](https://alphacephei.com/vosk/models), [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [Piper actual](https://github.com/OHF-Voice/piper1-gpl).

## Licencias y recursos

- Runtime sherpa: Apache-2.0. El paquete TTS utiliza además eSpeak NG y sus datos; eSpeak NG publica GPL-3.0. El conjunto de binarios y dependencias no debe describirse como exclusivamente Apache-2.0. [Fuente eSpeak](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING).
- Whisper original: MIT. Se usa la conversión ONNX publicada por sherpa. [Licencia original](https://github.com/openai/whisper/blob/main/LICENSE).
- El repositorio Piper voices declara MIT en sus metadatos; la ficha específica de Claude indica dataset Apache-2.0. Se conservan las referencias por componente y no se supone que licencia de dataset, voz, runtime y dependencias sean intercambiables. [Repositorio de voces](https://huggingface.co/rhasspy/piper-voices/blob/main/README.md), [ficha Claude](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/claude/high/MODEL_CARD).

Esta instalación es para desarrollo local. Los binarios y modelos quedan fuera de Git; no se preparó su redistribución en instaladores. El inventario completo de avisos, licencias y fuentes de dependencias al empaquetar pertenece a la Fase 8.

## Instalación reproducible

Desde la raíz del proyecto, con Node 24 y `tar` disponibles:

```sh
npm run speech:install
npm run speech:verify
npm run validate:speech
```

En Ubuntu hace falta además `bzip2` (`sudo apt install bzip2`). Se utiliza explícitamente ese descompresor porque el tar de la instalación WSL intentaba usar lbzip2, ausente. No se requiere Python, FFmpeg ni un compilador para esta instalación.

Ubicación por defecto: `.cache/speech/win32-x64` o `.cache/speech/linux-x64`, relativa al proyecto, independiente de los datos del chat. `MIJARVIS_SPEECH_DIR` puede indicar otra carpeta absoluta o relativa a la raíz del proyecto. Estos scripts leen el entorno del proceso y no cargan `.env` por sí mismos. El instalador también admite `--directory` y `--cache`. Se instala nativamente en cada plataforma; no se comparten binarios Windows con Linux.

```sh
npm run speech:install -- --directory /ruta/recursos-voz
npm run speech:verify -- --directory /ruta/recursos-voz
```

Para usar esa carpeta con `validate:speech`, definir `MIJARVIS_SPEECH_DIR` en el entorno. El chat no necesita estos archivos ni los carga al iniciar.

El catálogo `apps/core/src/speech/catalog.js` fija URLs, tamaños y SHA-256 de cuatro archivos oficiales: dos runtimes por plataforma y dos modelos compartidos. Cada instalación descarga solo su runtime; son unos 208 MB para Windows o 212 MB para Linux comprimidos. Los archivos originales se conservan en `.cache/speech-downloads/`. El paquete STT incluye también modelos sin cuantizar, pero el adaptador utiliza los dos INT8.

Los digests del runtime y del paquete de voz proceden de la API de releases de GitHub. El release antiguo de Whisper tiny no publica digest: su SHA-256 se midió en esta sesión sobre la descarga HTTPS oficial y quedó fijado para posteriores instalaciones; no es una firma ni un checksum independiente publicado por upstream.

El instalador comprueba caché/descargas antes de extraer, valida los nombres del archivo, usa una carpeta de preparación y publica la instalación al terminar. No sobrescribe carpetas existentes. Un bloqueo evita instalaciones simultáneas sobre el mismo destino; si una interrupción deja un `.install.lock`, comprobar que no haya instalador activo antes de retirarlo. Para actualizar, elegir una carpeta nueva.

`speech-install.json`, versión 1, registra versión/plataforma/arquitectura, archivos, enlaces internos y hashes. `speech:verify` y la creación del adaptador comprueban el inventario, incluidos modelos y bibliotecas. Rechazan cambios, archivos adicionales, recursos ausentes, enlaces externos y plataformas incorrectas. Esto verifica integridad de una instalación cuyo manifiesto es local, no protege frente a alguien capaz de modificar también el manifiesto o el código del proyecto.

## Contratos desacoplados

El código de proveedores está en `apps/core/src/speech/`. `createSherpaSpeech({root, temporaryDirectory})` verifica recursos al crear el proveedor y expone:

| Operación implementada | Entrada | Salida |
| --- | --- | --- |
| transcribe | wav: Uint8Array, language: es/en, signal opcional | text, language, durationSeconds |
| synthesize | text, voice, speed, signal opcional | wav: Buffer, voice, sampleRate, durationSeconds |
| voices | propiedad de solo lectura por convención | Perfil instalado es_MX-claude-high |
| cancel | sin argumentos | Solicita abortar la operación activa |
| close | sin argumentos | Aborta, espera limpieza y cierra el servicio |

Una operación por instancia; una segunda concurrente se rechaza. Estos adaptadores no capturan ni reproducen audio: el escritorio coordina esas etapas y la revisión antes de enviar al chat. La entrada STT es WAV PCM16 mono, 16 kHz, hasta 30 segundos. Se rechazan señal de energía prácticamente nula, WAV malformado y resultados vacíos o demasiado largos. La energía no sustituye un VAD ni garantiza que haya habla. La síntesis recibe hasta 1000 caracteres por segmento, una voz instalada y velocidad entre 0.5 y 2. El reproductor del escritorio aplica volumen.

`runNative` usa argumentos separados, sin shell, ventana oculta en Windows, salida combinada limitada a 256 KiB y plazo de 120 segundos. Usa CPU y dos hilos. `--` separa el texto de las opciones, incluso si comienza por `--config`. No se muestran ni registran stderr con el texto sintetizado. Al cancelar espera el cierre del proceso, con terminación forzada de respaldo, antes de limpiar archivos. Cada trabajo usa una carpeta temporal propia; el audio generado se devuelve en memoria y su archivo se elimina. Si hay un fallo de permisos en la limpieza, se propaga el error.

La conversión `toMono16k` es una utilidad offline PCM para las pruebas; usa promediado simple y no es un resampler de alta fidelidad. No activa dispositivos.

Se definen también estos contratos para la siguiente integración; **todavía no están implementados**:

| Adaptador futuro | Contrato y responsabilidad |
| --- | --- |
| CaptureProvider | listInputs(); start({deviceId, signal, onLevel}) -> sesión; sesión.finish() -> WAV PCM16 mono 16 kHz; sesión.cancel() libera tracks y AudioContext sin transcribir. Permiso solo tras acción del usuario. |
| PlaybackProvider | listOutputs(); play({wav, deviceId, volume, signal}) -> Promise al terminar; stop()/close() liberan reproducción y recursos. Sin micrófono ni envío a modelo. |
| VoiceController del HUD | Coordina reposo/captura/transcripción/revisión/generación/síntesis/reproducción. Nunca inicia captura desde TTS. Revisa/corrige transcripción antes de enviar. Cancela la etapa activa y descarta resultados tardíos. |

El main de Electron valida remitente IPC, límites del audio y selección de acciones; no expone ejecutables ni rutas arbitrarias al renderer. La captura usa entrada explícita y eventos de desconexión; el reproductor gestiona volumen/dispositivo. La cola reproduce segmentos de respuestas completas. Los permisos y el atajo local pertenecen al escritorio; no hay endpoints de audio nuevos en el servidor Core.

## Verificación del primer avance

`npm run check` y `npm test`: sintaxis y 35 pruebas aprobadas en Windows y Ubuntu/WSL. Las ocho pruebas nuevas cubren catálogo, integridad, plataforma incorrecta, rutas fuera del directorio, WAV inválido, remuestreo, argumentos literales/Unicode, errores de motor, salida acotada, timeout, cancelación, concurrencia y limpieza.

`validate:speech` usa motores reales y una frase sintética conocida. No abre el micrófono ni reproduce sonido. Guarda una muestra WAV y un reporte en `artifacts/speech/validation-*`. Comprueba síntesis, transcripción con la palabra azul, cancelación, solicitud posterior y ausencia de temporales.

| Medición, una ejecución por plataforma | Windows x64 | Ubuntu 26.04.1/WSL x64 |
| --- | --- | --- |
| TTS, proceso nuevo | 5.60 s para 3.53 s de audio | 1.20 s para 3.49 s de audio |
| STT, frase sintética convertida a 16 kHz | 1.82 s | 0.90 s |
| Transcripción observada del nombre | Jardis | Harvys |
| Cancelación y recuperación | Aprobadas | Aprobadas |

No son garantías ni una comparación controlada entre sistemas: no se controló la caché de archivos, carga o temperatura y no hay muestra humana ni una tasa de error representativa. Una medición adicional de TTS en Windows dio 2.29 s y un pico de working set de 195 928 064 bytes (unos 187 MiB). GNU time sobre toda la validación Linux registró 233 684 KiB de RSS máximo (unos 228 MiB); ese máximo del conjunto y descendientes no es directamente comparable con el working set del proceso TTS Windows. No se declara que el proceso nuevo de Windows cumpla tiempo real ni se promete latencia de conversación.

Evidencias Windows: `artifacts/speech/validation-sgcDln/` y `artifacts/speech/windows-memory.json`. Evidencia Linux copiada: `artifacts/speech-linux-mijarvis-phase3.i0Ypud/`. La copia Linux independiente está indicada en `~/.cache/mijarvis-phase3-current`. Se instaló bzip2 y se actualizó libbz2-1.0 como dependencia en WSL. No se instalaron paquetes Python ni se modificó Ollama.

## Siguiente paso

Completar aceptación con micrófono y salida físicos. El flujo integrado con audio sintético pasó en Windows y Ubuntu/WSLg X11 y Wayland; alcance y evidencia en [validacion-voz-hud.md](validacion-voz-hud.md). Después continuar residencia y activación de Fase 4.
