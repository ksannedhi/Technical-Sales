import { spawn } from 'node:child_process';
import { get } from 'node:http';
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

// Poll /api/health until the Express server responds 200.
// More reliable than stdout text matching: confirms the server is actually
// accepting HTTP connections, not just that the process started.
function waitForServer(url, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;

    function attempt() {
      get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      }).on('error', retry);
    }

    function retry() {
      if (Date.now() >= deadline) {
        resolve(); // timed out — start client anyway
        return;
      }
      setTimeout(attempt, 500);
    }

    attempt();
  });
}

// Start server first, then wait for it to be healthy before starting Vite.
// Prevents ECONNRESET on the first proxied request after a fresh start or
// a node --watch restart triggered by file changes.
const server = runWorkspace('server', 'server', '35');
const children = [server];

waitForServer('http://localhost:3002/api/health').then(() => {
  const client = runWorkspace('client', 'client', '36');
  children.push(client);
});

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
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
