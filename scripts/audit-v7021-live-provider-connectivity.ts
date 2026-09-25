declare const process:any;
import { buildOfficialLawQueries, discoverOfficialLaw, probeOfficialProviderConnectivity } from '../server/officialLawRetriever.ts';

let pass=0,fail=0;
function check(name:string,ok:boolean,detail=''){console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);ok?pass++:fail++;}

const probes=await probeOfficialProviderConnectivity();
for(const p of probes){
  // Compatibility semantics after V7.0.2.4:
  // HTTP 401/403/429 is network-reachable but access-blocked. It must not be
  // mislabeled as DNS/firewall failure. Retrieval usability is audited separately.
  check(`live network reachability ${p.provider}`,p.network_reachable,JSON.stringify({
    direct_status:p.direct_status,
    direct_state:p.direct_state,
    usable:p.usable,
    final_state:p.final_state,
    finalUrl:p.finalUrl,
    error:p.error||null,
  }));
}

const usableProbes=probes.filter(p=>p.usable);
if(usableProbes.length){
  const queries=buildOfficialLawQueries({
    title:'Uji konektivitas otoritas resmi',
    domain:'Hukum Perdata & Perikatan',
    text:'Sengketa perjanjian dan wanprestasi memerlukan verifikasi regulasi, produk hukum Mahkamah Agung, dan putusan yang relevan.',
    issues:[{id:'connectivity-check',issue:'Apa otoritas hukum resmi yang relevan?',query_terms:['perjanjian','wanprestasi','ganti rugi']}],
  });
  const result=await discoverOfficialLaw({mode:'hybrid',queries,domain:'Hukum Perdata & Perikatan',caseText:'perjanjian wanprestasi ganti rugi',maxCandidates:8});
  const providers=result.providers||[];
  for(const name of usableProbes.map(p=>p.provider)){
    const provider=providers.find(x=>x.name===name);
    check(`runtime provider status ${name}`,!!provider && provider.status!=='UNREACHABLE',JSON.stringify(provider||null));
  }
  check('global provider diagnostics not falsely UNREACHABLE when any provider is usable',
    (result.diagnostics as any)?.provider_status!=='UNREACHABLE',
    JSON.stringify({global:(result.diagnostics as any)?.provider_status,providers}));
}else{
  console.log('INFO | runtime retrieval skipped because no provider has a proven usable path. Network-reachable-but-blocked is not treated as DNS failure.');
}

console.log(`\n${pass}/${pass+fail} V7.0.2.1 compatibility checks PASS`);
if(fail) process.exit(1);
