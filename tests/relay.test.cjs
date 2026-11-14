'use strict';
const test = require('node:test'), assert = require('node:assert');
const net = require('node:net'), dgram = require('node:dgram');
const { Relay, publicIp } = require('../relay.cjs');

function socks(port, cmd, host, dport) {
  return new Promise((ok, no) => {
    const s = net.connect(port, '127.0.0.1'); let step = 0, buf = Buffer.alloc(0);
    s.on('error', no); s.on('close', () => no(Error('closed')));
    s.setTimeout(3000, () => { s.destroy(); no(Error('timeout')); });
    s.on('connect', () => s.write(Buffer.from([5, 1, 2])));
    s.on('data', b => {
      buf = Buffer.concat([buf, b]);
      if (step === 0 && buf.length >= 2) { buf = buf.subarray(2); step = 1; const u = Buffer.from('u'), p = Buffer.from('p'); s.write(Buffer.from([1, u.length, ...u, p.length, ...p])); }
      if (step === 1 && buf.length >= 2) { if (buf[1] !== 0) { s.destroy(); return no(Error('auth')); } buf = buf.subarray(2); step = 2; s.write(Buffer.from([5, cmd, 0, 1, ...host.split('.').map(Number), dport >> 8, dport & 255])); }
      if (step === 2 && buf.length >= 10) { const rep = buf.subarray(0, 10); step = 3; s.removeAllListeners('data'); s.removeAllListeners('close'); s.setTimeout(0); if (buf.length > 10) s.unshift(buf.subarray(10)); ok({ s, bindPort: rep.readUInt16BE(8) }); }
    });
  });
}

test('relay chuyển tiếp TCP nguyên vẹn và đếm byte', async () => {
  const echo = net.createServer(c => c.pipe(c)); await new Promise(r => echo.listen(0, '127.0.0.1', r));
  const relay = new Relay({ user: 'u', password: 'p', allowPrivateTargets: true }); await relay.listen();
  const { s } = await socks(relay.port, 1, '127.0.0.1', echo.address().port);
  const got = await new Promise(r => { s.once('data', r); s.write('xin chao'); });
  assert.equal(got.toString(), 'xin chao');
  assert.ok(relay.stats.up >= 8 && relay.stats.down >= 8);
  s.destroy(); await relay.close(); echo.close();
});

test('relay chuyển tiếp UDP nguyên vẹn', async () => {
  const echo = dgram.createSocket('udp4'); echo.on('message', (b, f) => echo.send(b, f.port, f.address));
  await new Promise(r => echo.bind(0, '127.0.0.1', r));
  const relay = new Relay({ user: 'u', password: 'p', allowPrivateTargets: true }); await relay.listen();
  const { s, bindPort } = await socks(relay.port, 3, '0.0.0.0', 0);
  const c = dgram.createSocket('udp4'); await new Promise(r => c.bind(0, '127.0.0.1', r));
  const payload = Buffer.from([1, 2, 3, 250, 99]);
  const head = Buffer.from([0, 0, 0, 1, 127, 0, 0, 1, echo.address().port >> 8, echo.address().port & 255]);
  const got = await new Promise(r => { c.once('message', r); c.send(Buffer.concat([head, payload]), bindPort, '127.0.0.1'); });
  assert.deepEqual(got.subarray(10), payload);
  c.close(); s.destroy(); await relay.close(); echo.close();
});

test('relay từ chối sai mật khẩu và địa chỉ nội bộ', async () => {
  const relay = new Relay({ user: 'u', password: 'khac' }); await relay.listen();
  await assert.rejects(socks(relay.port, 1, '127.0.0.1', 80));
  await relay.close();
  assert.equal(publicIp('10.0.0.1'), false); assert.equal(publicIp('1.1.1.1'), true);
});
