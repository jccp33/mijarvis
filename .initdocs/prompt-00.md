Actúa como un Arquitecto de Software Senior y Desarrollador Full-Stack especializado en agentes de IA y sistemas embebidos/escritorio. Necesito que diseñes e inicies la estructura del código base para un Asistente Personal estilo "JARVIS" que sea híbrido (interfaz futurista HUD + arquitectura modular de comandos) y estrictamente multiplataforma (compatible con Windows 11 y Ubuntu Linux).

---

### 1. OBJETIVO DEL PROYECTO
Crear un asistente de escritorio en segundo plano que combine una interfaz de usuario visualmente impresionante estilo Sci-Fi/Cyberpunk con un backend ligero capaz de procesar voz, ejecutar modelos de lenguaje locales o en nube y controlar funciones del sistema operativo de manera adaptativa según la plataforma donde se ejecute.

---

### 2. ARQUITECTURA TÉCNICA Y STACK RECOMENDADO

#### A. Frontend (HUD / UI Futurista)
- **Framework:** Tauri (Rust + HTML/CSS/JS) o Electron. Debe soportar ventanas flotantes, frameless (sin bordes) y con transparencia real (`transparent: true`, `decorations: false`).
- **Visualización:** WebGL / Three.js / Canvas 2D para generar un núcleo holográfico o anillos de audio reactivos según el estado del agente (Listening, Thinking, Speaking).
- **Métricas:** Monitoreo gráfico interactivo de CPU, RAM y GPU en tiempo real.

#### B. Backend / Core Engine
- **Lenguaje recomendante:** Node.js (TypeScript) o Python.
- **Comunicación UI <-> Backend:** WebSockets o IPC de alta velocidad.
- **Pipeline Audio:**
  - **Wake Word:** Integración con `openWakeWord` o `Porcupine` (Wake word: "Jarvis").
  - **Speech-to-Text (STT):** `faster-whisper` / `whisper.cpp` (procesamiento de voz local eficiente).
  - **Text-to-Speech (TTS):** `Piper-TTS` (local y ultrarrápido) o `Edge-TTS`.
- **Motor de IA (LLM):** Conexión vía API REST/HTTP a Ollama en local (`http://localhost:11434`) con fallback opcional a APIs en la nube (OpenAI / Anthropic / Gemini).

#### C. Capa de Abstracción del Sistema Operativo (OS Layer)
Diseñar un módulo de comandos con patrón *Strategy* o *Adapter* para ejecutar acciones del sistema aislando la plataforma:
- **Windows 11:** Lanzamiento de comandos vía PowerShell / Win32 API.
- **Ubuntu Linux:** Lanzamiento de comandos vía Bash / D-Bus / `xdotool` o `wtype`.

---

### 3. REQUERIMIENTOS ENTREGABLES EN ESTA PRIMERA FASE

Por favor, proporcióname la siguiente estructura inicial para arrancar el desarrollo:

1. **Estructura de Directorios del Proyecto:** Una arquitectura limpia monorepo o modular (separando UI, Core Engine y OS Adapters).
2. **Capa del OS (Código de Ejemplo):** Un módulo en Node.js/TypeScript o Python (`SystemController`) que detecte el OS y exponga métodos unificados como:
   - `openTerminal()`
   - `getSystemStats()` (CPU/RAM usando `psutil` o equivalente)
   - `runSystemCommand(cmd)`
3. **Cliente Ollama & WebSocket Server:** Un servidor básico que escuche eventos de la UI, reenvíe el prompt a la API local de Ollama y devuelva la respuesta en streaming.
4. **Configuración Inicial del Frontend (Tauri/Electron):** Estructura básica del HTML/CSS con transparencia, CSS neumórfico o estilo HUD Sci-Fi y la conexión WebSocket con el backend.

Empieza proporcionando la estructura de carpetas sugerida y el código inicial funcional de la **Capa de Abstracción del Sistema Operativo** y el **Servidor Core**.