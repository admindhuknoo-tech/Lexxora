declare const process:any;
import { probeOfficialProviderConnectivity, __test__ } from '../server/officialLawRetriever';

let pass=0,fail=0;
function check(name:string,ok:boolean,detail=''){
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok?pass++:fail++;
}

check('1 HTTP 403 classified as BLOCKED, not network failure',__test__.classifyHttpAccess(403,false)==='BLOCKED');
check('2 HTTP 429 classified as BLOCKED',__test__.classifyHttpAccess(429,false)==='BLOCKED');
check('3 HTTP 503 classified as HTTP_ERROR',__test__.classifyHttpAccess(503,false)==='HTTP_ERROR');
check('4 status=0 classified as NETWORK_ERROR',__test__.classifyHttpAccess(0,false)==='NETWORK_ERROR');
check('5 aggregate preserves blocked provider visibility',__test__.aggregateProviderStatuses([
  {name:'JDIH_BPK',status:'REACHABLE_NO_LINKS',query_count:1},
  {name:'JDIH_MA',status:'REACHABLE_BLOCKED',query_count:1},
])==='REACHABLE_BLOCKED');

async function main(){
  const originalFetch=globalThis.fetch;
  const response=(url:string,html:string,status=200)=>({ok:status>=200&&status<300,status,url,text:async()=>html,headers:new Headers()}) as any;
  (globalThis as any).fetch=async(raw:any)=>{
    const url=String(raw); const decoded=decodeURIComponent(url);
    if(url.includes('peraturan.bpk.go.id/Search')) return response(url,'<html><body>BPK search ok</body></html>',200);
    if(url.includes('jdih.mahkamahagung.go.id/dokumen?search=')) return response(url,'Forbidden',403);
    if(url.includes('putusan3.mahkamahagung.go.id/search.html?q=')) return response(url,'Forbidden',403);
    if(url.includes('html.duckduckgo.com')){
      if(decoded.includes('jdih.mahkamahagung.go.id')) return response(url,'<a class="result__a" href="https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-1-tahun-2025/detail">SEMA Nomor 1 Tahun 2025</a>',200);
      if(decoded.includes('putusan3.mahkamahagung.go.id')) return response(url,'<a class="result__a" href="https://putusan3.mahkamahagung.go.id/direktori/putusan/mock.html">Putusan Perdata</a>',200);
    }
    if(url==='https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-1-tahun-2025/detail') return response(url,'<html><h1>SEMA Nomor 1 Tahun 2025</h1></html>',200);
    if(url==='https://putusan3.mahkamahagung.go.id/direktori/putusan/mock.html') return response(url,'<html><h1>Putusan Perdata</h1></html>',200);
    if(url.includes('bing.com')) return response(url,'<html></html>',200);
    return response(url,'not found',404);
  };
  try{
    const rows=await probeOfficialProviderConnectivity();
    const bpk=rows.find(r=>r.provider==='JDIH_BPK')!;
    const ma=rows.find(r=>r.provider==='JDIH_MA')!;
    const put=rows.find(r=>r.provider==='PUTUSAN_MA')!;
    check('6 BPK direct 200 remains USABLE_DIRECT',bpk.usable&&bpk.final_state==='USABLE_DIRECT',JSON.stringify(bpk));
    check('7 JDIH MA direct 403 remains network_reachable',ma.network_reachable&&ma.direct_status===403&&ma.direct_state==='REACHABLE_BLOCKED',JSON.stringify(ma));
    check('8 JDIH MA becomes usable through official-detail fallback',ma.usable&&ma.final_state==='USABLE_VIA_FALLBACK'&&ma.fallback_strategy==='DUCKDUCKGO_HTML'&&ma.official_detail_ok,JSON.stringify(ma));
    check('9 Putusan MA direct 403 remains network_reachable',put.network_reachable&&put.direct_status===403&&put.direct_state==='REACHABLE_BLOCKED',JSON.stringify(put));
    check('10 Putusan MA becomes usable through official-detail fallback',put.usable&&put.final_state==='USABLE_VIA_FALLBACK'&&put.fallback_strategy==='DUCKDUCKGO_HTML'&&put.official_detail_ok,JSON.stringify(put));
    check('11 fallback does not treat search engine as authority',rows.filter(r=>r.provider!=='JDIH_BPK').every(r=>r.official_detail_ok));
  } finally {
    (globalThis as any).fetch=originalFetch;
  }
  console.log(`\n${pass}/${pass+fail} V7.0.2.4 provider-access semantics checks PASS`);
  if(fail) process.exit(1);
}
main().catch(err=>{console.error(err);process.exit(1)});
