import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
const root=process.cwd();
const file=path.join(root,'dist','runtime','source-manifest.json');
if(!fs.existsSync(file)) throw new Error('Production runtime manifest missing. Run npm run build:runtime.');
const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
const mismatches=[];
for(const [rel,expected] of Object.entries(manifest.files||{})){
  const src=path.join(root,rel);
  if(!fs.existsSync(src)){mismatches.push(`${rel}:MISSING`);continue;}
  const actual=crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');
  if(actual!==expected)mismatches.push(`${rel}:STALE_RUNTIME`);
}
if(mismatches.length) throw new Error(`Production runtime is stale relative to canonical source: ${mismatches.join(', ')}. Run npm run build:runtime before start.`);
console.log(`PASS: production runtime parity (${Object.keys(manifest.files||{}).length} canonical source files)`);

const legacy=path.join(root,'dist','server.cjs');
if(!fs.existsSync(legacy) || !fs.readFileSync(legacy,'utf8').includes("require('./runtime/server.js')")){
  throw new Error('Legacy dist/server.cjs is not a canonical runtime forwarder. Run npm run build:runtime.');
}
const desktopLegacy=path.join(root,'.desktop-runtime','dist','server.cjs');
const desktopCanonical=path.join(root,'.desktop-runtime','dist','runtime','server.js');
if(fs.existsSync(desktopLegacy) && (!fs.readFileSync(desktopLegacy,'utf8').includes("require('./runtime/server.js')") || !fs.existsSync(desktopCanonical))){
  throw new Error('Desktop runtime contains a stale/independent server entry. Rebuild desktop runtime.');
}
console.log('PASS: all supported server entry points forward to canonical runtime');
