import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript/lib/typescript.js'); } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sourcePath = path.join(root, 'server', 'exporters.ts');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicore-v70227-'));
const compiledPath = path.join(tempDir, 'exporters.cjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
fs.writeFileSync(compiledPath, transpiled.outputText);
const { createPdfBuffer, createDocxBuffer } = require(compiledPath);

function pdfText(buf) {
  const raw = buf.toString('binary');
  return [...raw.matchAll(/\(([^\r\n]*?)\) Tj/g)].map(m => m[1].replace(/\\([()\\])/g, '$1')).join(' ');
}
function xmlDecode(s) { return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'"); }
function docxText(buf) {
  const raw = buf.toString('utf8');
  const start = raw.indexOf('<w:document');
  const end = raw.indexOf('</w:document>');
  if (start < 0 || end < 0) throw new Error('word/document.xml not found in stored DOCX');
  return xmlDecode(raw.slice(start, end + 13).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function includes(hay, needle, label) { assert(hay.toLowerCase().includes(needle.toLowerCase()), `${label}: missing ${needle}`); }
function excludes(hay, rx, label) { assert(!rx.test(hay), `${label}: leaked ${rx}`); }

const analysis = {
  title: 'Sengketa Tanah - Uji Ekspor',
  source_role: 'LITIGATION_SUBMISSION',
  export_meta: { id:'LC-TEST-V70227', generated_at_wib:'19-09-2026 22:00:00 WIB' },
  analysis_provenance: { status:'DEGRADED', attempts:[{ status:'FAILED', model:'internal-model', duration_ms:123, detail:'diagnostik teknis' }] },
  pipeline_gate: { status:'DEGRADED', score:88, blockers:['official identity guard: verified+nexus=8, bad online=1','source quality guard: status=REVIEW REQUIRED, excluded_spans=5'] },
  pipeline_trace: [{ id:'law_discover', label:'Menemukan kandidat hukum', status:'DONE', ms:12, detail:'candidates=8; usable=7; rejected=1' }],
  case_regulatory_snapshot: { domains:[{label:'Hukum Agraria & Pertanahan'},{label:'Hukum Perdata & Perikatan'}] },
  lawyer_workflow: {
    version:'5.5', procedural_stage:'PLEADING', orientation:'CIVIL_PLAINTIFF', represented_side_hint:'Penggugat', role_confidence:'HIGH',
    mandate_summary:'Analisis diarahkan sebagai civil plaintiff pada tahap pleading dengan fokus pada posisi klien.',
    stages:[{label:'Organizing Legal Facts & Chronology',status:'READY',objective:'Pisahkan fakta dan klaim.',outputs:['Fact table','Actor-action-evidence matrix','Chronology']},{label:'Examining Authority & Operational Duties',status:'PARTIAL',objective:'Uji kewenangan formal.',outputs:['Authority-duty module intentionally limited - no formal-authority actor detected.']},{label:'Reviewing Document Integrity & Procedure',status:'READY',objective:'Periksa signature/approval dan procedural compliance.',outputs:['Document integrity checklist','Procedure exceptions','Citation/source verification']}],
    allegation_response_matrix:[], authority_duty_matrix:[],
    financial_collateral_audit:{amounts:[],collateral_terms:[],repayment_terms:[],discrepancy_terms:[],review_questions:[]},
    witness_strategy:{witness_targets:[],expert_domains:[]},
    drafting_plan:[{document:'Draft tanggapan',purpose:'Menyiapkan respons hukum.',priority:'P1',depends_on:['Coverage gaps','Verification queue']}],
    document_integrity_audit:{document_markers:['akta'],integrity_questions:['Apakah dokumen asli tersedia?']},
    next_actions:['Pisahkan semua dalil yang masih claim-only.']
  },
  facts:['Penggugat menguasai objek sengketa berdasarkan dokumen yang diajukan.'],
  actor_matrix:[{actor:'Penggugat',proven_status:'Penggugat',explicit_rights_obligations:'Pihak yang mengajukan gugatan.',evidence_tag:'[FAKTA H1: "Penggugat"]'}],
  verified_timeline:[{time:'2026',event:'Gugatan diajukan.',evidence_tag:'[FAKTA H1: "Gugatan"]'}],
  legal_issues:[
    { issue:'Apakah sertifikat memberikan perlindungan hukum?', rule:'PP No. 24 Tahun 1997 - Pasal 32 [CORPUS · HIGH · domain=PRIMARY · fn=SUBSTANTIVE · bind=3]', analysis:'Nexus substansi yang terdeteksi: pendaftaran tanah.', conclusion:'Kesimpulan taktis sementara: perlu verifikasi bukti primer.' },
    { issue:'Apa prosedur yang relevan?', rule:'PERMA No. 1 Tahun 2016 - Prosedur Mediasi', analysis:'Kandidat yang ditemukan belum mempunyai keterkaitan material yang cukup spesifik dengan isu ini.', conclusion:'Masih diperlukan verifikasi.' }
  ],
  applicable_law:[
    { regulation:'PP No. 24 Tahun 1997', article:'Pasal 32', relevance:'Nexus substansi yang terdeteksi: tanah. Kandidat dari korpus internal dengan tingkat keyakinan tinggi, terkait dengan domain utama. 2 pasal pada instrumen ini memuat istilah yang bersesuaian dengan isu.' },
    { regulation:'PERMA No. 1 Tahun 2016', article:'Prosedur Mediasi', relevance:'Identitas terbaca dari indeks otoritas resmi lokal (snapshot katalog resmi); belum diverifikasi langsung pada sesi ini.' }
  ],
  legal_gaps:[{gap:'Dalil masih claim-only.',why_material:'KLAIM KOSONG: perlu bukti primer.',evidence_tag:'[KLAIM H1: "dalil"]'}],
  multi_path_diagnosis:[{path:'Perdata',strength:'MEDIUM',application:'Uji jalur perdata.',counter_case:'Uji apakah unsur tidak terpenuhi.'}],
  risk_matrix:[{level:'MEDIUM',clause:'Kekuatan bukti',finding:'Dokumen primer belum lengkap.',mitigation:'Lengkapi dokumen asli.'}],
  risk_score_breakdown:[{factor:'Source quality',score:55,basis:'status=REVIEW_REQUIRED; excluded_spans=5; working_paper=60; pipeline=88'}],
  arguments_for:['Sertifikat dan dokumen formal mendukung posisi.'], arguments_against:['Keaslian dokumen masih perlu diuji.'],
  best_case:'Bukti primer mengonfirmasi seluruh unsur.', worst_case:'Bukti primer tidak mendukung dalil utama.',
  recommendations:['Kumpulkan dokumen primer.','Verifikasi rujukan hukum.'],
  adverse_evidence:[{evidence_id:'ADV-1',page:2,adverse_point:'Dokumen lawan berbeda.',analysis:'Perlu uji autentisitas.'}],
  blank_spot_questions:['Apa bukti primer yang mendukung dalil?'],
  verification_note:'pipeline gate belum final; official identity guard perlu review.',
};

const before = JSON.stringify(analysis);
const pdf = createPdfBuffer(analysis);
const docx = createDocxBuffer(analysis);
const after = JSON.stringify(analysis);
assert(before === after, 'exporters mutated analysis object');

const views = [['PDF', pdfText(pdf)], ['DOCX', docxText(docx)]];
const forbidden = [
  /pipeline gate/i,/official identity guard/i,/source quality guard/i,/working_paper/i,/claim-only/i,/intentionally/i,
  /nexus substansi/i,/riwayat percobaan model/i,/diagnostik teknis/i,/basis skor risiko/i,/jejak proses analisis/i,
  /status penalaran/i,/status pembacaan/i,/cakupan pembacaan/i,/kematangan kertas kerja/i,/candidate/i,/kandidat dari korpus/i,
  /Organizing Legal Facts/i,/Reviewing Document Integrity/i,/Coverage gaps/i,/Verification queue/i,/procedural compliance/i,/signature\/approval/i
];
const required = ['ANALISA & PENDAPAT HUKUM','Ringkasan Eksekutif','Kerangka Hukum Relevan','Risk Assessment','Strategi Penanganan Perkara','Pendapat Hukum / Kesimpulan','Rujukan Hukum Utama','Catatan Profesional','PP No. 24 Tahun 1997','PERMA No. 1 Tahun 2016','Keterkaitan dengan isu'];

let checks = 0;
for (const [label, text] of views) {
  for (const rx of forbidden) { excludes(text, rx, label); checks++; }
  for (const token of required) { includes(text, token, label); checks++; }
  includes(text, 'Menyusun Fakta Hukum & Kronologi', label); checks++;
  includes(text, 'Menelaah Integritas', label); checks++;
  includes(text, 'Matriks fakta', label); checks++;
  includes(text, 'Matriks aktor-tindakan-bukti', label); checks++;
  includes(text, 'Dokumen yang belum tersedia', label); checks++;
  includes(text, 'Hal yang perlu diverifikasi', label); checks++;
}
assert(pdf.length > 5000, 'PDF unexpectedly small'); checks++;
assert(docx.length > 5000, 'DOCX unexpectedly small'); checks++;

console.log(`PASS ${checks}/${checks} V7.0.2.27 lawyer-facing export cleanup`);
fs.rmSync(tempDir, {recursive:true, force:true});
