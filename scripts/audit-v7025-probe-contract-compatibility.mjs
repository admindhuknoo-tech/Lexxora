import fs from 'node:fs';

let pass=0, fail=0;
function check(name, ok, detail='') {
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok ? pass++ : fail++;
}

const retriever=fs.readFileSync('server/officialLawRetriever.ts','utf8');
const legacy=fs.readFileSync('scripts/audit-v7021-live-provider-connectivity.ts','utf8');
const v7023=fs.existsSync('scripts/audit-v7023-live-provider-connectivity.ts')?fs.readFileSync('scripts/audit-v7023-live-provider-connectivity.ts','utf8'):'';
const v7024=fs.existsSync('scripts/audit-v7024-live-provider-connectivity.ts')?fs.readFileSync('scripts/audit-v7024-live-provider-connectivity.ts','utf8'):'';

for (const field of ['direct_ok','direct_status','direct_state','network_reachable','usable','final_state']) {
  check(`OfficialProviderConnectivityProbe exposes ${field}`, new RegExp(`\\b${field}\\s*:`).test(retriever));
}
check('legacy V7.0.2.1 audit no longer reads removed p.ok', !/\bp\.ok\b/.test(legacy));
check('legacy V7.0.2.1 audit no longer reads removed p.status', !/\bp\.status\b/.test(legacy));
check('legacy audit uses network_reachable semantics', /p\.network_reachable/.test(legacy));
check('legacy audit uses usable semantics for retrieval path', /p\.usable/.test(legacy));
check('V7.0.2.3 live audit uses current contract', !v7023 || (/\.usable/.test(v7023)&&/\.direct_status/.test(v7023)&&/\.final_state/.test(v7023)));
check('V7.0.2.4 live audit uses current contract', !v7024 || (/\.usable/.test(v7024)&&/\.network_reachable/.test(v7024)&&/\.final_state/.test(v7024)));

console.log(`\n${pass}/${pass+fail} V7.0.2.5 probe-contract compatibility checks PASS`);
if (fail) process.exit(1);
