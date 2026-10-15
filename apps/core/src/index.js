import { startCore } from './server.js';

try {
  const core = await startCore({ port: Number(process.env.CORE_PORT || 4317), token: process.env.CORE_TOKEN });
  console.log(`MiJarvis Core: http://127.0.0.1:${core.port}/health`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await core.close(); process.exit(0); });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
