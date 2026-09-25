import { deriveOntologyIssues, inferLegalContext } from '../server/legalOntology';
import { buildLawyerWorkflow } from '../server/lawyerWorkflow';
import { __test__ } from '../server/caseAnalysis';

const results:{name:string;pass:boolean;detail:string}[]=[];
const check=(name:string,pass:boolean,detail:string)=>results.push({name,pass,detail});

// 1) issue overgeneration: certificate cancellation must NOT become contract cancellation/restitution.
const inheritanceLand=`--- HALAMAN 1 --- Gugatan Penggugat mengenai ahli waris dan tanah warisan. Para ahli waris mempermasalahkan Sertipikat Hak Milik Nomor 05392. Penggugat meminta membatalkan sertifikat tersebut karena data penerbitannya didalilkan tidak benar. --- HALAMAN 2 --- Pembagian waris Ibu Kasiyah kepada anak-anaknya dan sertifikat tanah atas nama Kajat.`;
const issueIds=deriveOntologyIssues(inheritanceLand).map(x=>x.id);
check('issue:no-false-contract-cancellation',!issueIds.includes('cancellation-restitution'),issueIds.join(','));

// 2) boilerplate power of attorney must not generate POA validity issue.
const poaBoiler=`--- HALAMAN 1 --- Berdasarkan Surat Kuasa Khusus, para Advokat bertindak untuk dan atas nama Penggugat. Gugatan membahas sengketa waris dan sertifikat tanah. Surat kuasa hanya dicantumkan sebagai dasar representasi para advokat.`;
const poaIds=deriveOntologyIssues(poaBoiler).map(x=>x.id);
check('issue:no-boilerplate-poa',!poaIds.includes('power-of-attorney'),poaIds.join(','));

// 3) actual disputed POA should still fire.
const poaDisputed=`--- HALAMAN 1 --- Tergugat menyatakan Surat Kuasa Khusus Penggugat tidak sah dan penerima kuasa melampaui batas kuasa sehingga keabsahan surat kuasa dipersoalkan.`;
const poaDisputedIds=deriveOntologyIssues(poaDisputed).map(x=>x.id);
check('issue:disputed-poa-kept',poaDisputedIds.includes('power-of-attorney'),poaDisputedIds.join(','));

// 3b) true contract cancellation/restitution must remain discoverable.
const contractCancel=`--- HALAMAN 1 --- Para pihak membuat perjanjian jual beli dengan pembayaran Rp100.000.000. Pembeli meminta pembatalan perjanjian dan pengembalian uang karena prestasi tidak dilaksanakan.`;
const contractCancelIds=deriveOntologyIssues(contractCancel).map(x=>x.id);
check('issue:true-contract-cancellation-kept',contractCancelIds.includes('cancellation-restitution'),contractCancelIds.join(','));

// 3c) formal document mention alone must not create authenticity issue.
const docBoiler=`--- HALAMAN 1 --- Sertifikat Hak Milik Nomor 123 dicantumkan sebagai objek sengketa tanah dan dilampirkan pada gugatan.`;
const docBoilerIds=deriveOntologyIssues(docBoiler).map(x=>x.id);
check('issue:no-document-authenticity-from-mention-only',!docBoilerIds.includes('document-authenticity'),docBoilerIds.join(','));

// 3d) actual falsification/integrity dispute must still create authenticity issue.
const docDispute=`--- HALAMAN 1 --- Penggugat mendalilkan data dalam sertifikat tidak benar dan terdapat pemalsuan dokumen serta perubahan setelah dokumen dibuat.`;
const docDisputeIds=deriveOntologyIssues(docDispute).map(x=>x.id);
check('issue:true-document-authenticity-kept',docDisputeIds.includes('document-authenticity'),docDisputeIds.join(','));

