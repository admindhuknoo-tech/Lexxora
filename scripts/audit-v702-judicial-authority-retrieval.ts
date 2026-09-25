declare const process:any;
import fs from 'node:fs';
import path from 'node:path';
import {
  buildAuthorityProviderPlan,
  buildOfficialLawQueries,
  discoverOfficialLaw,
  inferJudicialAuthorityIdentity,
  parseQueryIdentity,
  __test__,
} from '../server/officialLawRetriever';

let pass=0, fail=0;
function check(name:string,ok:boolean,detail=''){
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok?pass++:fail++;
}

const retrieverSrc=fs.readFileSync(path.join(process.cwd(),'server','officialLawRetriever.ts'),'utf8');
check('1.1 no case-party hardcode in retriever',!/Bu Sri|Subarno|Suwardi|Suwita/i.test(retrieverSrc));
check('1.2 no case-doctrine hardcode in provider core',!/pembeli\s+beritikad\s+baik/i.test(retrieverSrc));
check('1.3 judicial providers are first-class',/JDIH_MA/.test(retrieverSrc)&&/PUTUSAN_MA/.test(retrieverSrc));
check('1.4 provider-aware bounded plan is installed',/regulationBudget=6/.test(retrieverSrc)&&/judicialProductBudget=2/.test(retrieverSrc)&&/caseLawBudget=2/.test(retrieverSrc));
check('1.5 global provider status aggregates all providers',__test__.aggregateProviderStatuses([{name:'JDIH_BPK',status:'UNREACHABLE',query_count:1},{name:'JDIH_MA',status:'REACHABLE_CANDIDATES',query_count:1},{name:'PUTUSAN_MA',status:'UNREACHABLE',query_count:1}])==='REACHABLE_CANDIDATES');
check('1.6 direct official parsers are installed',/directOfficialDomainSearch\s*\(/.test(retrieverSrc)&&/parseDirectOfficialSearch\s*\(/.test(retrieverSrc));

const sema=parseQueryIdentity('SEMA Nomor 4 Tahun 2016');
const perma=parseQueryIdentity('Peraturan Mahkamah Agung Nomor 2 Tahun 2024');
check('2.1 SEMA exact identity parser',sema.instrument_family==='SEMA'&&sema.number==='4'&&sema.year===2016&&sema.exact===true,JSON.stringify(sema));
check('2.2 PERMA exact identity parser',perma.instrument_family==='PERMA'&&perma.number==='2'&&perma.year===2024&&perma.exact===true,JSON.stringify(perma));

const pn=inferJudicialAuthorityIdentity('Putusan PN BANDUNG Nomor 234/Pdt.G/2026/PN Bdg Tanggal Dibacakan 14 Juli 2026 Lembaga Peradilan PN BANDUNG','https://putusan3.mahkamahagung.go.id/direktori/putusan/x.html');
const ma=inferJudicialAuthorityIdentity('Putusan Mahkamah Agung Nomor 123 K/Pdt/2024 Tanggal Dibacakan 12 Januari 2025','https://putusan3.mahkamahagung.go.id/direktori/putusan/y.html');
const rk=inferJudicialAuthorityIdentity('Nomor Rumusan Kamar PERDATA UMUM/B.4/SEMA 4 2016 Nomor Sema SEMA Nomor 4 Tahun 2016','https://putusan3.mahkamahagung.go.id/rumusan_kamar/detail/z.html');
check('2.3 first-instance decision parser',pn?.authority_class==='DECISION'&&pn.decision_number==='234/Pdt.G/2026/PN Bdg'&&pn.year===2026,JSON.stringify(pn));
check('2.4 MA cassation decision parser',ma?.authority_class==='DECISION'&&ma.decision_number==='123 K/Pdt/2024'&&ma.year===2024,JSON.stringify(ma));
check('2.5 chamber formulation parser',rk?.authority_class==='JUDICIAL_PRODUCT'&&rk.judicial_product_type==='RUMUSAN_KAMAR',JSON.stringify(rk));

const genericFixtures=[
  {title:'Kontrak',domain:'Hukum Perdata & Perikatan',text:'Para pihak menandatangani perjanjian. Debitur tidak memenuhi prestasi setelah somasi dan kreditur meminta ganti rugi.'},
  {title:'Pidana',domain:'Hukum Pidana & Acara Pidana',text:'Tersangka ditahan dan mengajukan keberatan terhadap penyitaan serta keabsahan tindakan penyidikan.'},
  {title:'PHI',domain:'Ketenagakerjaan',text:'Pekerja mengalami PHK dan mempersoalkan pesangon, upah, serta prosedur pemutusan hubungan kerja.'},
  {title:'TUN',domain:'Tata Usaha Negara',text:'Penggugat mempersoalkan keputusan pejabat administrasi, kewenangan penerbitan KTUN, dan tenggang gugatan.'},
  {title:'Tanah',domain:'Hukum Agraria & Pertanahan',text:'Terjadi jual beli tanah, AJB, balik nama sertifikat, peralihan hak, dan sengketa riwayat kepemilikan.'},
];
for(const [i,f] of genericFixtures.entries()){
  const queries=buildOfficialLawQueries({title:f.title,domain:f.domain,text:f.text});
  const plan=buildAuthorityProviderPlan(queries,'hybrid');
  check(`3.${i+1} ${f.title} gets regulation + judicial + case-law slots`,plan.regulation_queries.length>0&&plan.judicial_product_queries.length>0&&plan.case_law_queries.length>0&&plan.total_query_slots<=10,JSON.stringify(plan));
}

// Runtime integration with a deterministic mocked network. This exercises the real
// provider routing, HTML parsing, material-nexus gate, merge, and diagnostics without
// depending on external network availability.
async function runRuntimeAudit(){
const originalFetch=globalThis.fetch;
const response=(url:string,html:string,status=200)=>({ok:status>=200&&status<300,status,url,text:async()=>html,headers:new Headers()}) as any;
(globalThis as any).fetch=async (raw:any)=>{
  const url=String(raw);
  if(url.includes('peraturan.bpk.go.id/Search')) return response(url,'<html><body>No regulation detail links in this deterministic fixture.</body></html>');
  if(url.includes('jdih.mahkamahagung.go.id/dokumen?search=')){
    return response(url,'<a href="/legal-product/sema-nomor-1-tahun-2025/detail">SEMA Nomor 1 Tahun 2025 tentang Wanprestasi Perjanjian dan Ganti Rugi</a>');
  }
  if(url.includes('putusan3.mahkamahagung.go.id/search.html?q=')){
    return response(url,'<a href="/direktori/putusan/mock.html">Putusan PN JAKARTA Nomor 11/Pdt.G/2025/PN Jkt</a>');
  }
  if(url.includes('html.duckduckgo.com') && decodeURIComponent(url).includes('site:jdih.mahkamahagung.go.id')){
    return response(url,'<a class="result__a" href="https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-1-tahun-2025/detail">SEMA Nomor 1 Tahun 2025 tentang Wanprestasi Perjanjian dan Ganti Rugi</a>');
  }
  if(url.includes('html.duckduckgo.com') && decodeURIComponent(url).includes('site:putusan3.mahkamahagung.go.id')){
    return response(url,'<a class="result__a" href="https://putusan3.mahkamahagung.go.id/direktori/putusan/mock.html">Putusan PN JAKARTA Nomor 11/Pdt.G/2025/PN Jkt</a>');
  }
  if(url.includes('jdih.mahkamahagung.go.id/legal-product/')){
    return response(url,'<html><title>SEMA Nomor 1 Tahun 2025</title><h1>SEMA NOMOR 1 TAHUN 2025</h1><div>Wanprestasi perjanjian prestasi somasi ganti rugi. Pedoman bagi pengadilan mengenai sengketa perjanjian dan ganti rugi.</div></html>');
  }
  if(url.includes('putusan3.mahkamahagung.go.id/direktori/putusan/')){
    return response(url,'<html><title>Putusan PN JAKARTA Nomor 11/Pdt.G/2025/PN Jkt</title><h1>Putusan PN JAKARTA Nomor 11/Pdt.G/2025/PN Jkt</h1><div>Lembaga Peradilan PN JAKARTA Tanggal Dibacakan 10 Januari 2025. Sengketa wanprestasi perjanjian prestasi somasi ganti rugi.</div></html>');
  }
  if(url.includes('bing.com')) return response(url,'<html></html>');
  return response(url,'<html></html>',404);
};

try{
  const qs=buildOfficialLawQueries({
    title:'Sengketa Perjanjian',domain:'Hukum Perdata & Perikatan',
    text:'Para pihak terikat perjanjian. Salah satu pihak tidak memenuhi prestasi walaupun telah disomasi dan diminta ganti rugi.'
  });
  const out=await discoverOfficialLaw({mode:'hybrid',queries:qs,domain:'Hukum Perdata & Perikatan',caseText:'wanprestasi perjanjian prestasi somasi ganti rugi',maxCandidates:8});
  const jp=out.candidates.find(c=>c.provider==='JDIH_MA');
  const dc=out.candidates.find(c=>c.provider==='PUTUSAN_MA');
  check('4.1 mocked runtime discovers JDIH MA judicial product',!!jp && jp.authority_class==='JUDICIAL_PRODUCT' && jp.material_nexus_status==='VERIFIED',JSON.stringify(jp));
  check('4.2 mocked runtime discovers official decision',!!dc && dc.authority_class==='DECISION' && dc.material_nexus_status==='VERIFIED',JSON.stringify(dc));
  check('4.3 diagnostics expose provider-aware plan',!!(out.diagnostics as any)?.provider_plan && (out.providers||[]).some(p=>p.name==='JDIH_MA') && (out.providers||[]).some(p=>p.name==='PUTUSAN_MA'),JSON.stringify(out.providers));
  check('4.4 global provider diagnostics report candidates when judicial provider succeeds',(out.diagnostics as any)?.provider_status==='REACHABLE_CANDIDATES',JSON.stringify((out.diagnostics as any)?.provider_status));
  check('4.5 direct official search used before third-party fallback',((out.diagnostics as any)?.judicial_search_diagnostics||[]).some((d:any)=>d.strategy==='DIRECT_OFFICIAL'),JSON.stringify((out.diagnostics as any)?.judicial_search_diagnostics));
}finally{
  (globalThis as any).fetch=originalFetch;
}
}

runRuntimeAudit().then(()=>{
  console.log(`\n${pass}/${pass+fail} V7.0.2 judicial-authority retrieval checks PASS`);
  if(fail) process.exit(1);
}).catch(err=>{console.error(err);process.exit(1);});
