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

const client = runWorkspace('client', 'client', '36');
const server = runWorkspace('server', 'server', '35');

const children = [client, server];

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
  const hint = path.join(root, 'start-phishing-analyzer.bat');
  process.stdout.write(
    `\nPhishing Analyzer is starting.\nFrontend: http://localhost:5173\nBackend:  http://localhost:3001\nOne-click launcher: ${hint}\n\n`
  );
}, 1200);
