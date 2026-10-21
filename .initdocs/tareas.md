# MiJarvis: tareas para completar el proyecto

## Objetivo y alcance

Crear un asistente de escritorio residente para Windows 11 y Ubuntu, con interfaz Sci-Fi/Cyberpunk, procesamiento de voz, modelos locales o en nube y control del sistema adaptado a cada plataforma.

Stack base acordado: JavaScript ESM, Node.js, Electron y WebSocket. Las integraciones de audio pueden usar ejecutables nativos administrados desde Node.js; su selección debe comprobar compatibilidad, distribución y licencia.

Esta lista parte de los requisitos de `prompt-00.md` y de la base implementada. `[x]` indica implementación existente; no implica validación completa en ambas plataformas. `[ ]` indica trabajo pendiente. Cada fase termina al cumplir su criterio de aceptación. Preservar las capacidades existentes conforme a `reglas.md`.

## Fase 1 — Base técnica y validación inicial

- [x] Separar escritorio, Core y adaptadores del sistema mediante workspaces npm.
- [x] Crear servidor Core local con WebSocket autenticado y endpoint de salud.
- [x] Integrar Ollama con respuestas en streaming, cancelación y tiempo límite.
- [x] Crear `SystemController` con detección de plataforma, terminal, CPU/RAM y comandos permitidos.
- [x] Crear HUD inicial transparente, sin marco, con animación de actividad y telemetría.
- [x] Aislar el renderer de Electron mediante preload, sandbox y validación de IPC.
- [x] Añadir pruebas del Core y prueba de arranque oculta del escritorio.
- [x] Documentar instalación y ejecución básica.
- [x] Validar conversación, streaming y cancelación contra Ollama real (Core y HUD automatizados; ver `validacion-fase-1.md`).
- [x] Comprobar errores por servicio no disponible, modelo ausente y modelo incompatible.
- [x] Inspeccionar captura del HUD y comprobar métricas y apertura real de terminal en Windows.
- [x] Comprobar interacción nativa de ventana Windows y comprobar presentación visual de errores.
- [x] Definir versiones de Ubuntu objetivo y matriz X11/Wayland (certificación pendiente de ejecución).
- [x] Ejecutar las verificaciones disponibles en Ubuntu 26.04.1 bajo WSL2/WSLg y registrar limitaciones.
- [x] Documentar comandos de inicio para PowerShell, Git Bash y Bash de Ubuntu.
- [x] Establecer una referencia estable de esta fase en Git.

Resultados y procedimiento reproducible: [validacion-fase-1.md](validacion-fase-1.md).

Estado: validación funcional completada en Windows y Ubuntu 26.04.1/WSLg. El repositorio Git ya existe con remoto `origin`, sin commits; crear la referencia estable continúa pospuesto. La matriz de Ubuntu Desktop/GNOME conserva su certificación pendiente; WSLg no la sustituye.

**Aceptación:** inicio reproducible, conversación real y controles básicos comprobados en Windows y Ubuntu; resultados y limitaciones documentados.

## Fase 2 — Conversación y configuración

Depende de la validación del Core de la fase 1.

- [x] Definir contrato de proveedores LLM (ver `contrato-proveedores.md`).
- [x] Añadir historial por conversación con roles y contexto entre turnos (persistente por conversación, con roles y selección).
- [x] Limitar contexto y tamaño del historial según el modelo.
- [x] Definir recorte o resumen (por pares completos, presupuesto conservador y reserva de salida; contexto-conversacion.md).
- [x] Definir cómo tratar turnos cancelados, fallidos o incompletos al reconstruir el contexto.
- [x] Añadir nueva conversación, selección y borrado del historial.
- [x] Implementar almacenamiento local con formato versionado y recuperación ante corrupción.
- [x] Añadir configuración desde la interfaz para modelo, endpoint e idioma.
- [x] Unificar carga, precedencia y validación de ajustes entre escritorio y Core independiente.
- [x] Mostrar estado de Ollama y modelos disponibles sin exigir editar variables de entorno.
- [x] Incorporar errores comprensibles, reintento manual y diagnóstico básico.
- [x] Verificar continuidad de contexto, aislamiento entre conversaciones y borrado efectivo.

**Aceptación:** el usuario puede configurar el modelo, mantener una conversación con contexto y gestionar su historial desde la aplicación.

Resultado y evidencia: [validacion-fase-2.md](validacion-fase-2.md). Implementación y aceptación funcional completadas en Windows y Ubuntu 26.04.1/WSLg por X11 y Wayland. La certificación Ubuntu Desktop/GNOME continúa fuera de esta validación.

## Fase 3 — Voz bajo demanda

Depende de la fase 2 para mantener contexto en conversaciones habladas.

