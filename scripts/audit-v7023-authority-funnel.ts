declare const process:any;
import fs from 'node:fs';
import path from 'node:path';
import {
  buildAuthorityProviderPlan,
  buildOfficialLawQueries,
  discoverOfficialLaw,
  __test__,
} from '../server/officialLawRetriever';

let pass=0, fail=0;
function check(name:string,ok:boolean,detail=''){
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok?pass++:fail++;
}

const retrieverSrc=fs.readFileSync(path.join(process.cwd(),'server','officialLawRetriever.ts'),'utf8');
const caseSrc=fs.readFileSync(path.join(process.cwd(),'server','caseAnalysis.ts'),'utf8');
check('1.1 production retrieval has no Bu Sri/Subarno hardcode',!/Bu Sri|Subarno|Suwardi|Suwita/i.test(retrieverSrc+caseSrc));
check('1.2 production retrieval has no good-faith-purchaser case hardcode',!/pembeli\s+beritikad\s+baik/i.test(retrieverSrc));
check('1.3 judicial search decorators are separated from relevance query',__test__.stripJudicialSearchDecorators('wanprestasi kontrak SEMA PERMA rumusan kamar putusan Mahkamah Agung')==='wanprestasi kontrak');
check('1.5 post-event judicial authority stays UNVERIFIED, not auto-rejected',__test__.inferAuthorityTempusStatus(2025,2024,'JUDICIAL_PRODUCT')==='UNVERIFIED');
check('1.6 post-event legislation remains potentially incompatible',__test__.inferAuthorityTempusStatus(2025,2024,'LEGISLATION')==='POTENTIALLY_INCOMPATIBLE');
check('1.4 official-result parser keeps bounded discovery context',(()=>{
  const html='<div>Wanprestasi kontrak prestasi somasi ganti rugi</div><a href="/direktori/putusan/mock.html">Putusan PN JAKARTA Nomor 11/Pdt.G/2025/PN Jkt</a><p>perjanjian tidak dipenuhi</p>';
  const hits=__test__.parseDirectOfficialSearch(html,'putusan3.mahkamahagung.go.id',5);
  return hits.length===1 && /wanprestasi|perjanjian/i.test(hits[0].context||'');
})());

const fixtures=[
  {title:'Kontrak',domain:'Hukum Perdata & Perikatan',text:'Para pihak menandatangani kontrak. Debitur tidak memenuhi prestasi setelah somasi dan diminta ganti rugi.'},
  {title:'Pidana',domain:'Hukum Pidana & Acara Pidana',text:'Tersangka mempersoalkan penahanan, penyitaan, keabsahan penyidikan, dan alat bukti.'},
  {title:'PHI',domain:'Ketenagakerjaan',text:'Pekerja mengalami PHK dan mempersoalkan pesangon, upah, serta prosedur pemutusan hubungan kerja.'},
  {title:'TUN',domain:'Tata Usaha Negara',text:'Penggugat mempersoalkan KTUN, kewenangan pejabat, cacat prosedur, dan tenggang gugatan.'},
  {title:'Tanah',domain:'Hukum Agraria & Pertanahan',text:'Terjadi jual beli tanah, AJB, balik nama sertifikat, peralihan hak, dan sengketa riwayat kepemilikan.'},
];
for(const [i,f] of fixtures.entries()){
  const q=buildOfficialLawQueries({title:f.title,domain:f.domain,text:f.text});
  const plan=buildAuthorityProviderPlan(q,'hybrid');
  check(`2.${i+1} ${f.title}: bounded regulation+judicial+case-law plan`,plan.regulation_queries.length>0&&plan.judicial_product_queries.length>0&&plan.case_law_queries.length>0&&plan.total_query_slots<=10,JSON.stringify(plan));
  check(`2.${i+6} ${f.title}: judicial queries do not bundle SEMA+PERMA+Rumusan together`,plan.judicial_product_queries.every(x=>!(/SEMA/i.test(x)&&/PERMA/i.test(x)&&/rumusan\s+kamar/i.test(x))),JSON.stringify(plan.judicial_product_queries));
}

