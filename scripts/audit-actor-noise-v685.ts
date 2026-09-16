declare const process: any;
import { buildEvidenceModel } from '../server/evidenceModel';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const fixture = `--- HALAMAN 1 ---
Nama : RUMATA ROSININTA SIANNYA, S.H., M.H.
NIP. : 19830414 200603 2 001
Pangkat : Jaksa Madya
Jabatan : Jaksa Penyidik Kejaksaan Negeri Blitar.
Jaksa Madya 4 Dipindai dengan CamScanner
Tersangka ELYA DWI ADMOKO, M.M. Anak Dari (Alm) SOENARKO
Penuntut Umum mengajukan dakwaan. Hakim Madya memimpin sidang.`;

const em = buildEvidenceModel(fixture);
const names = em.actors.map(a => String(a.actor).toLowerCase());

check('1.1 "Jaksa Madya" rejected as actor',
  !names.some(n => n === 'jaksa madya'),
  `actors=${em.actors.map(a => a.actor).join(', ')}`);

check('2.1 "Jaksa Madya NIP" rejected',
  !names.some(n => /^jaksa\s+madya\s+nip\b/i.test(n)),
  `actors=${em.actors.map(a => a.actor).join(', ')}`);

check('3.1 "Jaksa" preserved as role-word actor',
  names.some(n => n === 'jaksa'),
  `actors=${em.actors.map(a => a.actor).join(', ')}`);

check('4.1 "Penuntut Umum" preserved as role-word actor',
  names.some(n => n === 'penuntut umum'),
  `actors=${em.actors.map(a => a.actor).join(', ')}`);

check('5.1 "RUMATA ROSININTA SIANNYA" preserved',
  names.some(n => /rumata\s+rosininta/i.test(n)),
  `actors=${em.actors.map(a => a.actor).join(', ')}`);

check('6.1 "ELYA DWI ADMOKO" preserved',
  names.some(n => /elya\s+dwi\s+admoko/i.test(n)),
  `actors=${em.actors.map(a => a.actor).join(', ')}`);

{
  const artifactOnly = buildEvidenceModel(
    `--- HALAMAN 1 ---\nJaksa Madya 4 Dipindai dengan CamScanner`,
  );
  const artifactNames = artifactOnly.actors.map(a => String(a.actor).toLowerCase());
  check('7.1 OCR-artifact-only actor dropped',
    !artifactNames.some(n => /jaksa\s+madya/i.test(n)),
    `actors=${artifactOnly.actors.map(a => a.actor).join(', ')}`);
}

{
  const mixed = buildEvidenceModel(
    `--- HALAMAN 1 ---\nJaksa Penuntut Umum membacakan dakwaan di persidangan.\n--- HALAMAN 2 ---\nJaksa Madya 4 Dipindai dengan CamScanner`,
  );
  const mixedNames = mixed.actors.map(a => String(a.actor).toLowerCase());
  check('8.1 "Jaksa" still present when at least one quote is substantive',
    mixedNames.some(n => n === 'jaksa'),
    `actors=${mixed.actors.map(a => a.actor).join(', ')}`);
}

console.log(`\n${pass}/${pass + fail} actor-noise-v685 checks PASS`);
if (fail) process.exit(1);
