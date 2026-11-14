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
