import { buildEvidenceModel } from '../server/evidenceModel';
import { reasonForensically } from '../server/forensicReasoner';
import { evaluateCasePipelineGate } from '../server/caseAnalysis';
import { inferLegalContext } from '../server/legalOntology';

let pass=0, fail=0;
const ck=(name:string,cond:boolean,detail='')=>{ if(cond){pass++; console.log('PASS |',name,detail)} else {fail++; console.error('FAIL |',name,detail)} };

const text=`TANGGAPAN PENUNTUT UMUM TERHADAP NOTA PERLAWANAN TERDAKWA. Putusan Mahkamah Agung dan yurisprudensi digunakan sebagai bahan referensi. Surat Edaran Jaksa Agung juga dirujuk sebagai bahan hukum. Penuntut Umum menjelaskan Pasal 206 KUHAP dan pertimbangan hukum.`;
const evidence=buildEvidenceModel(text);
ck('role classified as LEGAL_REFERENCE_MATERIAL', evidence.source_role==='LEGAL_REFERENCE_MATERIAL', `role=${evidence.source_role}`);
ck('evidence model produces supporting evidence', evidence.supporting_evidence.length>0, `supporting=${evidence.supporting_evidence.length}`);

const domainContext:any=inferLegalContext(text);
const reasoning=reasonForensically({title:'audit',primaryDomain:'Hukum Pidana & Acara Pidana',domainContext,evidence,lawCandidates:[]});
ck('reasoner forwards supporting_evidence bucket', Array.isArray(reasoning.statement_buckets.supporting_evidence) && reasoning.statement_buckets.supporting_evidence.length===evidence.supporting_evidence.length, `reasoning=${reasoning.statement_buckets.supporting_evidence?.length||0}`);

const gate=evaluateCasePipelineGate({
  sourceRole:evidence.source_role,
  reasoningStatus:'READY', regulatoryMode:'offline', statementBuckets:reasoning.statement_buckets,
  actorMatrix:[{},{}], verifiedTimeline:[{}], legalIssues:[{issue:'A'.repeat(90),analysis:'B'.repeat(90)},{issue:'C'.repeat(90),analysis:'D'.repeat(90)}],
  multiPathDiagnosis:[{}], blankSpotQuestions:['1','2','3','4','5'], adverseEvidence:[], officialLawCandidates:[], applicableLaw:[], riskBreakdown:[{},{}],
});
const factCheck=gate.checks.find(x=>x.key==='facts_distinct_from_claims');
ck('reference-material gate passes through real reasoner contract', factCheck?.passed===true, factCheck?.detail||'');
ck('gate detail exposes nonzero supporting count', /supporting=[1-9]\d*/.test(factCheck?.detail||''), factCheck?.detail||'');

console.log(`\n${pass}/${pass+fail} PASS`);
if(fail) process.exit(1);
