declare const process: any;
import fs from 'node:fs';
import path from 'node:path';
import { buildEvidenceModel } from '../server/evidenceModel';
import { applyOcrSourceQualityGuard } from '../server/documentIngestion';
import { buildLawyerWorkflow } from '../server/lawyerWorkflow';
import { resolveCanonicalAnalysisText } from '../server/caseAnalysis';

let pass=0, fail=0;
function check(name:string, ok:boolean, detail=''){
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok?pass++:fail++;
}
const corpus=JSON.parse(fs.readFileSync(path.join(process.cwd(),'scripts','regression-corpus-v611.json'),'utf8'));
for(const fixture of corpus.fixtures){
  const guarded = Array.isArray(fixture.ocr_page_confidences)
    ? applyOcrSourceQualityGuard(fixture.text, fixture.ocr_page_confidences)
    : { text: fixture.text, excluded_spans: 0, repaired_spans: 0 };
  const em=buildEvidenceModel(guarded.text);
  const adverse=em.statements.filter((x:any)=>x.class==='ADVERSE_EVIDENCE');
  const wf=buildLawyerWorkflow({
    title:fixture.id,text:fixture.text,sourceRole:em.source_role,domainContext:{},evidence:em,
    legalIssues:[],legalGaps:[],adverseEvidence:adverse,applicableLaw:[],verifiedTimeline:em.timeline,actorMatrix:em.actors
  });
  const ex=fixture.expected;
  check(`${fixture.id}: source role locked`, em.source_role===ex.source_role, `actual=${em.source_role}`);
  for(const actor of ex.actors_include||[]){
    check(`${fixture.id}: actor ${actor}`, em.actors.some((a:any)=>String(a.actor).toLowerCase()===String(actor).toLowerCase()), `actors=${em.actors.map((a:any)=>a.actor).join(',')}`);
  }
  for(const actor of ex.actors_exclude||[]){
    check(`${fixture.id}: excludes noisy actor ${actor}`, !em.actors.some((a:any)=>String(a.actor).toLowerCase()===String(actor).toLowerCase()), `actors=${em.actors.map((a:any)=>a.actor).join(',')}`);
  }
  if(ex.span_noise_removed){
    check(`${fixture.id}: span noise removed`, !/PAI fY PERADI|UD SER ERA D3 AS/i.test(guarded.text), `excluded=${guarded.excluded_spans||0}`);
  }
  for(const phrase of ex.must_keep_text||[]){
    check(`${fixture.id}: keeps sanitized legal text ${phrase}`, guarded.text.includes(phrase), guarded.text.slice(0,220));
  }
  for(const phrase of ex.must_drop_text||[]){
    check(`${fixture.id}: drops OCR noise ${phrase}`, !guarded.text.includes(phrase), guarded.text.slice(0,220));
  }
  check(`${fixture.id}: orientation locked`, wf.orientation===ex.orientation, `actual=${wf.orientation}`);
  check(`${fixture.id}: procedural stage locked`, wf.procedural_stage===ex.procedural_stage, `actual=${wf.procedural_stage}`);
  if(ex.min_claims!=null){
    const n=em.statements.filter((x:any)=>x.class==='PARTY_CLAIM').length;
    check(`${fixture.id}: claim floor`, n>=ex.min_claims, `claims=${n}`);
  }
  if(ex.min_adverse!=null){
    check(`${fixture.id}: adverse floor`, adverse.length>=ex.min_adverse, `adverse=${adverse.length}`);
  }
}
for(const fixture of corpus.propagation_fixtures||[]){
  const canonical=resolveCanonicalAnalysisText({
    title:fixture.id,
    narrative:fixture.raw_input_text,
    input_type:'narrative+document',
    supplemental_narrative:fixture.supplemental_narrative,
    document_ingestion:{
      text:fixture.sanitized_document_text,
      mode:'LOCAL_OCR',
      coverage_ratio:0.87,
      manual_review_required:true,
      source_quality:{status:'REVIEW_REQUIRED',minimum_analysis_confidence:60,usable_pages:1,low_confidence_pages:[],excluded_pages:[],excluded_spans:2,repaired_spans:0},
    } as any,
  });
  for(const phrase of fixture.expected.must_include||[]){
    check(`${fixture.id}: canonical includes ${phrase}`, canonical.includes(phrase), canonical.slice(0,180));
  }
  for(const phrase of fixture.expected.must_exclude||[]){
    check(`${fixture.id}: canonical excludes raw phrase ${phrase}`, !canonical.includes(phrase), canonical.slice(0,180));
  }
}

const caseSource=fs.readFileSync(path.join(process.cwd(),'server','caseAnalysis.ts'),'utf8');
const serverSource=fs.readFileSync(path.join(process.cwd(),'server.ts'),'utf8');
check('V6.11.1 canonical text resolver uses sanitized ingestion text', /resolveCanonicalAnalysisText[\s\S]{0,700}document_ingestion\?\.text/.test(caseSource));
check('V6.11.1 semantic pipeline resolves canonical text before routing', /const text = resolveCanonicalAnalysisText\(input\)/.test(caseSource));
check('V6.11.1 upload route preserves typed narrative separately', /supplemental_narrative:\s*supplementalNarrative/.test(serverSource));
check('Group B readiness contract remains canonical MIN', /analysisReadinessScore\s*=\s*Math\.min\(pipelineGateReadinessScore,\s*workingPaperReadinessScore\)/.test(caseSource));
check('Group B pipeline readiness remains internal', /metric:'PIPELINE_GATE_READINESS'[\s\S]{0,180}internal:true/.test(caseSource));
check('Group A temporal rejections remain wired', /temporal_rejections/.test(caseSource));

console.log(`\n${pass}/${pass+fail} permanent-regression-corpus-v611 checks PASS`);
if(fail) process.exit(1);
