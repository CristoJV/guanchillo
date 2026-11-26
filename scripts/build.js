import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const source = new URL('src/guanchillo/', root);
const output = new URL('dist/', root);
const tsc = fileURLToPath(new URL('node_modules/typescript/bin/tsc', root));

rmSync(output, { recursive: true, force: true });
execFileSync(process.execPath, [tsc], { cwd: root, stdio: 'inherit' });

for (const filename of ['index.html', 'styles.css', 'favicon.svg',
  'views/crochet/desktop.css', 'views/crochet/mobile.css', 'views/editor/mobile.css']) {
  mkdirSync(new URL('.', new URL(filename, output)), { recursive: true });
  copyFileSync(new URL(filename, source), new URL(filename, output));
}

const patterns = new URL('../patterns/', import.meta.url);
const catalog = new URL('patterns/', output);
const manifest = JSON.parse(readFileSync(new URL('index.json', patterns), 'utf8'));
const keys = manifest.patterns;
if (!Array.isArray(keys) || new Set(keys).size !== keys.length ||
  keys.some(key => typeof key !== 'string' || !/^[a-z0-9-]+$/.test(key) || key === 'index')) {
  throw new Error('Invalid template filename in patterns/index.json.');
}
mkdirSync(catalog, { recursive: true });
for (const key of ['index', ...keys]) {
  copyFileSync(new URL(key + '.json', patterns), new URL(key + '.json', catalog));
}
