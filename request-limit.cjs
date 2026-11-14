'use strict';

// Fixed-window limiter with bounded memory. Pass only known route names.
function createRequestLimit(maxKeys = 4096, windowMs = 60000) {
  let resetAt = 0;
  const counts = new Map();
  return (key, limit) => {
    const now = Date.now();
    if (now >= resetAt) {
      counts.clear();
      resetAt = now + windowMs;
    }
    const count = counts.get(key) || 0;
    if (count >= limit || (!count && counts.size >= maxKeys)) {
      return Math.max(1, Math.ceil((resetAt - now) / 1000));
    }
    counts.set(key, count + 1);
    return 0;
  };
}

module.exports = { createRequestLimit };
