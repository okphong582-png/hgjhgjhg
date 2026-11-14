'use strict';
const crypto = require('node:crypto');
const REMEMBER_TTL = 30 * 86400000;
function sealRemember(value, secret, now = Date.now()) {
  const raw = Buffer.from(JSON.stringify({...value, issuedAt: now, until: now + REMEMBER_TTL})).toString('base64url');
  return raw + '.' + crypto.createHmac('sha256', secret).update('remember-v1\n' + raw).digest('base64url');
}
function openRemember(token, secret, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const [raw, mac] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update('remember-v1\n' + raw).digest();
    if (!crypto.timingSafeEqual(Buffer.from(mac, 'base64url'), expected)) return null;
    const v = JSON.parse(Buffer.from(raw, 'base64url'));
    if (!Number.isSafeInteger(v.issuedAt) || !Number.isSafeInteger(v.until) || v.issuedAt > now || v.until <= now || v.until - v.issuedAt !== REMEMBER_TTL ||
      typeof v.project !== 'string' || !/^[a-f0-9]{64}$/.test(v.hash) || !/^[a-f0-9]{64}$/.test(v.deviceHash) || !Number.isSafeInteger(v.claimedAt) || v.claimedAt < 0 || typeof v.label !== 'string' || v.label.length > 32) return null;
    return v;
  } catch { return null; }
}

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
function headers(res) {
  for (const [name, value] of Object.entries({
    'Content-Security-Policy': CSP,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'no-store'
  })) res.setHeader(name, value);
}

// Separate authentication budgets from normal status polling. Bounded memory.
class RateLimiter {
  constructor({limit = 12, windowMs = 60000, maxEntries = 4096, now = Date.now} = {}) {
    Object.assign(this, {limit, windowMs, maxEntries, now});
    this.entries = new Map();
  }
  take(key) {
    const now = this.now();
    let entry = this.entries.get(key);
    if (!entry || now - entry.at >= this.windowMs) {
      entry = {at: now, count: 0};
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
    entry.count++;
    return entry.count <= this.limit;
  }
}

// Enforce absolute expiry even if the database or browser is unavailable.
// A failed cleanup stays denied and is retried; it never restores permission.
class ExpiryGuard {
  constructor({now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, retryMs = 1000} = {}) {
    Object.assign(this, {now, setTimer, clearTimer, retryMs});
    this.entries = new Map();
    this.closed = false;
  }
  track(id, expiresAt, revoke) {
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw Error('invalid_expiry');
    this.cancel(id);
    const entry = {expiresAt, revoke, timer: null, pending: null};
    this.entries.set(id, entry);
    this.schedule(id, entry, Math.max(0, Math.min(2147483647, expiresAt - this.now())));
  }
  schedule(id, entry, delay) {
    if (this.closed || this.entries.get(id) !== entry) return;
    entry.timer = this.setTimer(() => {
      if (entry.expiresAt > this.now()) this.schedule(id, entry, Math.min(2147483647, entry.expiresAt - this.now()));
      else this.revoke(id).catch(() => {});
    }, delay);
    entry.timer?.unref?.();
  }
  revoke(id) {
    const entry = this.entries.get(id);
    if (!entry) return Promise.resolve();
    if (entry.pending) return entry.pending;
    this.clearTimer(entry.timer);
    entry.expiresAt = 0;
    entry.pending = Promise.resolve().then(entry.revoke).then(() => {
      if (this.entries.get(id) === entry) this.entries.delete(id);
    }, error => {
      entry.pending = null;
      this.schedule(id, entry, this.retryMs);
      throw error;
    });
    return entry.pending;
  }
  cancel(id) {
    const entry = this.entries.get(id);
    if (entry) this.clearTimer(entry.timer);
    this.entries.delete(id);
  }
  close() {
    this.closed = true;
    for (const id of this.entries.keys()) this.cancel(id);
  }
}

module.exports = {CSP, headers, RateLimiter, ExpiryGuard, sealRemember, openRemember, REMEMBER_TTL};
