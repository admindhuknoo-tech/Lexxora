import assert from 'node:assert/strict';
import { assessOcrPageCoverage } from '../server/caseIntegrityPolicy.mjs';

const page = (page, confidence, content_present=true, content_usable=true, status='OK') => ({ page, confidence, content_present, content_usable, status });

// Low confidence but semantically usable legal text must be retained and flagged for review.
let q = assessOcrPageCoverage(Array.from({length:36},(_,i)=>page(i+1,52,true,true)),36,60);
assert.equal(q.status,'REVIEW_REQUIRED');
assert.equal(q.usablePages,36);
assert.equal(q.pageCoverage,1);
assert.equal(q.excludedPages.length,0);
assert.equal(q.lowConfidencePages.length,36);

// Weak-but-present OCR is still coverage; it is a review issue, not an automatic exclusion.
q = assessOcrPageCoverage(Array.from({length:36},(_,i)=>page(i+1,42,true,i<8)),36,60);
assert.equal(q.status,'REVIEW_REQUIRED');
assert.equal(q.usablePages,36);
assert.equal(q.excludedPages.length,0);
assert.equal(q.weakContentPages.length,28);

// Truly absent/garbage content still reduces coverage and can block reasoning.
q = assessOcrPageCoverage(Array.from({length:36},(_,i)=>page(i+1,i<8?82:42,i<8,i<8)),36,60);
assert.equal(q.status,'INSUFFICIENT');
assert.equal(q.usablePages,8);
assert.equal(q.excludedPages.length,28);

// Hard failures remain excluded regardless of content signal.
q = assessOcrPageCoverage([
  page(1,88,true,true,'OK'),
  page(2,0,true,true,'FAILED'),
  page(3,54,true,true,'OK'),
],3,60);
assert.deepEqual(q.excludedPages,[2]);
assert.equal(q.usablePages,2);
assert.equal(q.status,'REVIEW_REQUIRED');

// Existing V32 safety invariant: only 8 materially present of 36 remains blocked.
q = assessOcrPageCoverage(Array.from({length:36},(_,i)=>page(i+1,i<8?85:20,i<8,i<8)),36,60);
assert.equal(q.status,'INSUFFICIENT');
assert.equal(q.pageCoverage,8/36);

console.log('PASS audit-v70232-2-ocr-quality-policy 16/16');
