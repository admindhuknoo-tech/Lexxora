declare const process: any;
import fs from 'node:fs';
import path from 'node:path';
import { __test__ } from '../server/officialLawRetriever';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const productionPath = path.join(process.cwd(), 'server', 'officialLawRetriever.ts');
const src = fs.readFileSync(productionPath, 'utf8');

const FORBIDDEN_SIGNATURES: Array<{ label: string; re: RegExp }> = [
  { label: 'V6.6.x material-anchors reason template', re: /material anchors \$\{hits\.length\}\/\$\{minHits\}/ },
  { label: 'V6.6.x nexus-score reason template',      re: /nexus score \$\{score\}<\$\{minScore\}/ },
  { label: 'V6.6.x independent-support reason',       re: /insufficient independent concept support/ },
  { label: 'V6.6.x minScore ternary (14/11)',         re: /minScore\s*=\s*minHits\s*>=\s*2\s*\?\s*14\s*:\s*11/ },
];
for (const sig of FORBIDDEN_SIGNATURES) check(`1.x static: production must not contain ${sig.label}`, !sig.re.test(src));

const REQUIRED_SIGNATURES: Array<{ label: string; re: RegExp }> = [
  { label: 'adaptive profile function',      re: /function profileQueryForTopicalPolicy\s*\(/ },
  { label: 'adaptive nexus reason template', re: /nexus score \$\{score\}<\$\{profile\.minNexus\} \(profile=\$\{profile\.kind\}\)/ },
  { label: 'strong-anchor gate',             re: /minimal satu material anchor kuat tidak ditemukan/ },
  { label: '__test__ export',                re: /export const __test__/ },
  { label: 'V6.7.7 issueQueries removal preserved', re: /Query generation is delegated entirely to the ontology layer/ },
  { label: 'V6.7.7 query cap 20 preserved', re: /return uniq\(queries\)\.slice\(0, 20\)/ },
  { label: 'network search cap 8 preserved', re: /input\.queries\.slice\(0,8\)/ },
];
for (const sig of REQUIRED_SIGNATURES) check(`1.y static: production must contain ${sig.label}`, sig.re.test(src));

const { profileQueryForTopicalPolicy, topicalCandidateAccepts } = __test__;

{
  const p = profileQueryForTopicalPolicy('wanprestasi somasi ganti rugi');
  check('2.1 SHORT_SPECIFIC -> 10 / 1', p.kind === 'SHORT_SPECIFIC' && p.minNexus === 10 && p.minQuerySpecificHits === 1,
    `kind=${p.kind} minNexus=${p.minNexus} minHits=${p.minQuerySpecificHits}`);
}
{
  const p = profileQueryForTopicalPolicy('peralihan hak karena jual beli PPJB AJB sertifikat pemecahan');
  check('2.2 LONG_ONTOLOGY -> 10 / 2', p.kind === 'LONG_ONTOLOGY' && p.minNexus === 10 && p.minQuerySpecificHits === 2,
    `kind=${p.kind} minNexus=${p.minNexus} minHits=${p.minQuerySpecificHits}`);
}
{
  const p = profileQueryForTopicalPolicy('perjanjian perikatan');
  check('2.3 GENERIC_FALLBACK -> 12 / 2', p.kind === 'GENERIC_FALLBACK' && p.minNexus === 12 && p.minQuerySpecificHits === 2,
    `kind=${p.kind} minNexus=${p.minNexus} minHits=${p.minQuerySpecificHits}`);
}
{
  const r = topicalCandidateAccepts(
    'wanprestasi somasi ganti rugi',
    'Hukum Perdata & Perikatan',
    'Kitab Undang-Undang Hukum Perdata',
    'Kitab Undang-Undang Hukum Perdata Pasal 1243 wanprestasi somasi ganti rugi prestasi',
    'UU',
    'Penggugat mendalilkan wanprestasi atas perjanjian jual beli. Somasi telah dikirim.',
  );
  check('3.1 accepted: wanprestasi query vs BW', r.ok === true, `ok=${r.ok} score=${r.score} reasons=${r.reasons.join('|')}`);
}
{
  const r = topicalCandidateAccepts(
    'perjanjian perikatan prestasi',
    'Hukum Perdata & Perikatan',
    'Peraturan Menteri tentang Tanah Wakaf',
    'Peraturan Menteri tentang Tanah Wakaf dan Nazhir',
    'PERMEN',
    'Perjanjian jual beli antara Agnes dan Irma.',
  );
  check('3.2 rejected: subtopic guard rejects wakaf', r.ok === false && r.reasons.some(x => /subtopic guard/i.test(x)), `reasons=${r.reasons.join('|')}`);
}
{
  const r = topicalCandidateAccepts(
    'wanprestasi somasi ganti rugi',
    'Hukum Perdata & Perikatan',
    'Peraturan Menteri tentang Tata Cara Sesuatu',
    'Peraturan Menteri tentang Tata Cara Sesuatu yang tidak berkaitan',
    'PERMEN',
    'Penggugat mendalilkan wanprestasi.',
  );
  const allReasons = r.reasons.join('|');
  check('3.3 rejected reason format is adaptive, not legacy',
    !/insufficient independent concept support/.test(allReasons) &&
    !/material anchors \d+\/\d+/.test(allReasons) &&
    !/nexus score \d+<14/.test(allReasons),
    `reasons=${allReasons}`);
}

console.log(`\n${pass}/${pass + fail} topical-policy-v678 checks PASS`);
if (fail) process.exit(1);
