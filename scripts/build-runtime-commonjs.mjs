import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ts from 'typescript';

const root = process.cwd();
const outRoot = path.join(root, 'dist', 'runtime');
fs.rmSync(outRoot, { recursive:true, force:true });
fs.mkdirSync(outRoot, { recursive:true });

const files = [path.join(root, 'server.ts')];
function walk(dir){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,ent.name);
    if(ent.isDirectory()) walk(full);
    else if(/\.(?:ts|mjs)$/i.test(ent.name)) files.push(full);
  }
}
walk(path.join(root,'server'));
files.sort();

const manifest={version:1,files:{}};
for(const file of files){
  const rel = path.relative(root,file).replaceAll('\\','/');
  const outRel = rel.replace(/\.ts$/i,'.js').replace(/\.mjs$/i,'.js');
  const out = path.join(outRoot,outRel);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  const source = fs.readFileSync(file,'utf8');
  manifest.files[rel]=crypto.createHash('sha256').update(source).digest('hex');
  let code = ts.transpileModule(source,{
    fileName:file.replace(/\.mjs$/i,'.js'),
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,allowJs:true,resolveJsonModule:true,sourceMap:false},
  }).outputText;
  code = code.replace(/require\((['"])(\.\.?\/[^'"]+)\.mjs\1\)/g,'require($1$2.js$1)');
  fs.writeFileSync(out,code,'utf8');
}
fs.writeFileSync(path.join(outRoot,'package.json'),JSON.stringify({type:'commonjs'},null,2)+'\n','utf8');
fs.writeFileSync(path.join(outRoot,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');

// Canonical launch invariant: legacy `dist/server.cjs` is retained only as a
// compatibility entry point. It must never contain an independently bundled
// copy of server logic because that can drift from `dist/runtime/server.js`.
// Always replace it with a tiny forwarder to the canonical emitted runtime.
const legacyShim = `'use strict';\nrequire('./runtime/server.js');\n`;
fs.writeFileSync(path.join(root,'dist','server.cjs'),legacyShim,'utf8');
console.log(`PASS: production CommonJS runtime emitted (${files.length} source modules)`);
