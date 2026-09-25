// V6.9.2 — Regression Corpus Permanen (Group C, item 9).
//
// This corpus intentionally locks AFTER Group A + Group B stabilized
// (README_V6_9_1_GROUP_A_FIX_AND_GROUP_B_START.txt: tsc clean, Group A
// correctness 16/16, audit-baseline 56/56, audit-deep 65/65,
// audit-readiness-domain-routing 6/6), per this item's own stated
// dependency: "butuh A + B stabil dulu untuk lock expected output".
//
// Each fixture exercises a distinct, previously-empirically-verified pipeline
// path so a future change cannot silently regress one path while every
// single-purpose audit (v691, v692, v690, baseline, deep) still passes in
// isolation. This is the safety net those targeted audits cannot provide by
// themselves: cross-cutting drift between subsystems.

import type { CaseAnalysisInput } from '../../server/caseAnalysis';

export interface CorpusFixture {
  id: string;
  description: string;
  input: CaseAnalysisInput;
}

const litigationAmbiguousDomain = `
JAWABAN TERGUGAT

Perkara Nomor 123/Pdt.G/2024/PN.Sby

Penggugat: Budi Santoso.
Tergugat: Andi Saputra.

Dalam jawaban ini, Tergugat menyatakan sebagai berikut.

Pada tanggal 5 Januari 2024, Penggugat dan Tergugat melakukan kesepakatan lisan
mengenai suatu hal. Pada tanggal 10 Februari 2024, terjadi perselisihan antara
kedua pihak mengenai pelaksanaan kesepakatan tersebut. Penggugat menyatakan
telah dirugikan sebesar Rp 50.000.000 akibat tindakan Tergugat.

Pada tanggal 1 Maret 2024, Penggugat mengirimkan surat kepada Tergugat. Pada
tanggal 15 Maret 2024, Tergugat membalas surat tersebut. Saksi Citra Dewi
mengetahui peristiwa ini. Saksi Doni Pratama juga hadir pada saat kejadian.

Berdasarkan uraian di atas, Tergugat memohon kepada Pengadilan untuk menolak
gugatan Penggugat seluruhnya.
`.trim();

const tanahSertifikatSengketa = `
GUGATAN PERDATA — SENGKETA HAK ATAS TANAH

Perkara diajukan oleh Penggugat, pemegang Sertifikat Hak Milik (SHM) Nomor
00512/Kelurahan Sukamaju, terhadap Tergugat yang menduduki dan mendirikan
bangunan di atas bidang tanah seluas 480 m2 yang sama, berdasarkan Sertifikat
Hak Milik (SHM) Nomor 00789/Kelurahan Sukamaju yang diterbitkan belakangan
oleh Kantor Pertanahan setempat.

Penggugat memperoleh SHM 00512 pada tanggal 12 Maret 2015 melalui jual beli
dengan Akta Jual Beli Notaris Nomor 45/2015, yang telah didaftarkan dan
dicatat dalam buku tanah Kantor Pertanahan Kabupaten. Tergugat memperoleh SHM
00789 pada tanggal 3 Juni 2020, tanpa proses pengukuran ulang batas bidang
tanah yang bersinggungan dengan sertifikat Penggugat yang sudah terdaftar
lebih dahulu.

Pada tanggal 20 Januari 2024, Penggugat mengetahui Tergugat mulai mendirikan
pagar dan pondasi bangunan di atas bidang tanah tersebut. Penggugat telah
melayangkan somasi tertulis pada tanggal 5 Februari 2024, namun Tergugat tidak
menanggapi dan melanjutkan pembangunan.

Penggugat memohon kepada Pengadilan untuk menyatakan SHM Nomor 00512 sebagai
alas hak yang sah, membatalkan SHM Nomor 00789 sepanjang bertampalan dengan
bidang tanah Penggugat, dan memerintahkan Tergugat mengosongkan bidang tanah
dimaksud.
`.trim();

const thinEarlyStageNarrative = `
Klien datang menceritakan ada masalah dengan tetangga soal batas tanah.
Belum ada dokumen yang dibawa. Klien mengatakan akan mencari sertifikat di
rumah dan kembali lagi minggu depan.
`.trim();

export const fixtures: CorpusFixture[] = [
  {
    id: 'litigation-ambiguous-domain',
    description: 'High-stakes JAWABAN with generic, non-domain-specific facts — the v691 readiness/domain-routing contradiction repro.',
    input: {
      title: 'Regression corpus: ambiguous-domain litigation submission',
      narrative: litigationAmbiguousDomain,
      input_type: 'narrative',
      regulatory_mode: 'offline',
    },
  },
  {
    id: 'tanah-sertifikat-ganda',
    description: 'Well-specified land/title dispute (overlapping SHM certificates) — a clean, confidently-routable domain path.',
    input: {
      title: 'Regression corpus: overlapping land certificate dispute',
      narrative: tanahSertifikatSengketa,
      input_type: 'narrative',
      regulatory_mode: 'offline',
    },
  },
  {
    id: 'thin-early-stage-intake',
    description: 'Minimal, pre-document client intake narrative — locks behavior at the low end of the evidence spectrum.',
    input: {
      title: 'Regression corpus: thin early-stage intake',
      narrative: thinEarlyStageNarrative,
      input_type: 'narrative',
      regulatory_mode: 'offline',
    },
  },
  {
    id: 'document-manual-review-required',
    description: 'Narrative paired with a document_ingestion result flagged manual_review_required — locks the ingestion-quality readiness floor (caseAnalysis.ts ingestionFloor / evidenceScore).',
    input: {
      title: 'Regression corpus: low-confidence OCR ingestion',
      narrative: tanahSertifikatSengketa,
      input_type: 'narrative+document',
      regulatory_mode: 'offline',
      document_ingestion: {
        text: [1,2,4,5,6].map((page)=>`--- HALAMAN ${page} ---\n${tanahSertifikatSengketa}`).join('\n\n'),
        mode: 'LOCAL_OCR',
        pages_total: 6,
        pages_ocr: 5,
        coverage_ratio: 0.62,
        manual_review_required: true,
        average_ocr_confidence: 58,
        page_confidences: [
          { page: 1, confidence: 61, status: 'OK' },
          { page: 2, confidence: 55, status: 'OK' },
          { page: 3, confidence: 0, status: 'FAILED' },
        ],
        failed_pages: [3],
        warning: 'OCR lokal membaca 5/6 halaman. Halaman gagal: 3. Confidence rata-rata 58%; halaman gagal wajib diperiksa manual.',
      },
    },
  },
];
