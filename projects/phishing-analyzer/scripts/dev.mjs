import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runWorkspace(label, workspace, color) {
  const child = spawn(npmCommand, ['run', 'dev', '--workspace', workspace], {
    cwd: root,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false
  });

  const prefix = `\x1b[${color}m[${label}]\x1b[0m`;

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`${prefix} ${chunk}`);
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`${prefix} ${chunk}`);
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });

  return child;
}

// Start server first, then client — prevents ECONNRESET on first request
// when Vite proxy forwards before Express is listening.
const server = runWorkspace('server', 'server', '35');

let clientStarted = false;

function startClient() {
  if (clientStarted) return;
  clientStarted = true;
  runWorkspace('client', 'client', '36');
}

// Trigger as soon as Express logs its ready message
server.stdout.on('data', (chunk) => {
  if (!clientStarted && chunk.toString().includes('listening on')) {
    startClient();
  }
});

// Fallback: start client after 6s regardless, in case the ready signal is missed
setTimeout(startClient, 6000);

const children = [server];

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

setTimeout(() => {
  const hint = path.join(root, 'Launch Phishing Analyzer.cmd');
  process.stdout.write(
    `\nPhishing Analyzer is starting.\nFrontend: http://localhost:5175\nBackend:  http://localhost:3002\nOne-click launcher: ${hint}\n\n`
  );
}, 1200);
