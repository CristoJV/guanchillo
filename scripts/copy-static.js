import { copyFileSync } from 'node:fs';

const source = new URL('../src/guanchillo/', import.meta.url);
const output = new URL('../dist/', import.meta.url);

for (const filename of ['index.html', 'styles.css', 'favicon.svg']) {
  copyFileSync(new URL(filename, source), new URL(filename, output));
}
