# Continuidad: siguiente sesión

## Próxima tarea

Retomar la **Fase 2 — Conversación y configuración**, comenzando por la primera tarea pendiente de `tareas.md`:

> Definir contrato de proveedores LLM: disponibilidad, modelos, conversación, streaming y cancelación.

Esta nota prepara la continuación; no se inició la implementación de la fase 2.

## Alcance del primer paso

1. Revisar `reglas.md`, `tareas.md`, `validacion-fase-1.md` y el estado actual del repositorio antes de editar.
2. Diseñar una interfaz de proveedor independiente de Ollama: comprobar disponibilidad, listar modelos, generar una respuesta conversacional incremental y cancelar mediante `AbortSignal`.
3. Definir mensajes con roles y eventos/resultados de streaming, finalización y error. Precisar cómo se representa una respuesta incompleta o cancelada.
4. Encapsular Ollama detrás del contrato conservando el chat, streaming, cancelación, opciones de ejecución y protocolo UI/Core existentes; documentar cualquier migración necesaria.
5. Añadir pruebas significativas del contrato y ejecutar las verificaciones de regresión apropiadas.
6. Actualizar `tareas.md` solo al cumplir el alcance. El siguiente paso será historial y contexto entre turnos; no darlo por implementado al definir el contrato.

Los proveedores en nube están previstos para la fase 6. El contrato debe permitir incorporarlos, sin implementar sus integraciones en este primer paso.

## Contexto técnico que se debe conservar

- Stack acordado: JavaScript ESM, Node.js, Electron y WebSocket; monorepo con workspaces npm.
- Core: `apps/core/src/`; escritorio: `apps/desktop/src/`; sistema: `packages/system/src/`.
- La fase 1 cuenta con validación funcional en Windows y Ubuntu 26.04.1/WSL2/WSLg por X11 y Wayland. No equivale a certificación Ubuntu Desktop/GNOME ni Ubuntu 24.04.
- El chat actual procesa prompts independientes; todavía no mantiene memoria conversacional.
- El renderer está aislado, las conexiones locales usan token y los comandos del sistema están restringidos. Mantener estas garantías y la regla «NO ROMPER LO QUE YA FUNCIONA».
- Al guardar esta nota existe el commit `686afa3` (`feat: inicia MiJarvis con Electron, Core Node.js e integración Ollama`). Algunas notas históricas todavía mencionan un commit pendiente. Verificar Git al retomar; no usar esas notas como estado actual ni modificar commits/remotos sin necesidad.

## Incidente CUDA y alternativa comprobada

Ollama falló intermitentemente con HTTP 500 y `CUDA error: shared object initialization failed`. Se encontró una RTX 3050 de 4 GB y reparto CPU/GPU; no se confirmó la causa definitiva del fallo.

Se añadieron opciones de solicitud `OLLAMA_NUM_CTX` y `OLLAMA_NUM_GPU` en `apps/core/src/ollama.js`. Si se omiten, se preservan los valores de Ollama. Se añadió un error comprensible para ese fallo CUDA y pruebas de opciones y manejo del error.

Inicio comprobado para evitar CUDA desde **Git Bash**, que es el shell usado por el usuario:

```bash
OLLAMA_MODEL=llama3.1:8b OLLAMA_NUM_CTX=2048 OLLAMA_NUM_GPU=0 npm start
```

La generación CPU real devolvió «Listo» en aproximadamente 10,5 segundos. La última verificación registrada pasó sintaxis y 8 pruebas del Core. No asumir que el problema CUDA quedó corregido: la CPU es una alternativa comprobada.

El escritorio lee variables del entorno del proceso; `.env` se carga únicamente con `npm run core`. Las dependencias de Windows y Linux deben mantenerse separadas. El puente temporal WSL → Ollama Windows se detuvo al terminar las pruebas anteriores.

## Instrucción breve para retomar

«Lee `.initdocs/siguiente-sesion.md` e inicia la primera tarea de la Fase 2: contrato de proveedores LLM, preservando las capacidades actuales.»
