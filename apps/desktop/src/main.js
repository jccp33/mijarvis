import { app, BrowserWindow, ipcMain, session } from 'electron';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startCore } from '@mijarvis/core';
import { SystemController } from '@mijarvis/system';

let core;
let window;
let quitting = false;
let exitCode = 0;
const token = randomBytes(32).toString('hex');
const page = new URL('./index.html', import.meta.url).href;
const smokeTest = process.argv.includes('--smoke-test');
if (smokeTest) console.log('Desktop main loaded');

function validate(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame?.url !== page) throw new Error('Unauthorized IPC');
}

app.whenReady().then(async () => {
if (smokeTest) console.log('Electron ready');
try {
  core = await startCore({ port: 0, token });
  const system = new SystemController();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ipcMain.handle('connection', event => { validate(event); return `ws://127.0.0.1:${core.port}/ws?token=${token}`; });
  ipcMain.handle('terminal', event => { validate(event); return system.openTerminal(); });
  ipcMain.on('close', event => { validate(event); window.close(); });
  ipcMain.on('minimize', event => { validate(event); window.minimize(); });
  window = new BrowserWindow({
    show: !smokeTest || process.argv.includes('--show-test-window'),
    width: 1000, height: 740, minWidth: 760, minHeight: 600,
    transparent: true, frame: false, backgroundColor: '#00000000',
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: !smokeTest,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  await window.loadURL(page);
  if (smokeTest) {
    await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { clearInterval(poll); reject(new Error('HUD failed: ' + document.getElementById('connection').textContent + ' / ' + document.getElementById('messages').textContent)); }, 8000);
      const poll = setInterval(() => {
        if (document.getElementById('connection').textContent === 'CORE ONLINE' &&
            document.getElementById('cpu').textContent !== '—') {
          clearInterval(poll); clearTimeout(timeout); resolve(true);
        }
      }, 100);
    })`);
    const preferences = window.webContents.getLastWebPreferences();
    if (!preferences.sandbox || !preferences.contextIsolation || preferences.nodeIntegration) {
      throw new Error('Unexpected desktop security configuration');
    }
    if (process.argv.includes('--validate-ollama')) {
      await window.webContents.executeJavaScript(`(async () => {
        async function waitFor(predicate) {
          const started = Date.now();
          while (!predicate()) {
            if (Date.now() - started > 125000) throw new Error('HUD conversation timed out');
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        const input = document.getElementById('prompt');
        const form = document.getElementById('prompt-form');
        const log = document.getElementById('messages');
        input.value = 'Responde con una frase breve en español: ¿qué puedes hacer como asistente?';
        form.requestSubmit();
        await waitFor(() => !document.getElementById('send').disabled);
        if (log.querySelector('.error') || !log.lastElementChild?.textContent.trim()) {
          throw new Error('HUD response failed: ' + log.textContent);
        }
        input.value = 'Escribe una lista detallada de 100 consejos para organizar archivos.';
        form.requestSubmit();
        await waitFor(() => log.lastElementChild?.textContent.trim() || !document.getElementById('send').disabled);
        if (!document.getElementById('send').disabled) throw new Error('Generation finished before cancellation');
        document.getElementById('cancel').click();
        await waitFor(() => !document.getElementById('send').disabled);
        if (!log.querySelector('.error') || !document.getElementById('cancel').disabled) {
          throw new Error('HUD cancellation did not restore controls');
        }
      })()`);
      console.log('Desktop real Ollama conversation and cancellation OK');
    }
    if (process.argv.includes('--validate-error')) {
      const error = await window.webContents.executeJavaScript(`(async () => {
        document.getElementById('prompt').value = 'Hola';
        document.getElementById('prompt-form').requestSubmit();
        const started = Date.now();
        while (!document.querySelector('#messages .error') || document.getElementById('send').disabled) {
          if (Date.now() - started > 10000) throw new Error('Expected error was not displayed');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return document.querySelector('#messages .error').textContent;
      })()`);
      if (!new RegExp(process.env.MIJARVIS_EXPECT_ERROR || '.').test(error)) throw new Error(`Unexpected UI error: ${error}`);
      console.log(`Desktop error presentation OK: ${error}`);
    }
    if (process.argv.includes('--validate-window')) {
      if (process.platform !== 'win32') throw new Error('Physical window test currently requires Windows');
      window.show();
      const handle = window.getNativeWindowHandle();
      const nativeHandle = handle.length === 8 ? handle.readBigUInt64LE().toString() : handle.readUInt32LE().toString();
      await promisify(execFile)('powershell.exe', ['-NoProfile', '-File',
        fileURLToPath(new URL('../../../scripts/validate-window.ps1', import.meta.url)), '-WindowHandle', nativeHandle],
      { windowsHide: true, timeout: 15000 });
      await window.webContents.executeJavaScript("document.getElementById('minimize').click()");
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!window.isMinimized()) throw new Error('Minimize button did not minimize the native window');
      window.restore();
      await new Promise(resolve => setTimeout(resolve, 300));
      if (window.isMinimized() || !window.isVisible()) throw new Error('Native window did not restore');
      console.log('Desktop physical header drag, minimize and restore OK');
    }
    const artifactDirectory = process.env.MIJARVIS_ARTIFACT_DIR || 'artifacts';
    await mkdir(artifactDirectory, { recursive: true });
    await window.webContents.executeJavaScript('Promise.race([new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))), new Promise(resolve => setTimeout(resolve, 500))])');
    const screenshot = await window.webContents.capturePage();
    if (screenshot.isEmpty()) throw new Error('Empty HUD screenshot');
    if (process.argv.includes('--validate-window') && screenshot.toBitmap()[3] !== 0) {
      throw new Error('HUD corner should retain transparent pixels');
    }
    await writeFile(join(artifactDirectory, 'phase1-hud.png'), screenshot.toPNG());
    if (process.argv.includes('--validate-terminal')) {
      const result = await window.webContents.executeJavaScript('window.jarvis.openTerminal()');
      if (!result.opened) throw new Error('Terminal did not launch');
      console.log('Desktop terminal IPC OK (interactive terminal opened)');
    }
    console.log('Desktop smoke test OK: preload, WebSocket and telemetry');
    app.quit();
  }
} catch (error) {
  console.error('Could not start MiJarvis:', error.message);
  exitCode = 1;
  app.quit();
}
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (core && !quitting) {
    event.preventDefault();
    quitting = true;
    core.close().finally(() => app.exit(exitCode));
  }
});
