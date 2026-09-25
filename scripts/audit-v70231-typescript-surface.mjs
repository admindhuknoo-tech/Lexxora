import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
let ts; try{ts=require('typescript/lib/typescript.js')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js')}
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const files=['server.ts','server/localOcr.ts','server/caseJobStore.ts','server/documentIngestion.ts','server/db.ts','server/caseAnalysis.ts'];
let checks=0;
for(const rel of files){
  const src=fs.readFileSync(path.join(root,rel),'utf8');
  const out=ts.transpileModule(src,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}});
  const errors=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length){
    console.error('FAIL',rel,errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join(' | '));
    process.exit(1);
  }
  console.log('PASS',rel);checks++;
}
console.log(`SUMMARY ${checks}/${files.length} V7.0.2.31 TypeScript transpile surface`);
