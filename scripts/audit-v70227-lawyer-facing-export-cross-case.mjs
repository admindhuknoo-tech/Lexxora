import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript/lib/typescript.js'); } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicore-v70227-cross-'));
const src = fs.readFileSync(path.join(root,'server','exporters.ts'),'utf8');
const out = ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const compiled=path.join(tempDir,'exporters.cjs'); fs.writeFileSync(compiled,out);
const {createPdfBuffer,createDocxBuffer}=require(compiled);
function pdfText(buf){return [...buf.toString('binary').matchAll(/\(([^\r\n]*?)\) Tj/g)].map(m=>m[1].replace(/\\([()\\])/g,'$1')).join(' ')}
function docxText(buf){const r=buf.toString('utf8');const a=r.indexOf('<w:document');const b=r.indexOf('</w:document>');return r.slice(a,b+13).replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ')}
function assert(c,m){if(!c)throw new Error(m)}
const stages=[
  ['PLEADING','Jawab-menjawab / pengajuan perkara','PERMA No. 1 Tahun 2016'],
  ['APPEAL','Upaya hukum','UU No. 20 Tahun 1947'],
  ['EXECUTION','Eksekusi','HIR Pasal 195'],
  ['INVESTIGATION','Penyidikan','KUHAP'],
  ['PROSECUTION','Penuntutan','KUHAP'],
  ['CONSULTATION','Konsultasi / penelaahan awal','KUHPerdata'],
];
const forbidden=/pipeline gate|official identity guard|source quality guard|working_paper|claim-only|intentionally|nexus substansi|diagnostik teknis|jejak proses analisis/i;
let checks=0;
for(const [stage,stageLabel,authority] of stages){
  const analysis={
    title:`Cross Case ${stage}`,source_role:stage==='INVESTIGATION'?'INVESTIGATION_OR_BAP':'LITIGATION_SUBMISSION',
    export_meta:{id:`X-${stage}`,generated_at_wib:'19-09-2026 22:10:00 WIB'},
    case_regulatory_snapshot:{domains:[{label:stage==='INVESTIGATION'||stage==='PROSECUTION'?'Hukum Pidana':'Hukum Perdata & Perikatan'}]},
    lawyer_workflow:{version:'5.5',procedural_stage:stage,orientation:stage==='INVESTIGATION'?'RESPONDENT':'CIVIL_PLAINTIFF',represented_side_hint:'Klien',role_confidence:'HIGH',mandate_summary:`Posisi perkara pada ${stage}.`,stages:[],allegation_response_matrix:[],authority_duty_matrix:[],financial_collateral_audit:{amounts:[],collateral_terms:[],repayment_terms:[],discrepancy_terms:[],review_questions:[]},witness_strategy:{witness_targets:[],expert_domains:[]},drafting_plan:[],document_integrity_audit:{document_markers:[],integrity_questions:[]},next_actions:[]},
    legal_issues:[{issue:'Apa dasar hukum dan langkah yang relevan?',rule:`${authority} - ketentuan relevan`,analysis:'Analisis berbasis dokumen.',conclusion:'Perlu verifikasi dokumen primer.'}],
    applicable_law:[{regulation:authority,article:'Ketentuan relevan',relevance:'Keterkaitan dengan isu perkara.'}],risk_matrix:[],recommendations:['Verifikasi dokumen primer.'],arguments_for:[],arguments_against:[],blank_spot_questions:[],adverse_evidence:[],verification_note:'Verifikasi profesional diperlukan.'
  };
  for(const [fmt,buf] of [['PDF',createPdfBuffer(analysis)],['DOCX',createDocxBuffer(analysis)]]){
    const text=fmt==='PDF'?pdfText(buf):docxText(buf);
    assert(text.toLowerCase().includes(stageLabel.toLowerCase()),`${fmt}/${stage}: missing professional stage ${stageLabel}`); checks++;
    assert(text.includes(authority),`${fmt}/${stage}: authority lost`); checks++;
    assert(!forbidden.test(text),`${fmt}/${stage}: technical leakage`); checks++;
    assert(text.toLowerCase().includes('pendapat hukum / kesimpulan'),`${fmt}/${stage}: missing conclusion section`); checks++;
  }
}
console.log(`PASS ${checks}/${checks} V7.0.2.27 lawyer-facing export cross-case`);
fs.rmSync(tempDir,{recursive:true,force:true});
