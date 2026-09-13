import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const srcPath=path.join(root,'src','data','official-drafting-sources.json');
const outPath=path.join(root,'src','data','official-drafting-source-status.json');
const registry=JSON.parse(fs.readFileSync(srcPath,'utf8'));
const rows=[];
for (const [id,src] of Object.entries(registry.sources||{})) {
  const row={id,url:src.url,issuer:src.issuer,title:src.title,kind:src.kind,checked_at:new Date().toISOString(),status:'UNREACHABLE',http_status:null,final_url:null,page_title:null};
  try {
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),12000);
    const r=await fetch(src.url,{redirect:'follow',signal:ctrl.signal,headers:{'User-Agent':'LexiCore-Official-Source-Audit/1.0'}});
    clearTimeout(timer);
    row.http_status=r.status; row.final_url=r.url; row.status=r.ok?'REACHABLE':'HTTP_ERROR';
    const ct=r.headers.get('content-type')||'';
    if(r.ok && /text\/html/i.test(ct)){
      const html=(await r.text()).slice(0,500000);
      const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if(m) row.page_title=m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,300);
    }
  } catch (e) { row.error=String(e?.message||e).slice(0,300); }
  rows.push(row);
  console.log(`${row.status.padEnd(11)} ${id} ${row.http_status??'-'} ${src.url}`);
}
fs.writeFileSync(outPath,JSON.stringify({generated_at:new Date().toISOString(),sources:rows},null,2));
console.log(`\nSaved ${rows.length} source checks to ${path.relative(root,outPath)}`);
