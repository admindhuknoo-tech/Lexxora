import { buildEvidenceModel, classifySourceRole } from '../server/evidenceModel';
import { deriveOntologyIssues, inferLegalContext, authorityAnchorsForContext, splitPages } from '../server/legalOntology';
import { buildLawyerWorkflow } from '../server/lawyerWorkflow';
import { resolveProceduralPosture, CIVIL_DOCKET_RE } from '../server/proceduralPosture';
import { splitMarkedPages } from '../server/caseIntegrityPolicy.mjs';
import { runCaseAnalysis } from '../server/caseAnalysis';
import { applyOcrSourceQualityGuard } from '../server/documentIngestion';

async function main(){
const rows:{name:string;pass:boolean;detail:string}[]=[];
const check=(name:string,pass:boolean,detail:any='')=>rows.push({name,pass,detail:String(detail)});
const issueIds=(text:string)=>deriveOntologyIssues(text).map(x=>x.id);

// A. Negation scope: list-style absence must suppress financial module, but
// operational discrepancy "tanpa survei ulang" must not suppress real credit/agunan context.
const noFinance='Pewaris meninggal dan ahli waris berselisih mengenai harta bersama. Tidak ada tanah, sertifikat, bank, kredit, pinjaman, atau agunan.';
const wfNoFinance=buildLawyerWorkflow({title:'x',text:noFinance,sourceRole:'CASE_NARRATIVE_OR_QUESTION',domainContext:{},evidence:{textual_facts:[],party_claims:[]},legalIssues:deriveOntologyIssues(noFinance).map(x=>({issue:x.issue,analysis:x.basis})),legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]});
check('negation:list-absence-keeps-financial-module-off',wfNoFinance.financial_collateral_audit.active===false,JSON.stringify(wfNoFinance.financial_collateral_audit));
const financeDiscrepancy='Debitur memperoleh fasilitas kredit dengan agunan SHM. Kabag Kredit menyetujui proses tanpa survei ulang atas agunan dan dokumen administrasi belum lengkap.';
const wfFinance=buildLawyerWorkflow({title:'x',text:financeDiscrepancy,sourceRole:'INVESTIGATION_OR_BAP',domainContext:{},evidence:{textual_facts:[{}],party_claims:[]},legalIssues:deriveOntologyIssues(financeDiscrepancy).map(x=>({issue:x.issue,analysis:x.basis})),legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]});
check('negation:without-survey-does-not-disable-real-finance',wfFinance.financial_collateral_audit.active===true,JSON.stringify(wfFinance.financial_collateral_audit));
check('negation:financial-discrepancy-survives',wfFinance.financial_collateral_audit.discrepancy_terms.some(x=>/survei|administrasi/i.test(x)),wfFinance.financial_collateral_audit.discrepancy_terms.join(' | '));

const contrastedFinance='Tidak ada tanah atau sertifikat, tetapi Debitur tetap memiliki fasilitas kredit bank dan angsuran yang jatuh tempo.';
const wfContrast=buildLawyerWorkflow({title:'x',text:contrastedFinance,sourceRole:'CASE_NARRATIVE_OR_QUESTION',domainContext:{},evidence:{textual_facts:[],party_claims:[]},legalIssues:deriveOntologyIssues(contrastedFinance).map(x=>({issue:x.issue,analysis:x.basis})),legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]});
check('negation:contrast-preserves-asserted-finance',wfContrast.financial_collateral_audit.active===true,JSON.stringify(wfContrast.financial_collateral_audit));

// B. Lex specialis routing for corruption must arise from criminal issue/text,
// not from a corporate supporting domain.
const tipikorText='BERITA ACARA PEMERIKSAAN TERSANGKA. Jaksa Penyidik memeriksa dugaan tindak pidana korupsi dalam pemberian fasilitas kredit BPR. Tersangka diduga menyalahgunakan kewenangan dan menimbulkan kerugian keuangan negara.';
const tipikorCtx=inferLegalContext(tipikorText);
const tipikorIssues=deriveOntologyIssues(tipikorText);
const criminal=tipikorIssues.find(x=>x.id==='criminal-elements');
check('tipikor:primary-domain-criminal',tipikorCtx.primary.id==='PIDANA_MATERIIL_FORMIL',`${tipikorCtx.primary.id}:${tipikorCtx.primary.score}`);
check('tipikor:criminal-issue-carries-lex-specialis-query',Boolean(criminal?.query_terms.some(x=>/korupsi|tipikor/i.test(x))),criminal?.query_terms.join(' | ')||'none');
check('tipikor:authority-anchor-carries-lex-specialis',authorityAnchorsForContext('PIDANA_MATERIIL_FORMIL',tipikorText).some(x=>/Korupsi/i.test(x)),authorityAnchorsForContext('PIDANA_MATERIIL_FORMIL',tipikorText).join(' | '));

