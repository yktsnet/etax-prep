import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalStore } from '../core/store-local.mjs';
import { GitHubStore } from '../core/store-github.mjs';
import { createApi } from '../core/api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 8099);

// 既定はローカルのファイル。STORE=github でクラウド本番と同じ経路を手元から検証できる。
const store = process.env.STORE === 'github'
  ? new GitHubStore({
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH ?? 'main',
    root: process.env.LEDGER_ROOT ?? 'ledger',
  })
  : new LocalStore(path.join(root, 'data'));
await store.init();

const [accounts, taxCfg] = await Promise.all([
  readFile(path.join(root, 'config/accounts.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'config/tax-2026.json'), 'utf8').then(JSON.parse),
]);

const handle = createApi({ store, accounts, taxCfg });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
    });

    const response = await handle(new Request(url, { method: req.method, headers: req.headers, body }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    return res.end(Buffer.from(await response.arrayBuffer()));
  }

  const file = url.pathname === '/' ? '/index.html' : url.pathname;
  const full = path.join(root, 'public', file);
  if (!full.startsWith(path.join(root, 'public'))) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const data = await readFile(full);
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
  }
});

server.listen(PORT, () => console.log(`etax-prep dev (${store.constructor.name})  http://localhost:${PORT}`));
