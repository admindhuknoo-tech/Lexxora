import { __test__ } from '../server/caseAnalysis';
import { buildLawyerWorkflow } from '../server/lawyerWorkflow';

let failed=0;
const check=(name:string,ok:boolean,detail='')=>{console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` :: ${detail}`:''}`);if(!ok)failed++;};
const ctx=(primary:string)=>__test__.buildDomainRankingContext(primary as any,[]);
const mk=(title:string,article:string,alignment:'PRIMARY'|'SECONDARY'|'NEUTRAL'|'FOREIGN'='PRIMARY')=>({title,source_kind:'LOCAL' as const,source_label:title,article_summary:'Pasal X',domain_tags:[],article_text_pool:article,material_confidence:'HIGH' as const,citation_hit:false,regime_note:null,domain_alignment:alignment,authority_identity:title,tempus_status:'POTENTIALLY_COMPATIBLE' as const,year:2020,raw_articles:[{pasal:'Pasal X',topic:'',content:article,keywords:[]}]});
const bind=(text:string,regime:any,forum:any,domain:string,terms:string[],cands:any[])=>__test__.bindIssuesToAuthorities(
 [{issue:'Uji prosedural',issue_id:'remedy-procedure',analysis:'uji'}],
 [{question:'Uji prosedural',id:'remedy-procedure',query_terms:terms,domain}],
 cands,ctx(domain),text,regime,forum
)[0];

const civilAppeal=bind('Pengadilan Negeri. Memori banding diajukan dan tenggang banding dipersoalkan.','CIVIL','UMUM','PERDATA_UMUM',['hukum acara','banding','tenggang banding'],[
 mk('Pedoman Banding Peradilan Umum','hukum acara banding tenggang banding pengadilan negeri'),
 mk('Pedoman Eksekusi','hukum acara eksekusi aanmaning sita eksekusi pengadilan negeri'),
]);
check('cross:civil-appeal-selects-appeal-family',civilAppeal.bound_authorities.length===1 && civilAppeal.bound_authorities[0].source_label==='Pedoman Banding Peradilan Umum',JSON.stringify(civilAppeal.bound_authorities));

const civilExecution=bind('Pengadilan Negeri. Pemohon meminta aanmaning dan sita eksekusi.','CIVIL','UMUM','PERDATA_UMUM',['hukum acara','eksekusi','aanmaning','sita eksekusi'],[
 mk('Pedoman Banding Peradilan Umum','hukum acara banding tenggang banding pengadilan negeri'),
 mk('Pedoman Eksekusi Peradilan Umum','hukum acara eksekusi aanmaning sita eksekusi pengadilan negeri'),
]);
check('cross:civil-execution-selects-execution-family',civilExecution.bound_authorities.length===1 && civilExecution.bound_authorities[0].source_label==='Pedoman Eksekusi Peradilan Umum',JSON.stringify(civilExecution.bound_authorities));

const criminalInvestigation=bind('Tersangka diperiksa penyidik dan penahanan serta penyitaan dipersoalkan.','CRIMINAL','UMUM','PIDANA_MATERIIL_FORMIL',['hukum acara pidana','penahanan','penyitaan'],[
 mk('KUHAP','hukum acara pidana penyidikan penahanan penyitaan praperadilan'),
 mk('Pedoman Banding Perdata','hukum acara perdata banding pengadilan negeri'),
]);
check('cross:criminal-investigation-selects-criminal-procedure',criminalInvestigation.bound_authorities.length===1 && criminalInvestigation.bound_authorities[0].source_label==='KUHAP',JSON.stringify(criminalInvestigation.bound_authorities));

const admin=bind('Sengketa di PTUN mempertanyakan kompetensi dan syarat formil gugatan.','ADMINISTRATIVE','TUN','TUN_ADMINISTRASI',['hukum acara','kompetensi pengadilan','syarat formil'],[
 mk('Hukum Acara PTUN','hukum acara pengadilan tata usaha negara ptun kompetensi syarat formil'),
 mk('Pedoman Peradilan Agama','hukum acara peradilan agama kompetensi syarat formil'),
]);
check('cross:ptun-rejects-other-forum-procedure',admin.bound_authorities.length===1 && admin.bound_authorities[0].source_label==='Hukum Acara PTUN',JSON.stringify(admin.bound_authorities));

const wfAppeal=buildLawyerWorkflow({title:'x',text:'Memori banding diajukan ke Pengadilan Tinggi.',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[]},legalIssues:[{issue:'banding'}],legalGaps:[],adverseEvidence:[],applicableLaw:[{regulation:'Pedoman Banding',source:'resmi',article:'tenggang banding',relevance:'hukum acara banding'}],verifiedTimeline:[],actorMatrix:[]});
check('cross:workflow-appeal-stage-and-ready-authority',wfAppeal.procedural_stage==='APPEAL' && wfAppeal.stages.find(x=>x.id==='drafting')?.status==='READY');

const wfExecutionNoAuthority=buildLawyerWorkflow({title:'x',text:'Permohonan eksekusi dan aanmaning.',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[]},legalIssues:[{issue:'eksekusi'}],legalGaps:[],adverseEvidence:[],applicableLaw:[{regulation:'KUHPerdata',source:'lokal',article:'wanprestasi',relevance:'substansi'}],verifiedTimeline:[],actorMatrix:[]});
check('cross:workflow-execution-not-ready-with-substantive-only',wfExecutionNoAuthority.procedural_stage==='EXECUTION' && wfExecutionNoAuthority.stages.find(x=>x.id==='drafting')?.status==='PARTIAL');

if(failed){console.error(`FAILED ${failed}`);process.exit(1);}console.log('ALL PROCEDURAL AUTHORITY CROSS-CASE TESTS PASSED');
