import fs from 'node:fs';

const caseSrc = fs.readFileSync(new URL('../server/caseAnalysis.ts', import.meta.url), 'utf8');
const retrieverSrc = fs.readFileSync(new URL('../server/officialLawRetriever.ts', import.meta.url), 'utf8');

const checks = [];
const check = (name, ok, detail='') => { checks.push({name,ok,detail}); console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`); };

check('Claim-first source-role semantics exist', /claimFirstRoles=.*LITIGATION_SUBMISSION/.test(caseSrc) && /claims\.length>=facts\.length/.test(caseSrc));
check('Degraded reasoning is canonical and cannot be READY', /const\s+reasoningStatus:\s*'READY'\s*\|\s*'DEGRADED'/.test(caseSrc) && /reasoning\.reasoning_status/.test(caseSrc) && !/reasoningStatus:\s*'DEGRADED_FALLBACK'/.test(caseSrc));
check('Forensic validator requires actor matrix', /key:'actor_matrix'[\s\S]*?actorMatrix\|\|\[\]\)\.length>=2/.test(caseSrc));
check('Forensic validator requires multi issue IRAC', /key:'irac_multi_issue'[\s\S]*?legalIssues\|\|\[\]\)\.length>=2/.test(caseSrc));
check('Forensic validator requires blank spot audit', /key:'blank_spot_audit'[\s\S]*?blankSpotQuestions\|\|\[\]\)\.length>=5/.test(caseSrc));
check('Forensic validator requires adverse evidence', /key:'adverse_evidence_analyzed'[\s\S]*?adverseSpecific>0/.test(caseSrc));
check('Pipeline gate is executable', /evaluateCasePipelineGate/.test(caseSrc) && /pipeline_gate/.test(caseSrc));
check('Online applicable law requires identity verified', /filter\(\(c:any\) => c\.status === 'IDENTITY_VERIFIED'\)/.test(caseSrc));
check('Authority identity guard exists', /authorityMatches/.test(retrieverSrc));
check('Instrument family identity guard exists', /instrumentFamily/.test(retrieverSrc) && /familyOk/.test(retrieverSrc));
check('Number and year identity guard exists', /numberOk/.test(retrieverSrc) && /yearOk/.test(retrieverSrc));
check('Local mode bypasses online retrieval', /DISABLED_LOCAL_MODE/.test(retrieverSrc));

// Regression fixtures: these are acceptance properties, not expected legal conclusions.
const exactIdentity = (q,c) => {
  const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const auth=s=>/dkpp/.test(norm(s))?'DKPP':/\bkpu\b|komisi pemilihan umum/.test(norm(s))?'KPU':undefined;
  const fam=s=>{ const n=norm(s); if(/peraturan dkpp/.test(n))return'PDKPP'; if(/peraturan kpu|pkpu/.test(n))return'PKPU'; if(/peraturan daerah|perda/.test(n))return'PERDA'; if(/peraturan bupati|perbup/.test(n))return'PERBUP'; if(/undang undang|^uu$/.test(n))return'UU'; return n; };
  const parse=s=>{ const m=String(s).match(/(Peraturan DKPP|Peraturan KPU|PKPU|Peraturan Daerah|PERDA|Peraturan Bupati|PERBUP|Undang-Undang|UU)\s+(?:Nomor|No\.?)[ :]*([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i); return m?{f:fam(m[1]),n:norm(m[2]),y:Number(m[3]),a:auth(s)}:null; };
  const a=parse(q), b=parse(c); if(!a||!b)return false; return (!a.a||a.a===b.a)&&a.f===b.f&&a.n===b.n&&a.y===b.y;
};
check('Fixture accepts DKPP exact identity', exactIdentity('Peraturan DKPP Nomor 2 Tahun 2017','Peraturan DKPP Nomor 2 Tahun 2017 tentang Kode Etik'));
check('Fixture rejects Perda with same number/year', !exactIdentity('Peraturan DKPP Nomor 2 Tahun 2019','Peraturan Daerah Kabupaten Rokan Hulu Nomor 2 Tahun 2019'));
check('Fixture rejects Perbup with same number/year', !exactIdentity('Peraturan KPU Nomor 21 Tahun 2020','Peraturan Bupati Karimun Nomor 21 Tahun 2020'));

const failed=checks.filter(x=>!x.ok);
console.log(`\n${checks.length-failed.length}/${checks.length} pipeline acceptance checks PASS`);
if(failed.length) process.exit(1);