// C. Lease redisposition is a material authority/competing-disposition question,
// but ordinary lease is not.
const sublease='Penyewa menyewakan kembali rumah sewaan kepada pihak lain tanpa persetujuan pemilik.';
const subleaseIds=issueIds(sublease);
check('property:sublease-triggers-competing-disposition',subleaseIds.includes('competing-disposition'),subleaseIds.join(','));
check('property:sublease-triggers-authority-issue',subleaseIds.includes('asset-disposition-authority'),subleaseIds.join(','));
const ordinaryLease='Pemilik menyewakan rumah kepada Penyewa berdasarkan perjanjian sewa selama dua tahun.';
const ordinaryIds=issueIds(ordinaryLease);
check('property:ordinary-lease-no-redisposition-issue',!ordinaryIds.includes('competing-disposition')&&!ordinaryIds.includes('asset-disposition-authority'),ordinaryIds.join(','));

// D. Actor contamination and canonicalization.
const actorText=`--- HALAMAN 1 ---\nGUGATAN Perkara Nomor 45/Pdt.G/2023/PN Mlg. Penggugat Budi Santoso mengajukan gugatan. Tergugat Ir. Andi Prasetyo membantah. PN Mlg Budi Santoso hadir.\n--- HALAMAN 2 ---\nBERITA ACARA PEMERIKSAAN TERSANGKA. Nama lengkap: ELYA DWI ADMOKO, M.M. Jabatan: Direktur Utama. Debitur Dewi Mufarida Tahun 2022. Sdr. Dewi Mufarida menerangkan. Dewi Mufarifa menerangkan hal yang sama.`;
const actors=buildEvidenceModel(actorText).actors;
const names=actors.map(a=>a.actor);
check('actor:keeps-budi-santoso',names.some(x=>/^Budi Santoso$/i.test(x)),names.join(' | '));
check('actor:no-court-prefix-person',!names.some(x=>/^(?:PN|PA|PTUN)\s/i.test(x)),names.join(' | '));
check('actor:no-role-prefix-person',!names.some(x=>/^(?:Penggugat|Tergugat)\s/i.test(x)),names.join(' | '));
check('actor:no-title-only-person',!names.some(x=>/^Ir$/i.test(x)),names.join(' | '));
check('actor:elya-canonical-once',names.filter(x=>/ELYA DWI ADMOKO/i.test(x)).length===1,names.join(' | '));
check('actor:dewi-near-ocr-alias-single',actors.filter(a=>/dewi mufar/i.test([a.actor,...(a.aliases||[])].join(' '))).length===1,JSON.stringify(actors.filter(a=>/dewi/i.test([a.actor,...(a.aliases||[])].join(' ')))));

// E. Civil docket parser accepts real 45/Pdt.G/2023 syntax (no dot after G).
const docket='GUGATAN\nPerkara Nomor 45/Pdt.G/2023/PN Mlg\nPenggugat Budi Santoso melawan Tergugat Andi Prasetyo. Petitum: mengabulkan gugatan.';
check('docket:canonical-regex-real-format',CIVIL_DOCKET_RE.test(docket),String(CIVIL_DOCKET_RE));
check('docket:source-role-litigation',classifySourceRole(docket).role==='LITIGATION_SUBMISSION',classifySourceRole(docket).role);
check('docket:posture-pleading',resolveProceduralPosture({text:docket,sourceRole:'LITIGATION_SUBMISSION'}).stage==='PLEADING',resolveProceduralPosture({text:docket,sourceRole:'LITIGATION_SUBMISSION'}).stage);

// F. Canonical page parser: a blank page cannot consume the following page.
const marked='--- HALAMAN 1 ---\nisi satu\n--- HALAMAN 2 ---\n\n--- HALAMAN 3 ---\nisi tiga';
const pgs=splitMarkedPages(marked);
check('pages:three-markers-three-pages',pgs.length===3,JSON.stringify(pgs));
check('pages:blank-page-isolated',String(pgs[1]?.text||'').trim()==='',JSON.stringify(pgs));
check('pages:following-page-preserved',/isi tiga/.test(String(pgs[2]?.text||'')),JSON.stringify(pgs));
check('pages:ontology-uses-same-boundaries',splitPages(marked).length===3,JSON.stringify(splitPages(marked)));

