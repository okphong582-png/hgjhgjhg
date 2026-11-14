'use strict';
// Máy chủ chạy trên VPS: web + API + đường hầm WebSocket tới Xray.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), net = require('node:net'), crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Gateway } = require('./gateway.cjs');
const site = require('./mizze.config.cjs');

const root = __dirname, privateDir = path.join(root, 'private');
fs.mkdirSync(privateDir, { recursive: true });
const localCfgFile = path.join(root, 'config.json');
const cfg = { quickTunnel: false, cloudflared: process.platform === 'win32' ? 'native/cloudflared.exe' : 'cloudflared', maxConnections: 256, ...(fs.existsSync(localCfgFile) ? JSON.parse(fs.readFileSync(localCfgFile)) : {}) };
const port = cfg.port || site.PORT, wsPort = cfg.wsPort || site.WS_PORT, profile = cfg.profileName || site.PROFILE_NAME;

const sessionFile = path.join(privateDir, 'session.json');
let session;
if (fs.existsSync(sessionFile)) session = JSON.parse(fs.readFileSync(sessionFile));
else { session = { uuid: crypto.randomUUID(), token: crypto.randomBytes(32).toString('hex') }; fs.writeFileSync(sessionFile, JSON.stringify(session), { flag: 'wx', mode: 0o600 }); }

let origin = cfg.quickTunnel ? null : (cfg.publicOrigin || site.VPS_ORIGIN);
let gateway, tunnel, closing = false;
const startedAt = Date.now(), sockets = new Set();
const transport = { accepted: 0, rejected: 0, upstreamErrors: 0 };

const FILES = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'application/javascript'], '/style.css': ['style.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };

function state() {
  return { version: 'mizze-sach-1', gateway: gateway?.ready ? 'ready' : 'offline', online: Boolean(gateway?.ready && origin), uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), stats: gateway?.stats() || { up: 0, down: 0, flows: 0 }, activeConnections: sockets.size };
}
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

const server = http.createServer((req, res) => {
  try {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const url = new URL(req.url, 'http://localhost');
    const hosts = new Set(['localhost:' + port, '127.0.0.1:' + port, ...(origin ? [new URL(origin).host] : [])]);
    if (!hosts.has(req.headers.host)) return json(res, 403, { error: 'Host không hợp lệ.' });
    if (closing) return json(res, 503, { error: 'Máy chủ đang dừng.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Phương thức không hợp lệ.' });

    if (url.pathname === '/healthz') return json(res, 200, { ok: true, gateway: gateway?.ready === true });
    if (url.pathname === '/api/state') return json(res, 200, state());
    if (url.pathname === '/api/config') {
      if (!origin || !gateway?.ready) return json(res, 503, { error: 'Máy chủ đang khởi động. Chờ vài giây rồi thử lại.' });
      const subscription = origin + '/sub/' + session.token;
      return json(res, 200, { subscription, addUrl: 'happ://add/' + subscription });
    }
    if (url.pathname === '/sub/' + session.token) {
      if (!origin || !gateway?.ready) return json(res, 503, { error: 'Máy chủ chưa sẵn sàng.' });
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'profile-title': profile, 'profile-update-interval': '12' });
      return res.end(gateway.wsUri(session.uuid, new URL(origin).hostname, session.token, profile) + '\n');
    }
    const file = FILES[url.pathname];
    if (file) {
      res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(path.join(root, 'web', file[0])));
    }
    json(res, 404, { error: 'Không tìm thấy trang.' });
  } catch { if (!res.headersSent) json(res, 400, { error: 'Không xử lý được yêu cầu.' }); else res.end(); }
});
server.requestTimeout = 12000; server.headersTimeout = 8000; server.maxHeadersCount = 32;

server.on('upgrade', (req, socket, head) => {
  let upstream;
  try {
    if (!origin || req.url !== '/tunnel/' + session.token || req.headers.host !== new URL(origin).host || !gateway?.ready || closing) { transport.rejected++; throw Error('denied'); }
    if (sockets.size >= cfg.maxConnections) { transport.rejected++; socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return; }
    transport.accepted++; sockets.add(socket);
    socket.setTimeout(180000, () => socket.destroy());
    socket.on('error', () => upstream?.destroy()); socket.on('close', () => { sockets.delete(socket); upstream?.destroy(); });
    upstream = net.connect(wsPort, '127.0.0.1');
    upstream.setTimeout(10000, () => upstream.destroy());
    upstream.on('error', () => { transport.upstreamErrors++; socket.destroy(); }); upstream.on('close', () => socket.destroy());
    upstream.on('connect', () => {
      upstream.setTimeout(180000);
      let headers = 'GET /mizze-tunnel HTTP/1.1\r\nHost: 127.0.0.1\r\n';
      for (const k of ['connection', 'upgrade', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions', 'user-agent']) if (req.headers[k]) headers += k + ': ' + req.headers[k] + '\r\n';
      upstream.write(headers + '\r\n'); if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
  } catch { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); upstream?.destroy(); }
});

function startQuickTunnel() {
  const exe = path.resolve(root, cfg.cloudflared);
  tunnel = spawn(exe, ['tunnel', '--url', 'http://127.0.0.1:' + port, '--no-autoupdate', '--protocol', 'http2'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let tail = '';
  const inspect = b => { tail = (tail + b).slice(-8000); const m = tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m && !origin) { origin = m[0]; fs.writeFileSync(path.join(root, 'PUBLIC-URL.txt'), origin + '\n'); console.log('Địa chỉ công khai tạm: ' + origin); } };
  tunnel.stdout.on('data', inspect); tunnel.stderr.on('data', inspect);
  tunnel.on('error', e => console.error('cloudflared: ' + e.message)); tunnel.on('exit', () => { if (!closing) stop(1); });
}

async function start() {
  gateway = new Gateway(root, { ...cfg, wsPort });
  gateway.onExit = () => { if (!closing) { console.error('Xray đã thoát.'); stop(1); } };
  await gateway.start(session.uuid);
  await new Promise((ok, no) => { server.once('error', no); server.listen(port, '127.0.0.1', ok); });
  console.log('Mizze sẵn sàng: http://127.0.0.1:' + port);
  if (cfg.quickTunnel) startQuickTunnel(); else console.log('Địa chỉ công khai: ' + origin + '  (tunnel phải trỏ về http://127.0.0.1:' + port + ')');
}

async function stop(code = 0) {
  if (closing) return; closing = true;
  for (const s of sockets) s.destroy();
  tunnel?.kill(); server.close();
  try { await gateway?.stop(); } catch {}
  setTimeout(() => process.exit(code), 100).unref();
}

process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
start().catch(e => { console.error('Không khởi động được: ' + e.message); stop(1); });
