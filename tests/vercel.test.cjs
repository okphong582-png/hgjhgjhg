'use strict';
const test = require('node:test'), assert = require('node:assert');
const handler = require('../api/gateway.js');

function call(url, method = 'GET') {
  return new Promise(ok => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { ok({ status: this.statusCode, headers: this.headers, body: String(b) }); } };
    handler({ url, method, headers: {} }, res);
  });
}

test('hàm Vercel chặn route lạ và phương thức ghi', async () => {
  assert.equal((await call('/api/gateway?route=/api/moco')).status, 404);
  assert.equal((await call('/api/gateway?route=/api/probe')).status, 404);
  assert.equal((await call('/api/gateway?route=/api/state', 'POST')).status, 405);
});

test('hàm Vercel chuyển tiếp tới VPS_ORIGIN gắn sẵn', async () => {
  const real = global.fetch; let seen;
  global.fetch = async (u) => { seen = u; return new Response(JSON.stringify({ ok: 1 }), { headers: { 'content-type': 'application/json' } }); };
  try {
    const r = await call('/api/gateway?route=/api/state');
    assert.equal(r.status, 200); assert.equal(seen, require('../mizze.config.cjs').VPS_ORIGIN + '/api/state');
  } finally { global.fetch = real; }
});

test('Happ nhận header ẩn cài đặt và nội dung đăng ký nguyên vẹn', async () => {
  const real = global.fetch;
  const profile = 'vless://example\n';
  global.fetch = async () => new Response(profile, { headers: { 'content-type': 'text/plain' } });
  try {
    const r = await call('/api/gateway?route=/sub/' + 'a'.repeat(64));
    assert.equal(r.status, 200);
    assert.equal(r.headers['hide-settings'], '1');
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(r.body, profile);
  } finally { global.fetch = real; }
});

test('gateway trả 429 trước khi chuyển yêu cầu vượt ngưỡng tới VPS', async () => {
  const real = global.fetch;
  let forwarded = 0;
  global.fetch = async () => {
    forwarded++;
    return new Response('{}', { headers: { 'content-type': 'application/json' } });
  };
  try {
    for (let i = 0; i < 30; i++) {
      assert.equal((await call('/api/gateway?route=/api/config')).status, 200);
    }
    const r = await call('/api/gateway?route=/api/config');
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers['retry-after']) > 0);
    assert.equal(forwarded, 30);
  } finally { global.fetch = real; }
});
