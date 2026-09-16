import fs from 'node:fs';
const ca=fs.readFileSync(new URL('../server/caseAnalysis.ts',import.meta.url),'utf8');
const ev=fs.readFileSync(new URL('../server/evidenceModel.ts',import.meta.url),'utf8');
const fr=fs.readFileSync(new URL('../server/forensicReasoner.ts',import.meta.url),'utf8');
const ol=fs.readFileSync(new URL('../server/officialLawRetriever.ts',import.meta.url),'utf8');
const ex=fs.readFileSync(new URL('../server/exporters.ts',import.meta.url),'utf8');
const lr=fs.readFileSync(new URL('../server/localReasoning.ts',import.meta.url),'utf8');
const checks=[
 ['lawyer-centric source roles', !/ADJUDICATIVE_DECISION/.test(ca+ev) && /LEGAL_REFERENCE_MATERIAL/.test(ev)],
 ['deterministic forensic reasoning wired', /reasonForensically/.test(ca) && /export function reasonForensically/.test(fr)],
 ['no external AI key dependency', !/GEMINI_API_KEY|GOOGLE_API_KEY|@google\/genai|Google Gemini/.test(ca+fr+lr)],
 ['facts and claims separated', /TEXTUAL_FACT/.test(ev) && /PARTY_CLAIM/.test(ev)],
 ['open-world source fallback', /MIXED_CASE_MATERIAL/.test(ev) && /open-world/i.test(fr)],
 ['strict online identity guard', /identityCompatible/.test(ol) && /authorityMatches/.test(ol)],
 ['exact family collision guard', /PERPPU/.test(ol) && /familyOk/.test(ol)],
 ['material nexus guard', /materialNexusScore/.test(ol) && /material_nexus_status/.test(ol)],
 ['report surfaces reasoning status', /Reasoning Core/.test(ex)],
 ['degraded exporter warning supports canonical status', /isDegradedReasoning/.test(ex) && /status === 'DEGRADED'/.test(ex) && /DEGRADED_FALLBACK/.test(ex)],
];
let pass=0; for(const [name,ok] of checks){ console.log(`${ok?'PASS':'FAIL'}  ${name}`); if(ok)pass++; }
console.log(`\n${pass}/${checks.length} checks PASS`); if(pass!==checks.length)process.exit(1);
