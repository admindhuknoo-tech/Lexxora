declare const process:any;
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../server/forensicReasoner.ts', import.meta.url),'utf8');
let pass=0,fail=0;
function ck(n:string,v:boolean){console.log(`${v?'PASS':'FAIL'} | ${n}`);v?pass++:fail++;}
ck('claimed-event chronology is claim-tagged',/t\.type===['\"]CLAIMED_EVENT['\"][\s\S]{0,220}tagClaim/.test(src));
ck('non-claimed chronology retains factual tag path',/: tagFact\(t\.page,t\.quote\)/.test(src));
console.log(`\n${pass}/${pass+fail} timeline-provenance-v683 checks PASS`); if(fail)process.exit(1);
