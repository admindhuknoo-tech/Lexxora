declare const process: any;
import fs from 'node:fs';
import path from 'node:path';
import { parseQueryIdentity } from '../server/officialLawRetriever';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const retrieverSrc = fs.readFileSync(path.join(process.cwd(), 'server', 'officialLawRetriever.ts'), 'utf8');
const caseSrc = fs.readFileSync(path.join(process.cwd(), 'server', 'caseAnalysis.ts'), 'utf8');

const forbiddenPatterns = [
  /\bPP\s+24\s+Tahun\s+1997/i,
  /\bUU\s+5\s+Tahun\s+1960/i,
  /\bPP\s+18\s+Tahun\s+2021/i,
  /\bUU\s+13\s+Tahun\s+2003/i,
];
check('1.1 officialLawRetriever.ts has no hardcoded regulation identity', !forbiddenPatterns.some(re => re.test(retrieverSrc)));
check('1.2 caseAnalysis.ts has no hardcoded regulation identity', !forbiddenPatterns.some(re => re.test(caseSrc)));
check('1.3 resolveCanonicalSeeds is present', /async function resolveCanonicalSeeds\s*\(/.test(retrieverSrc));
check('1.4 canonicalAuthoritySeeds bridge is present', /const\s+canonicalAuthoritySeeds\s*=/.test(caseSrc));
check('1.5 canonicalAuthorities is wired to discoverOfficialLaw', /discoverOfficialLaw\s*\(\s*\{[\s\S]{0,1600}?canonicalAuthorities\s*:\s*canonicalAuthoritySeeds/.test(caseSrc));
check('1.6 canonical merge priority is manual > seed > auto', /for\(const c of manual\.candidates\)[\s\S]{0,300}?for\(const c of seed\.candidates\)[\s\S]{0,300}?for\(const c of auto\.candidates\)/.test(retrieverSrc));
check('1.7 canonical resolver is bounded to max 6', /CANONICAL_SEED_MAX\s*=\s*6/.test(retrieverSrc));
check('1.8 canonical resolver has 45s budget', /CANONICAL_SEED_BUDGET_MS\s*=\s*45000/.test(retrieverSrc));
check('1.9 canonical exact path skips broad JDIHN/web discovery', /skipJdihn\s*:\s*true[\s\S]{0,100}?skipWebDiscovery\s*:\s*true/.test(retrieverSrc));
check('1.10 diagnostics expose canonical seed attempts/resolution', /canonical_seeds_attempted/.test(retrieverSrc) && /canonical_seeds_resolved/.test(retrieverSrc) && /canonical_seed_attempts/.test(retrieverSrc));

const shapes: Array<{ input: string; expectFamily: string; expectNumber: string; expectYear: number }> = [
  { input: 'PP No. 24 Tahun 1997', expectFamily: 'PP', expectNumber: '24', expectYear: 1997 },
  { input: 'PP No. 24 Tahun 1997 jo PP No. 18 Tahun 2021', expectFamily: 'PP', expectNumber: '24', expectYear: 1997 },
  { input: 'UU No. 5 Tahun 1960', expectFamily: 'UU', expectNumber: '5', expectYear: 1960 },
  { input: 'UU No. 8 Tahun 1999', expectFamily: 'UU', expectNumber: '8', expectYear: 1999 },
  { input: 'Undang-Undang Nomor 13 Tahun 2003', expectFamily: 'UU', expectNumber: '13', expectYear: 2003 },
  { input: 'Peraturan Pemerintah Nomor 35 Tahun 2021', expectFamily: 'PP', expectNumber: '35', expectYear: 2021 },
];
for (const s of shapes) {
  const id = parseQueryIdentity(s.input);
  check(`2.x parse "${s.input}" -> ${s.expectFamily}|${s.expectNumber}|${s.expectYear}`,
    id.exact === true && id.instrument_family === s.expectFamily && String(id.number) === s.expectNumber && Number(id.year) === s.expectYear,
    `got=${id.instrument_family}|${id.number}|${id.year} exact=${id.exact}`);
}

for (const s of ['Staatsblad 1847 No. 23','Kitab Undang-Undang Hukum Perdata','Kompilasi Hukum Islam']) {
  const id = parseQueryIdentity(s);
  check(`2.y non-canonical "${s}" yields exact=false`, id.exact === false, `exact=${id.exact} family=${id.instrument_family||'(none)'}`);
}

check('3.1 V6.7.11 title-aware bonus is not present in production', !/titleCn\s*&&\s*titleCn\.includes\(a\)\s*\?\s*2\s*:\s*0/.test(retrieverSrc));
check('3.2 V6.7.8 adaptive topical profile remains present', /function profileQueryForTopicalPolicy\s*\(/.test(retrieverSrc));
check('3.3 provider-aware bounded network plan preserved', /buildAuthorityProviderPlan\s*\(/.test(retrieverSrc) && /regulationBudget=6/.test(retrieverSrc) && /judicialProductBudget=2/.test(retrieverSrc) && /caseLawBudget=2/.test(retrieverSrc));

console.log(`\n${pass}/${pass + fail} canonical-seed-v680 checks PASS`);
if (fail) process.exit(1);
