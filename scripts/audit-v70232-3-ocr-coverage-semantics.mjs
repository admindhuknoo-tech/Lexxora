import assert from 'node:assert/strict';
import { assessOcrExtractedPage, assessOcrPageCoverage, validateReasoningDocumentIntegrity } from '../server/caseIntegrityPolicy.mjs';

const bap = `BERITA ACARA PEMERIKSAAN TERSANGKA\nBahwa tersangka diperiksa oleh Jaksa Penyidik dalam perkara dugaan tindak pidana korupsi. Tersangka menerangkan proses pemberian kredit, debitur, agunan, komite kredit, dan kewenangan Direktur Utama.`;
const weakButReadable = `Pemeriksaan tersangka kredit debitur bank. Keterangan penyidik dan surat kredit masih terbaca meskipun hasil scan buram.`;
const garbage = `@@@ 12 / -- ?? xx`;

let p = assessOcrExtractedPage(bap);
assert.equal(p.content_present,true);
assert.equal(p.content_usable,true);
p = assessOcrExtractedPage(weakButReadable);
assert.equal(p.content_present,true);
p = assessOcrExtractedPage(garbage);
assert.equal(p.content_present,false);

// 36/36 OCR-success pages with low confidence are coverage=100%, not 52%.
let rows = Array.from({length:36},(_,i)=>({page:i+1,confidence:42,status:'OK',content_present:true,content_usable:i%4!==0}));
let q = assessOcrPageCoverage(rows,36,60);
assert.equal(q.status,'REVIEW_REQUIRED');
assert.equal(q.usablePages,36);
assert.equal(q.pageCoverage,1);
assert.equal(q.excludedPages.length,0);
assert.equal(q.weakContentPages.length,9);

// Only hard failures / effectively blank pages reduce coverage.
rows = Array.from({length:36},(_,i)=>({page:i+1,confidence:45,status:'OK',content_present:i<30,content_usable:i<24}));
q = assessOcrPageCoverage(rows,36,60);
assert.equal(q.usablePages,30);
assert.equal(q.pageCoverage,30/36);
assert.equal(q.status,'REVIEW_REQUIRED');

// Real safety invariant remains: 8/36 materially present pages is blocked.
rows = Array.from({length:36},(_,i)=>({page:i+1,confidence:i<8?75:25,status:'OK',content_present:i<8,content_usable:i<8}));
q = assessOcrPageCoverage(rows,36,60);
assert.equal(q.status,'INSUFFICIENT');
assert.equal(q.usablePages,8);

// Reasoning integrity accepts complete page structure at review-required quality.
const text = Array.from({length:36},(_,i)=>`--- HALAMAN ${i+1} ---\n${bap}`).join('\n\n');
const integrity = validateReasoningDocumentIntegrity({
  inputType:'document', text,
  ingestion:{mode:'LOCAL_OCR',pages_total:36,pages_ocr:36,coverage_ratio:1,manual_review_required:true,source_quality:{status:'REVIEW_REQUIRED'}}
});
assert.equal(integrity.ok,true);

// But incomplete source is still fail-closed.
const shortText = Array.from({length:8},(_,i)=>`--- HALAMAN ${i+1} ---\n${bap}`).join('\n\n');
const blocked = validateReasoningDocumentIntegrity({
  inputType:'document', text:shortText,
  ingestion:{mode:'LOCAL_OCR',pages_total:36,pages_ocr:8,coverage_ratio:8/36,manual_review_required:true,source_quality:{status:'INSUFFICIENT'}}
});
assert.equal(blocked.ok,false);
assert.ok(blocked.reasons.includes('page_coverage_below_minimum'));

console.log('PASS audit-v70232-3-ocr-coverage-semantics 16/16');
