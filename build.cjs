'use strict';

const fs = require('node:fs');
const path = require('node:path');
const source = path.join(__dirname, 'web');
const output = path.join(__dirname, 'dist');

fs.mkdirSync(output, { recursive: true });
for (const file of ['index.html', 'app.js', 'style.css', 'logo-mizze.jpg', 'favicon.svg']) {
  fs.copyFileSync(path.join(source, file), path.join(output, file));
}
console.log('Mizze web ready. Gateway runs separately on VPS.');