const evidencePaged=buildEvidenceModel('--- HALAMAN 1 ---\nFakta pertama cukup panjang untuk diproses sebagai pernyataan material.\n--- HALAMAN 2 ---\n\n--- HALAMAN 3 ---\nFakta ketiga cukup panjang dan harus tetap memiliki provenance halaman tiga.');
check('pages:evidence-model-preserves-page-three-provenance',evidencePaged.statements.some((x:any)=>x.page===3&&/Fakta ketiga/i.test(x.statement)),JSON.stringify(evidencePaged.statements));

// F2. Production guard uses the same boundaries: excluding page 2 must never consume page 3.
const guarded=applyOcrSourceQualityGuard(
  '--- HALAMAN 1 ---\nIni isi halaman pertama yang cukup panjang dan tetap dapat dianalisis sebagai dokumen hukum.\n--- HALAMAN 2 ---\n\n--- HALAMAN 3 ---\nUNIQUE_PAGE_THREE Ini isi halaman ketiga yang cukup panjang dan wajib tetap tersedia untuk analisis.',
  [
    {page:1,confidence:95,status:'OK'},
    {page:2,confidence:0,status:'FAILED'},
    {page:3,confidence:94,status:'OK'},
  ],
  3,
);
check('pages:guard-excludes-only-blank-page',guarded.excluded_pages.length===1&&guarded.excluded_pages[0]===2,JSON.stringify(guarded));
check('pages:guard-preserves-following-page',/UNIQUE_PAGE_THREE/.test(guarded.text),guarded.text);

// G. Timeline context crosses wrapped lines and recognizes material/procedural verbs.
const bapTimeline=`--- HALAMAN 1 ---\nBERITA ACARA PEMERIKSAAN TERSANGKA\nSurat Perintah Penyidikan Kepala Kejaksaan Negeri Blitar Nomor:\nPRINT-01/M.5.22/Fd.2/03/2026\ntanggal 25 Maret 2026\nSurat Penetapan Tersangka Nomor:\n06/M.5.22/Fd.2/05/2026\ntanggal 20 Mei 2026\nPada hari ini Kamis 21-05-2026 pukul 12.30 WIB\nJaksa Penyidik memeriksa Tersangka.\nDebitur menandatangani perjanjian kredit\npada tanggal 1 Juni 2022.\nKredit dicairkan\npada tanggal 5 Juni 2022.`;
const timeline=buildEvidenceModel(bapTimeline).timeline;
const typeOf=(d:string)=>timeline.find(x=>x.date===d)?.type;
check('timeline:sprindik-procedural',typeOf('25 Maret 2026')==='PROCEDURAL_EVENT',JSON.stringify(timeline));
check('timeline:suspect-order-procedural',typeOf('20 Mei 2026')==='PROCEDURAL_EVENT',JSON.stringify(timeline));
check('timeline:bap-numeric-exam-procedural',typeOf('21-05-2026')==='PROCEDURAL_EVENT',JSON.stringify(timeline));
check('timeline:signed-contract-claimed-event',typeOf('1 Juni 2022')==='CLAIMED_EVENT',JSON.stringify(timeline));
check('timeline:credit-disbursement-claimed-event',typeOf('5 Juni 2022')==='CLAIMED_EVENT',JSON.stringify(timeline));

// H. Previously ungated templates must not fire from isolated/negated lexical mentions.
const negatives=[
  ['gate:no-land-from-negated-list','Tidak ada tanah, sertifikat, SHM, AJB, PPJB, atau urusan BPN.',['land-title','land-sale-chain','land-registration']],
  ['gate:no-contract-from-explicit-absence','Tidak ada perjanjian, kontrak, kredit, utang, piutang, atau hubungan sewa.',['contract-obligation']],
  ['gate:no-criminal-elements-from-negated-mention','Para pihak menegaskan tidak ada dugaan pidana.',['criminal-elements']],
  ['gate:no-election-ethics-from-kpu-incidental','Anggota KPU hadir sebagai saksi fakta dalam sengketa perdata; tidak ada persoalan kode etik.',['election-ethics']],
  ['gate:no-admin-decision-from-incidental-license','Izin usaha dilampirkan sebagai bukti identitas perusahaan dalam sengketa kontrak.',['administrative-decision']],
  ['gate:no-civil-criminal-response-from-bare-pidana','Para ahli waris hanya menyebut istilah pidana dalam korespondensi tanpa perusakan, penguasaan tanpa hak, atau laporan pidana.',['civil-criminal-response']],
] as const;
for(const [name,text,forbidden] of negatives){ const ids=issueIds(text); check(name,!forbidden.some(x=>ids.includes(x)),ids.join(',')); }

