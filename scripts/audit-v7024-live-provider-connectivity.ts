declare const process:any;
import { probeOfficialProviderConnectivity } from '../server/officialLawRetriever';

const rows=await probeOfficialProviderConnectivity();
let unusable=0;
for(const r of rows){
  const result=r.usable?'PASS':'FAIL';
  console.log(`${result} | ${r.provider} | direct=${r.direct_status}/${r.direct_state} | network=${r.network_reachable?'reachable':'unreachable'} | fallback_attempted=${r.fallback_attempted?'yes':'no'} strategy=${r.fallback_strategy} hits=${r.fallback_hits} detail=${r.official_detail_status||0} | final=${r.final_state}`+(r.error?` | ${r.error}`:''));
  for(const a of (r.fallback_attempts||[])){ console.log(`  FALLBACK | ${a.engine} | http=${a.status}/${a.access_state} | reachable=${a.reachable?'yes':'no'} | hits=${a.hits} | body=${a.body_state}/${a.body_length}`+(a.error?` | ${a.error}`:'')); }
  if(!r.usable) unusable++;
}
if(unusable){
  console.log(`\nLIVE PROVIDER PATH: FAIL/UNVERIFIED (${unusable}/${rows.length} provider tidak mempunyai retrieval path yang terbukti usable).`);
  console.log('Interpretasi: HTTP 401/403/429 = REACHABLE_BLOCKED, bukan DNS/firewall failure. NETWORK_UNREACHABLE hanya untuk DNS/timeout/refused/no HTTP response.');
  console.log('Direct-blocked provider dinyatakan usable hanya bila fallback discovery menemukan halaman authority resmi .go.id, identitas judicial terverifikasi, dan halaman tersebut berhasil di-fetch.');
  process.exit(2);
}
console.log(`\nLIVE PROVIDER PATH: PASS (${rows.length}/${rows.length} provider mempunyai retrieval path resmi yang terbukti usable).`);
