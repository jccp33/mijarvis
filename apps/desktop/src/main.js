import { app, BrowserWindow, ipcMain, session } from 'electron';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startCore, dataDirectory, loadEnvironment } from '@mijarvis/core';
import { SystemController } from '@mijarvis/system';
import { phase2Scenario } from '../../../scripts/desktop-phase2-scenario.js';
import { MediaGate, createVoiceService, voiceResult } from './voice-service.js';
import { voiceScenario } from '../../../scripts/desktop-voice-scenario.js';

let core;
let window;
let quitting = false;
let exitCode = 0;
let voice;
let gate;
const token = randomBytes(32).toString('hex');
const page = new URL('./index.html', import.meta.url).href;
const smokeTest = process.argv.includes('--smoke-test');
if (smokeTest) {
  const profile = process.env.MIJARVIS_TEST_PROFILE || mkdtempSync(join(tmpdir(), 'mijarvis-desktop-test-'));
  mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
}
if (smokeTest) console.log('Desktop main loaded');

function validate(event) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame?.url !== page) throw new Error('Unauthorized IPC');
}

app.whenReady().then(async () => {
if (smokeTest) console.log('Electron ready');
try {
  loadEnvironment();
  core = await startCore({ port: 0, token, dataDir: smokeTest ? process.env.MIJARVIS_TEST_DATA_DIR : dataDirectory() });
  const system = new SystemController();
  voice = createVoiceService(); gate = new MediaGate(page);
  const trustedContents = contents => Boolean(window && !window.isDestroyed() && contents === window.webContents && contents.getURL() === page);
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => trustedContents(contents) && gate.allows(permission, details));
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(trustedContents(contents) && gate.allows(permission, details, true)));
  ipcMain.handle('connection', event => { validate(event); return `ws://127.0.0.1:${core.port}/ws?token=${token}`; });
  ipcMain.handle('terminal', event => { validate(event); return system.openTerminal(); });
  ipcMain.handle('voice:arm', (event, kind) => { validate(event); gate.arm(kind); return true; });
  ipcMain.handle('voice:disarm', event => { if (quitting || window?.isDestroyed() || !event.senderFrame) return true; validate(event); gate.disarm(); return true; });
  ipcMain.handle('voice:status', event => { validate(event); return voiceResult(() => voice.status()); });
  ipcMain.handle('voice:transcribe', (event, input) => { validate(event); return voiceResult(() => voice.transcribe(input)); });
  ipcMain.handle('voice:synthesize', (event, input) => { validate(event); return voiceResult(() => voice.synthesize(input)); });
  ipcMain.handle('voice:cancel', (event, id) => { if (quitting || window?.isDestroyed() || !event.senderFrame) return { ok: true }; validate(event); return voiceResult(() => voice.cancel(id)); });
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
  window.on('closed', () => { gate.disarm(); void voice.close(); });
  window.webContents.on('render-process-gone', () => { gate.disarm(); void voice.cancel(); });
  window.webContents.on('did-start-navigation', () => { gate.disarm(); void voice.cancel(); });
  await window.loadURL(page);
  if (smokeTest) {
    await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { clearInterval(poll); reject(new Error('HUD failed: ' + document.getElementById('connection').textContent + ' / ' + document.getElementById('messages').textContent)); }, 15000);
      const poll = setInterval(() => {
        if (document.getElementById('connection').textContent === 'CORE ONLINE' &&
            document.getElementById('cpu').textContent !== '—' && !document.getElementById('send').disabled) {
          clearInterval(poll); clearTimeout(timeout); resolve(true);
        }
      }, 100);
    })`);
    const preferences = window.webContents.getLastWebPreferences();
    if (!preferences.sandbox || !preferences.contextIsolation || preferences.nodeIntegration) {
      throw new Error('Unexpected desktop security configuration');
    }
    if (process.argv.includes('--validate-phase2')) {
      await window.webContents.executeJavaScript(`(${phase2Scenario.toString()})(${JSON.stringify(process.env.MIJARVIS_PHASE2_STAGE)}, ${JSON.stringify(process.env.MIJARVIS_TEST_ENDPOINT)})`);
      console.log(`Desktop phase 2 ${process.env.MIJARVIS_PHASE2_STAGE} OK: conversations, settings, retry and persistence`);
    }
    if (process.argv.includes('--validate-voice')) {
      const evidence = await window.webContents.executeJavaScript(`(${voiceScenario.toString()})()`, true);
      console.log('Desktop voice scenario OK: ' + JSON.stringify(evidence));
      await mkdir(process.env.MIJARVIS_ARTIFACT_DIR || 'artifacts', { recursive: true });
      await writeFile(join(process.env.MIJARVIS_ARTIFACT_DIR || 'artifacts', 'voice-hud.json'), JSON.stringify(evidence, null, 2));
      window.setSize(760, 600);
      await window.webContents.executeJavaScript(`document.getElementById('voice-review').hidden = false; document.getElementById('voice-transcript').value = ${JSON.stringify(evidence.transcription)};`);
      await new Promise(resolve => setTimeout(resolve, 300));
      await window.webContents.executeJavaScript(`(() => {
        for (const id of ['voice-send', 'voice-talk', 'send']) {
          const box = document.getElementById(id).getBoundingClientRect();
          if (box.bottom > innerHeight || box.top < 0 || box.right > innerWidth) throw new Error('Voice controls clipped at minimum size: ' + id);
        }
      })()`);
      await writeFile(join(process.env.MIJARVIS_ARTIFACT_DIR || 'artifacts', 'voice-review.png'), (await window.webContents.capturePage()).toPNG());
      window.setSize(1000, 740);
      await window.webContents.executeJavaScript("document.getElementById('voice-settings').click()");
      await new Promise(resolve => setTimeout(resolve, 300));
      await writeFile(join(process.env.MIJARVIS_ARTIFACT_DIR || 'artifacts', 'voice-settings.png'), (await window.webContents.capturePage()).toPNG());
      await window.webContents.executeJavaScript("document.getElementById('voice-dialog-close').click(); document.getElementById('voice-review').hidden=true;");
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
    await writeFile(join(artifactDirectory, process.argv.includes('--validate-phase2') ? 'phase2-hud.png' : 'phase1-hud.png'), screenshot.toPNG());
    if (process.argv.includes('--validate-terminal')) {
      const probe = fileURLToPath(new URL('../../../scripts/validate-terminal.ps1', import.meta.url));
      let baseline = [];
      if (process.platform === 'win32') baseline = JSON.parse((await promisify(execFile)('powershell.exe', ['-NoProfile', '-File', probe, '-ListOnly'], { windowsHide: true, timeout: 15000 })).stdout);
      await window.webContents.executeJavaScript(`(async () => {
        document.getElementById('terminal').click();
        const start = Date.now();
        while (document.getElementById('terminal').disabled) {
          if (Date.now() - start > 12000) throw new Error('Terminal button timed out');
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (document.getElementById('terminal-status').dataset.state !== 'opened') throw new Error(document.getElementById('terminal-status').textContent);
      })()`);
      if (process.platform === 'win32') {
        const args = ['-NoProfile', '-File', probe];
        if (baseline.length) args.push('-Exclude', baseline.join(','));
        const result = await promisify(execFile)('powershell.exe', args, { windowsHide: true, timeout: 15000 });
        console.log(result.stdout.trim());
      }
      console.log('Desktop terminal button and IPC OK');
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
    gate?.disarm();
    Promise.allSettled([core.close(), voice?.close()]).finally(() => app.exit(exitCode));
  }
});
