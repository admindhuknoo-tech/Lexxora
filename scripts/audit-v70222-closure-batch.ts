import { deriveOntologyIssues } from '../server/legalOntology';
import { buildLawyerWorkflow } from '../server/lawyerWorkflow';
import { __test__ } from '../server/caseAnalysis';

const results:{name:string;pass:boolean;detail:string}[]=[];
const check=(name:string,pass:boolean,detail:string)=>results.push({name,pass,detail});

const inheritanceLand=`--- HALAMAN 1 --- REPLIEK perkara perdata. Penggugat adalah ahli waris. Pemberi Kuasa memberi kuasa kepada Advokat. --- HALAMAN 2 --- Pembagian waris Ibu Kasiyah kepada Suliah, Kasdi, Riwayat dan Kajat. Kajat didalilkan menipu Kasdi dan Riwayat untuk membuat surat pernyataan agar tanah dapat dijaminkan ke Bank. --- HALAMAN 3 --- Sertipikat Nomor 05392 memuat data yang menurut Penggugat tidak benar. Penggugat menawarkan penyelesaian hak ahli waris tanpa membatalkan sertipikat. Tanah dan rumah menjadi objek sengketa.`;
const ids=deriveOntologyIssues(inheritanceLand).map(x=>x.id);
check('issues:no-boilerplate-remedy-procedure',!ids.includes('remedy-procedure'),ids.join(','));
check('issues:no-duplicate-civil-criminal-boundary',!(ids.includes('civil-criminal-response')&&ids.includes('civil-criminal-boundary')),ids.join(','));
check('issues:no-poa-from-boilerplate',!ids.includes('power-of-attorney'),ids.join(','));

const pmh=`--- HALAMAN 1 --- Penggugat mendalilkan Tergugat melakukan perbuatan melawan hukum yang menimbulkan kerugian karena penguasaan tanah tanpa hak. Tidak ada perjanjian atau wanprestasi yang dipersoalkan.`;
const pmhIssues=deriveOntologyIssues(pmh);
const tort=pmhIssues.find(x=>x.id==='tort-alternative');
check('issues:pmh-wording-no-forced-wanprestasi',!!tort && !/duplikasi dari wanprestasi/i.test(tort.issue) && /jika memang ada/i.test(tort.issue),tort?.issue||'missing');

const wfCollateral=buildLawyerWorkflow({title:'x',text:'Kajat meminta Kasdi menandatangani surat agar tanah dapat dijaminkan ke Bank. Penggugat menyatakan data Sertipikat 05392 tidak benar.',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[{}]},legalIssues:[],legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]});
const fq=wfCollateral.financial_collateral_audit.review_questions.join(' | ');
check('financial:collateral-activation-real',wfCollateral.financial_collateral_audit.active===true,JSON.stringify(wfCollateral.financial_collateral_audit));
check('financial:no-template-ledger-appraisal-repayment-personalgain',!/ledger|appraisal|repayment|keuntungan pribadi|personal gain/i.test(fq),fq);
check('financial:collateral-question-is-contextual',/dapat dijaminkan|kewenangan.*pengikatan/i.test(fq),fq);
check('financial:nonfinancial-certificate-discrepancy-not-promoted',wfCollateral.financial_collateral_audit.discrepancy_terms.length===0,JSON.stringify(wfCollateral.financial_collateral_audit.discrepancy_terms));

const wfCredit=buildLawyerWorkflow({title:'x',text:'Debitur menerima kredit bank Rp100.000.000 dengan agunan BPKB. Angsuran jatuh tempo belum lunas. Mutasi rekening menunjukkan transfer pembayaran. Nilai taksasi agunan tercantum dalam appraisal.',sourceRole:'CASE_NARRATIVE_OR_QUESTION',domainContext:{},evidence:{textual_facts:[],party_claims:[{}]},legalIssues:[],legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]});
const fq2=wfCredit.financial_collateral_audit.review_questions.join(' | ');
check('financial:true-credit-keeps-specific-questions',/hubungan kredit|jatuh tempo|pembayaran|taksasi/i.test(fq2),fq2);
check('financial:account-record-question-only-with-source-signal',/rekening\/ledger/i.test(fq2),fq2);
const wfCreditNoRecords=buildLawyerWorkflow({title:'x',text:'Debitur menerima kredit Rp100.000.000 dengan agunan BPKB dan angsuran jatuh tempo belum lunas.',sourceRole:'CASE_NARRATIVE_OR_QUESTION',domainContext:{},evidence:{textual_facts:[],party_claims:[{}]},legalIssues:[],legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]});
check('financial:no-ledger-question-without-ledger-or-account-record',!/ledger|rekening koran|mutasi rekening/i.test(wfCreditNoRecords.financial_collateral_audit.review_questions.join(' | ')),wfCreditNoRecords.financial_collateral_audit.review_questions.join(' | '));

const actors=[
 {actor:'Pemberi Kuasa',roles:['Pemberi Kuasa'],pages:[1],entity_type:'ROLE'},
 {actor:'Advokat',roles:['Advokat'],pages:[1],entity_type:'ROLE'},
 {actor:'Notaris Rina',roles:['Notaris'],pages:[2],entity_type:'PERSON'},
];
const wfRoles=buildLawyerWorkflow({title:'x',text:'Berdasarkan surat kuasa khusus, Advokat bertindak untuk Penggugat. Akta dibuat oleh Notaris Rina.',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[{}]},legalIssues:[{issue:'uji'}],legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:actors});
const duties=wfRoles.authority_duty_matrix.map(x=>x.actor);
check('roles:counsel-not-authority-audit-without-dispute',!duties.includes('Pemberi Kuasa')&&!duties.includes('Advokat')&&duties.includes('Notaris Rina'),duties.join(','));
const wfNoWitness=buildLawyerWorkflow({title:'x',text:'Berdasarkan surat kuasa khusus, Advokat bertindak untuk Penggugat.',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[{}]},legalIssues:[{issue:'uji'}],legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:actors.filter(a=>a.actor!=='Notaris Rina')});
check('witness:no-drafting-plan-when-no-witness-or-expert',!wfNoWitness.drafting_plan.some(x=>/saksi|ahli/i.test(x.document)),wfNoWitness.drafting_plan.map(x=>x.document).join(' | '));

