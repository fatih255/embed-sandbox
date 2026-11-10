// Fails the build when dist/ isn't a single file or embed.js goes over budget.
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET_GZIP_BYTES = 10 * 1024;
const dist = new URL('../dist/', import.meta.url);

const files = readdirSync(dist);
if (files.length !== 1 || files[0] !== 'embed.js') {
  console.error(`dist/ should contain only embed.js, found: ${files.join(', ')}`);
  process.exit(1);
}

const source = readFileSync(new URL('embed.js', dist));
const gzip = gzipSync(source, { level: 9 }).length;
const kb = (bytes) => `${(bytes / 1024).toFixed(2)} KB`;

console.log(`embed.js: ${kb(source.length)} raw, ${kb(gzip)} gzip (budget ${kb(BUDGET_GZIP_BYTES)})`);
if (gzip > BUDGET_GZIP_BYTES) {
  console.error(`embed.js is ${gzip - BUDGET_GZIP_BYTES} bytes over the gzip budget`);
  process.exit(1);
}
