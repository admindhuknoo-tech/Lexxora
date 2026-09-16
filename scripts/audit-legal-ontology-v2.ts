declare const process: { exit(code?: number): never };
import { buildEvidenceModel } from '../server/evidenceModel';
import { inferLegalContext, officialQueriesForContext } from '../server/legalOntology';
import { evaluateOfficialCandidatePolicy, inferTempusYearFromCase } from '../server/officialLawRetriever';

const checks:Array<{name:string;ok:boolean;detail?:string}>=[];
const check=(name:string,ok:boolean,detail='')=>checks.push({name,ok,detail});

const inheritance=`Seorang duda memiliki seorang anak kandung. Sawah telah dimiliki sebelum menikah lagi. Setelah ayah meninggal, pasangan kedua ingin menguasai sawah dan merobek sertifikat. Ditanyakan legitime portie, bagian ahli waris, status harta, dan langkah hukum.`;
const contract=`Debitur terikat perjanjian jual beli. Pembayaran jatuh tempo tetapi tidak dipenuhi meskipun dua kali somasi. Ditanyakan wanprestasi, ganti rugi dan langkah hukum.`;
const land=`Pemilik SHM menghadapi tumpang tindih bidang setelah pengukuran BPN. Sengketa menyangkut batas, surat ukur, dan pendaftaran tanah.`;
const longMixed=`${'tanah sertifikat '.repeat(40)} Pewaris meninggal dan meninggalkan ahli waris anak kandung serta istri. Ditanyakan legitime portie dan boedel waris.`;
const cited=`Pada tahun 2021 sengketa terjadi. Para pihak menyebut Undang-Undang Nomor 7 Tahun 2017 dan Peraturan Nomor 2 Tahun 2019. Pada 14 Februari 2021 surat dikirim dan tindakan dilakukan.`;

const a=inferLegalContext(inheritance); const ae=buildEvidenceModel(inheritance);
check('Inheritance primary domain',a.primary.id==='KELUARGA_WARIS',`${a.primary.id}/${a.confidence}`);
check('Narrative is not treated as verified fact',ae.party_claims.length>0 && ae.textual_facts.length===0,`claims=${ae.party_claims.length},facts=${ae.textual_facts.length}`);
check('Inheritance issue graph multi-issue',ae.issue_seeds.length>=3,String(ae.issue_seeds.length));
check('Inheritance queries are issue-derived',officialQueriesForContext(inheritance).some(q=>/legitime|bagian mutlak/i.test(q)) && officialQueriesForContext(inheritance).some(q=>/sertifikat|dokumen rusak/i.test(q)),officialQueriesForContext(inheritance).join(' | '));

const c=inferLegalContext(contract);
check('Contract primary domain',c.primary.id==='PERDATA_KONTRAKTUAL',c.primary.id);
check('Contract issue graph contains default',buildEvidenceModel(contract).issue_seeds.some(x=>/wanprestasi|somasi|lalai/i.test(x.issue)),'');

const l=inferLegalContext(land);
check('Pure land remains land domain',l.primary.id==='AGRARIA_PERTANAHAN',l.primary.id);

const lm=inferLegalContext(longMixed);
check('Repeated incidental land words do not automatically swamp inheritance',lm.primary.id==='KELUARGA_WARIS' || lm.ambiguous,`${lm.primary.id}/${lm.confidence}/margin=${lm.margin}`);

check('Waris rejects unrelated wakaf regulation',!evaluateOfficialCandidatePolicy('waris ahli waris legitime portie','Hukum Keluarga & Waris','Peraturan Menteri ATR Nomor 2 Tahun 2017 Tata Cara Pendaftaran Tanah Wakaf','Peraturan Menteri ATR').accepted,'');
check('Private dispute rejects unrelated Perbup',!evaluateOfficialCandidatePolicy('wanprestasi perjanjian perikatan','Hukum Perdata & Perikatan','Peraturan Bupati Kabupaten X Nomor 9 Tahun 2020 tentang kerja sama daerah dan wanprestasi','Peraturan Bupati').accepted,'');
check('Event-driven tempus ignores citation years',inferTempusYearFromCase(cited)===2021,String(inferTempusYearFromCase(cited)));

for(const c of checks) console.log(`${c.ok?'PASS':'FAIL'} | ${c.name}${c.detail?` | ${c.detail}`:''}`);
const failed=checks.filter(x=>!x.ok); console.log(`\n${checks.length-failed.length}/${checks.length} ontology-v2 checks PASS`); if(failed.length)process.exit(1);
