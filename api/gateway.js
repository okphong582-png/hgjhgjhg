'use strict';
// Hàm Vercel: chuyển tiếp các route công khai tới gateway trên VPS.
// Địa chỉ VPS lấy thẳng từ mizze.config.cjs — không cần biến môi trường.
const { VPS_ORIGIN } = require('../mizze.config.cjs');
const ROUTE = /^\/(?:api\/(?:state|config)|healthz|sub\/[a-f0-9]{64})$/;

module.exports = async function handler(req, res) {
  const fail = (status, message) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: message }));
  };
  try {
    const route = new URL(req.url, 'https://local.invalid').searchParams.get('route');
    if (!route || !ROUTE.test(route)) return fail(404, 'Không tìm thấy trang.');
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405, 'Phương thức không hợp lệ.');
    const base = new URL(VPS_ORIGIN);
    if (base.protocol !== 'https:') return fail(500, 'VPS_ORIGIN phải là địa chỉ https.');
    const r = await fetch(base.origin + route, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const type = String(r.headers.get('content-type') || '');
    if (route.startsWith('/api/') && !type.includes('application/json')) return fail(502, 'Đường hầm tới VPS đang lỗi. Kiểm tra máy chủ trên VPS.');
    res.statusCode = r.status;
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    for (const name of ['content-type', 'profile-title', 'profile-update-interval']) { const v = r.headers.get(name); if (v) res.setHeader(name, v); }
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch {
    fail(502, 'Chưa kết nối được máy chủ VPS. Kiểm tra máy chủ đang chạy.');
  }
};
