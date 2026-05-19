const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const webRoot = process.cwd();
const nextDir = path.resolve(webRoot, '.next');
const port = process.argv[2] || process.env.PORT || '3002';

if (!nextDir.startsWith(webRoot)) {
  throw new Error(`Refusing to remove path outside web root: ${nextDir}`);
}

const nextBin = require.resolve('next/dist/bin/next');

const probe = net.createServer();

probe.once('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the existing dev server first, then run this command again.`);
    process.exit(1);
  }
  throw error;
});

probe.once('listening', () => {
  probe.close(() => {
    if (fs.existsSync(nextDir)) {
      fs.rmSync(nextDir, { recursive: true, force: true });
      console.log(`Removed ${nextDir}`);
    }

    const env = { ...process.env, NODE_ENV: 'development' };
    if (env.Path && env.PATH) {
      delete env.PATH;
    }

    const child = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', port], {
      cwd: webRoot,
      stdio: 'inherit',
      env,
    });

    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 0);
    });
  });
});

probe.listen(Number(port), '127.0.0.1');
