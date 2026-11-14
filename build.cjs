'use strict';
// Build tĩnh cho Vercel: kiểm tra cấu hình rồi chép web/ sang dist/.
const fs = require('node:fs'), path = require('node:path');
const { VPS_ORIGIN } = require('./mizze.config.cjs');
const u = new URL(VPS_ORIGIN);
if (u.protocol !== 'https:' || u.pathname !== '/' || u.search || u.hash) throw Error('VPS_ORIGIN trong mizze.config.cjs phải dạng https://ten-mien');
const src = path.join(__dirname, 'web'), out = path.join(__dirname, 'dist');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(out, f));
console.log('Build xong: dist/ → ' + VPS_ORIGIN);
