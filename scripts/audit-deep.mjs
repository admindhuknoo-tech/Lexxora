import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=read('index.html');
const server=read('server.ts');
const db=read('server/db.ts');
const types=read('server/types.ts');
const templates=JSON.parse(read('src/data/templates.json'));
const failures=[];
const pass=[];
const check=(name,cond,detail='')=>(cond?pass:failures).push({name,detail});

// Parse the active inline application script for syntax without executing browser globals.
const start=index.indexOf('<script>');
const end=start>=0?index.indexOf('</script>',start+8):-1;
check('active inline script located',start>=0&&end>start);
if(start>=0&&end>start){
  try{ new Function(index.slice(start+8,end)); check('active inline script syntax',true); }
  catch(e){ check('active inline script syntax',false,String(e?.message||e)); }
}

for(const p of ['client','draft','review','case','corpus','risk','research','norm']){
  check(`panel ${p} has nav binding`,index.includes(`data-panel="${p}"`));
  check(`panel ${p} exists`,index.includes(`id="${p}"`));
}

const routeChecks=[
  ['draft create', "app.post('/api/drafts'", ['/drafts']],
  ['draft update', "app.put('/api/drafts/:id'", ['/drafts/']],
  ['client create', "app.post('/api/communications'", ['/communications']],
  ['client update', "app.put('/api/communications/:id'", ['/communications/']],
  ['history fetch', "app.get('/api/history/:kind/:id'", ['/history/${kind}/${id}']],
  ['case export by id', "app.get('/api/case-analysis/export/:fmt/:case_id'", ['/case-analysis/export/']],
  ['compliance questions', "app.get('/api/compliance/questions'", ['/compliance/questions']],
  ['compliance assess', "app.post('/api/compliance/assess'", ['/compliance/assess']],
  ['research summarize', "app.post('/api/research/summarize'", ['/research/summarize']],
  ['norm conflict', "app.post('/api/norm-conflicts'", ['/norm-conflicts']]
];
for(const [name,serverNeedle,uiNeedles] of routeChecks){
  check(`${name}: server route`,server.includes(serverNeedle));
  check(`${name}: frontend call`,uiNeedles.some(x=>index.includes(x)));
}

check('client communication type can be updated',types.includes('updated_at?: string')&&db.includes('updateClientCommunication'));
check('client save updates existing record instead of duplicating',index.includes("API+'/communications/'+currentClientDocumentId")&&index.includes("currentClientDocumentId=d.data?.id"));
check('draft history restores template key',index.includes('selectDraftTemplateFromRecord')&&index.includes('x?.template_key'));
check('research history restores source text',index.includes('x.source_text||x.content'));
check('compliance preview may be incomplete but final may not',server.includes('if (!preview && missingSystem.length)'));
check('API errors stay JSON',server.includes('Unhandled API error:')&&server.includes("type === 'entity.too.large'"));
check('template display names exclude internal classification pipes',Object.values(templates).every(x=>!String(x?.display_name||'').includes('|')));
check('template catalog remains enriched',Object.keys(templates).length>=300,`templates=${Object.keys(templates).length}`);
check('single frontend source of truth is index.html',!index.includes('src/main.tsx')&&!index.includes('type="module"'));
for(const orphan of ['src/main.tsx','src/App.tsx','src/index.css','src/components/analysis-report.tsx','src/lib/analysis.functions.ts','App.tsx','index.css','components/analysis-report.tsx','lib/analysis.functions.ts']){
  check(`orphan frontend removed: ${orphan}`,!fs.existsSync(path.join(root,orphan)));
}
const vite=read('vite.config.ts');
check('vite has no unused React/Tailwind plugins',!vite.includes('@vitejs/plugin-react')&&!vite.includes('@tailwindcss/vite')&&!vite.includes('react()')&&!vite.includes('tailwindcss()'));
const pkg=JSON.parse(read('package.json'));
const allDeps={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
for(const dep of ['react','react-dom','lucide-react','motion','@vitejs/plugin-react','@tailwindcss/vite','tailwindcss','autoprefixer']){
  check(`unused frontend dependency removed: ${dep}`,!(dep in allDeps));
}

for(const x of pass) console.log(`PASS  ${x.name}${x.detail?'  '+x.detail:''}`);
for(const x of failures) console.log(`FAIL  ${x.name}${x.detail?'  '+x.detail:''}`);
console.log(`\n${pass.length}/${pass.length+failures.length} deep-contract checks PASS`);
if(failures.length) process.exit(1);