async function runtime(){
  const originalFetch=globalThis.fetch;
  const response=(url:string,html:string,status=200)=>({ok:status>=200&&status<300,status,url,text:async()=>html,headers:new Headers()}) as any;
  const decode=(url:string)=>{try{return decodeURIComponent(url)}catch{return url}};
  (globalThis as any).fetch=async(raw:any)=>{
    const url=String(raw), d=decode(url);
    if(url.includes('peraturan.bpk.go.id/Search')) return response(url,'<html><body>No regulation detail fixture.</body></html>');
    if(url.includes('jdih.mahkamahagung.go.id/dokumen?search=')){
      const relevant=/wanprestasi|kontrak|perjanjian/i.test(d);
      if(relevant) return response(url,'<div>Pedoman sengketa wanprestasi kontrak, somasi dan ganti rugi</div><a href="/legal-product/sema-nomor-1-tahun-2025/detail">SEMA Nomor 1 Tahun 2025 tentang Sengketa Perjanjian</a>');
      return response(url,'<div>Administrasi internal pengadilan</div><a href="/legal-product/sema-nomor-9-tahun-2025/detail">SEMA Nomor 9 Tahun 2025 tentang Administrasi Internal</a>');
    }
    if(url.includes('putusan3.mahkamahagung.go.id/search.html?q=')){
      const relevant=/wanprestasi|kontrak|perjanjian/i.test(d);
      if(relevant) return response(url,'<div>Wanprestasi kontrak prestasi somasi ganti rugi</div><a href="/direktori/putusan/mock.html">Putusan PN JAKARTA Nomor 11/Pdt.G/2025/PN Jkt</a>');
      return response(url,'<div>Pidana narkotika</div><a href="/direktori/putusan/irrelevant.html">Putusan PN JAKARTA Nomor 12/Pid.Sus/2025/PN Jkt</a>');
    }
    if(url.includes('/legal-product/sema-nomor-1-tahun-2025/')) return response(url,'<html><title>SEMA Nomor 1 Tahun 2025</title><h1>SEMA NOMOR 1 TAHUN 2025</h1><div>Pedoman sengketa wanprestasi perjanjian, prestasi, somasi dan ganti rugi.</div></html>');
    if(url.includes('/legal-product/sema-nomor-9-tahun-2025/')) return response(url,'<html><title>SEMA Nomor 9 Tahun 2025</title><h1>SEMA NOMOR 9 TAHUN 2025</h1><div>Administrasi internal, tata naskah dan kepegawaian pengadilan.</div></html>');
    if(url.includes('/direktori/putusan/mock.html')) return response(url,'<html><title>Putusan PN JAKARTA Nomor 11/Pdt.G/2025/PN Jkt</title><h1>Putusan PN JAKARTA Nomor 11/Pdt.G/2025/PN Jkt</h1><div>Lembaga Peradilan PN JAKARTA Tanggal Dibacakan 10 Januari 2025. Sengketa wanprestasi kontrak, prestasi, somasi dan ganti rugi.</div></html>');
    if(url.includes('/direktori/putusan/irrelevant.html')) return response(url,'<html><title>Putusan PN JAKARTA Nomor 12/Pid.Sus/2025/PN Jkt</title><h1>Putusan PN JAKARTA Nomor 12/Pid.Sus/2025/PN Jkt</h1><div>Pidana narkotika dan barang bukti.</div></html>');
    if(url.includes('html.duckduckgo.com')||url.includes('bing.com')) return response(url,'<html></html>');
    return response(url,'<html></html>',404);
  };

  try{
    const qs=buildOfficialLawQueries({title:'Sengketa Kontrak',domain:'Hukum Perdata & Perikatan',text:'Para pihak terikat kontrak. Debitur tidak memenuhi prestasi setelah somasi dan kreditur meminta ganti rugi.'});
    const out=await discoverOfficialLaw({mode:'hybrid',queries:qs,domain:'Hukum Perdata & Perikatan',caseText:'kontrak wanprestasi prestasi somasi ganti rugi',maxCandidates:8});
    const jp=out.candidates.filter(c=>c.provider==='JDIH_MA');
    const dc=out.candidates.filter(c=>c.provider==='PUTUSAN_MA');
    check('3.1 actual retriever accepts materially relevant JDIH MA judicial product',jp.length>0 && jp.some(c=>c.material_nexus_status==='VERIFIED'&&c.authority_class==='JUDICIAL_PRODUCT'),JSON.stringify(jp));
    check('3.2 actual retriever accepts materially relevant official decision',dc.length>0 && dc.some(c=>c.material_nexus_status==='VERIFIED'&&c.authority_class==='DECISION'),JSON.stringify(dc));
    const d:any=out.diagnostics||{};
    check('3.3 diagnostics expose JDIH MA funnel',d.jdih_ma && Number.isInteger(d.jdih_ma.identity_rejected)&&Number.isInteger(d.jdih_ma.topical_rejected)&&Number.isInteger(d.jdih_ma.detail_fetches),JSON.stringify(d.jdih_ma));
    check('3.4 diagnostics expose Putusan MA funnel',d.putusan_ma && Number.isInteger(d.putusan_ma.identity_rejected)&&Number.isInteger(d.putusan_ma.topical_rejected)&&Number.isInteger(d.putusan_ma.detail_fetches),JSON.stringify(d.putusan_ma));
    check('3.5 global provider status reflects successful judicial yield',d.provider_status==='REACHABLE_CANDIDATES',String(d.provider_status));
    check('3.6 official search context is retained on accepted judicial candidate',[...jp,...dc].some(c=>/wanprestasi|kontrak/i.test(String((c as any).discovery_context||''))));

    // Negative run: same production pipeline, official domains reachable, but only unrelated authorities.
    const neg=await discoverOfficialLaw({mode:'hybrid',queries:['pajak pertambahan nilai administrasi'],domain:'Hukum Perdata & Perikatan',caseText:'kontrak wanprestasi prestasi somasi ganti rugi',maxCandidates:8});
    check('3.7 unrelated judicial candidates remain fail-closed',neg.candidates.filter(c=>c.provider==='JDIH_MA'||c.provider==='PUTUSAN_MA').length===0,JSON.stringify(neg.candidates));
    const nd:any=neg.diagnostics||{};
    check('3.8 negative funnel records rejection rather than silently dropping',((nd.jdih_ma?.rejected||0)+(nd.putusan_ma?.rejected||0))>0,JSON.stringify({jdih_ma:nd.jdih_ma,putusan_ma:nd.putusan_ma}));
  } finally {
    (globalThis as any).fetch=originalFetch;
  }
}

runtime().then(()=>{
  console.log(`\n${pass}/${pass+fail} V7.0.2.3 authority-funnel checks PASS`);
  if(fail) process.exit(1);
}).catch(err=>{console.error(err);process.exit(1);});
