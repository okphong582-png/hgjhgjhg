'use strict';
// SOCKS5 relay (TCP CONNECT + UDP ASSOCIATE) giữa Xray và Internet.
// Chỉ chuyển tiếp dữ liệu nguyên vẹn; không đọc, giữ, sửa hay chèn gói tin.
const net = require('node:net'), dgram = require('node:dgram'), dns = require('node:dns');

class Reader {
  constructor(s) {
    this.s = s; this.b = Buffer.alloc(0); this.q = []; this.dead = false;
    this.onData = b => { this.b = Buffer.concat([this.b, b]); if (this.b.length > 65536) s.destroy(); this.drain(); };
    s.on('data', this.onData);
    s.on('close', () => { this.dead = true; this.drain(); });
    s.on('error', () => {});
  }
  drain() {
    while (this.q.length) {
      const q = this.q[0];
      if (this.b.length >= q.n) { this.q.shift(); const v = this.b.subarray(0, q.n); this.b = this.b.subarray(q.n); q.ok(v); }
      else if (this.dead) { this.q.shift(); q.no(Error('closed')); }
      else break;
    }
  }
  read(n) { return new Promise((ok, no) => { this.q.push({ n, ok, no }); this.drain(); }); }
  release() { this.s.off('data', this.onData); if (this.b.length) this.s.unshift(this.b); this.s.pause(); }
}

async function readAddress(r, type) {
  if (type === 1) return [...await r.read(4)].join('.');
  if (type === 3) { const n = (await r.read(1))[0]; return (await r.read(n)).toString(); }
  throw Error('IPv4 only');
}

function parseUdp(b) {
  if (b.length < 10 || b[0] || b[1] || b[2] || b[3] !== 1) return null;
  return { host: [...b.subarray(4, 8)].join('.'), port: b.readUInt16BE(8), payload: b.subarray(10) };
}

function publicIp(ip) {
  const b = ip.split('.').map(Number);
  if (b.length !== 4 || b.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  return !(b[0] === 0 || b[0] === 10 || b[0] === 127 || b[0] >= 224 || (b[0] === 169 && b[1] === 254) ||
    (b[0] === 172 && b[1] >= 16 && b[1] <= 31) || (b[0] === 192 && b[1] === 168) ||
    (b[0] === 100 && b[1] >= 64 && b[1] <= 127) || (b[0] === 198 && (b[1] === 18 || b[1] === 19)));
}

const reply = (s, port = 0) => s.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, port >> 8, port & 255]));

class Relay {
  constructor({ port = 0, user, password, allowPrivateTargets = false, maxSockets = 512, idleTimeoutMs = 180000 }) {
    Object.assign(this, { port, user, password, allowPrivateTargets, maxSockets, idleTimeoutMs });
    this.sockets = new Set(); this.udp = new Set();
    this.stats = { up: 0, down: 0, tcpFlows: 0, udpFlows: 0, rejected: 0 };
    this.server = net.createServer(s => this.handle(s).catch(() => s.destroy()));
  }
  listen() {
    return new Promise((ok, no) => {
      this.server.once('error', no);
      this.server.listen(this.port, '127.0.0.1', () => { this.port = this.server.address().port; ok(); });
    });
  }
  allowed(ip) { return this.allowPrivateTargets || publicIp(ip); }
  async handle(s) {
    if (this.sockets.size >= this.maxSockets) { this.stats.rejected++; s.destroy(); return; }
    this.sockets.add(s); s.on('close', () => this.sockets.delete(s));
    s.setTimeout(10000, () => s.destroy());
    const r = new Reader(s);
    let h = await r.read(2); if (h[0] !== 5) throw Error('version');
    const methods = await r.read(h[1]); if (!methods.includes(2)) throw Error('auth required');
    s.write(Buffer.from([5, 2]));
    if ((await r.read(1))[0] !== 1) throw Error('auth version');
    const u = (await r.read((await r.read(1))[0])).toString(), p = (await r.read((await r.read(1))[0])).toString();
    if (u !== this.user || p !== this.password) { s.end(Buffer.from([1, 1])); return; }
    s.write(Buffer.from([1, 0])); s.setTimeout(this.idleTimeoutMs, () => s.destroy());
    h = await r.read(4); if (h[0] !== 5 || h[2] !== 0) throw Error('request');
    const host = await readAddress(r, h[3]), port = (await r.read(2)).readUInt16BE();

    if (h[1] === 1) { // CONNECT
      if (!port) throw Error('port');
      const { address } = await dns.promises.lookup(host, { family: 4 });
      if (!this.allowed(address)) throw Error('private destination blocked');
      const t = net.createConnection({ host: address, port });
      this.sockets.add(t); this.stats.tcpFlows++;
      t.on('close', () => { this.sockets.delete(t); s.destroy(); });
      t.setTimeout(this.idleTimeoutMs, () => t.destroy());
      t.on('error', () => s.destroy()); s.on('error', () => t.destroy()); s.on('close', () => t.destroy());
      t.on('connect', () => {
        reply(s); r.release();
        s.on('data', b => { this.stats.up += b.length; }); t.on('data', b => { this.stats.down += b.length; });
        s.pipe(t); t.pipe(s); s.resume();
      });
      return;
    }
    if (h[1] !== 3) throw Error('command');

    // UDP ASSOCIATE
    const local = dgram.createSocket('udp4'), remote = dgram.createSocket('udp4');
    this.udp.add(local); this.udp.add(remote); this.stats.udpFlows++;
    let peer = null; const seen = new Map();
    const end = () => { this.udp.delete(local); this.udp.delete(remote); try { local.close(); } catch {} try { remote.close(); } catch {} };
    s.once('close', end); local.on('error', () => s.destroy()); remote.on('error', () => s.destroy());
    await new Promise(ok => local.bind(0, '127.0.0.1', ok));
    await new Promise(ok => remote.bind(0, '0.0.0.0', ok));
    reply(s, local.address().port); r.release(); s.resume();
    local.on('message', (b, from) => {
      if (from.address !== '127.0.0.1' || (peer && from.port !== peer.port)) return;
      const q = parseUdp(b); if (!q || !q.port || !this.allowed(q.host)) return;
      peer = from; s.setTimeout(this.idleTimeoutMs);
      seen.set(q.host + ':' + q.port, Date.now()); if (seen.size > 256) seen.delete(seen.keys().next().value);
      this.stats.up += q.payload.length;
      remote.send(q.payload, q.port, q.host, () => {});
    });
    remote.on('message', (b, from) => {
      const at = seen.get(from.address + ':' + from.port);
      if (!peer || !at || Date.now() - at > this.idleTimeoutMs) return;
      s.setTimeout(this.idleTimeoutMs); this.stats.down += b.length;
      const head = Buffer.from([0, 0, 0, 1, ...from.address.split('.').map(Number), from.port >> 8, from.port & 255]);
      local.send(Buffer.concat([head, b]), peer.port, '127.0.0.1', () => {});
    });
  }
  async close() {
    for (const s of this.sockets) s.destroy();
    for (const u of this.udp) try { u.close(); } catch {}
    await new Promise(ok => this.server.close(() => ok()));
  }
}

module.exports = { Relay, parseUdp, publicIp };
