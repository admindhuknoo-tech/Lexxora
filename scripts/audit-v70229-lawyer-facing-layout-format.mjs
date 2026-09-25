import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
let ts; try{ts=require('typescript/lib/typescript.js')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js')}
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lexicore-v70229-'));
const src=fs.readFileSync(path.join(root,'server','exporters.ts'),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const compiled=path.join(temp,'exporters.cjs');fs.writeFileSync(compiled,js);
const {createPdfBuffer,createDocxBuffer}=require(compiled);
function assert(c,m){if(!c)throw new Error(m)}
function no(t,rx,m){assert(!rx.test(t),m||`forbidden ${rx}`)}
function has(t,s,m){assert(t.includes(s),m||`missing ${s}`)}
function unzipEntry(buf,name){const s=buf.toString('binary');const sig='PK\x03\x04';let at=0;while((at=s.indexOf(sig,at))>=0){const fnLen=buf.readUInt16LE(at+26),extraLen=buf.readUInt16LE(at+28),size=buf.readUInt32LE(at+18),fn=buf.slice(at+30,at+30+fnLen).toString();const start=at+30+fnLen+extraLen;if(fn===name)return buf.slice(start,start+size).toString('utf8');at=start+size;}throw new Error(`entry not found ${name}`)}
const analysis={
 title:'Case Analysis',user_name:'Erfanudin',source_role:'LITIGATION_SUBMISSION',export_meta:{id:'LC-SYSTEM-SECRET',generated_at_wib:'20-09-2026 06:30:00 WIB'},professional_verification:'PENDING',
 case_regulatory_snapshot:{domains:[{label:'Hukum Perdata & Perikatan'}]},
 facts:['Ni Aovga ara Kuasa Penggugat / :', 'Terguagat mengajukan Rekonyensi.', 'Dokumen menjadiatas nama pihak lain.', 'aktor → tindakan → bukti → norma'],
 actor_matrix:[{actor:'Penggugat',proven_status:'Pihak',explicit_rights_obligations:'Terguagat dalam Rekonyensi.',evidence_tag:'[KLAIM H1: "Ni Aovga ara Kuasa Penggugat / :"]'}],
 verified_timeline:[{time:'2026',event:'Dokumen menjadiatas nama pihak.',evidence_tag:'[FAKTA H1: "Peristiwa"]'}],
 legal_issues:[{issue:'Apakah dalil telah terbukti?',rule:'Belum ada norma spesifik.',analysis:'Basis isu.',conclusion:'Kesimpulan taktis sementara: BERBASIS KLAIM - belum cukup.'}],
 applicable_law:[{regulation:'KUHPerdata',article:'Pasal 1365',relevance:'Keterkaitan dengan isu.'}],
 legal_gaps:[{gap:'Dalil identitas belum cukup.',why_material:'Klaim tidak boleh dipromosikan menjadi fakta. [DALIL BELUM TERKONFIRMASI: Identitas pihak]'}],multi_path_diagnosis:[],
 risk_matrix:[{level:'MEDIUM',clause:'Kualitas fakta',finding:'Masih perlu verifikasi.',mitigation:'Periksa dokumen primer.'}],arguments_for:['Dalil didukung dokumen.'],arguments_against:['Bukti tandingan belum lengkap.'],best_case:'Bukti cukup.',worst_case:'Bukti tidak cukup.',
 recommendations:['Bangun matriks aktor → tindakan → bukti → norma.'],adverse_evidence:[],blank_spot_questions:[],verification_note:'Dokumen harus diverifikasi.',
 lawyer_workflow:{version:'5.5',procedural_stage:'PLEADING',orientation:'CIVIL_PLAINTIFF',represented_side_hint:'Penggugat',role_confidence:'HIGH',mandate_summary:'Tahap pleading.',stages:[],allegation_response_matrix:[{issue:'Isu A',supporting_material:['Bukti A'],counter_material:['Bukti B'],unresolved:['Pertanyaan C']}],authority_duty_matrix:[],financial_collateral_audit:{amounts:[],collateral_terms:[],repayment_terms:[],discrepancy_terms:[],review_questions:[]},witness_strategy:{witness_targets:[],expert_domains:[]},drafting_plan:[],document_integrity_audit:{document_markers:[],integrity_questions:[]},next_actions:[]}
};
const pdf=createPdfBuffer(analysis),docx=createDocxBuffer(analysis);
const pdfRaw=pdf.toString('binary');const doc=unzipEntry(docx,'word/document.xml');const styles=unzipEntry(docx,'word/styles.xml');const header=unzipEntry(docx,'word/header1.xml');const footer=unzipEntry(docx,'word/footer1.xml');
let checks=0;
// PDF geometry/typography contracts.
has(pdfRaw,'/MediaBox [0 0 595 842]');checks++;
assert(/113(?:\.\d+)?\s+\d+(?:\.\d+)?\s+Td \(1\. RINGKASAN EKSEKUTIF\)/.test(pdfRaw),'PDF main left margin not ~4 cm');checks++;
assert(/\/F4 14(?:\.0+)? Tf/.test(pdfRaw),'PDF chapter heading not 14 pt bold serif');checks++;
assert(/\/F3 12(?:\.0+)? Tf/.test(pdfRaw),'PDF body not 12 pt serif');checks++;
no(pdfRaw,/LC\)|LEXICORE|Export ID|Pengguna LexiCore/,'PDF system metadata/header leak');checks++;
has(pdfRaw,'Erfanudin');checks++;
no(pdfRaw,/\? tindakan \?/,'PDF broken arrow glyph');checks++;
has(pdfRaw,'aktor -> tindakan -> bukti -> norma','PDF directional relation missing');checks++;
no(pdfRaw,/DALIL BELUM TERKONFIRMASI/,'PDF rigid unconfirmed label leaked');checks++;
has(pdfRaw,'memerlukan verifikasi bukti dokumen primer','PDF softened verification language missing');checks++;
no(pdfRaw,/Terguagat|Rekonyensi|menjadiatas|Ni Aovga ara Kuasa Penggugat/,'PDF OCR/editorial typos remain');checks++;
has(pdfRaw,'Tergugat');has(pdfRaw,'Rekonvensi');has(pdfRaw,'menjadi atas');has(pdfRaw,'Kuasa Penggugat');checks+=4;
// DOCX page geometry and typography.
has(doc,'<w:pgSz w:w="11906" w:h="16838"/>');checks++;
has(doc,'<w:pgMar w:top="1701" w:right="1701" w:bottom="1701" w:left="2268"');checks++;
assert(/styleId="Normal"[\s\S]*?<w:spacing w:line="360" w:lineRule="auto" w:after="(?:120|140|160)"\/>[\s\S]*?<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"\/>[\s\S]*?<w:sz w:val="24"\/>/.test(styles),'DOCX Normal must be TNR 12 pt, 1.5 spacing, 6-8pt after');checks++;
assert(/styleId="Heading1"[\s\S]*?<w:sz w:val="28"\/>/.test(styles),'DOCX Heading1 must be 14 pt');checks++;
no(styles,/Georgia/,'DOCX decorative Georgia remains');checks++;
assert(/w:firstLine="567"/.test(doc),'DOCX body first-line indent must be 1 cm');checks++;
assert(/<w:sz w:val="20"\/><w:szCs w:val="20"\/>/.test(doc),'DOCX table font must include 10 pt');checks++;
assert(/w:line="240"/.test(doc),'DOCX table line spacing must be single');checks++;
no(header,/LC|LEXICORE|Pengguna LexiCore/,'DOCX header system branding leak');checks++;
has(header,'Erfanudin');checks++;
no(footer,/Export ID|Kertas Kerja Rahasia|Verifikasi Profesional/,'DOCX footer metadata leak');checks++;
has(footer,'Halaman');checks++;
no(doc,/DALIL BELUM TERKONFIRMASI/,'DOCX rigid unconfirmed label leaked');checks++;
has(doc,'Dalil ini masih memerlukan verifikasi bukti dokumen primer lebih lanjut.');checks++;
no(doc,/Terguagat|Rekonyensi|menjadiatas|Ni Aovga ara Kuasa Penggugat/,'DOCX OCR/editorial typos remain');checks++;
has(doc,'Tergugat');has(doc,'Rekonvensi');has(doc,'menjadi atas');has(doc,'Kuasa Penggugat');checks+=4;
has(doc,'aktor → tindakan → bukti → norma');checks++;
// Allegation matrix should be readable as structured blocks, not a cramped four-column table.
has(doc,'Matriks Dalil dan Tanggapan');has(doc,'Isu: Isu A');has(doc,'Dukungan: Bukti A');has(doc,'Tanggapan lawan: Bukti B');has(doc,'Belum terjawab: Pertanyaan C');checks+=5;
console.log(`PASS ${checks}/${checks} V7.0.2.29 lawyer-facing layout & format`);
fs.rmSync(temp,{recursive:true,force:true});
