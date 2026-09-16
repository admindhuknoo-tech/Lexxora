const base=(process.argv[2]||process.env.LEXICORE_BASE_URL||'http://127.0.0.1:3000').replace(/\/$/,'');
let pass=0, fail=0;
function check(name,ok,detail=''){ console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`); ok?pass++:fail++; }
async function get(path){
  const started=Date.now();
  const res=await fetch(base+path,{headers:{'accept':'application/json','x-request-id':'smoke-v612'}});
  const text=await res.text();
  let body=null; try{body=JSON.parse(text)}catch{}
  return {res,body,text,ms:Date.now()-started};
}
try{
  const live=await get('/api/live');
  check('1 liveness 200',live.res.status===200,`status=${live.res.status} ${live.ms}ms`);
  check('2 security headers present',live.res.headers.get('x-content-type-options')==='nosniff' && live.res.headers.get('x-frame-options')==='DENY');
  check('3 request id echoed',live.res.headers.get('x-request-id')==='smoke-v612');

  const ready=await get('/api/ready');
  check('4 readiness 200',ready.res.status===200,`status=${ready.res.status}`);
  check('5 reference corpus loaded',Number(ready.body?.references?.templates)>0 && Number(ready.body?.references?.regulations)>0,JSON.stringify(ready.body?.references||{}));
  check('6 transient storage disclosed',ready.body?.storage_mode==='IN_MEMORY_TRANSIENT');

  const health=await get('/api/health');
  check('7 health 200',health.res.status===200);
  check('8 baseline is v6.12.0',health.body?.baseline==='V6.12.0-GROUP-D');

  const templates=await get('/api/drafting/templates');
  const rows=Object.values(templates.body?.data||templates.body?.templates||{});
  check('9 template index available',templates.res.status===200 && rows.length>0,`count=${rows.length}`);
  check('10 template index excludes heavy structure',rows.every(x=>!('structure' in (x||{})) && !('required_elements' in (x||{}))));
  check('11 template index cache header',/max-age=300/.test(templates.res.headers.get('cache-control')||''));

  console.log(`\n${pass}/${pass+fail} production-smoke checks PASS`);
  if(fail) process.exit(1);
}catch(err){
  console.error('FAIL | smoke execution |',err?.message||err);
  process.exit(1);
}
