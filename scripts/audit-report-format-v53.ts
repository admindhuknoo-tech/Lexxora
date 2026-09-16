import { buildEvidenceModel } from '../server/evidenceModel';
import { inferLegalContext } from '../server/legalOntology';
import { reasonForensically } from '../server/forensicReasoner';
import { analysisToText, createPdfBuffer, createDocxBuffer } from '../server/exporters';

const raw = `Bagus ditangkap dan ditahan polisi Polres Sidoarjo atas laporan Rahmad.
Bagus menyewa mobil milik Rahmad dengan biaya sewa setiap bulan, tetapi Agus menggadaikan mobil tersebut kepada Andi.
Pada waktu Rahmad ingin menarik mobilnya, ternyata oleh Andi digadaikan lagi kepada Putut.
Setelah dicari ke rumah Putut, mobil tersebut tidak ada karena disewa perusahaan selama beberapa bulan.
Bagaimana posisi hukum para pihak dan langkah hukum yang dapat ditempuh?`;

const evidence = buildEvidenceModel(raw);
const context = inferLegalContext(raw);
const reasoning = reasonForensically({ title:'Audit General Case', primaryDomain:context.primary.label, domainContext:context, evidence, lawCandidates:[], tempusYear:undefined });
const analysis:any = {
  ...reasoning,
  title:'Audit General Case',
  source_role:evidence.source_role,
  analysis_provenance:{status:reasoning.reasoning_status,model:'lexicore-deterministic-forensic-v3',mode:'DETERMINISTIC_FORENSIC'},
  pipeline_gate:{status:reasoning.reasoning_status==='READY'?'READY':'DEGRADED',score:75},
  risk_matrix:reasoning.risks,
  document_reading:{status:'READABLE',segments_read:1,segments_total:1},
};
const md = analysisToText(analysis);
const pdf = createPdfBuffer(analysis);
const docx = createDocxBuffer(analysis);

const checks:[string,boolean,string][] = [];
const ck=(name:string,ok:boolean,detail='')=>checks.push([name,ok,detail]);
ck('minimum 3 material/audit issues', reasoning.legal_issues.length>=3, String(reasoning.legal_issues.length));
ck('insurance false-positive absent', !reasoning.legal_issues.some(x=>/polis|asuransi|dipertanggungkan/i.test(x.issue)), reasoning.legal_issues.map(x=>x.issue).join(' | '));
ck('criminal context detected', context.scores.some(x=>x.id==='PIDANA_MATERIIL_FORMIL'&&x.score>=6), JSON.stringify(context.scores.slice(0,4).map(x=>({id:x.id,score:x.score}))));
ck('named actors extracted', ['Bagus','Rahmad','Agus','Andi','Putut'].filter(n=>evidence.actors.some(a=>a.actor.toLowerCase()===n.toLowerCase())).length>=4, evidence.actors.map(a=>a.actor).join(', '));
ck('markdown metadata table', md.includes('| Metrik | Status & Nilai |')&&md.includes('|---|---|'));
ck('markdown reference table', md.includes('| Referensi | Klausul | Relevansi Nexus |'));
ck('markdown risk table', md.includes('| Aspek Risiko | Temuan Riil | Mitigasi Kritis |'));
ck('markdown action table', md.includes('| No | Prioritas | Rencana Tindakan Remediasi Data | Status |'));
ck('strict section I-V', ['## I. KONTEKS PERKARA / MASALAH','## II. ISU UTAMA DAN ANALISIS','## III. DASAR RUJUKAN & CELAH DATA','## IV. MATRIKS RISIKO & TINDAKAN LANJUT','## V. VERIFIKASI PROFESIONAL'].every(x=>md.includes(x)));
ck('legacy argument/scenario sections removed', !/POSISI ARGUMENTASI|SKENARIO LITIGASI|DIAGNOSIS MULTI-JALUR/.test(md));
ck('horizontal separators present', (md.match(/^---$/gm)||[]).length>=5, String((md.match(/^---$/gm)||[]).length));
ck('pdf generated', pdf.length>2000, String(pdf.length));
ck('docx generated', docx.length>2000, String(docx.length));

let pass=0;
for(const [name,ok,detail] of checks){ console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` :: ${detail}`:''}`); if(ok)pass++; }
console.log(`\n${pass}/${checks.length} report-format-v5.3 checks PASS`);
if(pass!==checks.length) process.exitCode=1;
