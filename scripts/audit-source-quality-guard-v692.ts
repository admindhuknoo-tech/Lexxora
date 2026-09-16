declare const process: any;
import { applyOcrSourceQualityGuard } from '../server/documentIngestion';

/**
 * Legacy compatibility audit.
 *
 * V6.9.2 used a now-retired detectSourceMismatch helper. Source robustness is
 * now enforced by the canonical OCR/source-quality guard introduced in Group C.
 * Keep this historical audit compilable without reintroducing a dead production
 * API that is no longer part of the runtime contract.
 */

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const cleanFixture = [
  'Jawaban Pertama Tergugat I, II, DAN III atas Gugatan Penggugat.',
  'Para pihak mengajukan dalil dan bukti sesuai dokumen perkara.',
].join('\n');

const noisyFixture = [
  'PAI fY PERADI KA TANT P A &ASSOCIATES aa',
  'MENGEGGT Gaia brranaradd MANGA MPA EDAN Phone 082228007899',
  'Jawaban Pertama Tergugat I, II, DAN III atas Gugatan Penggugat.',
].join('\n');

const clean = applyOcrSourceQualityGuard(cleanFixture, [
  { page: 1, confidence: 95, status: 'OK' },
]);
const noisy = applyOcrSourceQualityGuard(noisyFixture, [
  { page: 1, confidence: 87, status: 'OK' },
]);

check('legacy compatibility: clean source remains analyzable',
  String(clean?.text || '').includes('Jawaban Pertama Tergugat'));

check('legacy compatibility: noisy source is quality-guarded',
  Number(noisy?.excluded_spans || 0) > 0 || Number(noisy?.repaired_spans || 0) > 0,
  `excluded=${Number(noisy?.excluded_spans || 0)} repaired=${Number(noisy?.repaired_spans || 0)}`);

check('legacy compatibility: valid legal tail survives sanitization',
  String(noisy?.text || '').includes('Jawaban Pertama Tergugat'));

console.log(`\n${pass}/${pass + fail} legacy-source-quality-v692 compatibility checks PASS`);
if (fail) process.exit(1);