const wfDisputedPoa=buildLawyerWorkflow({title:'x',text:'Tergugat menyatakan surat kuasa Penggugat tidak sah dan Advokat melampaui batas kuasa.',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[{}]},legalIssues:[{issue:'keabsahan kuasa'}],legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:actors});
const duties2=wfDisputedPoa.authority_duty_matrix.map(x=>x.actor);
check('roles:disputed-poa-restores-representation-audit',duties2.includes('Pemberi Kuasa')&&duties2.includes('Advokat'),duties2.join(','));

const domain=__test__.buildDomainRankingContext('PERDATA_KONTRAKTUAL',[]);
const regime={forum:'UMUM',regime:'CIVIL',signals:{forum_explicit:[],criminal_procedural:[],civil_procedural:['gugatan'],administrative_procedural:[],islamic_substantive:[],civil_substantive:['perbuatan melawan hukum'],customary_substantive:[],personal_identity:[]}} as any;
const mr=__test__.matchRegulations('perbuatan melawan hukum kausalitas kerugian','PERDATA_KONTRAKTUAL',['perbuatan melawan hukum','kausalitas'],domain,regime);
const bw=mr.rows.find((r:any)=>String(r.regulation?.nomor||'').includes('1847'));
const bwArts=(bw?.matched_articles||[]).map((a:any)=>String(a?.pasal||''));
check('authority:pmh-article-1365-focused',bwArts.includes('Pasal 1365')&&!bwArts.some((x:string)=>/1243|1266|1267|1244|1245/.test(x)),bwArts.join(','));

const localCandidate={
 title:'UU No. 1 Tahun 1974 tentang Perkawinan',source_kind:'LOCAL',source_label:'UU No. 1 Tahun 1974 jo UU No. 16 Tahun 2019',article_summary:'Pasal 35-37',domain_tags:['perkawinan','harta bersama'],article_text_pool:'Pasal 35-37 harta bersama perkawinan',raw_articles:[{pasal:'Pasal 35-37',topic:'Harta dalam Perkawinan',content:'Harta benda yang diperoleh selama perkawinan menjadi harta bersama.',keywords:['harta bersama','harta bawaan']}],material_confidence:'HIGH',citation_hit:false,regime_note:null,domain_alignment:'PRIMARY',authority_identity:'local:marriage',tempus_status:'POTENTIALLY_COMPATIBLE'
} as any;
const proceduralIssue=[{issue:'Remedy dan langkah prosedural apa yang diperlukan?',issue_id:'remedy-procedure',analysis:'uji'}];
const bound=__test__.bindIssuesToAuthorities(proceduralIssue,[{question:'Remedy dan langkah prosedural apa yang diperlukan?',id:'remedy-procedure',query_terms:['hukum acara','tenggang upaya hukum','kompetensi pengadilan'],domain:'KELUARGA_WARIS'}],[localCandidate],__test__.buildDomainRankingContext('KELUARGA_WARIS',[]),'gugatan waris',regime);
check('authority:procedural-issue-rejects-marriage-substantive-law',(bound[0]?.bound_authorities||[]).length===0,String(bound[0]?.rule||''));

const enriched=__test__.enrichApplicableLawFromIssueBindings([
 {domain:'x',source:'x',status:'CANDIDATE_LOCAL_CORPUS',regulation:'UU X',article:'PERLU VERIFIKASI',relevance:'Kandidat dari korpus internal. Identitas instrumen tetap wajib diverifikasi.',authority_identity:'local:x'}
] as any,[{issue:'Isu harta bersama',bound_authorities:[{authority_identity:'local:x',article_summary:'Pasal 35-37',matched_terms:['harta bersama'],source_label:'UU X',source_kind:'LOCAL'}]}] as any);
check('sectionIII:issue-linked-relevance',/Terikat pada isu/.test(enriched[0].relevance)&&/harta bersama/.test(enriched[0].relevance)&&enriched[0].article==='Pasal 35-37',JSON.stringify(enriched[0]));

const wfCivil=buildLawyerWorkflow({title:'x',text:'REPLIEK sengketa waris dan sertipikat tanah. Penggugat membantah dalil Tergugat.',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[{}]},legalIssues:[{issue:'Siapa ahli waris?'}],legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]});
check('workflow:case-theory-no-forced-contract-pmh',!wfCivil.case_theory_candidates.some(x=>/hubungan kontraktual\/PMH|wanprestasi, kerugian/i.test(x)),wfCivil.case_theory_candidates.join(' | '));
check('workflow:pleading-no-civil-pledoi',!wfCivil.case_theory_candidates.some(x=>/pledoi/i.test(x)),wfCivil.case_theory_candidates.join(' | '));

for(const r of results) console.log(`${r.pass?'PASS':'FAIL'} ${r.name} :: ${r.detail}`);
const passed=results.filter(x=>x.pass).length;
console.log(`SUMMARY ${passed}/${results.length} PASS`);
if(passed!==results.length) process.exit(1);
