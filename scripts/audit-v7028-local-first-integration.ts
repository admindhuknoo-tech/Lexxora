import { discoverOfficialLaw } from '../server/officialLawRetriever';

let pass=0,fail=0;
const check=(name:string,ok:boolean,detail='')=>{if(ok){pass++;console.log(`PASS | ${name}${detail?` | ${detail}`:''}`)}else{fail++;console.error(`FAIL | ${name}${detail?` | ${detail}`:''}`)}};

const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response('<html><body>provider blocked for deterministic failover test</body></html>',{status:403,headers:{'content-type':'text/html'}});
try{
  const result=await discoverOfficialLaw({
    mode:'hybrid',
    queries:['peralihan hak jual beli tanah sertifikat','pendaftaran tanah peralihan hak'],
    domain:'Hukum Agraria & Pertanahan',
    caseText:'Pembeli melakukan pengecekan sertifikat sebelum jual beli dan proses balik nama.',
    tempusYear:2013,
    maxCandidates:8,
  });
  const indexed=result.candidates.filter(c=>c.provider==='OFFICIAL_INDEX');
  check('production pipeline survives blocked judicial providers',indexed.length>0,`indexed=${indexed.length}`);
  check('indexed judicial authority reaches final candidates',indexed.some(c=>c.authority_class==='JUDICIAL_PRODUCT'));
  check('indexed candidate keeps explicit verification state',indexed.every(c=>c.verification_state==='INDEXED_OFFICIAL'));
  check('global provider status remains candidate-usable',result.diagnostics?.provider_status==='REACHABLE_CANDIDATES',String(result.diagnostics?.provider_status));
  check('official index provider reported',result.providers.some(p=>p.name==='OFFICIAL_INDEX'&&p.status==='REACHABLE_CANDIDATES'));
  check('live MA block still reported honestly',result.providers.some(p=>p.name==='JDIH_MA'&&p.status==='REACHABLE_BLOCKED'));
} finally {
  globalThis.fetch=originalFetch;
}
console.log(`\n${pass}/${pass+fail} V7.0.2.8 local-first integration checks PASS`);
process.exitCode=fail?1:0;
