const test=require('node:test'),assert=require('node:assert/strict'),{signature,verify}=require('../web-proxy.cjs');
test('trusted proxy signature binds path, IP, method, body and timestamp',()=>{const secret='isolated-test-secret',at=String(Date.now()),body=Buffer.from('{"mode":"ghost"}'),req={method:'POST',url:'/api/settings',headers:{'x-mizze-at':at,'x-mizze-ip':'203.0.113.9'}};req.headers['x-mizze-signature']=signature(secret,req.method,req.url,at,req.headers['x-mizze-ip'],body);assert.equal(verify(secret,req,body),'203.0.113.9');assert.equal(verify(secret,req,Buffer.from('{}')),null);assert.equal(verify(secret,{...req,url:'/api/shutdown'},body),null);assert.equal(verify(secret,req,body,Number(at)+31000),null);assert.equal(verify('wrong',req,body),null);assert.equal(verify(secret,{...req,headers:{...req.headers,'x-mizze-ip':'not-ip'}},body),null);});
test('Vercel proxy blocks private routes and fails clearly without configuration',async()=>{const handler=require('../api/gateway.js');async function request(route){const res={headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.body=JSON.parse(v)}};await handler({url:'/api/gateway?route='+encodeURIComponent(route),method:'GET',headers:{}},res);return res;}assert.equal((await request('/api/shutdown')).statusCode,404);assert.equal((await request('/pc')).statusCode,404);assert.equal((await request('/api/info')).statusCode,503);});
test('Happ link requires an active session and returns only the encrypted profile URL', async (t) => {
  const previousOrigin = process.env.MIZZE_GATEWAY_ORIGIN;
  const previousSecret = process.env.MIZZE_WEB_PROXY_TOKEN;
  process.env.MIZZE_GATEWAY_ORIGIN = 'https://gateway.example.test';
  process.env.MIZZE_WEB_PROXY_TOKEN = 'test-only';
  t.after(() => {
    for (const [key, value] of [['MIZZE_GATEWAY_ORIGIN', previousOrigin], ['MIZZE_WEB_PROXY_TOKEN', previousSecret]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const handler = require('../api/gateway.js');
  const token = 'c'.repeat(64);
  const link = 'happ://crypt5/' + 'a'.repeat(64);
  let sessionStatus = 200;
  let encryptedLink = link;
  const mocked = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === 'https://gateway.example.test/api/state') {
      assert.equal(options.headers.Authorization, 'Bearer ' + token);
      return Response.json(sessionStatus === 200 ? { gateway: 'ready' } : { error: 'Phiên hết hạn' }, { status: sessionStatus });
    }
    assert.equal(url, 'https://crypto.happ.su/api-v2.php');
    assert.deepEqual(JSON.parse(options.body), { url: 'https://mizzedongnhathoangha.com/sub/' + token });
    return Response.json({ encrypted_link: encryptedLink });
  });
  async function request(authorization) {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = JSON.parse(body); } };
    await handler({ url: '/api/gateway?route=/api/happ-link', method: 'GET', headers: { authorization } }, res);
    return res;
  }

  assert.equal((await request()).statusCode, 401);
  assert.equal(mocked.mock.callCount(), 0);
  sessionStatus = 401;
  assert.equal((await request('Bearer ' + token)).statusCode, 401);
  assert.equal(mocked.mock.callCount(), 1);
  sessionStatus = 200;
  const result = await request('Bearer ' + token);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { addUrl: link });
  assert.equal(result.headers['Cache-Control'], 'no-store');
  encryptedLink = 'happ://add/https://gateway.example.test/sub/' + token;
  assert.equal((await request('Bearer ' + token)).statusCode, 503);
});
