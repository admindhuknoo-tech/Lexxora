import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const checks=[];
const add=(name,ok,detail='')=>checks.push({name,ok,detail});

const index=[read('index.html'), read('public/lexicore.v6122.css'), read('public/lexicore.v6122.js')].join('\n');
const server=read('server.ts');
const caseAnalysis=read('server/caseAnalysis.ts');
const exporters=read('server/exporters.ts');
const db=read('server/db.ts');
const ingest=read('server/documentIngestion.ts');
const localReasoning=read('server/localReasoning.ts');
const forensicReasoner=read('server/forensicReasoner.ts');
const templates=JSON.parse(read('src/data/templates.json'));
const draftingSources=JSON.parse(read('src/data/official-drafting-sources.json'));
const templateRows=Object.values(templates);

for (const panel of ['client','draft','review','case','corpus','risk','research','norm']) {
  add(`panel:${panel}`, index.includes(`id="${panel}"`) && index.includes(`data-panel="${panel}"`));
}
add('300+ drafting templates', Object.keys(templates).length >= 300, `count=${Object.keys(templates).length}`);
add('drafting 9 ecosystems classified', ['PIDANA','PERDATA','PENGADILAN AGAMA','PTUN','PENGADILAN PAJAK','PHI','PRAPERADILAN','EKSEKUSI','ADMINISTRASI KANTOR HUKUM'].every(d=>templateRows.some(x=>x.domain===d)));
add('official drafting source registry', Object.keys(draftingSources.sources||{}).length >= 15, `sources=${Object.keys(draftingSources.sources||{}).length}`);
add('official source provenance injected', templateRows.filter(x=>Array.isArray(x.official_source_details)&&x.official_source_details.length).length >= 250);
add('draft template search/filter UI', /draftTemplateSearch/.test(index) && /draftCategoryFilter/.test(index));
add('draft generator is local/template-aware', /generateLegalDraft/.test(localReasoning) && /template/.test(localReasoning));
add('no raw binary UTF-8 upload decode in server routes', !/req\.file\.buffer\.toString\(['"]utf8['"]\)/.test(server));
add('document ingestion module wired', server.includes('extractUploadedDocument') && ingest.includes('extractUploadedDocument'));
add('case four-script summary', /summary/.test(caseAnalysis));
add('case four-script facts', /facts/.test(caseAnalysis));
add('case four-script legal issues', /legal_issues/.test(caseAnalysis));
add('case four-script applicable law', /applicable_law/.test(caseAnalysis));
add('case four-script arguments', /arguments_for/.test(caseAnalysis) && /arguments_against/.test(caseAnalysis));
add('case risk matrix', /risk_matrix/.test(caseAnalysis));
add('case risk score', /overall_risk_score/.test(caseAnalysis));
add('case scenarios', /best_case/.test(caseAnalysis) && /worst_case/.test(caseAnalysis));
add('case recommendations', /recommendations/.test(caseAnalysis));
add('professional verification', /verification_note/.test(caseAnalysis));
add('no hardcoded case readiness 82', !/overall_score\s*:\s*82|percentage\s*:\s*82/.test(caseAnalysis));
add('no false full official access claim', !/FULL_OFFICIAL_SOURCE_ACCESS/.test(caseAnalysis+server));
add('no raw living-analysis engine in active case path', !/livingSteps|livingLawSynthesis|living_analysis/.test(caseAnalysis));
add('case export by id route', /case-analysis\/export\/:fmt\/:case_id/.test(server));
add('PDF exporter present', /createPdfBuffer/.test(exporters));
add('DOCX exporter present', /createDocxBuffer/.test(exporters));
add('generic DOCX exporter present', /createWorkingDocumentDocxBuffer/.test(exporters) && /export\/document\/docx/.test(server));
add('draft DOCX endpoint present', /drafts\/:id\/export\/docx/.test(server));
add('compliance data contract', /data:\s*\{\s*category,\s*questions:\s*categoryRules\s*\}/.test(server));
add('research uses source_text contract', /source_text/.test(server));
add('research refuses empty source fallback', /tidak akan membuat ringkasan doktrin\/yurisprudensi tanpa materi sumber/.test(server));
add('norm matrix contract', /rule_comparison_matrix/.test(server));
add('norm metric not hard-coded 12', !/norm_conflict_analyses\s*:\s*12/.test(db));
add('no fabricated case seed', !/seedInitialCase|LEXICORE_SEED_DEMO/.test(db));
add('official host health performs fetch', /api\/legal-sources\/health/.test(server) && /await fetch\(src\.url/.test(server));
// Pre-existing stale check: this project moved scan/image OCR from Gemini Vision to fully
// local Tesseract.js (see README_LOCAL_OCR.md) so the UI no longer says "AI OCR" — it correctly
// discloses local-only OCR instead. Assertion updated to match the honest text actually shipped,
// not the older Gemini-Vision-era wording.
add('contract review ingestion honest UI', /PDF text-layer dibaca lokal/.test(index) && /OCR lokal Tesseract/.test(index) && /tanpa API key/.test(index));
add('type-aware local drafting', /SOMASI|KUASA|GUGATAN/i.test(localReasoning));
add('deterministic forensic reasoner wired', /reasonForensically/.test(caseAnalysis) && /no external generative-AI|No external generative-AI/i.test(forensicReasoner));
add('no Gemini/API-key runtime dependency', !/GEMINI_API_KEY|GOOGLE_API_KEY|@google\/genai|Google Gemini/.test(server+caseAnalysis+localReasoning+forensicReasoner));


add('robust frontend JSON error parser reads body once', /const raw=await r\.text\(\)/.test(index) && !/await r\.json\(\)[\s\S]{0,200}await r\.text\(\)/.test(index));
add('manual draft POST route exists', /app\.post\('\/api\/drafts'/.test(server));
add('draft canonical template key persists', /template_key/.test(server) && /template_key:docType\.value/.test(index));
add('history GET by kind/id exists', /app\.get\('\/api\/history\/:kind\/:id'/.test(server));
add('client communication update route exists', /app\.put\('\/api\/communications\/:id'/.test(server));
add('client history keeps canonical record id', /currentClientDocumentId/.test(index) && /currentClientDocumentId=x\.id/.test(index));
add('client edited draft becomes dirty', /Ada perubahan yang belum disimpan/.test(index));
add('compliance final assessment blocks unanswered controls', /Assessment belum lengkap/.test(server) && /missingSystem/.test(server));
add('compliance completion metadata', /completion_percentage/.test(server));
add('API error boundary returns JSON for oversize payload', /entity\.too\.large/.test(server) && /LIMIT_FILE_SIZE/.test(server));
add('server port supports environment override', /process\.env\.PORT/.test(server));

const failed=checks.filter(x=>!x.ok);
for(const c of checks) console.log(`${c.ok?'PASS':'FAIL'}  ${c.name}${c.detail?'  '+c.detail:''}`);
console.log(`\n${checks.length-failed.length}/${checks.length} checks PASS`);
if(failed.length) process.exit(1);
