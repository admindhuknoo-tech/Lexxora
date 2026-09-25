declare const process:any;
import { runCaseAnalysis } from '../server/caseAnalysis';

let pass=0,fail=0;
function check(name:string,ok:boolean,detail=''){
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok?pass++:fail++;
}

async function main(){
  const originalFetch=globalThis.fetch;
  const originalLog=console.log;
  const response=(url:string,html:string,status=200)=>({ok:status>=200&&status<300,status,url,text:async()=>html,headers:new Headers()}) as any;
  (globalThis as any).fetch=async(raw:any)=>{
    const url=String(raw);
    if(url.includes('peraturan.bpk.go.id/Search')) return response(url,'<html><body>No regulation detail fixture.</body></html>');
    if(url.includes('jdih.mahkamahagung.go.id/dokumen?search=')) return response(url,'<div>Pedoman sengketa wanprestasi kontrak, somasi dan ganti rugi</div><a href="/legal-product/sema-nomor-1-tahun-2025/detail">SEMA Nomor 1 Tahun 2025 tentang Sengketa Perjanjian</a>');
    if(url.includes('putusan3.mahkamahagung.go.id/search.html?q=')) return response(url,'<div>Wanprestasi kontrak prestasi somasi ganti rugi</div><a href="/direktori/putusan/mock.html">Putusan PN JAKARTA Nomor 11/Pdt.G/2025/PN Jkt</a>');
    if(url.includes('/legal-product/sema-nomor-1-tahun-2025/')) return response(url,'<html><title>SEMA Nomor 1 Tahun 2025</title><h1>SEMA NOMOR 1 TAHUN 2025</h1><div>Pedoman sengketa wanprestasi perjanjian, prestasi, somasi dan ganti rugi.</div></html>');
    if(url.includes('/direktori/putusan/mock.html')) return response(url,'<html><title>Putusan PN JAKARTA Nomor 11/Pdt.G/2025/PN Jkt</title><h1>Putusan PN JAKARTA Nomor 11/Pdt.G/2025/PN Jkt</h1><div>Lembaga Peradilan PN JAKARTA Tanggal Dibacakan 10 Januari 2025. Sengketa wanprestasi kontrak, prestasi, somasi dan ganti rugi.</div></html>');
    if(url.includes('html.duckduckgo.com')||url.includes('bing.com')) return response(url,'<html></html>');
    return response(url,'<html></html>',404);
  };
  console.log=(...args:any[])=>{ if(String(args[0]||'').startsWith('[LEXICORE:')) return; originalLog(...args); };
  try{
    const out=await runCaseAnalysis({
      title:'Sengketa Kontrak',
      narrative:'Pada tahun 2024 para pihak membuat perjanjian. Debitur tidak memenuhi prestasi setelah somasi. Kreditur meminta ganti rugi.',
      regulatory_mode:'hybrid',
    });
    const official=(out as any).official_law_retrieval?.candidates||[];
    const applicable=(out as any).applicable_law||[];
    const issues=(out as any).legal_issues||[];
    check('1 official pipeline yields JDIH MA candidate',official.some((c:any)=>c.provider==='JDIH_MA'&&c.authority_class==='JUDICIAL_PRODUCT'),JSON.stringify(official.map((c:any)=>({p:c.provider,t:c.title,temp:c.tempus_status}))));
    check('2 official pipeline yields Putusan MA candidate',official.some((c:any)=>c.provider==='PUTUSAN_MA'&&c.authority_class==='DECISION'));
    check('3 post-event judicial candidate not auto-rejected',official.filter((c:any)=>c.provider==='JDIH_MA'||c.provider==='PUTUSAN_MA').every((c:any)=>c.tempus_status!=='POTENTIALLY_INCOMPATIBLE'));
    check('4 Section III/applicable law contains judicial product',applicable.some((x:any)=>/SEMA/i.test(String(x.regulation||''))),JSON.stringify(applicable.map((x:any)=>({status:x.status,regulation:x.regulation}))));
    check('5 Section III/applicable law contains decision',applicable.some((x:any)=>/Putusan/i.test(String(x.regulation||''))));
    check('6 issue binding contains judicial authority',issues.some((x:any)=>(x.bound_authorities||[]).some((b:any)=>/SEMA|Putusan/i.test(String(b.source_label||'')))),JSON.stringify(issues.map((x:any)=>({issue:x.issue,bound:(x.bound_authorities||[]).map((b:any)=>b.source_label)}))));
    check('7 professional-verification posture preserved',applicable.filter((x:any)=>/JUDICIAL/.test(String(x.status||''))).every((x:any)=>/wajib diverifikasi profesional/i.test(String(x.relevance||''))));
  } finally {
    (globalThis as any).fetch=originalFetch;
    console.log=originalLog;
  }
  originalLog(`\n${pass}/${pass+fail} V7.0.2.3 end-to-end case-pipeline checks PASS`);
  if(fail) process.exit(1);
}
main().catch(err=>{console.error(err);process.exit(1)});
