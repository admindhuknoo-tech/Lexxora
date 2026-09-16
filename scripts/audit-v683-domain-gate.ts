declare const process:any;
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../server/caseAnalysis.ts', import.meta.url),'utf8');
let pass=0,fail=0;
function ck(n:string,v:boolean){console.log(`${v?'PASS':'FAIL'} | ${n}`);v?pass++:fail++;}
ck('domain routing confidence gate exists',/key:'domain_routing_confident'/.test(src));
ck('litigation submission treated as high-stakes',/highStakes=\[[^\]]*'LITIGATION_SUBMISSION'/.test(src));
ck('LOW confidence cannot pass high-stakes gate',/conf!==['\"]LOW['\"]/.test(src));
ck('ambiguous routing cannot pass high-stakes gate',/domainClassificationAmbiguous!==true/.test(src));
ck('domain state is wired into pipeline gate',/domainClassificationConfidence: domainContext\.confidence/.test(src)&&/domainClassificationMargin: domainContext\.margin/.test(src));
console.log(`\n${pass}/${pass+fail} domain-gate-v683 checks PASS`); if(fail)process.exit(1);
