/* 零依赖静态预览服务器：node serve.js  (默认 http://localhost:8000) */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  let file = path.join(ROOT, decodeURIComponent(u.pathname));
  if (u.pathname === '/' || u.pathname === '') file = path.join(ROOT, 'index.html');

  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }

  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    // 本地预览不缓存，方便改代码后立即看到效果
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`静态预览： http://localhost:${PORT}`);
  console.log('数据源在 js/config.js 里改。按 Ctrl+C 停止。');
});
