import fs from 'fs';
import path from 'path';
import { brotliCompressSync, gzipSync, constants } from 'zlib';

const dist = path.resolve(process.cwd(), 'dist');
const compressible = /\.(?:html|css|js|json|svg)$/i;
let files = 0;
let rawBytes = 0;
let brBytes = 0;
let gzBytes = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (compressible.test(entry.name) && !/\.(?:br|gz)$/i.test(entry.name)) {
      const input = fs.readFileSync(full);
      if (input.length < 1024) continue;
      const br = brotliCompressSync(input, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } });
      const gz = gzipSync(input, { level: 9 });
      fs.writeFileSync(full + '.br', br);
      fs.writeFileSync(full + '.gz', gz);
      files += 1;
      rawBytes += input.length;
      brBytes += br.length;
      gzBytes += gz.length;
    }
  }
}

if (!fs.existsSync(dist)) throw new Error(`dist not found: ${dist}`);
walk(dist);
console.log(JSON.stringify({ event:'static_precompress', files, raw_bytes:rawBytes, brotli_bytes:brBytes, gzip_bytes:gzBytes }));
