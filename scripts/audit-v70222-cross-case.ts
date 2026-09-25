import { deriveOntologyIssues, inferLegalContext } from '../server/legalOntology';
import { buildLawyerWorkflow } from '../server/lawyerWorkflow';

const rows:{name:string;pass:boolean;detail:string}[]=[];
const check=(name:string,pass:boolean,detail:string)=>rows.push({name,pass,detail});
const wf=(text:string,role='CASE_NARRATIVE_OR_QUESTION')=>buildLawyerWorkflow({title:'benchmark',text,sourceRole:role,domainContext:{},evidence:{textual_facts:[],party_claims:[{}]},legalIssues:deriveOntologyIssues(text).map(x=>({issue:x.issue,analysis:x.basis})),legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]});

// A. Pure contract / default
const contract='Para pihak membuat perjanjian jasa. Pembayaran termin kedua jatuh tempo 1 Juli 2026. Debitur tidak membayar setelah somasi. Kreditur menuntut wanprestasi dan ganti rugi. Tidak ada dugaan pidana.';
const contractIds=deriveOntologyIssues(contract).map(x=>x.id);
check('cross:contract-detects-contract-default',contractIds.includes('contract-obligation')&&contractIds.includes('default-remedies'),contractIds.join(','));
check('cross:contract-no-financial-audit-from-payment-alone',wf(contract).financial_collateral_audit.active===false,JSON.stringify(wf(contract).financial_collateral_audit));

// B. Criminal non-financial
const criminal='Tersangka diperiksa penyidik atas dugaan penganiayaan. Terdapat BAP, penahanan, saksi, dan barang bukti. Tidak ada kredit, pinjaman, agunan, transfer, atau transaksi keuangan.';
const criminalCtx=inferLegalContext(criminal);
const criminalWf=wf(criminal,'INVESTIGATION_OR_BAP');
check('cross:criminal-routes-criminal',criminalCtx.primary.id==='PIDANA_MATERIIL_FORMIL',`${criminalCtx.primary.id}:${criminalCtx.primary.score}`);
check('cross:criminal-nonfinancial-stays-inactive',criminalWf.financial_collateral_audit.active===false,JSON.stringify(criminalWf.financial_collateral_audit));

// C. Family/inheritance without land
const family='Pewaris meninggal dan meninggalkan tiga anak serta seorang istri. Para pihak berselisih mengenai ahli waris, bagian waris, harta bawaan, dan harta bersama. Tidak ada tanah, sertifikat, bank, kredit, atau agunan.';
const familyIds=deriveOntologyIssues(family).map(x=>x.id);
check('cross:family-detects-inheritance-property',familyIds.includes('inheritance-entitlement')&&familyIds.includes('marital-property-estate'),familyIds.join(','));
check('cross:family-no-agraria-issue',!familyIds.includes('land-title')&&!familyIds.includes('land-registration'),familyIds.join(','));
check('cross:family-financial-inactive',wf(family).financial_collateral_audit.active===false,JSON.stringify(wf(family).financial_collateral_audit));

// D. Real finance/collateral
const finance='PT A memperoleh fasilitas kredit Rp2 miliar dari Bank B dengan Hak Tanggungan atas SHM. Angsuran telah jatuh tempo, mutasi rekening mencatat beberapa pembayaran, dan appraisal mencantumkan nilai taksasi agunan.';
const finWf=wf(finance);
const finQuestions=finWf.financial_collateral_audit.review_questions.join(' | ');
check('cross:finance-active',finWf.financial_collateral_audit.active===true,JSON.stringify(finWf.financial_collateral_audit));
check('cross:finance-questions-follow-signals',/kredit|pinjaman/i.test(finQuestions)&&/agunan|jaminan/i.test(finQuestions)&&/jatuh tempo|pembayaran/i.test(finQuestions)&&/taksasi|appraisal/i.test(finQuestions),finQuestions);

// E. Administrative/non-financial
const admin='Pemohon menggugat keputusan tata usaha negara mengenai pencabutan izin usaha. Dipersoalkan kewenangan pejabat, prosedur penerbitan keputusan, dan upaya administratif. Tidak ada pinjaman, bank, agunan, atau transaksi.';
const adminCtx=inferLegalContext(admin);
const adminIds=deriveOntologyIssues(admin).map(x=>x.id);
check('cross:admin-routes-administrative',adminCtx.primary.id==='TUN_ADMINISTRASI',`${adminCtx.primary.id}:${adminCtx.primary.score}`);
check('cross:admin-has-administrative-issue',adminIds.includes('administrative-decision'),adminIds.join(','));
check('cross:admin-financial-inactive',wf(admin).financial_collateral_audit.active===false,JSON.stringify(wf(admin).financial_collateral_audit));

for(const r of rows) console.log(`${r.pass?'PASS':'FAIL'} ${r.name} :: ${r.detail}`);
const ok=rows.filter(r=>r.pass).length;
console.log(`SUMMARY ${ok}/${rows.length} PASS`);
if(ok!==rows.length) process.exit(1);
