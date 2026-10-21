import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const execute = promisify(execFile);
const adapters = {
  win32: {
    terminal: ['powershell.exe', ['-NoLogo', '-NoProfile', '-NoExit']],
    commands: {
      hostname: ['hostname.exe', []],
      whoami: ['whoami.exe', []],
    },
  },
  linux: {
    terminal: ['x-terminal-emulator', []],
    commands: { hostname: ['hostname', []], whoami: ['whoami', []] },
  },
};

function cpuSnapshot() {
  return os.cpus().reduce((sum, cpu) => {
    sum.idle += cpu.times.idle;
    sum.total += Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return sum;
  }, { idle: 0, total: 0 });
}

export class SystemController {
  constructor(platform = process.platform, { executeFile = execute, spawnProcess = spawn } = {}) {
    if (!adapters[platform]) throw new Error(`Unsupported platform: ${platform}`);
    this.platform = platform;
    this.adapter = adapters[platform];
    this.previous = cpuSnapshot();
    this.executeFile = executeFile;
    this.spawnProcess = spawnProcess;
  }

  getSystemStats() {
    const current = cpuSnapshot();
    const totalDelta = current.total - this.previous.total;
    const cpuPercent = totalDelta > 0
      ? 100 * (1 - (current.idle - this.previous.idle) / totalDelta) : 0;
    this.previous = current;
    const total = os.totalmem();
    const used = total - os.freemem();
    return {
      platform: this.platform,
      cpuPercent: Math.max(0, Math.min(100, cpuPercent)),
      memory: { total, used, percent: used / total * 100 },
      gpu: null,
      uptimeSeconds: os.uptime(),
    };
  }

  async openTerminal() {
    if (this.platform === 'win32') {
      const file = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const interactive = Buffer.from("$Host.UI.RawUI.WindowTitle = 'MiJarvis Terminal'", 'utf16le').toString('base64');
      // Start-Process creates an independent visible console, even when Electron has no console handles.
      const script = `$ErrorActionPreference = 'Stop'; $shell = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'; ` +
        `$p = Start-Process -FilePath $shell -ArgumentList @('-NoLogo','-NoProfile','-NoExit','-EncodedCommand','${interactive}') -WindowStyle Normal -PassThru; ` +
        `Start-Sleep -Milliseconds 500; if ($p.HasExited) { throw 'La terminal terminó antes de abrirse.' }; @{opened=$true;pid=$p.Id} | ConvertTo-Json -Compress`;
      try {
        const { stdout } = await this.executeFile(file, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
          shell: false, windowsHide: true, timeout: 10000, maxBuffer: 16384,
        });
        const result = JSON.parse(stdout.trim());
        if (result.opened !== true || !Number.isInteger(result.pid) || result.pid < 1) throw new Error('Invalid terminal result');
        return result;
      } catch { throw new Error('No se pudo abrir PowerShell. Revisa que Windows permita iniciar una terminal interactiva.'); }
    }
    const [file, args] = this.adapter.terminal;
    await new Promise((resolve, reject) => {
      const child = this.spawnProcess(file, args, {
        detached: true, stdio: 'ignore', windowsHide: false, shell: false,
      });
      child.once('error', () => reject(new Error('No se pudo abrir la terminal. Comprueba x-terminal-emulator y la sesión gráfica.')));
      child.once('spawn', () => { child.unref(); resolve(); });
    });
    return { opened: true };
  }

  async runSystemCommand(command) {
    if (typeof command !== 'string' || !Object.hasOwn(this.adapter.commands, command)) {
      throw new Error('Command not allowed. Available: hostname, whoami');
    }
    const [file, args] = this.adapter.commands[command];
    const { stdout, stderr } = await this.executeFile(file, args, {
      shell: false, windowsHide: true, timeout: 5000, maxBuffer: 65536,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  }
}
