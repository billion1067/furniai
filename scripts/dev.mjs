import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const viteArgs = process.argv.slice(2);

const children = [
  spawn(process.execPath, [join(root, 'scripts', 'replicate-api.mjs')], {
    cwd: root,
    stdio: 'inherit',
  }),
  spawn(process.execPath, [viteBin, '--host', '0.0.0.0', ...viteArgs], {
    cwd: root,
    stdio: 'inherit',
  }),
];

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
};

process.on('SIGINT', () => {
  stop();
  process.exit(130);
});

process.on('SIGTERM', () => {
  stop();
  process.exit(143);
});

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      stop();
      process.exit(code);
    }
  });
}
