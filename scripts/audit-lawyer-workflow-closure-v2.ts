import { buildLawyerWorkflow } from '../server/lawyerWorkflow';
declare const process:any;
let pass=0,total=0;
const ck=(name:string,ok:boolean,detail='')=>{ total++; console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` :: ${detail}`:''}`); if(ok)pass++; };

function run(text:string, actors:any[]){
  return buildLawyerWorkflow({
    title:'Deterministic lawyer-workflow closure', text, sourceRole:'INVESTIGATION_OR_BAP', domainContext:{},
    evidence:{textual_facts:[],party_claims:[]}, legalIssues:[{issue:'Uji kewenangan dan prosedur',analysis:'Uji SOP dan pembagian tugas.'}],
    legalGaps:[], adverseEvidence:[], applicableLaw:[], verifiedTimeline:[], actorMatrix:actors,
  });
}

const operationalActors=[
  {actor:'Kepala Bagian Kredit',roles:['Kabag Kredit'],pages:[1]},
  {actor:'Tim Analisa',roles:['Account Officer','Legal'],pages:[1]},
  {actor:'Debitur',roles:['Debitur'],pages:[1]},
  {actor:'Penyidik',roles:['Penyidik'],pages:[1]},
];
const positive=run(
  'BERITA ACARA PEMERIKSAAN TERSANGKA. Kredit Rp255.000.000 diproses oleh Tim Kredit. Penyidik mempertanyakan kredit tanpa survei ulang dan pengurangan provisi. Agunan BPKB dikuasai bank.',
  operationalActors,
);
ck('financial discrepancy captures omitted/reduced procedure',positive.financial_collateral_audit.discrepancy_terms.some(x=>/tanpa survei ulang|pengurangan provisi/i.test(x)),positive.financial_collateral_audit.discrepancy_terms.join('|'));
ck('operational role may become fact-witness candidate',positive.witness_strategy.witness_targets.some(x=>x.category==='FACT_WITNESS'&&/Kepala Bagian Kredit|Tim Analisa/i.test(x.witness)),positive.witness_strategy.witness_targets.map(x=>`${x.witness}:${x.category}`).join('|'));
ck('procedural actor remains procedural with caution',positive.witness_strategy.witness_targets.some(x=>x.category==='PROCEDURAL_ACTOR'&&/Penyidik/i.test(x.witness)&&!!x.caution));
ck('party-only actor is not auto-promoted to witness',!positive.witness_strategy.witness_targets.some(x=>/^Debitur$/i.test(x.witness)));

const noFinancial=run(
  'BERITA ACARA PEMERIKSAAN. Tidak ada kredit, pinjaman, agunan, transfer, atau transaksi keuangan dalam perkara ini. Dokumen administrasi belum lengkap.',
  [{actor:'Staf Administrasi',roles:['Staf'],pages:[1]}],
);
ck('explicit absence does not activate financial audit',noFinancial.financial_collateral_audit.active===false,String(noFinancial.financial_collateral_audit.active));
ck('generic administrative incompleteness is not financial discrepancy',noFinancial.financial_collateral_audit.discrepancy_terms.length===0,String(noFinancial.financial_collateral_audit.discrepancy_terms.length));
ck('generic actor is not auto-promoted to witness',noFinancial.witness_strategy.witness_targets.length===0,String(noFinancial.witness_strategy.witness_targets.length));

const financeNoDiscrepancy=run(
  'BERITA ACARA PEMERIKSAAN. Fasilitas kredit telah lunas. Agunan BPKB asli tersimpan di bank dan seluruh dokumen dinyatakan lengkap.',
  [{actor:'Kabag Kredit',roles:['Kepala Bagian Kredit'],pages:[1]}],
);
ck('finance context alone does not invent discrepancy',financeNoDiscrepancy.financial_collateral_audit.discrepancy_terms.length===0,financeNoDiscrepancy.financial_collateral_audit.discrepancy_terms.join('|'));
ck('operational witness candidate still requires concrete operational role',financeNoDiscrepancy.witness_strategy.witness_targets.some(x=>/Kabag Kredit/i.test(x.witness)));

console.log(`\n${pass}/${total} lawyer-workflow closure checks PASS`);
if(pass!==total) process.exitCode=1;
