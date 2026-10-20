# Continuidad: siguiente sesión

## Estado al 20 de octubre de 2026

Fase 2 completada: contrato de proveedores, historial por conversación, presupuesto y recorte, política de turnos incompletos, gestión desde HUD, almacenamiento versionado recuperable, ajustes compartidos, disponibilidad/modelos, reintento y diagnóstico.

Leer validacion-fase-2.md para arquitectura, esquema, precedencia y evidencias; contexto-conversacion.md para presupuesto. La UI permite nueva conversación, selección, borrado y ajustes de modelo, servidor e idioma de las respuestas. El historial se conserva tras reiniciar. Solo se guardan pares completados. No hay fallback de nube ni ejecución autónoma.

## Próxima tarea

Iniciar Fase 3: comparar y seleccionar STT/TTS según español, latencia, memoria, licencia y soporte Windows/Ubuntu. Revisar reglas.md, tareas.md y el estado real de Git antes de editar. No elegir motores sin comprobar distribución de binarios/modelos y licencia. Mantener la regla NO ROMPER LO QUE YA FUNCIONA.

## Validación

Sintaxis y 27 pruebas en Windows y Linux. Escenario integral del HUD aprobado en Windows y Ubuntu 26.04.1/WSLg por X11 y Wayland: ajustes, cambio de servidor/modelo/idioma, aislamiento, reintento, cancelación, borrado y restauración tras dos arranques. Capturas inspeccionadas.

Ollama real en Windows con llama3.2:latest y CPU: streaming, cancelación, recuperación y recuerdo de azul7319 después de reiniciar el Core. Errores por servicio no disponible y modelos ausente/incompatible comprobados también desde el HUD.

Se corrigió el permiso de lectura/ejecución de node_modules/electron/dist para ALL APPLICATION PACKAGES. Las pruebas gráficas se ejecutaron fuera del aislamiento de herramientas de Codex, con sandbox de Electron activo. Wayland mantiene advertencias EGL por permisos de GPU. Ubuntu Desktop/GNOME y Ubuntu 24.04 siguen sin certificar.

## Datos y entorno

- Ambos puntos de entrada cargan .env raíz (o MIJARVIS_ENV_FILE); el entorno existente prevalece. Arranque: iniciales < guardados < .env < entorno < opciones explícitas. Guardar en UI aplica de inmediato; el entorno vuelve a prevalecer al reiniciar.
- Datos: Windows LOCALAPPDATA/MiJarvis; Linux XDG_DATA_HOME/mijarvis o ~/.local/share/mijarvis. MIJARVIS_DATA_DIR permite sustituirlos. Un Core por directorio; state.lock evita escrituras de procesos concurrentes.
- state.json versión 1, escritura atómica, copias .corrupt en recuperación, versiones futuras preservadas. No se guardan turnos incompletos, tokens del Core ni credenciales. Las copias corruptas pueden conservar datos antiguos.
- Cada conversación admite 128 000 caracteres y 16 000 mensajes; máximo 100 conversaciones y 64 MB totales. Presupuesto de contexto estimado por bytes UTF-8, sin tokenizador exacto.
- Mantener dependencias Windows/Linux separadas. Copia Linux actual: ruta en ~/.cache/mijarvis-phase2-current.
- Fallo CUDA intermitente de origen no confirmado. Alternativa CPU en Git Bash: OLLAMA_MODEL=llama3.1:8b OLLAMA_NUM_CTX=2048 OLLAMA_NUM_GPU=0 npm start
- Hay cambios locales previos y de esta continuación. No se crearon commits ni se modificaron remotos.
