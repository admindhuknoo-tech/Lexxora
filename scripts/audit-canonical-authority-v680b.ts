declare const process:any;
import fs from 'node:fs';
import path from 'node:path';
let pass=0, fail=0;
function check(name:string,ok:boolean,detail=''){console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);ok?pass++:fail++;}
const caseSrc=fs.readFileSync(path.join(process.cwd(),'server','caseAnalysis.ts'),'utf8');
const ret=fs.readFileSync(path.join(process.cwd(),'server','officialLawRetriever.ts'),'utf8');
const occ=(s:string,re:RegExp)=>(s.match(re)||[]).length;

check('1.1 exactly one caseAnalysis canonicalAuthorities bridge',occ(caseSrc,/canonicalAuthorities\s*:\s*canonicalAuthoritySeeds/g)===1,`count=${occ(caseSrc,/canonicalAuthorities\s*:\s*canonicalAuthoritySeeds/g)}`);
check('1.2 duplicate canonicalSeeds caller absent',!(/\bcanonicalSeeds\b/.test(caseSrc)));
check('1.3 malformed manualAuthorities/canonicalSeeds sequence absent',!(/manualAuthorities:[\s\S]{0,120}\[\]\s*\n\s*canonicalSeeds/.test(caseSrc)));
check('1.4 existing sourceStrategy preserved',/sourceStrategy\s*:\s*input\.official_source_strategy\s*\|\|\s*['"]auto['"]/.test(caseSrc));
check('1.5 existing manualAuthorities preserved',/manualAuthorities\s*:\s*input\.manual_official_sources\s*\|\|\s*\[\]/.test(caseSrc));

check('2.1 retriever exposes canonicalAuthorities',/canonicalAuthorities\?\s*:\s*CanonicalSeed\[\]/.test(ret));
check('2.2 retriever consumes canonicalAuthorities',/input\.canonicalAuthorities/.test(ret));
check('2.3 legacy canonicalSeeds input absent',!(/canonicalSeeds\?\s*:\s*CanonicalSeed\[\]/.test(ret)));
check('2.4 exact resolver implementation retained',/resolveExactCitation\s*\(/.test(ret));
check('2.5 bounded canonical resolver retained',/resolveCanonicalSeeds\s*\(/.test(ret));
check('2.6 canonical resolver has finite seed cap',/CANONICAL_SEED_MAX\s*=\s*6/.test(ret));
check('2.7 canonical resolver has time budget',/CANONICAL_SEED_BUDGET_MS\s*=\s*45000/.test(ret));

check('3.1 provider search cap 8 preserved',/queries\.slice\(0\s*,\s*8\)|input\.queries\.slice\(0\s*,\s*8\)/.test(ret));
check('3.2 no legacy threshold 14 restored',!(/minScore\s*=\s*minHits\s*>=\s*2\s*\?\s*14\s*:\s*11/.test(ret)));
check('3.3 adaptive SHORT_SPECIFIC threshold 10 present',/SHORT_SPECIFIC[\s\S]{0,220}minNexus\s*:\s*10|kind\s*:\s*['"]SHORT_SPECIFIC['"][\s\S]{0,120}minNexus\s*:\s*10/.test(ret));
check('3.4 no production regulation-number hardcode',!(/\bPP\s+24\s+Tahun\s+1997|\bUU\s+5\s+Tahun\s+1960|\bPP\s+18\s+Tahun\s+2021|\bUU\s+13\s+Tahun\s+2003/i.test(ret+'\n'+caseSrc)));

console.log(`\n${pass}/${pass+fail} canonical-authority-v680b checks PASS`);
if(fail) process.exit(1);
