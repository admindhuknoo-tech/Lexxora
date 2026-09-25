import { deriveOntologyIssues } from '../server/legalOntology';
import { __test__ } from '../server/caseAnalysis';
import { buildLawyerWorkflow } from '../server/lawyerWorkflow';

let failed=0;
function check(name:string,ok:boolean,detail=''){ console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` :: ${detail}`:''}`); if(!ok) failed++; }

const issue=(text:string)=>deriveOntologyIssues(text).find(x=>x.id==='remedy-procedure');
check('issue:no-boilerplate-gugatan',!issue('Penggugat mengajukan gugatan wanprestasi dan meminta ganti rugi.'));
check('issue:appeal-material',!!issue('Penggugat mengajukan memori banding dan tenggang banding dipersoalkan.'));
check('issue:execution-material',!!issue('Pemohon meminta aanmaning dan sita eksekusi terhadap objek putusan.'));

check('stage:appeal-over-generic-litigation',
  buildLawyerWorkflow({title:'x',text:'MEMORI BANDING diajukan ke Pengadilan Tinggi.',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[]},legalIssues:[{issue:'tenggang banding'}],legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]}).procedural_stage==='APPEAL');
check('stage:execution-over-generic-litigation',
  buildLawyerWorkflow({title:'x',text:'Permohonan eksekusi dan aanmaning atas putusan.',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[]},legalIssues:[{issue:'eksekusi'}],legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]}).procedural_stage==='EXECUTION');

const regime={forum:'UMUM',regime:'CIVIL',signals:{forum_explicit:['pengadilan_negeri'],criminal_procedural:[],civil_procedural:['gugatan'],administrative_procedural:[],islamic_substantive:[],civil_substantive:[],customary_substantive:[],personal_identity:[]}} as any;
const ont=[{question:'Remedy dan langkah prosedural apa yang secara faktual dibutuhkan untuk melindungi posisi klien, dengan forum, tenggang, kewenangan, dan syarat formil yang masih harus diverifikasi?',id:'remedy-procedure',query_terms:['hukum acara','tenggang upaya hukum','kompetensi pengadilan','banding','tenggang banding'],domain:'PERDATA_UMUM'}];
const mk=(title:string,article:string,year=2020)=>({title,source_kind:'LOCAL' as const,source_label:title,article_summary:'Pasal 1',domain_tags:[],article_text_pool:article,material_confidence:'HIGH' as const,citation_hit:false,regime_note:null,domain_alignment:'PRIMARY' as const,authority_identity:title,tempus_status:'POTENTIALLY_COMPATIBLE' as const,year,raw_articles:[{pasal:'Pasal 1',topic:'',content:article,keywords:[]} ]});
const bind=(text:string,cands:any[],forum:any='UMUM')=>__test__.bindIssuesToAuthorities([{issue:ont[0].question,issue_id:'remedy-procedure',analysis:'uji'}],ont,cands,__test__.buildDomainRankingContext('PERDATA_UMUM',[]),text,'CIVIL',forum)[0];

check('authority:reject-substantive-for-appeal',bind('Pengadilan Negeri. Memori banding diajukan.',[mk('KUHPerdata','wanprestasi perjanjian ganti rugi')]).bound_authorities.length===0);
check('authority:reject-execution-family-for-appeal',bind('Pengadilan Negeri. Memori banding dan tenggang banding dipersoalkan.',[mk('Hukum Acara Eksekusi','eksekusi aanmaning sita eksekusi hukum acara')]).bound_authorities.length===0);
check('authority:accept-appeal-family',bind('Pengadilan Negeri. Memori banding dan tenggang banding dipersoalkan.',[mk('Hukum Acara Banding','banding tenggang banding hukum acara pengadilan negeri')]).bound_authorities.length===1);
check('authority:forum-mismatch-pa-vs-umum',bind('Pengadilan Negeri. Memori banding dan tenggang banding dipersoalkan.',[mk('Pedoman Peradilan Agama','peradilan agama banding tenggang banding hukum acara')]).bound_authorities.length===0);

const procLater={...mk('Hukum Acara Banding','banding tenggang banding hukum acara pengadilan negeri',2022),tempus_status:'POTENTIALLY_INCOMPATIBLE' as const};
check('tempus:procedural-not-rejected-by-old-material-event',bind('Transaksi terjadi tahun 2018. Pada 2024 Pengadilan Negeri menerima memori banding dan tenggang banding dipersoalkan.',[procLater]).bound_authorities.length===1);
const substantiveLater={...mk('KUHPerdata Baru','wanprestasi perjanjian ganti rugi',2022),tempus_status:'POTENTIALLY_INCOMPATIBLE' as const};
check('tempus:substantive-still-rejected',bind('Transaksi terjadi tahun 2018. Memori banding diajukan pada 2024.',[substantiveLater]).bound_authorities.length===0);


const appealBound=bind('Pengadilan Negeri. Memori banding dan tenggang banding dipersoalkan.',[mk('Hukum Acara Banding','banding tenggang banding hukum acara pengadilan negeri')]);
const appealLaw=[{domain:'x',source:'x',status:'CANDIDATE_LOCAL_CORPUS',regulation:'Hukum Acara Banding',article:'PERLU VERIFIKASI',relevance:'Kandidat.',authority_identity:'Hukum Acara Banding'}] as any;
const sectionIII=__test__.enrichApplicableLawFromIssueBindings(
  __test__.filterApplicableLawToBoundAuthorities(appealLaw,new Set(['hukum acara banding']),new Set(['Hukum Acara Banding'])),
  [appealBound],
);
check('sectionIII:procedural-authority-propagates-from-binding',sectionIII.length===1 && /Terikat pada isu/.test(sectionIII[0].relevance) && /Pasal 1/.test(sectionIII[0].article),JSON.stringify(sectionIII[0]||{}));
check('sectionIII:fail-closed-without-binding',__test__.filterApplicableLawToBoundAuthorities(appealLaw,new Set(),new Set()).length===0);

const wfNoAuthority=buildLawyerWorkflow({title:'x',text:'MEMORI BANDING diajukan.',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[]},legalIssues:[{issue:'tenggang banding'}],legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]});
check('workflow:appeal-drafting-not-ready-without-procedural-authority',wfNoAuthority.stages.find(x=>x.id==='drafting')?.status==='PARTIAL');
const wfWithAuthority=buildLawyerWorkflow({title:'x',text:'MEMORI BANDING diajukan.',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[]},legalIssues:[{issue:'tenggang banding'}],legalGaps:[],adverseEvidence:[],applicableLaw:[{regulation:'Hukum Acara Banding',source:'resmi',article:'tenggang banding',relevance:'Terikat pada isu banding'}],verifiedTimeline:[],actorMatrix:[]});
check('workflow:appeal-drafting-ready-with-procedural-authority',wfWithAuthority.stages.find(x=>x.id==='drafting')?.status==='READY');

if(failed){ console.error(`FAILED ${failed}`); process.exit(1); }
console.log('ALL PROCEDURAL AUTHORITY PRECISION TESTS PASSED');
