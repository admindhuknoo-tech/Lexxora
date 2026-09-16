declare const process: any;
import { buildEvidenceModel } from '../server/evidenceModel';

let pass = 0, fail = 0;
function check(name:string, ok:boolean, detail='') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const repliek = `
REPLIEK
Perkara Nomor 44/Pdt.G/2026/PN.Kpn
Kepada Yth. Majelis Hakim Pengadilan Negeri Kepanjen.
Penggugat dengan ini menyampaikan repliek atas jawaban Para Tergugat.
Para Tergugat dalam jawabannya mendalilkan bahwa objek sengketa merupakan milik bersama dan menolak dalil Penggugat.
Penggugat membantah dalil Para Tergugat tersebut dan tetap pada gugatan.
`;

const em = buildEvidenceModel(repliek);
check('1 source classified as LITIGATION_SUBMISSION', em.source_role === 'LITIGATION_SUBMISSION', `role=${em.source_role}`);
check('2 opponent-attributed proposition becomes adverse evidence', em.adverse_evidence.length >= 1, `count=${em.adverse_evidence.length}`);
check('3 adverse evidence retains page provenance', em.adverse_evidence.every(x => Number(x.page) > 0));
check('4 author rebuttal remains claim-first', em.party_claims.some(x => /Penggugat membantah/i.test(x.statement)), `claims=${em.party_claims.length}`);

const neutral = buildEvidenceModel(`
REPLIEK
Perkara Nomor 1/Pdt.G/2026/PN.X
Kepada Yth. Majelis Hakim.
Penggugat menyatakan tetap pada gugatan dan memohon agar gugatan dikabulkan.
`);
check('5 unattributed author claim is not manufactured as adverse evidence', neutral.adverse_evidence.length === 0, `count=${neutral.adverse_evidence.length}`);

console.log(`\n${pass}/${pass + fail} adverse-evidence-v682 checks PASS`);
if (fail) process.exit(1);