- [x] Comparar y seleccionar STT/TTS según español, latencia, memoria, licencia y soporte Windows/Ubuntu.
- [x] Definir instalación, versiones, ubicación y verificación de binarios y modelos de audio.
- [x] Diseñar interfaces de captura, transcripción y síntesis desacopladas del proveedor.
- [x] Solicitar permiso de micrófono únicamente al activar una función de voz.
- [x] Permitir seleccionar y probar micrófono y salida de audio.
- [x] Implementar pulsar para hablar mediante botón y atajo configurable.
- [x] Limitar duración de captura y detectar silencio o ausencia de señal.
- [x] Integrar STT local y mostrar la transcripción antes de enviar o permitir corregirla.
- [x] Integrar TTS local con selección de voz, velocidad y volumen.
- [x] Dividir respuestas en segmentos reproducibles sin leer tokens incompletos.
- [x] Añadir controles para detener captura, generación y reproducción.
- [x] Evitar que la salida de voz reactive la captura; definir interrupción mientras Jarvis habla.
- [x] Liberar dispositivos, procesos y archivos temporales al cancelar o cerrar.
- [x] Probar permisos denegados, desconexión del micrófono y errores del motor de audio.

**Aceptación:** completar voz → texto → modelo → voz en ambas plataformas, con cancelación y recuperación de errores.

Implementación integrada y validada con audio sintético: [validacion-voz-hud.md](validacion-voz-hud.md). Motores y contratos: [voz-fase-3.md](voz-fase-3.md). Pendiente la aceptación con micrófono/altavoces físicos y Ubuntu Desktop; las casillas reflejan implementación.

## Fase 4 — Ejecución en segundo plano y activación por voz

Depende de la fase 3; la escucha permanente debe ser opcional.

- [ ] Añadir bandeja del sistema con mostrar/ocultar, estado, silenciar y salir.
- [ ] Diferenciar cerrar la ventana, minimizar a bandeja y terminar la aplicación.
- [ ] Evitar múltiples instancias y permitir recuperar la ventana desde un segundo inicio.
- [ ] Añadir atajo global configurable para invocar el asistente y manejar conflictos.
- [ ] Añadir inicio con sesión del usuario, desactivado hasta que se configure.
- [ ] Seleccionar motor wake word compatible y verificar disponibilidad/licencia de “Jarvis”.
- [ ] Implementar escucha local opcional, pausa y detección de activación.
- [ ] Mostrar de forma persistente cuándo el micrófono está activo.
- [ ] Ajustar sensibilidad y medir falsas activaciones con voz, ruido y audio del equipo.
- [ ] Reducir trabajo del HUD cuando esté oculto y medir consumo en reposo y escucha.
- [ ] Recuperar audio, modelo y conexión tras suspensión, reanudación o cambio de dispositivo.

**Aceptación:** Jarvis permanece disponible en bandeja, se invoca por atajo o voz y permite detener completamente la escucha y salir.

## Fase 5 — Acciones del sistema adaptativas

Puede comenzar después de la fase 2; integrar su uso hablado al completar la fase 3.

- [ ] Definir catálogo inicial acotado: abrir aplicaciones/carpetas, volumen, reproducción multimedia y consulta del sistema.
- [ ] Especificar esquema de cada acción: identificador, parámetros, plataforma, permisos y resultado.
- [ ] Exponer detección de capacidades para ofrecer solo acciones disponibles en el equipo.
- [ ] Implementar adaptadores Windows con PowerShell/API nativa y argumentos controlados.
- [ ] Implementar adaptadores Ubuntu con D-Bus/herramientas compatibles con X11 o Wayland.
- [ ] Validar parámetros, rutas y aplicaciones permitidas; mantener límites de tiempo y salida.
- [ ] Añadir enrutamiento entre conversación y acciones estructuradas solicitadas al modelo.
- [ ] Validar las acciones propuestas por el modelo antes de ejecutarlas.
- [ ] Definir qué acciones necesitan confirmación por su impacto y cómo se muestran al usuario.
- [ ] Mostrar progreso, resultado y fallos de cada acción; añadir cancelación cuando sea posible.
- [ ] Mantener registro local mínimo y configurable de acciones, sin secretos ni audio.
- [ ] Probar acciones no soportadas, parámetros inválidos y propuestas maliciosas o ambiguas del modelo.

**Aceptación:** órdenes por texto o voz ejecutan únicamente acciones autorizadas y disponibles, con resultados verificables en ambas plataformas.

## Fase 6 — Modelos en nube y selección de proveedor

Depende del contrato de proveedores de la fase 2. El modo local debe seguir funcionando sin nube.

