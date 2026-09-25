import assert from 'node:assert/strict';
import { buildEvidenceModel } from '../server/evidenceModel';
import { deriveOntologyIssues } from '../server/legalOntology';
import { resolveProceduralPosture } from '../server/proceduralPosture';
import { buildLawyerWorkflow } from '../server/lawyerWorkflow';

let pass = 0;
function check(name:string, fn:()=>void) {
  try { fn(); pass++; console.log(`PASS | ${name}`); }
  catch (err) { console.error(`FAIL | ${name}`); throw err; }
}
function actorNames(text:string) { return buildEvidenceModel(text).actors.map(x => x.actor); }
function issueIds(text:string) { return deriveOntologyIssues(text).map(x => x.id); }
function workflow(text:string, sourceRole='LEGAL_CORRESPONDENCE') {
  return buildLawyerWorkflow({
    title:'', text, sourceRole, domainContext:{},
    evidence:{ textual_facts:[], party_claims:[] }, legalIssues:[], legalGaps:[],
    adverseEvidence:[], applicableLaw:[], verifiedTimeline:[], actorMatrix:[],
  });
}

const bap = `BERITA ACARA PEMERIKSAAN\nPada hari Senin tanggal 12 Maret 2024 Penyidik Budi Santoso memeriksa Tersangka ELYA DWI ADMOKO.\nSaksi DEWI MUFARIDA menerangkan bahwa Perumda BPR Kota Blitar mencairkan kredit pada tanggal 15 Februari 2024.\nNIP 19700101. Anak Kandung. Setelah pemeriksaan selesai. Demikian berita acara ini dibuat.`;
const bapModel = buildEvidenceModel(bap);
const bapActors = bapModel.actors.map(x => x.actor);

check('BAP: ELYA DWI ADMOKO is one canonical actor', () => assert.equal(bapActors.filter(x => x === 'ELYA DWI ADMOKO').length, 1));
check('BAP: DEWI MUFARIDA is one canonical actor', () => assert.equal(bapActors.filter(x => x === 'DEWI MUFARIDA').length, 1));
check('BAP: Perumda BPR Kota Blitar is one canonical entity', () => assert.equal(bapActors.filter(x => x === 'Perumda BPR Kota Blitar').length, 1));
check('BAP: lexical noise is not an actor', () => assert.deepEqual(bapActors.filter(x => ['NIP','Kandung','Setelah','Demikian','Bahwa'].includes(x)), []));
check('BAP: active-voice examination date reaches timeline', () => assert.ok(bapModel.timeline.some(x => x.date === '12 Maret 2024')));
check('BAP: material credit-disbursement date reaches timeline', () => assert.ok(bapModel.timeline.some(x => x.date === '15 Februari 2024')));

check('actor: dotted initial remains intact', () => assert.ok(actorNames('Tersangka M. Yusuf Hidayat diperiksa oleh Penyidik.').includes('M. Yusuf Hidayat')));
check('actor: defined pleading party is extracted', () => assert.ok(actorNames('BUDI SANTOSO, selanjutnya disebut PENGGUGAT, mengajukan gugatan.').includes('BUDI SANTOSO')));

check('posture: historical somasi cannot override pleading identity', () => assert.equal(resolveProceduralPosture({title:'GUGATAN', text:'GUGATAN\nPenggugat telah mengirimkan somasi kepada Tergugat. POSITA PETITUM', sourceRole:'LITIGATION_SUBMISSION'}).stage, 'PLEADING'));
check('posture: true SOMASI title remains pre-litigation', () => assert.equal(resolveProceduralPosture({title:'SOMASI', text:'SOMASI\nTeguran hukum', sourceRole:'LEGAL_CORRESPONDENCE'}).stage, 'PRE_LITIGATION'));
check('posture: SOMASI PERTAMA first-line remains pre-litigation', () => assert.equal(resolveProceduralPosture({text:'SOMASI PERTAMA\nKepada Yth Debitur', sourceRole:'LEGAL_CORRESPONDENCE'}).stage, 'PRE_LITIGATION'));

const sale = 'Perihal: Jual beli tanah. Para pihak: Agnes, Irma, Imam, Hendra. Agnes menjual tanah 150 m2 kepada Irma. Belakangan Agnes bermaksud menjual objek yang sama kepada Hendra.';
check('issue: competing disposition survives material-nexus gate', () => assert.ok(issueIds(sale).includes('competing-disposition')));
check('issue: pledge to another party survives material-nexus gate', () => assert.ok(issueIds('Pemilik menyerahkan kendaraan kepada Penyewa. Penyewa kemudian menggadaikan kendaraan kepada pihak lain tanpa izin pemilik.').includes('asset-disposition-authority')));
check('issue: ordinary vendor transfer does not create disposition issue', () => assert.ok(!issueIds('Bank mencairkan kredit dan dana ditransfer ke rekening pihak ketiga selaku vendor sesuai instruksi debitur.').includes('asset-disposition-authority')));
check('issue: incidental director/PT words do not create corporate authority', () => assert.ok(!issueIds('Direktur PT hadir memberikan keterangan sebagai saksi mengenai pencairan kredit.').includes('corporate-authority')));
check('issue: incidental status word does not create formal-status issue', () => assert.ok(!issueIds('Status pemeriksaan saksi telah selesai pada hari ini.').includes('formal-status')));

check('orientation: mere mention of Tergugat is neutral', () => assert.equal(workflow('Surat ini menyebut Tergugat dalam kronologi.').orientation, 'GENERAL_COUNSEL_REVIEW'));
check('orientation: defining both parties is not silently defense-side', () => assert.equal(workflow('Budi selanjutnya disebut PENGGUGAT. Agus selanjutnya disebut TERGUGAT.').orientation, 'GENERAL_COUNSEL_REVIEW'));

console.log(`SUMMARY ${pass}/18 regression-consolidation cumulative cross-case checks PASS`);
assert.equal(pass, 18);
