#!/usr/bin/env node
// Minnesota Mayhem local server — serves the production build (dist/) with no dependencies.
// Usage: node server.mjs [--port 4173] [--lan] [--open]
//   --lan   also listen on your local network so a phone on the same Wi-Fi can connect
//   --open  open the game in your default browser
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { exec } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 4173;
const lan = args.includes('--lan');
const host = lan ? '0.0.0.0' : '127.0.0.1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    let target = file;
    try { if ((await stat(target)).isDirectory()) target = join(target, 'index.html'); } catch { target = join(root, 'index.html'); }
    const body = await readFile(target);
    const type = TYPES[extname(target)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': target.endsWith('sw.js') || target.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(body);
  } catch (e) { res.writeHead(500).end('error'); }
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') { console.log(`Port ${port} already in use — the game is probably already running. Opening it.`); openBrowser(); setTimeout(() => process.exit(0), 500); }
  else { console.error(e); process.exit(1); }
});
function openBrowser() {
  const url = `http://localhost:${port}/`;
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}
server.listen(port, host, () => {
  console.log('\n  MINNESOTA MAYHEM is running.');
  console.log(`  On this computer:   http://localhost:${port}/`);
  if (lan) for (const nets of Object.values(networkInterfaces())) for (const n of nets ?? []) if (n.family === 'IPv4' && !n.internal) console.log(`  On your phone (same Wi-Fi):  http://${n.address}:${port}/`);
  console.log('  Close this window to stop the game.\n');
  if (args.includes('--open')) openBrowser();
});
