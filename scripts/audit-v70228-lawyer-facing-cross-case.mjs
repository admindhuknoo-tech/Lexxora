import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
let ts; try{ts=require('typescript/lib/typescript.js')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js')}
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lexicore-v70228-cross-'));
const src=fs.readFileSync(path.join(root,'server','exporters.ts'),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const compiled=path.join(temp,'exporters.cjs');fs.writeFileSync(compiled,js);
const {createPdfBuffer,createDocxBuffer}=require(compiled);
function pdfText(buf){return [...buf.toString('binary').matchAll(/\(([^\r\n]*?)\) Tj/g)].map(m=>m[1].replace(/\\([()\\])/g,'$1')).join(' ').replace(/\s+/g,' ')}
function docxText(buf){const r=buf.toString('utf8');const a=r.indexOf('<w:document'),b=r.indexOf('</w:document>');return r.slice(a,b+13).replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/\s+/g,' ')}
function assert(c,m){if(!c)throw new Error(m)}
const forbidden=/\bauthority\b|\bdrafting\b|evidence support|\bProfessional\b|\bPENDING\b|reasoning core|evidence-grounded|Sinyal domain\s*=|\bkandidat\b|counter-reading|\bcitation\b|pleading final|allegation-response matrix|\bfact matrix\b|\bprocedural stage\b|\bposture\b|Pertanyaan review|Kesimpulan taktis sementara|BERBASIS KLAIM|DIDUKUNG MATERI TEKSTUAL|CAMPURAN FAKTA\/KLAIM/i;
const cases=[
 {name:'civil-pleading',stage:'PLEADING',domain:'Hukum Perdata & Perikatan',issue:'Apakah wanprestasi telah terbukti?',conclusion:'Kesimpulan taktis sementara: DIDUKUNG MATERI TEKSTUAL - dapat dipakai sebagai hipotesis kerja atas isu, tetap tunduk pada verifikasi dokumen asli dan norma.',authority:'KUHPerdata Pasal 1238',recommendation:'Verifikasi bukti somasi dan prestasi yang diperjanjikan.'},
 {name:'civil-appeal',stage:'APPEAL',domain:'Hukum Acara Perdata',issue:'Apakah alasan banding didukung putusan dan bukti?',conclusion:'Kesimpulan taktis sementara: CAMPURAN FAKTA/KLAIM - sebagian mempunyai dukungan tekstual, sebagian masih memerlukan pembuktian.',authority:'UU No. 20 Tahun 1947',recommendation:'Verifikasi tenggang dan memori banding.'},
 {name:'execution',stage:'EXECUTION',domain:'Hukum Acara Perdata',issue:'Apakah syarat eksekusi telah terpenuhi?',conclusion:'Kesimpulan taktis sementara: BERBASIS KLAIM - belum cukup untuk dinyatakan sebagai fakta hukum.',authority:'HIR Pasal 195',recommendation:'Verifikasi putusan berkekuatan hukum tetap dan permohonan eksekusi.'},
 {name:'criminal-prosecution',stage:'PROSECUTION',domain:'Hukum Pidana',issue:'Apakah unsur dakwaan didukung alat bukti?',conclusion:'Kesimpulan taktis sementara: CAMPURAN FAKTA/KLAIM - sebagian mempunyai dukungan tekstual, sebagian masih memerlukan pembuktian.',authority:'KUHAP',recommendation:'Verifikasi alat bukti dan kesesuaian uraian dakwaan.'},
 {name:'consultation',stage:'CONSULTATION',domain:'Hukum Agraria & Pertanahan',issue:'Apa status hak atas tanah dan dokumen yang tersedia?',conclusion:'Kesimpulan taktis sementara: DIDUKUNG MATERI TEKSTUAL - dapat dipakai sebagai hipotesis kerja atas isu, tetap tunduk pada verifikasi dokumen asli dan norma.',authority:'PP No. 24 Tahun 1997',recommendation:'Verifikasi sertifikat, buku tanah, dan riwayat peralihan.'}
];
let checks=0;
for(const c of cases){
 const analysis={title:'Case Analysis',source_role:c.stage==='PROSECUTION'?'LITIGATION_SUBMISSION':'CASE_NARRATIVE_OR_QUESTION',export_meta:{id:`LC-${c.name}`,generated_at_wib:'20-09-2026 06:15:00 WIB'},case_regulatory_snapshot:{domains:[{label:c.domain}]},lawyer_workflow:{version:'5.5',procedural_stage:c.stage,orientation:c.stage==='PROSECUTION'?'CRIMINAL_DEFENSE':'GENERAL_COUNSEL_REVIEW',represented_side_hint:'Klien',role_confidence:'MEDIUM',mandate_summary:`Analisis diarahkan pada ${c.stage} dengan fokus pada isu dan authority serta drafting yang sesuai.`,stages:[],allegation_response_matrix:[],authority_duty_matrix:[],financial_collateral_audit:{amounts:[],collateral_terms:[],repayment_terms:[],discrepancy_terms:[],review_questions:[]},witness_strategy:{witness_targets:[],expert_domains:[]},drafting_plan:[],document_integrity_audit:{document_markers:[],integrity_questions:[]},next_actions:[]},legal_issues:[{issue:c.issue,rule:`${c.authority} - ketentuan relevan`,analysis:'Analisis berdasarkan materi yang tersedia.',conclusion:c.conclusion}],applicable_law:[{regulation:c.authority,article:'Ketentuan relevan',relevance:'Keterkaitan dengan isu perkara.'}],risk_matrix:[],recommendations:[c.recommendation],arguments_for:[],arguments_against:[],blank_spot_questions:[],adverse_evidence:[],verification_note:'Verifikasi profesional diperlukan.'};
 const before=JSON.stringify(analysis);
 for(const [fmt,buf] of [['PDF',createPdfBuffer(analysis)],['DOCX',createDocxBuffer(analysis)]]){
  const text=fmt==='PDF'?pdfText(buf):docxText(buf);
  assert(text.includes(c.authority),`${fmt}/${c.name}: authority reference lost`);checks++;
  assert(text.toLowerCase().includes(c.issue.replace(/\?$/,'').toLowerCase()),`${fmt}/${c.name}: issue substance lost`);checks++;
  assert(text.toLowerCase().includes('dasar hukum utama yang telah teridentifikasi'),`${fmt}/${c.name}: legal-basis conclusion missing`);checks++;
  assert(text.toLowerCase().includes('prioritas tindak lanjut'),`${fmt}/${c.name}: action conclusion missing`);checks++;
  assert(!forbidden.test(text),`${fmt}/${c.name}: technical/machine language leaked`);checks++;
  assert(text.toLowerCase().includes('catatan profesional'),`${fmt}/${c.name}: professional note missing`);checks++;
 }
 assert(before===JSON.stringify(analysis),`${c.name}: exporter mutated analysis`);checks++;
}
console.log(`PASS ${checks}/${checks} V7.0.2.28 lawyer-facing cross-case`);
fs.rmSync(temp,{recursive:true,force:true});
