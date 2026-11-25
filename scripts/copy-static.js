import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

const source = new URL('../src/guanchillo/', import.meta.url);
const output = new URL('../dist/', import.meta.url);

for (const filename of ['index.html', 'styles.css', 'favicon.svg']) {
  copyFileSync(new URL(filename, source), new URL(filename, output));
}

const patterns = new URL('../patterns/', import.meta.url);
const catalog = new URL('patterns/', output);
const manifest = JSON.parse(readFileSync(new URL('index.json', patterns), 'utf8'));
const keys = Object.values(manifest).flat();
if (keys.some(key => typeof key !== 'string' || !/^[a-z0-9-]+$/.test(key) || key === 'index')) {
  throw new Error('Invalid template filename in patterns/index.json.');
}
rmSync(catalog, { recursive: true, force: true });
mkdirSync(catalog, { recursive: true });
for (const key of ['index', ...keys]) {
  copyFileSync(new URL(key + '.json', patterns), new URL(key + '.json', catalog));
}
