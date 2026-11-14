'use strict';
// Chạy Xray (VLESS qua WebSocket) và chuyển toàn bộ lưu lượng sang relay SOCKS5 cục bộ.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), net = require('node:net');
const { spawn, execFile } = require('node:child_process'), { promisify } = require('node:util');
const { Relay } = require('./relay.cjs');
const exec = promisify(execFile);

class Gateway {
  constructor(dir, cfg) {
    this.dir = dir; this.cfg = cfg; this.ready = false; this.process = null;
    this.exe = path.resolve(dir, cfg.xray || (process.platform === 'win32' ? 'native/xray.exe' : 'native/xray'));
    const f = path.join(dir, 'private/relay-secret.json');
    if (fs.existsSync(f)) this.secret = JSON.parse(fs.readFileSync(f));
    else { this.secret = { relayPassword: crypto.randomBytes(24).toString('hex') }; fs.writeFileSync(f, JSON.stringify(this.secret), { flag: 'wx', mode: 0o600 }); }
  }

  async start(uuid) {
    if (!fs.existsSync(this.exe)) throw Error('Không thấy Xray tại ' + this.exe);
    this.relay = new Relay({ user: 'mizze', password: this.secret.relayPassword, allowPrivateTargets: this.cfg.allowPrivateTargets === true, maxSockets: this.cfg.maxFlows || 512 });
    await this.relay.listen();
    const config = {
      log: { loglevel: 'warning' },
      inbounds: [{ tag: 'mizze-ws', listen: '127.0.0.1', port: this.cfg.wsPort, protocol: 'vless',
        settings: { clients: [{ id: uuid, email: 'mizze@local' }], decryption: 'none' },
        streamSettings: { network: 'ws', security: 'none', wsSettings: { path: '/mizze-tunnel' } } }],
      outbounds: [{ tag: 'relay', protocol: 'socks', settings: { servers: [{ address: '127.0.0.1', port: this.relay.port, users: [{ user: 'mizze', pass: this.secret.relayPassword }] }] } }],
      dns: { servers: ['1.1.1.1', '8.8.8.8'], queryStrategy: 'UseIPv4' }
    };
    const file = path.join(this.dir, 'private/xray-server.json');
    fs.writeFileSync(file, JSON.stringify(config, null, 2));
    await exec(this.exe, ['run', '-test', '-c', file], { windowsHide: true, timeout: 15000 });
    this.process = spawn(this.exe, ['run', '-c', file], { windowsHide: true, stdio: 'ignore' });
    this.process.on('error', () => { this.ready = false; });
    this.process.on('exit', () => { this.ready = false; this.onExit?.(); });
    for (let i = 0; i < 50; i++) {
      if (await this.probe()) { this.ready = true; return; }
      await new Promise(r => setTimeout(r, 100));
    }
    throw Error('Xray không khởi động được');
  }

  probe() {
    return new Promise(ok => {
      const s = net.connect(this.cfg.wsPort, '127.0.0.1');
      s.on('connect', () => { s.destroy(); ok(true); }); s.on('error', () => ok(false));
      s.setTimeout(200, () => { s.destroy(); ok(false); });
    });
  }

  stats() { return this.relay ? { up: this.relay.stats.up, down: this.relay.stats.down, flows: this.relay.sockets.size } : { up: 0, down: 0, flows: 0 }; }

  wsUri(uuid, host, token, name) {
    const q = new URLSearchParams({ encryption: 'none', type: 'ws', security: 'tls', sni: host, host, path: '/tunnel/' + token });
    return `vless://${uuid}@${host}:443?${q}#${encodeURIComponent(name || 'Mizze')}`;
  }

  async stop() {
    this.ready = false;
    if (this.process) { this.process.kill(); this.process = null; }
    if (this.relay) await this.relay.close();
  }
}

module.exports = { Gateway };
