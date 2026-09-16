import fs from 'node:fs';
import path from 'node:path';
import { __test__ } from '../server/officialLawRetriever';

let pass = 0, fail = 0;
function check(name:string, ok:boolean, detail=''){
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok ? pass++ : fail++;
}

const retrieverPath = path.join(process.cwd(), 'server', 'officialLawRetriever.ts');
const retriever = fs.readFileSync(retrieverPath, 'utf8');
const casePath = path.join(process.cwd(), 'server', 'caseAnalysis.ts');
const caseSrc = fs.existsSync(casePath) ? fs.readFileSync(casePath, 'utf8') : '';

check('1.1 discoverOfficialLaw accepts canonicalAuthorities', /canonicalAuthorities\?:\s*string\[\]\|string/.test(retriever));
check('1.2 canonical seeds use existing exact resolver', /resolveExactCitation\(raw,identity\)/.test(retriever));
check('1.3 canonical seed candidate is exact-identity verified', /query_kind:'CANONICAL_CORPUS_SEED'/.test(retriever) && /identity_match:'EXACT'/.test(retriever));
check('1.4 canonical source origin is LOCAL identity seed', /source_origin:'LOCAL'/.test(retriever));
check('1.5 user manual exact candidate keeps priority', /user-selected exact authority > verified canonical corpus seed > topical auto discovery/i.test(retriever));
check('1.6 topical auto discovery remains present', /discoverAutoOfficialLaw/.test(retriever));
check('1.7 network topical search cap remains 8', /input\.queries\.slice\(0,8\)/.test(retriever));
check('1.8 threshold policy 10\/12 preserved', /minNexus:\s*10/.test(retriever) && /minNexus:\s*12/.test(retriever));
check('1.9 canonical seed diagnostics present', /canonical_seed_resolved/.test(retriever) && /canonical_seed_attempts/.test(retriever));

const split = (__test__ as any).splitCanonicalAuthoritySeeds;
check('2.0 split helper exported for audit', typeof split === 'function');
if (typeof split === 'function') {
  const xs = split('PP No. 24 Tahun 1997 jo PP No. 18 Tahun 2021; UU No. 5 Tahun 1960');
  check('2.1 jo chain expands into independent exact identities', xs.length === 3, JSON.stringify(xs));
  check('2.2 seed expansion preserves regulation identities', xs.includes('PP No. 24 Tahun 1997') && xs.includes('PP No. 18 Tahun 2021') && xs.includes('UU No. 5 Tahun 1960'), JSON.stringify(xs));
}

check('3.1 caseAnalysis bridge installed', /const\s+canonicalAuthoritySeeds/.test(caseSrc) && /canonicalAuthorities:\s*canonicalAuthoritySeeds/.test(caseSrc));
check('3.2 bridge derives seeds from matchedRegs', /\(matchedRegs\s*\|\|\s*\[\]\)/.test(caseSrc));
check('3.3 bridge contains no Tanah-specific regulation numbers', !/PP\s+No\.\s*24\s+Tahun\s+1997|UU\s+No\.\s*5\s+Tahun\s+1960|PP\s+No\.\s*18\s+Tahun\s+2021/i.test(caseSrc));
check('3.4 bridge is confidence\/nexus gated', /material_confidence/.test(caseSrc) && /issue_phrase_hits/.test(caseSrc) && /anchor_hits/.test(caseSrc));

console.log(`\n${pass}/${pass+fail} canonical-authority-seed-v6712 checks PASS`);
if (fail) process.exit(1);
