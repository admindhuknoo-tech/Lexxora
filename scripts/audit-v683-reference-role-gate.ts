import { evaluateCasePipelineGate } from '../server/caseAnalysis';

function ck(name:string, ok:boolean){ if(!ok) throw new Error(`FAIL: ${name}`); console.log(`PASS | ${name}`); }

const base:any={
  sourceRole:'LEGAL_REFERENCE_MATERIAL', reasoningStatus:'READY', regulatoryMode:'offline',
  statementBuckets:{textual_facts:[],party_claims:[],supporting_evidence:[{statement:'Putusan/yurisprudensi sebagai bahan referensi'}]},
  actorMatrix:[{actor:'Penuntut Umum'},{actor:'Terdakwa'}], verifiedTimeline:[{date:'2026-09-07'}],
  legalIssues:[{issue:'Unsur delik apa yang didalilkan dan bukti apa yang mendukung setiap unsur secara spesifik?',analysis:'Analisis material spesifik yang cukup panjang untuk melewati pemeriksaan issue specificity.'},{issue:'Apakah surat dakwaan memenuhi syarat formil dan materiil serta apa konsekuensinya?',analysis:'Analisis material spesifik kedua yang cukup panjang untuk melewati pemeriksaan issue specificity.'}],
  multiPathDiagnosis:[{domain:'Pidana'}], blankSpotQuestions:['1','2','3','4','5'], adverseEvidence:[], officialLawCandidates:[], applicableLaw:[], riskBreakdown:[1,2]
};
const gate=evaluateCasePipelineGate(base);
const factCheck=gate.checks.find(x=>x.key==='facts_distinct_from_claims');
ck('LEGAL_REFERENCE_MATERIAL accepts supporting-only evidence semantics', factCheck?.passed===true);
ck('gate detail exposes supporting count and role', /supporting=1/.test(factCheck?.detail||'') && /LEGAL_REFERENCE_MATERIAL/.test(factCheck?.detail||''));
const empty=evaluateCasePipelineGate({...base,statementBuckets:{textual_facts:[],party_claims:[],supporting_evidence:[]}});
ck('empty reference material still fails evidence distinctness', empty.checks.find(x=>x.key==='facts_distinct_from_claims')?.passed===false);
