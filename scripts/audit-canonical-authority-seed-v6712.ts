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

check('1.1 discoverOfficialLaw accepts canonicalAuthorities', /canonicalAuthorities\?:\s*Array<string\s*\|\s*CanonicalSeed>/.test(retriever));
check('1.2 canonical seeds use existing exact resolver', /resolveExactCitation\(query,identity,\{[\s\S]{0,120}?skipJdihn:true[\s\S]{0,120}?skipWebDiscovery:true/.test(retriever));
check('1.3 canonical seed candidate is exact-identity verified', /canonical seed derived from local corpus/.test(retriever) && /identity_match:\s*'EXACT'/.test(retriever) && /query_kind:\s*'EXACT_CITATION'/.test(retriever));
check('1.4 verified canonical seed remains official-source origin', /canonical seed derived from local corpus[\s\S]{0,800}?source_origin:\s*'AUTO'|source_origin:\s*'AUTO'[\s\S]{0,800}?canonical seed derived from local corpus/.test(retriever));
check('1.5 user manual exact candidate keeps priority', /Priority:\s*manual user selection > canonical corpus seed > keyword auto-discovery/i.test(retriever) && /for\(const c of manual\.candidates\)[\s\S]{0,240}?for\(const c of seed\.candidates\)[\s\S]{0,240}?for\(const c of auto\.candidates\)/.test(retriever));
check('1.6 topical auto discovery remains present', /discoverAutoOfficialLaw/.test(retriever));
check('1.7 provider-aware bounded network plan preserved', /buildAuthorityProviderPlan\s*\(/.test(retriever) && /regulationBudget=6/.test(retriever) && /judicialProductBudget=2/.test(retriever) && /caseLawBudget=2/.test(retriever));
check('1.8 threshold policy 10\/12 preserved', /minNexus:\s*10/.test(retriever) && /minNexus:\s*12/.test(retriever));
check('1.9 canonical seed diagnostics present', /canonical_authorities_resolved/.test(retriever) && /canonical_seed_attempts/.test(retriever) && /canonical_seeds_resolved/.test(retriever));

const normalize = (__test__ as any).normalizeCanonicalAuthorities;
check('2.0 canonical authority normalizer exported for audit', typeof normalize === 'function');
if (typeof normalize === 'function') {
  const xs = normalize(['PP No. 24 Tahun 1997 jo PP No. 18 Tahun 2021','UU No. 5 Tahun 1960']);
  check('2.1 jo chain expands into independent exact identities', xs.length === 3, JSON.stringify(xs));
  const keys=xs.map((x:any)=>`${x.instrument_family}|${x.number}|${x.year}`);
  check('2.2 seed expansion preserves regulation identities', keys.includes('PP|24|1997') && keys.includes('PP|18|2021') && keys.includes('UU|5|1960'), JSON.stringify(keys));
}

check('3.1 caseAnalysis bridge installed', /const\s+canonicalAuthoritySeeds/.test(caseSrc) && /canonicalAuthorities:\s*canonicalAuthoritySeeds/.test(caseSrc));
check('3.2 bridge derives seeds from matchedRegs', /\(matchedRegs\s*\|\|\s*\[\]\)/.test(caseSrc));
check('3.3 bridge contains no Tanah-specific regulation numbers', !/PP\s+No\.\s*24\s+Tahun\s+1997|UU\s+No\.\s*5\s+Tahun\s+1960|PP\s+No\.\s*18\s+Tahun\s+2021/i.test(caseSrc));
check('3.4 bridge is confidence\/nexus gated', /material_confidence/.test(caseSrc) && /issue_phrase_hits/.test(caseSrc) && /anchor_hits/.test(caseSrc));

console.log(`\n${pass}/${pass+fail} canonical-authority-seed-v6712 checks PASS`);
if (fail) process.exit(1);
