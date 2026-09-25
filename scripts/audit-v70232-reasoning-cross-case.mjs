import { validateReasoningDocumentIntegrity, validateSemanticModelIntegrity, isCaseAnalysisFinalized } from '../server/caseIntegrityPolicy.mjs';
const results=[]; const check=(n,p,d='')=>{results.push(Boolean(p));console.log(`${p?'PASS':'FAIL'} ${n}${d?` :: ${d}`:''}`)};
const text=(pages,body)=>Array.from({length:pages},(_,i)=>`--- HALAMAN ${i+1} ---\n${body}`).join('\n\n');
const scenarios=[
 ['criminal-investigation-36',36,36,'Berita Acara Pemeriksaan Tersangka. Jaksa Penyidik melakukan penyidikan tindak pidana korupsi.',{textual_facts:[1,2],party_claims:[1],supporting_evidence:[1],actors:[1,2],timeline:[1],issue_seeds:[1]}],
 ['civil-pleading-12',12,12,'REPLIEK Penggugat terhadap jawaban Tergugat mengenai sengketa tanah dan bukti sertifikat.',{textual_facts:[1],party_claims:[1,2],supporting_evidence:[1],actors:[1,2],timeline:[],issue_seeds:[1]}],
 ['appeal-18',18,17,'MEMORI BANDING menguraikan keberatan terhadap pertimbangan putusan dan bukti persidangan.',{textual_facts:[1],party_claims:[1],supporting_evidence:[1],actors:[1],timeline:[1],issue_seeds:[1]}],
 ['execution-8',8,5,'Permohonan eksekusi dan aanmaning atas putusan yang telah berkekuatan hukum tetap.',{textual_facts:[1],party_claims:[1],supporting_evidence:[1],actors:[1],timeline:[1],issue_seeds:[1]}],
 ['legal-reference-20',20,20,'Naskah peraturan dan penjelasan pasal sebagai bahan referensi hukum.',{textual_facts:[],party_claims:[],supporting_evidence:[1,2,3],actors:[],timeline:[],issue_seeds:[1]}],
];
for(const [name,pages,read,body,evidence] of scenarios){
  const src=text(pages,body);
  const doc=validateReasoningDocumentIntegrity({inputType:'document',text:src,ingestion:{mode:'PDF_LOCAL_TEXT',pages_total:pages,pages_ocr:read,coverage_ratio:read/pages,source_quality:{status:read/pages<1?'REVIEW_REQUIRED':'GOOD'}}});
  const sem=validateSemanticModelIntegrity({inputType:'document',text:src,evidence});
  check(`${name}:input-integrity`,doc.ok,JSON.stringify(doc));
  check(`${name}:semantic-integrity`,sem.ok,JSON.stringify(sem));
}
const tooPartial=validateReasoningDocumentIntegrity({inputType:'document',text:text(4,'sebagian materi'),ingestion:{mode:'LOCAL_OCR',pages_total:10,pages_ocr:4,coverage_ratio:.4,source_quality:{status:'REVIEW_REQUIRED'}}});
check('cross:40-percent-coverage-is-blocked',!tooPartial.ok,JSON.stringify(tooPartial));
const narrative=validateReasoningDocumentIntegrity({inputType:'narrative',text:'Klien menjelaskan hubungan hukum, tindakan pihak, kerugian, bukti awal, serta tujuan konsultasi secara cukup rinci untuk ditelaah.',ingestion:null});
check('cross:narrative-path-unchanged',narrative.ok,JSON.stringify(narrative));
const finalRecord={analysis_provenance:{job_status:'COMPLETED',finalized:true},legal_issues:[{issue:'x'}]};
const provisionalRecord={analysis_provenance:{job_status:'RUNNING',finalized:false},legal_issues:[]};
check('cross:final-record-action-eligible',isCaseAnalysisFinalized(finalRecord));
check('cross:provisional-record-action-ineligible',!isCaseAnalysisFinalized(provisionalRecord));
const pass=results.filter(Boolean).length; console.log(`SUMMARY ${pass}/${results.length} V7.0.2.32 cross-case PASS`); if(pass!==results.length)process.exit(1);