// H2. Positive controls for tightened families: material facts must still produce the issue.
const positives=[
  ['gate:inheritance-positive','Pewaris telah meninggal dan para ahli waris berselisih mengenai pembagian boedel waris.','inheritance-entitlement'],
  ['gate:marital-estate-positive','Suami istri mempersoalkan harta bersama yang diperoleh selama perkawinan.','marital-property-estate'],
  ['gate:land-title-positive','Para pihak bersengketa atas tanah SHM 123 dan keabsahan sertifikat hak milik.','land-title'],
  ['gate:land-sale-chain-positive','Pemilik menandatangani PPJB kemudian AJB atas tanah yang sama kepada pembeli.','land-sale-chain'],
  ['gate:land-registration-positive','BPN melakukan balik nama sertifikat setelah peralihan hak atas tanah.','land-registration'],
  ['gate:contract-positive','Debitur menandatangani perjanjian kredit dan wajib melunasi utang sesuai jatuh tempo.','contract-obligation'],
  ['gate:tort-positive','Penggugat mendalilkan perbuatan melawan hukum yang menimbulkan kerugian dan hubungan kausal.','tort-alternative'],
  ['gate:criminal-elements-positive','Tersangka diduga melakukan tindak pidana korupsi yang menimbulkan kerugian negara.','criminal-elements'],
  ['gate:criminal-procedure-positive','Penyidik melakukan penyitaan dalam tahap penyidikan berdasarkan laporan polisi.','criminal-procedure'],
  ['gate:election-ethics-positive','Anggota KPU diperiksa DKPP karena dugaan pelanggaran kode etik penyelenggara pemilu.','election-ethics'],
  ['gate:electronic-evidence-positive','Screenshot WhatsApp diajukan sebagai bukti elektronik dan autentikasinya dipersoalkan.','electronic-evidence'],
  ['gate:administrative-decision-positive','Keputusan tata usaha negara mengenai pencabutan izin digugat ke PTUN.','administrative-decision'],
  ['gate:resignation-positive','Direktur mengundurkan diri dan prosedur penggantian pengurus dipersoalkan.','resignation-replacement'],
  ['gate:instrument-revision-positive','Surat Keputusan awal kemudian direvisi dan keabsahan perubahan SK dipersoalkan.','instrument-revision'],
  ['gate:civil-criminal-response-positive','Ahli waris menguasai tanpa hak dokumen sertifikat milik pewaris dan tindakan itu dipersoalkan sebagai perdata atau pidana.','civil-criminal-response'],
] as const;
for(const [name,text,expected] of positives){ const ids=issueIds(text); check(name,ids.includes(expected),ids.join(',')); }

// I. Production-path offline BAP Tipikor: Section III must not become empty merely
// because a corporate supporting domain is correctly rejected.
try {
  const out:any=await runCaseAnalysis({title:'BAP Tipikor Kredit',narrative:tipikorText,input_type:'narrative',regulatory_mode:'offline'});
  const laws=(out?.applicable_law||[]).map((x:any)=>String(x.regulation||x.title||x.source_label||''));
  check('production:tipikor-section-iii-not-empty',laws.length>0,laws.join(' | '));
  check('production:tipikor-lex-specialis-present',laws.some((x:string)=>/31\s*Tahun\s*1999|20\s*Tahun\s*2001|Tipikor|Korupsi/i.test(x)),laws.join(' | '));
  const supporting=(out?.domain_classification?.domains||[]).slice(1).map((x:any)=>String(x.label||''));
  check('production:no-employment-supporting-domain',!supporting.some((x:string)=>/Ketenagakerjaan/i.test(x)),supporting.join(' | '));
  check('production:evidence-needed-structured',Array.isArray(out?.evidence_needed)&&out.evidence_needed.length>0&&!out.evidence_needed.every((x:string)=>/Dokumen primer yang melahirkan hubungan hukum|Bukti pembayaran\/transaksi\/korespondensi|Kronologi bertanggal dan identitas|Bukti pendukung atas kerugian/.test(x)),JSON.stringify(out?.evidence_needed));
  const plans=out?.case_working_paper?.action_plan||[];
  check('production:action-plan-not-constant-objectives',plans.length===0||new Set(plans.map((x:any)=>x.objective)).size>1,JSON.stringify(plans.slice(0,5)));
} catch(e:any) {
  check('production:offline-runCaseAnalysis-executes',false,e?.stack||e);
}

for(const r of rows) console.log(`${r.pass?'PASS':'FAIL'} ${r.name} :: ${r.detail}`);
const passed=rows.filter(x=>x.pass).length;
console.log(`SUMMARY ${passed}/${rows.length} residual-v4 checks PASS`);
if(passed!==rows.length) process.exit(1);
}
main().catch(e=>{ console.error(e); process.exit(1); });
