declare const process:any;
import { buildLawyerWorkflow } from '../server/lawyerWorkflow';

let pass=0,total=0;
function check(name:string,ok:boolean,detail=''){ total++; if(ok){pass++;console.log(`PASS ${name}${detail?` :: ${detail}`:''}`)}else console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`); }

// Generic financial-criminal defense fixture. No person/case/regulation hardcoding.
const text=`BERITA ACARA PEMERIKSAAN TERSANGKA. Tersangka adalah mantan direktur utama sebuah BPR daerah. Penyidik memeriksa pemberian fasilitas kredit Rp255.000.000 kepada debitur existing. Kredit sebelumnya Rp150.000.000 telah lunas tepat waktu. Pengajuan kedua disetujui berdasarkan usulan kepala bagian pemasaran dan dokumen analisa kredit. Agunan berupa kendaraan dengan nilai taksasi Rp262.333.333 dan BPKB asli diserahkan ke bank. Pada lembar fiat terdapat catatan agar legalitas kelengkapan dan opini kepatuhan diperiksa. Terdapat temuan bahwa survei lokasi tidak diulang dan sebagian dokumen administrasi belum lengkap. Sebelum kredit kedua jatuh tempo, debitur mengajukan kredit ketiga lebih besar dan direktur menolak karena repayment capacity tidak memadai. Tidak disebut adanya hubungan keluarga atau aliran dana kepada direktur. Penyidik mempertanyakan pembagian kewenangan, prosedur 5C, kerugian keuangan, dan kemungkinan keuntungan pribadi.`;
const evidence={source_role:'INVESTIGATION_OR_BAP',textual_facts:[{statement:'kredit pertama telah lunas'}],party_claims:[{statement:'tersangka menyatakan keputusan berdasarkan usulan staf'}],actors:[{actor:'Direktur Utama',roles:['Pemutus Kredit'],pages:[1]},{actor:'Kabag Pemasaran',roles:['Pengusul Kredit'],pages:[1]},{actor:'Debitur',roles:['Debitur'],pages:[1]}],timeline:[{date:'2022',event:'Pemberian fasilitas kredit',page:1}],anomalies:[],adverse_evidence:[]};
const ctx={primary:{id:'PIDANA_MATERIIL_FORMIL',label:'Hukum Pidana & Acara Pidana',score:10},secondary:[{id:'KORPORASI_BISNIS',label:'Hukum Korporasi & Bisnis',score:7}],confidence:'MEDIUM',ambiguous:true,margin:3};
const issues=[
  {issue:'Apakah keputusan kredit merupakan penyalahgunaan kewenangan atau diskresi bisnis yang harus diuji terhadap pembagian tugas dan SOP?',analysis:'Uji kewenangan pemutus, rekomendasi bawahan, prosedur 5C, dan catatan persetujuan.',rule:'PENDING',conclusion:'PENDING'},
  {issue:'Apakah terdapat kesengajaan atau keuntungan pribadi dalam keputusan yang dipersoalkan?',analysis:'Uji personal gain, hubungan istimewa, penolakan transaksi berikutnya, dan aliran dana.',rule:'PENDING',conclusion:'PENDING'},
  {issue:'Bagaimana status agunan, repayment, dan kerugian yang didalilkan?',analysis:'Rekonsiliasi nilai agunan, penguasaan dokumen, repayment, dan actual/potential loss.',rule:'PENDING',conclusion:'PENDING'}
];
const wf=buildLawyerWorkflow({title:'Audit defense workflow',text,sourceRole:'INVESTIGATION_OR_BAP',domainContext:ctx,evidence,legalIssues:issues,legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:evidence.timeline,actorMatrix:evidence.actors});

check('orientation criminal defense',wf.orientation==='CRIMINAL_DEFENSE',wf.orientation);
check('role stage present',wf.stages.some(x=>x.id==='case-role'));
check('source scope stage present',wf.stages.some(x=>x.id==='scope-source'));
check('fact matrix stage present',wf.stages.some(x=>x.id==='fact-matrix'));
check('allegation response matrix built',wf.allegation_response_matrix.length>=1,String(wf.allegation_response_matrix.length));
check('authority duty matrix built',wf.authority_duty_matrix.length>=1,String(wf.authority_duty_matrix.length));
check('financial amounts captured',wf.financial_collateral_audit.amounts.length>=3,wf.financial_collateral_audit.amounts.join('|'));
check('collateral review captured',wf.financial_collateral_audit.collateral_terms.length>=1,String(wf.financial_collateral_audit.collateral_terms.length));
check('repayment review captured',wf.financial_collateral_audit.repayment_terms.length>=1,String(wf.financial_collateral_audit.repayment_terms.length));
check('discrepancy review captured',wf.financial_collateral_audit.discrepancy_terms.length>=1,String(wf.financial_collateral_audit.discrepancy_terms.length));
check('document integrity stage',wf.stages.some(x=>x.id==='document-integrity'));
check('witness strategy generated',wf.witness_strategy.witness_targets.length>=1,String(wf.witness_strategy.witness_targets.length));
check('banking expert inferred',wf.witness_strategy.expert_domains.some(x=>/Perbankan/i.test(x)),wf.witness_strategy.expert_domains.join('|'));
check('criminal expert inferred',wf.witness_strategy.expert_domains.some(x=>/pidana/i.test(x)),wf.witness_strategy.expert_domains.join('|'));
check('draft chronology planned',wf.drafting_plan.some(x=>/kronologi/i.test(x.document)));
check('draft evidence map planned',wf.drafting_plan.some(x=>/pembuktian|allegation/i.test(x.document)));
check('draft defense memo planned',wf.drafting_plan.some(x=>/defense|pembelaan/i.test(x.document)));
check('witness questions planned',wf.drafting_plan.some(x=>/saksi/i.test(x.document)));
check('citation verification next action',wf.next_actions.some(x=>/citation|status berlaku|tempus/i.test(x)));
check('no named-case hardcode in workflow output',!/Elya|Dewi Mufarida|Blitar/i.test(JSON.stringify(wf)));

console.log(`\n${pass}/${total} lawyer-workflow checks PASS`);
if(pass!==total) process.exitCode=1;