// 4) financial false-trigger: land certificate + damages amount must not activate audit.
const wfLand=buildLawyerWorkflow({title:'x',text:'Sengketa waris atas Sertipikat Hak Milik. Penggugat menuntut ganti rugi Rp50.000.000 dan pembatalan sertifikat.',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[{}]},legalIssues:[],legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]});
check('financial:land-damages-inactive',wfLand.financial_collateral_audit.active===false,JSON.stringify(wfLand.financial_collateral_audit));

// 5) real credit/collateral data should still activate.
const wfCredit=buildLawyerWorkflow({title:'x',text:'Debitur memiliki pinjaman bank Rp100.000.000 dengan agunan BPKB dan angsuran jatuh tempo belum lunas.',sourceRole:'CASE_NARRATIVE_OR_QUESTION',domainContext:{},evidence:{textual_facts:[],party_claims:[{}]},legalIssues:[],legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]});
check('financial:true-credit-active',wfCredit.financial_collateral_audit.active===true,JSON.stringify(wfCredit.financial_collateral_audit));

// 6) witness overgeneration: parties/counsel not auto-promoted; explicit witness kept.
const actors=[
 {actor:'Penggugat',roles:['Penggugat'],pages:[1],entity_type:'ROLE'},
 {actor:'Advokat',roles:['Advokat'],pages:[1],entity_type:'ROLE'},
 {actor:'Kasiyah',roles:['Ahli Waris'],pages:[2],entity_type:'PERSON'},
 {actor:'Saksi Budi',roles:['Saksi'],pages:[3],entity_type:'PERSON'},
 {actor:'Notaris Rina',roles:['Notaris'],pages:[4],entity_type:'PERSON'},
];
const wfWitness=buildLawyerWorkflow({title:'x',text:'Gugatan perdata',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[{}]},legalIssues:[{issue:'uji'}],legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:actors});
const witnessNames=wfWitness.witness_strategy.witness_targets.map(x=>x.witness);
check('witness:no-party-counsel-overgeneration',!witnessNames.includes('Penggugat')&&!witnessNames.includes('Advokat')&&!witnessNames.includes('Kasiyah'),witnessNames.join(','));
check('witness:explicit-witness-and-custodian-kept',witnessNames.includes('Saksi Budi')&&witnessNames.includes('Notaris Rina'),witnessNames.join(','));

// 7) authority-duty matrix should no longer include every party/person.
const dutyNames=wfWitness.authority_duty_matrix.map(x=>x.actor);
check('role:authority-matrix-filtered',!dutyNames.includes('Penggugat')&&!dutyNames.includes('Kasiyah')&&dutyNames.includes('Advokat')&&dutyNames.includes('Notaris Rina'),dutyNames.join(','));

// 8) internal article precision: harta issue should select Pasal 35-37, not divorce category.
const domain=__test__.buildDomainRankingContext('KELUARGA_WARIS',[]);
const regime={forum:'UMUM',regime:'CIVIL',signals:{forum_explicit:[],criminal_procedural:[],civil_procedural:['gugatan'],administrative_procedural:[],islamic_substantive:[],civil_substantive:[],customary_substantive:[],personal_identity:[]}} as any;
const mr=__test__.matchRegulations('harta bersama harta bawaan dalam perkawinan dan boedel waris','KELUARGA_WARIS',['harta bersama','harta bawaan','boedel waris','perkawinan'],domain,regime);
const marriage=mr.rows.find((r:any)=>String(r.regulation?.nomor||'').includes('UU No. 1 Tahun 1974'));
const arts=(marriage?.matched_articles||[]).map((a:any)=>String(a?.pasal||''));
check('authority:marital-property-article-specific',arts.includes('Pasal 35-37'),arts.join(','));
check('authority:no-divorce-category-for-property',!arts.includes('Perceraian & akibat hukum'),arts.join(','));

for(const r of results) console.log(`${r.pass?'PASS':'FAIL'} ${r.name} :: ${r.detail}`);
const passed=results.filter(x=>x.pass).length;
console.log(`SUMMARY ${passed}/${results.length} PASS`);
if(passed!==results.length) process.exit(1);
