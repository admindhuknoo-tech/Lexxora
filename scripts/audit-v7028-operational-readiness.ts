import { officialAuthorityIndexStats } from '../server/officialAuthorityIndex';
import { probeOfficialProviderConnectivity } from '../server/officialLawRetriever';

const stats=officialAuthorityIndexStats();
const probes=await probeOfficialProviderConnectivity();
let fail=0;
const indexHealthy=stats.total>=20&&stats.judicial_products>=15&&stats.decisions>=3;
console.log(`${indexHealthy?'PASS':'FAIL'} | OFFICIAL_INDEX | total=${stats.total} judicial=${stats.judicial_products} decisions=${stats.decisions} snapshot=${stats.snapshot_date}`);
if(!indexHealthy) fail++;
for(const p of probes){
  const tag=p.usable?'PASS':'WARN';
  console.log(`${tag} | ${p.provider} | direct=${p.direct_status}/${p.direct_state} | fallback=${p.fallback_strategy} hits=${p.fallback_hits} detail=${p.official_detail_status} | final=${p.final_state}`);
}
const bpk=probes.find(p=>p.provider==='JDIH_BPK');
if(!bpk?.usable){console.error('FAIL | Regulation live provider is not usable.');fail++;}
const judicialUsable=probes.filter(p=>p.provider!=='JDIH_BPK').some(p=>p.usable);
if(!judicialUsable){
  console.log('DEGRADED | Judicial live enrichment is blocked/unavailable, but local official authority index remains operational. Indexed authorities stay INDEXED_OFFICIAL and require professional verification.');
}
console.log(fail?'\nV7.0.2.8 OPERATIONAL READINESS: FAIL':'\nV7.0.2.8 OPERATIONAL READINESS: PASS (local-first; live judicial enrichment may be degraded)');
process.exitCode=fail?1:0;
