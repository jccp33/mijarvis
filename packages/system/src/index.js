import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

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
  constructor(platform = process.platform) {
    if (!adapters[platform]) throw new Error(`Unsupported platform: ${platform}`);
    this.platform = platform;
    this.adapter = adapters[platform];
    this.previous = cpuSnapshot();
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
    const [file, args] = this.adapter.terminal;
    await new Promise((resolve, reject) => {
      const child = spawn(file, args, {
        detached: true, stdio: 'ignore', windowsHide: false, shell: false,
      });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
    return { opened: true };
  }

  async runSystemCommand(command) {
    if (typeof command !== 'string' || !Object.hasOwn(this.adapter.commands, command)) {
      throw new Error('Command not allowed. Available: hostname, whoami');
    }
    const [file, args] = this.adapter.commands[command];
    const { stdout, stderr } = await execute(file, args, {
      shell: false, windowsHide: true, timeout: 5000, maxBuffer: 65536,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  }
}
