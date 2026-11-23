import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Render sets $PORT (e.g. 10000). The public web listener must bind to it.
const WEB_PORT = parseInt(process.env.PORT || process.env.WEB_PORT || '8080', 10);
// The internal Node API process runs on a separate internal port.
const API_PORT = WEB_PORT === 3000 ? 3001 : parseInt(process.env.INTERNAL_API_PORT || '3000', 10);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DIST_DIR = path.join(__dirname, 'frontend', 'dist');
const MEDIA_DIR = path.join(__dirname, 'catalogue', 'media');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Auto-detect Render external URL if ORIGIN or RP_ID are not set
const renderExternalUrl = process.env.RENDER_EXTERNAL_URL ? process.env.RENDER_EXTERNAL_URL.trim().replace(/\/+$/, '') : '';
const effectiveOrigin = process.env.ORIGIN || renderExternalUrl || `http://localhost:${WEB_PORT}`;

let effectiveRpId = process.env.RP_ID;
if (!effectiveRpId) {
  try {
    effectiveRpId = new URL(effectiveOrigin).hostname;
  } catch {
    effectiveRpId = 'localhost';
  }
}

console.log(`Starting openGym API on internal port ${API_PORT}...`);
console.log(`Configured Origin: ${effectiveOrigin} | RP_ID: ${effectiveRpId}`);

const apiEnv = {
  ...process.env,
  PORT: String(API_PORT),
  DATA_DIR: DATA_DIR,
  RP_ID: effectiveRpId,
  ORIGIN: effectiveOrigin,
  ALLOW_GUEST: process.env.ALLOW_GUEST || '1',
  PASSWORD_LOGIN: process.env.PASSWORD_LOGIN || '1',
  FIRST_USER_ADMIN: process.env.FIRST_USER_ADMIN || '1',
  TRUST_PROXY: process.env.TRUST_PROXY || '1',
};

const apiProcess = spawn('node', ['api/server.js'], {
  cwd: __dirname,
  env: apiEnv,
  stdio: 'inherit'
});

apiProcess.on('error', (err) => {
  console.error('Failed to start API:', err);
});

apiProcess.on('exit', (code, sig) => {
  if (code !== 0 && code !== null) {
    console.error(`API exited with code ${code} (${sig || 'no signal'})`);
  }
});

// MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json'
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// 2. Start Web Server
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${WEB_PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  // Proxy /api to API process
  if (pathname.startsWith('/api')) {
    const proxyReq = http.request({
      hostname: '127.0.0.1',
      port: API_PORT,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${API_PORT}`,
        origin: req.headers.origin || effectiveOrigin
      }
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: 'API Gateway Error', details: err.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  // Serve Exercise Media
  if (pathname.startsWith('/exercise-media/still/')) {
    const file = path.basename(pathname);
    const target = path.join(MEDIA_DIR, 'still', file);
    return serveFile(res, target);
  }
  if (pathname.startsWith('/exercise-media/clip/')) {
    const file = path.basename(pathname);
    const target = path.join(MEDIA_DIR, 'clip', file);
    return serveFile(res, target);
  }

  // Serve Static Frontend / SPA
  let targetFile = path.join(DIST_DIR, pathname);
  if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
    return serveFile(res, targetFile);
  }

  // SPA fallback to index.html
  const indexPath = path.join(DIST_DIR, 'index.html');
  return serveFile(res, indexPath);
});

server.listen(WEB_PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` openGym is running successfully!`);
  console.log(` Public listener:  http://0.0.0.0:${WEB_PORT}`);
  console.log(` Origin:           ${effectiveOrigin}`);
  console.log(` Storage dir:      ${DATA_DIR}`);
  console.log(`=======================================================`);
});

const cleanup = () => {
  try { apiProcess.kill(); } catch {}
  try { server.close(); } catch {}
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
