declare const process: any;
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

// ============================================================
// STATIC ASSERTIONS — verify the title-aware bonus is present
// in production source and does not mention any specific
// instrument number.
// ============================================================
const productionPath = path.join(process.cwd(), 'server', 'officialLawRetriever.ts');
const src = fs.readFileSync(productionPath, 'utf8');

check('1.1 materialNexusScore accepts optional candidateTitle',
  /function\s+materialNexusScore\s*\([\s\S]{0,200}candidateTitle\?:string/.test(src));

check('1.2 title-match bonus is present',
  /titleCn\s*&&\s*titleCn\.includes\(a\)\s*\?\s*2\s*:\s*0/.test(src));

check('1.3 caller passes candidateTitle',
  /materialNexusScore\(query,\s*domain,\s*candidateFullText,\s*candidateTitle\)/.test(src));

// The patch must not hardcode any regulation identity.
const forbidden = src.match(/\bPP\s+24\s+Tahun\s+1997|\bUU\s+5\s+Tahun\s+1960|\bPP\s+18\s+Tahun\s+2021|pendaftaran tanah khusus|peralihan hak khusus/gi);
check('1.4 no hardcoded regulation identity added by patch',
  !forbidden, forbidden ? `found ${forbidden.length}` : 'none');

// ============================================================
// RUNTIME ASSERTIONS — the bonus is generic across anchors,
// not tied to any specific domain or instrument.
// ============================================================

// We cannot call materialNexusScore directly (not exported), but we can
// verify indirectly via topicalCandidateAccepts __test__ if exported.
// This file assumes __test__ exports materialNexusScore and
// topicalCandidateAccepts from V6.7.8.
import { __test__ } from '../server/officialLawRetriever';
const { materialNexusScore } = __test__ as any;

if (typeof materialNexusScore !== 'function') {
  check('2.0 __test__.materialNexusScore exported', false, 'not a function');
} else {
  // Synthetic query + anchor that we control, and two synthetic titles.
  // Title A contains the anchor; Title B does not.
  const anchorQuery = 'pendaftaran tanah';
  const titleWith = 'Peraturan Pemerintah Nomor 24 Tahun 1997 tentang Pendaftaran Tanah';
  const titleWithout = 'Peraturan Menteri tentang Tata Cara Sesuatu yang Tidak Relevan';
  const bodyText = 'pendaftaran tanah diatur di sini';

  const scoreWith = materialNexusScore(anchorQuery, 'agraria', `${titleWith} ${bodyText}`, titleWith);
  const scoreWithout = materialNexusScore(anchorQuery, 'agraria', `${titleWithout} ${bodyText}`, titleWithout);

  check('2.1 title-match yields strictly higher score than non-title match',
    scoreWith > scoreWithout,
    `with=${scoreWith} without=${scoreWithout}`);

  // Delta should be 2 per matched multi-word anchor with title-match.
  // We do not assert exact delta (depends on anchor count) but assert delta >= 2.
  check('2.2 delta >= 2 (title-aware bonus active)',
    (scoreWith - scoreWithout) >= 2,
    `delta=${scoreWith - scoreWithout}`);

  // Backward-compat: passing no candidateTitle must not crash.
  const scoreNoTitle = materialNexusScore(anchorQuery, 'agraria', bodyText);
  check('2.3 missing candidateTitle is safe (backward compatible)',
    Number.isFinite(scoreNoTitle) && scoreNoTitle >= 0,
    `value=${scoreNoTitle}`);

  // Generic: another domain anchor should also receive the bonus.
  const anchorQuery2 = 'sertifikat';
  const titleWith2 = 'Peraturan tentang Sertifikat dan Pendaftaran Tanah';
  const bodyText2 = 'sertifikat disebut sekali';

  const scoreWith2 = materialNexusScore(anchorQuery2, 'agraria', `${titleWith2} ${bodyText2}`, titleWith2);
  const scoreWithout2 = materialNexusScore(anchorQuery2, 'agraria', `${titleWithout} ${bodyText2}`, titleWithout);

  check('2.4 bonus applies generically across anchors',
    scoreWith2 > scoreWithout2,
    `with=${scoreWith2} without=${scoreWithout2}`);
}

console.log(`\n${pass}/${pass + fail} title-aware-nexus-v6711 checks PASS`);
if (fail) process.exit(1);
