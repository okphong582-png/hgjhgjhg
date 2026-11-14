'use strict';
// Hàm Vercel: chuyển tiếp các route công khai tới gateway trên VPS.
const { isIP } = require('node:net');
const { createRequestLimit } = require('../request-limit.cjs');
const { VPS_ORIGIN } = require('../mizze.config.cjs');
const ROUTE = /^\/(?:api\/(?:state|config)|healthz|sub\/[a-f0-9]{64})$/;
const limit = createRequestLimit();
const quotas = { '/api/state': 90, '/api/config': 30, '/healthz': 90, '/sub': 60 };
let inflight = 0;

module.exports = async function handler(req, res) {
  const fail = (status, message) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: message }));
  };
  try {
    const routes = new URL(req.url, 'https://local.invalid').searchParams.getAll('route');
    const route = routes[0];
    if (routes.length !== 1 || !ROUTE.test(route)) return fail(404, 'Không tìm thấy trang.');
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405, 'Phương thức không hợp lệ.');
    const subscription = route.startsWith('/sub/');
    const bucket = subscription ? '/sub' : route;
    const forwarded = process.env.VERCEL === '1' ? req.headers['x-vercel-forwarded-for'] : null;
    const ip = isIP(forwarded || '') ? forwarded : (req.socket?.remoteAddress || 'unknown');
    const retry = limit(bucket + ':' + ip, quotas[bucket]);
    if (retry) {
      res.setHeader('Retry-After', String(retry));
      return fail(429, 'Quá nhiều yêu cầu. Vui lòng thử lại sau.');
    }
    if (inflight >= 24) {
      res.setHeader('Retry-After', '5');
      return fail(503, 'Máy chủ bận. Vui lòng thử lại sau.');
    }
    const base = new URL(process.env.VPS_ORIGIN || VPS_ORIGIN);
    if (base.protocol !== 'https:' || base.hostname === 'mizzedongnhathoangha.com' ||
        base.host === req.headers.host || base.hostname.endsWith('.vercel.app')) {
      return fail(500, 'VPS_ORIGIN phải là địa chỉ HTTPS riêng của VPS.');
    }
    inflight++;
    try {
      const r = await fetch(base.origin + route, { method: req.method, redirect: 'manual', signal: AbortSignal.timeout(8000) });
      const type = String(r.headers.get('content-type') || '');
      if (r.status >= 300 && r.status < 400 ||
          !subscription && !type.includes('application/json') ||
          subscription && r.ok && !type.includes('text/plain')) {
        await r.body?.cancel();
        return fail(502, 'Đường hầm tới VPS đang lỗi. Kiểm tra máy chủ trên VPS.');
      }
      const body = req.method === 'HEAD' ? undefined : Buffer.from(await r.arrayBuffer());
      res.statusCode = r.status;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      for (const name of ['content-type', 'profile-title', 'profile-update-interval', 'retry-after']) {
        const value = r.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      if (subscription && r.ok) res.setHeader('Hide-Settings', '1');
      res.end(body);
    } finally { inflight--; }
  } catch {
    fail(502, 'Chưa kết nối được máy chủ VPS. Kiểm tra máy chủ đang chạy.');
  }
};
