// Minimal static server for the demo pages. Only the listed routes are served.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

const routes = {
  '/': ['demo/index.html', 'text/html'],
  '/normal.html': ['demo/normal.html', 'text/html'],
  '/hostile.html': ['demo/hostile.html', 'text/html'],
  '/hostile-host.js': ['demo/hostile-host.js', 'text/javascript'],
  '/embed.js': ['dist/embed.js', 'text/javascript'],
  // A different Preact (10.x) for the hostile page, separate from the 11.x copy bundled in embed.js.
  '/vendor/preact.umd.js': ['node_modules/host-preact/dist/preact.umd.js', 'text/javascript'],
};

export function startServer(port = Number(process.env.PORT ?? 5101)) {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const route = routes[path];
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    try {
      const body = await readFile(new URL(route[0], root));
      res.writeHead(200, { 'content-type': `${route[1]}; charset=utf-8`, 'cache-control': 'no-store' }).end(body);
    } catch {
      const hint = route[0].startsWith('dist/') ? ' Run `npm run build` first.' : '';
      res.writeHead(500, { 'content-type': 'text/plain' }).end(`Missing ${route[0]}.${hint}`);
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = await startServer();
  const { port } = server.address();
  console.log(`Demo pages:\n  http://127.0.0.1:${port}/normal.html\n  http://127.0.0.1:${port}/hostile.html`);
}
