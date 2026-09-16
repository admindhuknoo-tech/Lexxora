import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const evidence=fs.readFileSync('server/evidenceModel.ts','utf8');
const reasoner=fs.readFileSync('server/forensicReasoner.ts','utf8');
const caseAnalysis=fs.readFileSync('server/caseAnalysis.ts','utf8');
const retriever=fs.readFileSync('server/officialLawRetriever.ts','utf8');
const exporter=fs.readFileSync('server/exporters.ts','utf8');

const checks=[];
const add=(name,ok)=>checks.push([name,Boolean(ok)]);

// #1 Evidence Quality / Claim-to-Fact Integrity
add('1.1 supporting evidence remains reference-tagged',/supporting_evidence:supporting[\s\S]{0,240}tagSupport\(/.test(reasoner));
add('1.2 actor provenance resolves from evidence statement class',/tagForEvidenceStatement\(provenance\)/.test(reasoner));
add('1.3 chronology heading is epistemically neutral',/Kronologi Terpetakan \(Fakta\/Klaim\)/.test(exporter) && !/Kronologi Terverifikasi/.test(exporter));

// #2 Actor Entity Resolution
add('2.1 actor model exposes canonical entity metadata',/entity_type\?: 'PERSON'\|'ROLE'\|'ORGANIZATION'/.test(evidence) && /canonical_key\?: string/.test(evidence));
add('2.2 alias resolver exists',/function resolveActorAliases\(/.test(evidence) && /absorbed/.test(evidence));
add('2.3 explicit role-person relation is extracted without collapsing role-only entity',/roleNameRe/.test(evidence) && /role=Terdakwa/.test(evidence));
add('2.4 actor matrix carries canonical metadata downstream',/entity_type:a\.entity_type/.test(reasoner) && /canonical_key:a\.canonical_key/.test(reasoner));

// #3 Issue-to-Authority Binding Quality
add('3.1 issue identity binds by ontology id before text fallback',/const ontologyById/.test(caseAnalysis) && /ontologyById\.get\(issueId\)/.test(caseAnalysis));
add('3.2 bound authority carries structured identity and reason',/authority_identity: string/.test(caseAnalysis) && /binding_reason: string/.test(caseAnalysis));
add('3.3 duplicate authority representations are consolidated',/const byIdentity=new Map<string,BoundAuthority>\(\)/.test(caseAnalysis) && /prefer the official source/.test(caseAnalysis));
add('3.4 issue-domain anchors contribute to binding quality',/issueDomainAnchors=authorityAnchorsForContext\(meta\.domain/.test(caseAnalysis) && /issueDomainHits/.test(caseAnalysis));

// #4 Temporal Applicability
add('4.1 candidate year after case tempus is incompatible',/candidateYear > tempusYear\) return 'POTENTIALLY_INCOMPATIBLE'/.test(retriever));
add('4.2 temporal gate runs before semantic binding',/GATE 0\.5[\s\S]{0,900}POTENTIALLY_INCOMPATIBLE[\s\S]{0,500}GATE 1 — domain alignment/.test(caseAnalysis));
add('4.3 local and official binding candidates carry tempus status',/tempus_status:\(tempusYear && Number\(reg\.tahun\) > tempusYear/.test(caseAnalysis) && /tempus_status:\(c\.tempus_status\|\|'UNVERIFIED'\)/.test(caseAnalysis));
add('4.4 temporal rejection is auditable',/temporal_rejections: bindingPool\.flatMap/.test(caseAnalysis));

// Runtime actor-resolution smoke test through platform-neutral TypeScript transpile.
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lexicora-group-a-'));
for(const f of ['legalOntology.ts','evidenceModel.ts']){
  const src=fs.readFileSync(path.join('server',f),'utf8');
  const out=ts.transpileModule(src,{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  fs.writeFileSync(path.join(tmp,f.replace(/\.ts$/,'.js')),out);
}
const runtimeRequire=createRequire(path.join(tmp,'runner.cjs'));
const { buildEvidenceModel }=runtimeRequire(path.join(tmp,'evidenceModel.js'));
const model=buildEvidenceModel('Terdakwa Drs. Elya Dwi Admoko, M.M. hadir. Elya Dwi Admoko menandatangani surat. Sdri. Dewi Mufarida menyerahkan dokumen.');
const elya=model.actors.find(a=>String(a.canonical_key||'').includes('elya dwi admoko'));
const fragment=model.actors.find(a=>String(a.actor).toLowerCase()==='dwi admoko');
add('2.5 runtime alias resolution removes partial-name duplicate',Boolean(elya)&&!fragment&&elya.roles.includes('Terdakwa'));

let passed=0;
for(const [name,ok] of checks){ console.log(`${ok?'PASS':'FAIL'} | ${name}`); if(ok)passed++; }
console.log(`\n${passed}/${checks.length} GROUP-A checks PASS`);
if(passed!==checks.length) process.exit(1);
