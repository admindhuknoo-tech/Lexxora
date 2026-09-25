import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
let ts; try{ts=require('typescript/lib/typescript.js')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js')}
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const files=['server.ts','server/localOcr.ts','server/caseJobStore.ts','server/documentIngestion.ts','server/db.ts','server/caseAnalysis.ts','server/legalOntology.ts'];
let checks=0;
for(const rel of files){
  const src=fs.readFileSync(path.join(root,rel),'utf8');
  const out=ts.transpileModule(src,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}});
  const errors=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length){console.error('FAIL',rel,errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join(' | '));process.exit(1)}
  console.log('PASS',rel);checks++;
}
// The shared integrity policy is plain ESM JS by design; parsing it as JS catches syntax regressions.
const policy=fs.readFileSync(path.join(root,'server/caseIntegrityPolicy.mjs'),'utf8');
const policyOut=ts.transpileModule(policy,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,allowJs:true}});
const policyErrors=(policyOut.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
if(policyErrors.length){console.error('FAIL server/caseIntegrityPolicy.mjs',policyErrors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join(' | '));process.exit(1)}
console.log('PASS server/caseIntegrityPolicy.mjs');checks++;
console.log(`SUMMARY ${checks}/${files.length+1} V7.0.2.32 TypeScript/ESM transpile surface`);
