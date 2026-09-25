import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateReasoningDocumentIntegrity } from '../server/caseIntegrityPolicy.mjs';

const page = (n) => `--- HALAMAN ${n} ---\nPASAL ${n}. Para pihak menyepakati kewajiban pembayaran, bukti, wanprestasi, forum, dan penyelesaian sengketa secara tertulis.`;
const text = [1,2,3].map(page).join('\n\n');
const integrity = validateReasoningDocumentIntegrity({
  inputType:'document', text,
  ingestion:{ mode:'PDF_LOCAL_TEXT', pages_total:3, pages_ocr:3, coverage_ratio:1, source_quality:{ status:'GOOD' } },
});
assert.equal(integrity.ok, true, JSON.stringify(integrity));
const server = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const routeStart = server.indexOf("app.post('/api/review'");
const routeEnd = server.indexOf("app.post('/api/", routeStart + 20);
const route = server.slice(routeStart, routeEnd > routeStart ? routeEnd : routeStart + 5000);
assert.match(route, /validateReasoningDocumentIntegrity/);
assert.match(route, /if\s*\(\s*!integrity\.ok\s*\)/);
assert.doesNotMatch(route, /integrity\.passed/);
console.log('PASS | /api/review uses canonical integrity.ok contract');
console.log('SUMMARY 1/1 review integrity-contract checks PASS');