- [ ] Elegir e integrar al menos un proveedor de nube; documentar cuáles quedan pendientes.
- [ ] Guardar credenciales usando almacenamiento seguro del sistema y permitir eliminarlas.
- [ ] Añadir configuración y comprobación de conexión del proveedor.
- [ ] Normalizar streaming, cancelación, errores y llamadas a herramientas entre proveedores.
- [ ] Permitir seleccionar proveedor/modelo por conversación y mostrar cuál está activo.
- [ ] Implementar fallback opcional con reglas explícitas y sin duplicar acciones del sistema.
- [ ] Pedir consentimiento antes de enviar contenido a nube y permitir restringir conversaciones a local.
- [ ] Manejar falta de red, límites de uso, credenciales inválidas y tiempos de espera.
- [ ] Mostrar uso o estimaciones de consumo cuando el proveedor los suministre.
- [ ] Probar que un fallo local no envía información a nube sin autorización.

**Aceptación:** el usuario puede elegir local o nube, identificar el destino de sus datos y mantener control del fallback y las credenciales.

## Fase 7 — Experiencia HUD y telemetría completa

Puede desarrollarse en paralelo por etapas; requiere eventos de voz y acciones para completar todos los estados.

- [ ] Definir sistema visual Sci-Fi/Cyberpunk: color, tipografía, espaciado, iconos y movimiento.
- [ ] Sustituir o ampliar el núcleo inicial con Canvas/WebGL y animación ligada a audio real.
- [ ] Unificar estados: reposo, escuchando, transcribiendo, pensando, hablando, ejecutando y error.
- [ ] Añadir medidor de entrada de audio y visualización de respuesta hablada.
- [ ] Convertir CPU/RAM en gráficos con historial y controles útiles.
- [ ] Detectar GPU y seleccionar mecanismo de métricas por plataforma/hardware.
- [ ] Mostrar “no disponible” cuando no se puedan obtener métricas GPU, sin bloquear el HUD.
- [ ] Añadir modo compacto/flotante, siempre visible opcional y persistencia de posición/tamaño.
- [ ] Validar múltiples monitores, escalado DPI, transparencia y cambios de resolución.
- [ ] Incorporar navegación por teclado, etiquetas accesibles y contraste legible.
- [ ] Respetar reducción de movimiento y ofrecer modo de bajo consumo.
- [ ] Medir fluidez y consumo con HUD visible, oculto y durante voz/inferencia.

**Aceptación:** interfaz coherente y reactiva a la actividad real, legible y fluida, con degradación adecuada en equipos o compositores limitados.

## Fase 8 — Estabilidad, distribución y entrega

La calidad se trabaja durante todas las fases; esta fase reúne los requisitos para distribuir la aplicación.

- [ ] Definir presupuestos medibles de CPU/RAM, latencia de voz, primer token y arranque en equipos de referencia.
- [ ] Medir por separado aplicación, motores auxiliares y modelos; documentar requisitos de hardware.
- [ ] Evaluar separar audio/inferencia del proceso principal para mantener la interfaz receptiva.
- [ ] Añadir logs estructurados con rotación y ocultación de datos sensibles.
- [ ] Incorporar diagnóstico exportable y recuperación controlada de procesos auxiliares.
- [ ] Versionar el protocolo UI/Core y las migraciones de configuración e historial.
- [ ] Crear CI con sintaxis y pruebas significativas en Windows y Ubuntu.
- [ ] Añadir pruebas de extremo a extremo para chat, voz, acciones y ciclo residente.
- [ ] Ejecutar pruebas prolongadas de reposo, escucha y conversaciones para detectar fugas.
- [ ] Revisar dependencias, licencias y avisos de distribución de modelos y binarios.
- [ ] Preparar instalador Windows y formato de distribución Ubuntu acordado.
- [ ] Resolver firma de paquetes y definir política de actualizaciones y recuperación de versiones.
- [ ] Crear asistente inicial para comprobar Ollama, modelos, audio y permisos.
- [ ] Validar instalación, actualización y desinstalación en equipos limpios.
- [ ] Documentar arquitectura, desarrollo, configuración, privacidad y solución de problemas.
- [ ] Publicar matriz de compatibilidad y limitaciones conocidas.

**Aceptación:** instalación reproducible sin entorno de desarrollo, funcionamiento prolongado estable y documentación suficiente para usar y mantener el asistente.

## Orden recomendado y cierre del objetivo

1. Terminar validaciones pendientes de fase 1.
2. Completar conversación/configuración de fase 2.
3. Entregar voz bajo demanda de fase 3.
4. Incorporar residencia y wake word de fase 4.
5. Completar acciones adaptativas y proveedor de nube de fases 5 y 6.
6. Consolidar el HUD de fase 7 y cerrar distribución de fase 8.

El objetivo se considera cumplido cuando una instalación limpia en Windows 11 y Ubuntu permite mantener Jarvis en segundo plano, invocarlo, conversar por voz con un modelo local o de nube elegido por el usuario y ejecutar el catálogo de acciones compatibles, con HUD reactivo, control de permisos y recuperación de errores. Registrar evidencia por plataforma antes de marcar una fase como terminada.
