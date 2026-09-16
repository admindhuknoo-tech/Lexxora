import { buildEvidenceModel } from '../server/evidenceModel';
import { inferLegalContext, officialQueriesForContext } from '../server/legalOntology';
import { evaluateOfficialCandidatePolicy } from '../server/officialLawRetriever';

const checks: Array<{name:string; ok:boolean; detail?:string}> = [];
const check=(name:string,ok:boolean,detail='')=>checks.push({name,ok,detail});

const inheritance=`Seorang duda mempunyai seorang anak kandung. Ia memiliki sawah bersertifikat, menikah lagi, kemudian meninggal dunia. Pasangan kedua ingin menguasai sawah dan merusak sertifikat. Ditanyakan bagian waris/legitime portie dan langkah hukum anak.`;
const contract=`Debitur menandatangani perjanjian jual beli. Setelah jatuh tempo kewajiban pembayaran tidak dipenuhi meskipun telah disomasi dua kali. Ditanyakan wanprestasi dan ganti rugi.`;
const land=`Pemilik SHM menghadapi tumpang tindih bidang setelah pengukuran BPN. Sengketa menyangkut batas, surat ukur, dan pendaftaran tanah.`;

const inheritanceCtx=inferLegalContext(inheritance);
const inheritanceEvidence=buildEvidenceModel(inheritance);
check('Inheritance routes to family/inheritance', inheritanceCtx.primary.id==='KELUARGA_WARIS', `${inheritanceCtx.primary.id}:${inheritanceCtx.primary.score}`);
check('Narrative question gets generic case role', inheritanceEvidence.source_role==='CASE_NARRATIVE_OR_QUESTION', inheritanceEvidence.source_role);
check('Inheritance produces multiple concrete issues', inheritanceEvidence.issue_seeds.length>=3, String(inheritanceEvidence.issue_seeds.length));
check('Inheritance query set is issue-specific', officialQueriesForContext(inheritance).some(q=>/legitime|bagian mutlak/i.test(q)) && officialQueriesForContext(inheritance).some(q=>/sertifikat pengganti|pewarisan/i.test(q)), officialQueriesForContext(inheritance).join(' | '));

const contractCtx=inferLegalContext(contract);
check('Contract routes to private obligations', contractCtx.primary.id==='PERDATA_KONTRAKTUAL', contractCtx.primary.id);
check('Contract issues include default/somasi', buildEvidenceModel(contract).issue_seeds.some(x=>/wanprestasi|somasi|lalai/i.test(x.issue)), '');

const landCtx=inferLegalContext(land);
check('Pure land dispute remains land domain', landCtx.primary.id==='AGRARIA_PERTANAHAN', landCtx.primary.id);

check('Inheritance rejects unrelated wakaf regulation', !evaluateOfficialCandidatePolicy(
  'hukum waris ahli waris bagian mutlak legitime portie',
  'Hukum Keluarga & Waris',
  'Peraturan Menteri Agraria dan Tata Ruang Nomor 2 Tahun 2017 Tata Cara Pendaftaran Tanah Wakaf',
  'Peraturan Menteri Agraria dan Tata Ruang'
).accepted, '');
check('Inheritance may admit materially linked registration rule', evaluateOfficialCandidatePolicy(
  'peralihan hak karena pewarisan sertifikat pengganti dokumen rusak',
  'Hukum Keluarga & Waris',
  'Peraturan Pemerintah Nomor 24 Tahun 1997 tentang Pendaftaran Tanah dan sertifikat pengganti karena pewarisan',
  'Peraturan Pemerintah'
).accepted, '');
check('Private dispute rejects unrelated local regulation', !evaluateOfficialCandidatePolicy(
  'wanprestasi perjanjian perikatan hukum perdata',
  'Hukum Perdata & Perikatan',
  'Peraturan Bupati Kabupaten X Nomor 9 Tahun 2020 tentang kerja sama daerah dan wanprestasi',
  'Peraturan Bupati'
).accepted, '');

for(const c of checks) console.log(`${c.ok?'PASS':'FAIL'} | ${c.name}${c.detail?` | ${c.detail}`:''}`);
const failed=checks.filter(x=>!x.ok);
console.log(`\n${checks.length-failed.length}/${checks.length} ontology/routing checks PASS`);
if(failed.length) process.exit(1);
