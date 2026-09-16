declare const process: any;
import fs from 'node:fs';
import path from 'node:path';
import { __test__ } from '../server/officialLawRetriever';
import type { CanonicalSeed } from '../server/officialLawRetriever';

const { normalizeCanonicalAuthorities, parseCanonicalIdentities } = __test__ as any;
let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const productionPath = path.join(process.cwd(), 'server', 'officialLawRetriever.ts');
const src = fs.readFileSync(productionPath, 'utf8');

check('0.1 public contract accepts string | CanonicalSeed',
  /canonicalAuthorities\?\s*:\s*Array<string\s*\|\s*CanonicalSeed>/.test(src));
check('0.2 normalized identities feed resolveCanonicalSeeds',
  /resolveCanonicalSeeds\(input\.mode,\s*normalizedCanonicalSeeds,\s*input\.tempusYear\)/.test(src));
check('0.3 raw/normalized/resolved diagnostics installed',
  /canonical_authorities_input_count/.test(src) && /canonical_authorities_attempted/.test(src) && /canonical_authorities_normalized/.test(src) && /canonical_authorities_resolved/.test(src));

{
  const ids = parseCanonicalIdentities('PP No. 24 Tahun 1997 jo PP No. 18 Tahun 2021');
  check('1.1 "jo" produces two identities', ids.length === 2, `count=${ids.length}`);
  check('1.2 first identity is PP 24/1997', ids[0]?.instrument_family === 'PP' && String(ids[0]?.number) === '24' && Number(ids[0]?.year) === 1997);
  check('1.3 second identity is PP 18/2021', ids[1]?.instrument_family === 'PP' && String(ids[1]?.number) === '18' && Number(ids[1]?.year) === 2021);
}
{
  const ids = parseCanonicalIdentities('UU No. 5 Tahun 1960');
  check('1.4 single identity preserved', ids.length === 1 && ids[0].instrument_family === 'UU' && String(ids[0].number) === '5' && Number(ids[0].year) === 1960);
}
{
  const ids = parseCanonicalIdentities('Staatsblad 1847 No. 23');
  check('1.5 non-canonical label yields empty', ids.length === 0);
}
{
  const ids = parseCanonicalIdentities('PP No. 24 Tahun 1997 jo. PP No. 18 Tahun 2021');
  check('1.6 "jo." variant handled', ids.length === 2);
}

{
  const input: Array<string | CanonicalSeed> = [
    'PP No. 24 Tahun 1997 jo PP No. 18 Tahun 2021',
    'UU No. 5 Tahun 1960',
    'UU No. 8 Tahun 1999',
  ];
  const seeds = normalizeCanonicalAuthorities(input);
  check('2.1 string[] normalizes to 4 seeds', seeds.length === 4, `count=${seeds.length}`);
  check('2.2 every seed has family/number/year', seeds.every((s: CanonicalSeed) => Boolean(s.instrument_family && s.number && s.year)));
  check('2.3 both identities from "jo" present',
    seeds.some((s: CanonicalSeed) => s.instrument_family === 'PP' && String(s.number) === '24' && s.year === 1997) &&
    seeds.some((s: CanonicalSeed) => s.instrument_family === 'PP' && String(s.number) === '18' && s.year === 2021));
  check('2.4 localRegulationId preserved', seeds.some((s: CanonicalSeed) => s.localRegulationId === 'PP No. 24 Tahun 1997 jo PP No. 18 Tahun 2021'));
}

{
  const input: CanonicalSeed[] = [
    { localRegulationId: 'x', canonical_label: 'UU No. 5 Tahun 1960', instrument_family: 'UU', number: '5', year: 1960 },
    { localRegulationId: 'y', canonical_label: 'UU No. 8 Tahun 1999', instrument_family: 'UU', number: '8', year: 1999 },
  ];
  const seeds = normalizeCanonicalAuthorities(input);
  check('3.1 CanonicalSeed[] preserved', seeds.length === 2);
}

{
  const input: Array<string | CanonicalSeed> = [
    'UU No. 5 Tahun 1960',
    { localRegulationId: 'x', canonical_label: 'UU No. 5 Tahun 1960', instrument_family: 'UU', number: '5', year: 1960 },
  ];
  check('4.1 duplicate identity deduplicated', normalizeCanonicalAuthorities(input).length === 1);
}

check('5.1 empty array -> empty result', normalizeCanonicalAuthorities([]).length === 0);
check('5.2 unparseable string -> empty result', normalizeCanonicalAuthorities(['Staatsblad 1847 No. 23']).length === 0);
check('5.3 malformed object skipped', normalizeCanonicalAuthorities([{ instrument_family: 'UU' } as any]).length === 0);

const normStart = src.indexOf('CANONICAL AUTHORITY CONTRACT NORMALIZATION');
const normEnd = src.indexOf('export interface CanonicalSeed', normStart);
const normBlock = normStart >= 0 && normEnd > normStart ? src.slice(normStart, normEnd) : '';
const forbidden = normBlock.match(/\bPP\s+24\s+Tahun\s+1997|\bUU\s+5\s+Tahun\s+1960|\bPP\s+18\s+Tahun\s+2021|\bUU\s+13\s+Tahun\s+2003/gi);
check('6.1 no regulation-specific hardcode in production normalizer', !forbidden, forbidden ? forbidden.join(', ') : 'none');

console.log(`\n${pass}/${pass + fail} canonical-authority-contract-v681 checks PASS`);
if (fail) process.exit(1);
