/*
 * Tiny static server for the web version, no dependencies: serves web/ on 127.0.0.1:8160.
 *   node tools/web/serve.js [port]
 * GET and HEAD only, "/" serves index.html, paths outside web/ are refused.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', 'web');
const HOST = '127.0.0.1';
const PORT = Number(process.argv[2] || process.env.PORT || 8160);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gpx': 'application/gpx+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function send(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(text);
}

const server = http.createServer(function (req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { send(res, 405, 'Method not allowed'); return; }
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://' + HOST).pathname); } catch (e) { send(res, 400, 'Bad request'); return; }
  if (rel.indexOf('\0') !== -1) { send(res, 400, 'Bad request'); return; }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, '.' + rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { send(res, 403, 'Forbidden'); return; }
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) { send(res, 404, 'Not found'); return; }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': 'no-store'
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, HOST, function () {
  console.log('Serving ' + ROOT + ' at http://' + HOST + ':' + PORT + '/');
});
