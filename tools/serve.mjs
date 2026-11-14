// LivingPainting — local static server (npm run game). Node built-ins only, no dependencies.
//   node tools/serve.mjs [--port=8090] [--root=game] [--mount=/jatek/=game]
// Serves the root folder(s) at http://127.0.0.1:<port>/ (default: game/, index.html = the game). Several roots
// (--root=site,game) overlay: the first one that has the file wins — the showcase site (site/) uses the game's own
// modules, data, textures and splats this way, under the same relative paths as the game. --mount=/prefix/=folder
// serves a folder under a prefix (the site's "play" link: /jatek/ = the game itself). Bound to 127.0.0.1, read-only,
// no caching (so an edit shows up on reload), and refuses paths outside its folders.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const arg = (name) => args.findLast((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const PORT = +(arg('port') || 8090);
const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = (arg('root') || 'game').split(',').map((r) => path.resolve(BASE, r));
const MOUNTS = args.filter((a) => a.startsWith('--mount=')).map((a) => {
  const [prefix, dir] = a.slice(8).split('=');
  return { prefix, dir: path.resolve(BASE, dir) };
});
const NAME = path.basename(ROOTS[0]);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.splat': 'application/octet-stream', '.spz': 'application/octet-stream', '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.wasm': 'application/wasm', '.map': 'application/json',
  '.woff2': 'font/woff2',
};

/** the file a request path maps to (first root that has it), or null; refuses anything outside the folders */
function resolve(rel) {
  const m = MOUNTS.find((m) => rel.startsWith(m.prefix));
  const roots = m ? [m.dir] : ROOTS;
  if (m) rel = '/' + rel.slice(m.prefix.length);
  for (const root of roots) {
    const file = path.resolve(root, '.' + rel);
    if (!file.startsWith(root + path.sep) || /(^|[\\/])\./.test(path.relative(root, file))) return null;
    try { if (fs.statSync(file).isFile()) return file; } catch { /* next root */ }
  }
  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = resolve(rel);
  if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nincs ilyen fájl: ' + rel); }
  const st = fs.statSync(file);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': st.size, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
});
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `[${NAME}] A ${PORT}-es port foglalt (más port: --port=8095)` : e);
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => console.log(`Élő festmény (${NAME}): http://127.0.0.1:${PORT}/  (leállítás: Ctrl+C)`));
