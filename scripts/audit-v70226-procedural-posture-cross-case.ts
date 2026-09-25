import { resolveProceduralPosture } from '../server/proceduralPosture';
import { buildLawyerWorkflow } from '../server/lawyerWorkflow';
import { __test__ } from '../server/caseAnalysis';

let failed=0;
const check=(name:string,ok:boolean,detail='')=>{console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` :: ${detail}`:''}`);if(!ok)failed++;};
const stage=(title:string,text:string,role:string)=>resolveProceduralPosture({title,text,sourceRole:role}).stage;

check('cross:civil-repliek-with-execution-subject',stage('','REPLIEK PERKARA NOMOR 44/Pdt.G/2026/PN\nTergugat membahas eksekusi hak tanggungan, agunan, jaminan dan pelelangan.','LITIGATION_SUBMISSION')==='PLEADING');
check('cross:civil-appeal-with-seizure-history',stage('','MEMORI BANDING\nPada penyidikan perkara lain pernah dilakukan penyitaan. Gugatan tingkat pertama ditolak.','LITIGATION_SUBMISSION')==='APPEAL');
check('cross:civil-execution-with-mediation-history',stage('','PERMOHONAN EKSEKUSI\nSebelumnya para pihak pernah mediasi dan saling mengirim somasi.','LITIGATION_SUBMISSION')==='EXECUTION');
check('cross:criminal-pledoi-with-investigation-history',stage('','PLEDOI\nPada tahap penyidikan Terdakwa pernah ditahan dan barang disita.','LITIGATION_SUBMISSION')==='PLEADING');
check('cross:criminal-indictment-with-civil-history',stage('','SURAT DAKWAAN\nSebelumnya para pihak bersengketa dalam gugatan perdata.','LITIGATION_SUBMISSION')==='PROSECUTION');
check('cross:criminal-bap-with-civil-mentions',stage('','BERITA ACARA PEMERIKSAAN\nPihak menerangkan adanya gugatan perdata dan somasi.','INVESTIGATION_OR_BAP')==='INVESTIGATION');
check('cross:ptun-pleading-with-administrative-appeal-history',stage('','GUGATAN PTUN\nSebelumnya Penggugat telah menempuh banding administratif.','LITIGATION_SUBMISSION')==='PLEADING');
check('cross:family-pleading-with-collateral-execution-topic',stage('','REPLIEK\nObjek waris pernah dijaminkan dan lawan menyebut kemungkinan eksekusi hak tanggungan.','LITIGATION_SUBMISSION')==='PLEADING');
check('cross:consultation-options-not-current-posture',stage('','Klien bertanya apakah sebaiknya banding, kasasi, atau menunggu kemungkinan eksekusi.','CASE_NARRATIVE_OR_QUESTION')==='CONSULTATION');

const ctx=(primary:string)=>__test__.buildDomainRankingContext(primary as any,[]);
const mk=(title:string,article:string)=>({title,source_kind:'LOCAL' as const,source_label:title,article_summary:'Pasal X',domain_tags:[],article_text_pool:article,material_confidence:'HIGH' as const,citation_hit:false,regime_note:null,domain_alignment:'PRIMARY' as const,authority_identity:title,tempus_status:'POTENTIALLY_COMPATIBLE' as const,year:2020,raw_articles:[{pasal:'Pasal X',topic:'',content:article,keywords:[]}]});
const bind=(text:string,stageValue:any,terms:string[],cands:any[])=>__test__.bindIssuesToAuthorities(
 [{issue:'Uji prosedural',issue_id:'remedy-procedure',analysis:'uji'}],
 [{question:'Uji prosedural',id:'remedy-procedure',query_terms:terms,domain:'PERDATA_UMUM'}],
 cands,ctx('PERDATA_UMUM'),text,'CIVIL','UMUM',stageValue
)[0];

const pleadingBind=bind('REPLIEK\nKompetensi relatif dipersoalkan. Lawan menyebut eksekusi hak tanggungan.','PLEADING',['hukum acara','kompetensi pengadilan'],[
 mk('Pedoman Eksekusi','hukum acara eksekusi aanmaning sita eksekusi pengadilan negeri'),
 mk('Pedoman Hukum Acara Perdata','hukum acara kompetensi pengadilan negeri syarat formil gugatan'),
]);
check('cross:pleading-rejects-execution-authority',pleadingBind.bound_authorities.length===1 && pleadingBind.bound_authorities[0].source_label==='Pedoman Hukum Acara Perdata',JSON.stringify(pleadingBind.bound_authorities));

const execBind=bind('PERMOHONAN EKSEKUSI\nPemohon meminta aanmaning dan sita eksekusi.','EXECUTION',['hukum acara','eksekusi','aanmaning'],[
 mk('Pedoman Eksekusi','hukum acara eksekusi aanmaning sita eksekusi pengadilan negeri'),
 mk('Pedoman Banding','hukum acara banding tenggang banding pengadilan negeri'),
]);
check('cross:execution-selects-execution-authority',execBind.bound_authorities.length===1 && execBind.bound_authorities[0].source_label==='Pedoman Eksekusi',JSON.stringify(execBind.bound_authorities));

const appealPostdated={...mk('Pedoman Banding 2025','hukum acara banding tenggang banding pengadilan negeri'),year:2025,tempus_status:'POTENTIALLY_INCOMPATIBLE' as const};
const appealBind=bind('MEMORI BANDING diajukan pada 2024. Dalam uraian disebut eksekusi perkara lain tahun 2026.','APPEAL',['hukum acara','banding','tenggang banding'],[appealPostdated]);
check('cross:appeal-tempus-rejects-postdated-authority-despite-other-stage-year',appealBind.bound_authorities.length===0,JSON.stringify(appealBind.bound_authorities));

const workflow=buildLawyerWorkflow({title:'',text:'REPLIEK\nBody membahas eksekusi dan agunan.',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[]},legalIssues:[{issue:'kompetensi'}],legalGaps:[],adverseEvidence:[],applicableLaw:[{regulation:'PERMA Prosedur Mediasi',source:'lokal',article:'prosedur mediasi',relevance:'hukum acara'}],verifiedTimeline:[],actorMatrix:[]});
check('cross:workflow-remains-pleading-aware',workflow.procedural_stage==='PLEADING' && workflow.drafting_plan.some((x:any)=>/gugatan|jawaban|replik|duplik/i.test(x.document||'')),workflow.procedural_stage);

if(failed){console.error(`FAILED ${failed}`);process.exit(1);}console.log('ALL V7.0.2.26 POSTURE CROSS-CASE TESTS PASSED');
