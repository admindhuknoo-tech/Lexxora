import fs from 'node:fs';
import {
  assessOcrPageCoverage,
  validateReasoningDocumentIntegrity,
  validateSemanticModelIntegrity,
  semanticSourceText,
  caseLifecycleState,
  isCaseAnalysisFinalized,
} from '../server/caseIntegrityPolicy.mjs';

const results=[];
const check=(name,pass,detail='')=>{results.push({name,pass:Boolean(pass),detail});console.log(`${pass?'PASS':'FAIL'} ${name}${detail?` :: ${detail}`:''}`)};
const pageRows=(n,present)=>Array.from({length:n},(_,i)=>({page:i+1,confidence:i<present?82:42,status:'OK',content_present:i<present,content_usable:i<present}));

// Reproduces the V31 failure class: 8 usable pages out of a 36-page file must
// never be treated as merely REVIEW_REQUIRED and sent into legal reasoning.
let q=assessOcrPageCoverage(pageRows(36,8),36,60);
check('ocr:8-of-36-is-insufficient',q.status==='INSUFFICIENT' && q.pageCoverage<0.23,JSON.stringify(q));
q=assessOcrPageCoverage(pageRows(36,35),36,60);
check('ocr:35-of-36-remains-reviewable',q.status==='REVIEW_REQUIRED' && q.pageCoverage>0.97,JSON.stringify(q));

const markers=(n,body='Materi hukum yang dapat dibaca dan diverifikasi dari dokumen primer.')=>Array.from({length:n},(_,i)=>`--- HALAMAN ${i+1} ---\n${body}`).join('\n\n');
const poor=validateReasoningDocumentIntegrity({inputType:'document',text:markers(8),ingestion:{mode:'LOCAL_OCR',pages_total:36,pages_ocr:8,coverage_ratio:8/36,source_quality:{status:'REVIEW_REQUIRED'}}});
check('integrity:partial-36-page-source-blocked',!poor.ok && poor.reasons.includes('page_coverage_below_minimum'),JSON.stringify(poor));
const full=validateReasoningDocumentIntegrity({inputType:'document',text:markers(36),ingestion:{mode:'PDF_LOCAL_TEXT',pages_total:36,pages_ocr:36,coverage_ratio:1}});
check('integrity:complete-36-page-source-accepted',full.ok,JSON.stringify(full));
const placeholder=Array.from({length:36},(_,i)=>`--- HALAMAN ${i+1} ---\n[HALAMAN DIKELUARKAN DARI ANALISIS OTOMATIS KARENA KUALITAS OCR RENDAH]`).join('\n\n');
const ph=validateReasoningDocumentIntegrity({inputType:'document',text:placeholder,ingestion:{mode:'LOCAL_OCR',pages_total:36,pages_ocr:36,coverage_ratio:1,source_quality:{status:'REVIEW_REQUIRED'}}});
check('integrity:system-placeholder-cannot-be-legal-source',!ph.ok && ph.reasons.includes('semantic_source_too_short'),JSON.stringify(ph));
check('integrity:system-placeholder-stripped-from-semantics',semanticSourceText(placeholder)==='','remaining='+semanticSourceText(placeholder));

const zero=validateSemanticModelIntegrity({inputType:'document',text:markers(12,'Isi dokumen panjang mengenai pihak, tindakan, tanggal, kewenangan, bukti, dan proses perkara. '.repeat(12)),evidence:{textual_facts:[],party_claims:[],supporting_evidence:[],actors:[],timeline:[],issue_seeds:[]}});
check('semantic:long-document-zero-model-blocked',!zero.ok && zero.reasons.length>0,JSON.stringify(zero));
const bapEvidence={textual_facts:[{statement:'Surat Perintah Penyidikan'}],party_claims:[{statement:'Keterangan tersangka'}],supporting_evidence:[{statement:'BAP'}],actors:[{actor:'Jaksa Penyidik'}],timeline:[{date:'2026-05-21'}],issue_seeds:[{id:'criminal-procedure'}]};
const nonzero=validateSemanticModelIntegrity({inputType:'document',text:markers(36,'Berita Acara Pemeriksaan Tersangka oleh Jaksa Penyidik dalam penyidikan tindak pidana korupsi.'),evidence:bapEvidence});
check('semantic:bap-material-model-accepted',nonzero.ok,JSON.stringify(nonzero));

const running={summary:'Case Analysis sedang diproses.',analysis_provenance:{job_status:'RUNNING',finalized:false},document_reading:{status:'PROCESSING'},document_ingestion:{mode:'PENDING'},legal_issues:[]};
const recoverable={...running,summary:'Case Analysis belum selesai.',analysis_provenance:{job_status:'FAILED_RECOVERABLE',finalized:false},document_reading:{status:'FAILED_RECOVERABLE'}};
const complete={analysis_provenance:{job_status:'COMPLETED',finalized:true},document_reading:{status:'READABLE'},document_ingestion:{mode:'PDF_LOCAL_TEXT'},legal_issues:[{issue:'uji'}]};
const legacy={analysis_provenance:{},document_reading:{status:'READABLE'},document_ingestion:{mode:'TEXT'},legal_issues:[{issue:'uji'}],legal_analysis:'analisis'};
check('lifecycle:running-not-final',caseLifecycleState(running)==='RUNNING'&&!isCaseAnalysisFinalized(running));
check('lifecycle:recoverable-not-final',caseLifecycleState(recoverable)==='FAILED_RECOVERABLE'&&!isCaseAnalysisFinalized(recoverable));
check('lifecycle:completed-final',caseLifecycleState(complete)==='COMPLETED'&&isCaseAnalysisFinalized(complete));
check('lifecycle:legacy-final-preserved',caseLifecycleState(legacy)==='COMPLETED_LEGACY'&&isCaseAnalysisFinalized(legacy));

const server=fs.readFileSync(new URL('../server.ts',import.meta.url),'utf8');
const ingestion=fs.readFileSync(new URL('../server/documentIngestion.ts',import.meta.url),'utf8');
const ontology=fs.readFileSync(new URL('../server/legalOntology.ts',import.meta.url),'utf8');
check('contract:export-has-finalization-gate',/requireFinalizedCaseAnalysis\(analysis, res, 'Ekspor PDF\/DOCX'\)/.test(server));
check('contract:draft-has-finalization-gate',/requireFinalizedCaseAnalysis\(c, res, 'Pembuatan legal draft'\)/.test(server));
check('contract:compliance-has-finalization-gate',/requireFinalizedCaseAnalysis\(c, res, 'Pembuatan compliance\/risk assessment'\)/.test(server));
check('contract:final-record-preserves-completed-state',/job_status:'COMPLETED'[\s\S]{0,100}finalized:true/.test(server));
check('contract:pdfjs-text-layer-precedes-ocr',ingestion.indexOf('extractPdfTextLayer(buffer)')<ingestion.indexOf('ocrPdfLocal(buffer, onProgress)'));
check('contract:text-layer-passes-span-quality-guard',ingestion.includes('pageText = applyOcrSpanQualityGuard(pageText).text;'));
check('contract:excluded-page-warning-not-fed-to-semantics',!ingestion.includes('return `--- HALAMAN ${page} ---\\n[HALAMAN DIKELUARKAN DARI ANALISIS OTOMATIS KARENA KUALITAS OCR RENDAH]`'));
check('contract:open-world-uses-semantic-source',ontology.includes('const semantic=semanticSourceText(text);'));

const pass=results.filter(x=>x.pass).length;
console.log(`SUMMARY ${pass}/${results.length} V7.0.2.32 reasoning-integrity PASS`);
if(pass!==results.length) process.exit(1);
