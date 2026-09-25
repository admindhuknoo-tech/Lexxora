declare const process:any;
import { probeOfficialProviderConnectivity } from '../server/officialLawRetriever';

const rows=await probeOfficialProviderConnectivity();
let fail=0;
for(const r of rows){
  const status=r.usable?'PASS':'FAIL';
  console.log(`${status} | ${r.provider} | direct=${r.direct_status}/${r.direct_state} | fallback=${r.fallback_strategy} | final=${r.final_state}`);
  if(!r.usable) fail++;
}
if(fail){
  console.log(`\nLIVE CONNECTIVITY/PATH: UNVERIFIED/FAIL (${fail}/${rows.length} provider belum mempunyai path usable).`);
  console.log('HTTP 401/403/429 diklasifikasikan REACHABLE_BLOCKED, bukan DNS/firewall failure.');
  process.exit(2);
}
console.log(`\nLIVE CONNECTIVITY/PATH: PASS (${rows.length}/${rows.length} provider usable).`);
