import fs from 'node:fs';
const reasoner=fs.readFileSync('server/forensicReasoner.ts','utf8');
const exporter=fs.readFileSync('server/exporters.ts','utf8');
const checks=[
  ['supporting bucket uses reference tag', /supporting_evidence:supporting[\s\S]{0,220}tagSupport\(/.test(reasoner)],
  ['issue evidence tags preserve supporting provenance', /sMatches\.map\(s=>tagSupport\(/.test(reasoner)],
  ['adverse evidence has distinct tag', /adverse_evidence[\s\S]{0,500}tagAdverse\(/.test(reasoner)],
  ['actor matrix resolves provenance from evidence statements', /const provenance=evidence\.statements\.find/.test(reasoner) && /tagForEvidenceStatement\(provenance\)/.test(reasoner)],
  ['legal-reference actor fallback is reference not fact', /source_role==='LEGAL_REFERENCE_MATERIAL'[\s\S]{0,80}tagSupport/.test(reasoner)],
  ['claim-first actor fallback remains claim', /LEGAL_CORRESPONDENCE[\s\S]{0,160}tagClaim/.test(reasoner)],
  ['exporter humanizes reference/adverse/anomaly tags', /REFERENSI\|BUKTI LAWAN\|ANOMALI/.test(exporter)],
  ['supporting tag is not FACT tag', !/supporting_evidence:supporting[\s\S]{0,220}tagFact\(/.test(reasoner)],
  ['chronology heading does not claim all events are verified', /Kronologi Terpetakan \(Fakta\/Klaim\)/.test(exporter) && !/Kronologi Terverifikasi/.test(exporter)],
];
let pass=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} | ${name}`); if(ok) pass++;}
console.log(`\n${pass}/${checks.length} PASS`);
if(pass!==checks.length) process.exit(1);
