import { createPdfBuffer, createDocxBuffer } from '../server/exporters.ts';

const analysis: any = {
  title: 'Analisis Perkara',
  user_name: 'LEXICORE QA',
  export_meta: { generated_at_wib: '21-09-2026 09:26:19 WIB' },
  document_role: 'BAP',
  legal_context: { primary_domain: 'Hukum Pidana & Acara Pidana' },
  procedural_posture: { stage: 'INVESTIGATION' },
  analysis_readiness: { status: 'DEGRADED', score: 55 },
  pipeline_gate: { status: 'DEGRADED', score: 94 },
  actor_matrix: [
    { actor: 'ELYA DWI ADMOKO', proven_status: 'Tersangka', explicit_rights_obligations: 'Hak dan kewajiban dibaca dari sumber.', evidence_tag: '[FAKTA H1: "ELYA DWI ADMOKO, M.M."]' },
    { actor: 'DEWI MUFARIDA', proven_status: 'Debitur', explicit_rights_obligations: 'Status debitur tertulis pada sumber.', evidence_tag: '[FAKTA H1: "Debitur Dewi Mufarida"]' },
  ],
  verified_timeline: [
    { time: '21-05-2026', event: 'Pemeriksaan dilakukan terhadap ELYA DWI ADMOKO.\nSurat Perintah Penyidikan tetap dirujuk.', evidence_tag: '[FAKTA H1: "21-05-2026"]' },
  ],
  facts: [
    '### Page 1 ### ELYA DWI ADMOKO diperiksa. ---------------------------naaaamaammmamamaanamnanan Nama lengkap tetap ELYA DWI ADMOKO.',
    'Dewi Mufarida menerima fasilitas kredit.\nKalimat lanjutan tidak boleh terpisah karena pergantian baris sumber.'
  ],
  legal_issues: [], applicable_law: [], legal_gaps: [], multi_path_diagnosis: [], risks: [],
  verification_note: 'Perlu verifikasi profesional.',
};

const pdf = createPdfBuffer(analysis);
const pdfText = pdf.toString('latin1');
const docx = createDocxBuffer(analysis);
const docxText = docx.toString('utf8'); // custom ZIP uses STORE; XML remains inspectable.

const checks: Array<[string, boolean]> = [
  ['PDF generated', pdf.length > 1000],
  ['DOCX generated', docx.length > 1000],
  ['PDF title 14pt Times Bold', /\/F4 14 Tf[^\n]*ANALISA & PENDAPAT HUKUM/.test(pdfText)],
  ['PDF body uses 12pt Times', /\/F3 12 Tf/.test(pdfText)],
  ['PDF footer has clean page label', pdfText.includes('Halaman 1') && !pdfText.includes('Halaman #1')],
  ['PDF removes embedded Page marker', !pdfText.includes('### Page 1 ###')],
  ['PDF removes OCR separator noise', !/naaaamaammmamamaanamnanan/i.test(pdfText)],
  ['PDF preserves names', pdfText.includes('ELYA DWI ADMOKO') && pdfText.includes('(DEWI)') && pdfText.includes('(MUFARIDA)')],
  ['DOCX legal margins 4/3/3/3 cm', docxText.includes('w:top="1701"') && docxText.includes('w:right="1701"') && docxText.includes('w:bottom="1701"') && docxText.includes('w:left="2268"')],
  ['DOCX normal 12pt Times New Roman', docxText.includes('w:ascii="Times New Roman"') && docxText.includes('<w:sz w:val="24"/>')],
  ['DOCX title 14pt bold', docxText.includes('w:styleId="Title"') && docxText.includes('<w:sz w:val="28"/>')],
  ['DOCX 1.5 spacing', docxText.includes('w:line="360"')],
  ['DOCX paragraph after 6pt', docxText.includes('w:after="120"')],
  ['DOCX footer has clean page label', docxText.includes('>Halaman</w:t>') && !docxText.includes('Halaman #</w:t>')],
  ['DOCX removes embedded Page marker', !docxText.includes('### Page 1 ###')],
  ['DOCX removes OCR separator noise', !/naaaamaammmamamaanamnanan/i.test(docxText)],
  ['DOCX preserves names', docxText.includes('ELYA DWI ADMOKO') && docxText.includes('DEWI MUFARIDA')],
  ['Actor table headers preserved', docxText.includes('AKTOR') && docxText.includes('STATUS / HAK-KEWAJIBAN') && docxText.includes('RUJUKAN SUMBER')],
  ['Chronology table headers preserved', docxText.includes('WAKTU') && docxText.includes('PERISTIWA')],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (!ok) fail++;
}
console.log(`RESULT ${checks.length - fail}/${checks.length} PASS`);
if (fail) process.exit(1);
