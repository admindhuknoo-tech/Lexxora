declare const process:any;
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../server/caseAnalysis.ts', import.meta.url),'utf8');
let pass=0,fail=0;
function ck(n:string,v:boolean){console.log(`${v?'PASS':'FAIL'} | ${n}`);v?pass++:fail++;}
ck('pre-downgraded regime/forum authority cannot bind',/if \(c\.regime_note\) \{[\s\S]{0,500}authority applicability rejected/.test(src));
ck('strict regime compatibility gate remains present',/candidateRegimeCompatible\(c,caseRegime,caseText\)/.test(src)&&!/crossSignal\s*=/.test(src));
ck('Section III fails closed when nothing binds',/if\(!boundLabels\.size\) return \[\];/.test(src)&&/return filtered;/.test(src));
ck('binding threshold unchanged',/if \(binding_score < 6\) continue;/.test(src));
console.log(`\n${pass}/${pass+fail} authority-applicability-v683 checks PASS`); if(fail)process.exit(1);
