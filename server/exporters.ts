import { Buffer } from 'node:buffer';

const NAVY = '1B365D';
const GOLD = 'EAAA00';
const LIGHT = 'F3F5F7';
const MID = 'D8DEE8';
const DARK = '1A1A1A';
const RED = 'B42318';
const GREEN = '16825D';

function clean(value: unknown): string {
  const text = String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\uFFFD+/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) return '';
  const sample = text.slice(0, 8000);
  const suspicious = (sample.match(/[?]{4,}|[^\x09\x0A\x20-\x7E\u00A0-\u024F]/g) || []).length;
  if (sample.length > 80 && suspicious / sample.length > 0.08)
    return '[DATA SUMBER TIDAK VALID / TERDETEKSI BINARY - lakukan analisis ulang dari dokumen yang dapat dibaca]';
  return text;
}
function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function verificationStatus(analysis: any): string {
  const note = clean(analysis?.verification_note);
  return /pending|menunggu|belum|perlu verifikasi/i.test(note) ? 'MENUNGGU VERIFIKASI' : 'VERIFIKASI PROFESIONAL DIPERLUKAN';
}
function methodLabel(analysis: any): string {
  return clean(analysis?.analysis_method || analysis?.method || 'Structured Legal Analysis / IRAC');
}
function readingStatus(analysis: any): string {
  if (analysis?.reading_status) return clean(analysis.reading_status);
  const d = analysis?.document_reading || {};
  const read = Number(d.segments_read || 0), total = Number(d.segments_total || 0);
  const status = humanizeStatus(d.status || '');
  if (total > 0) {
    const unit = Number(analysis?.document_ingestion?.pages_total || 0) > 0 ? 'halaman' : 'bagian';
    const cc = Number(d.char_coverage_ratio || 1);
    const failed = Array.isArray(d.failed_pages) && d.failed_pages.length ? ` • OCR gagal hlm ${d.failed_pages.join(', ')}` : '';
    return `${status || 'Pembacaan'} - ${read}/${total} ${unit}${d.coverage_ratio && Number(d.coverage_ratio) < .999 ? ` (${Math.round(Number(d.coverage_ratio) * 100)}% page coverage)` : ''}${cc < .999 ? ` • ${Math.round(cc * 100)}% karakter disintesis` : ''}${failed}`;
  }
  return 'Status pembacaan belum tersedia';
}
function titleOf(analysis: any): string { return clean(analysis?.title) || 'Analisis Dokumen Hukum'; }
function reasoningAttemptLines(analysis: any): string[] {
  const attempts = analysis?.analysis_provenance?.attempts;
  if (!Array.isArray(attempts) || !attempts.length) return [];
  return attempts.map((a: any, i: number) =>
    `${i + 1}. [${clean(a?.status || 'UNKNOWN')}] ${clean(a?.model || '-')} (${Math.round(Number(a?.duration_ms || 0))}ms)${a?.detail ? ` - ${clean(a.detail)}` : ''}`
  );
}

type ReasoningStatus = 'READY' | 'DEGRADED' | 'DEGRADED_FALLBACK' | 'UNKNOWN';

function normalizedReasoningStatus(analysis: any): ReasoningStatus {
  const raw = clean(analysis?.analysis_provenance?.status || analysis?.reasoning_status || '').toUpperCase();
  if (raw === 'READY') return 'READY';
  // DEGRADED_FALLBACK is retained only as a legacy persisted value.
  if (raw === 'DEGRADED_FALLBACK') return 'DEGRADED_FALLBACK';
  if (raw === 'DEGRADED') return 'DEGRADED';
  return 'UNKNOWN';
}

function isDegradedReasoning(analysis: any): boolean {
  const status = normalizedReasoningStatus(analysis);
  return status === 'DEGRADED' || status === 'DEGRADED_FALLBACK';
}

function degradedReasoningWarning(analysis: any): string {
  const status = normalizedReasoningStatus(analysis);
  if (status === 'DEGRADED_FALLBACK') {
    return 'PERINGATAN: Status penalaran menggunakan nilai kompatibilitas lama. Kertas kerja ini belum final dan wajib ditinjau ulang setelah penalaran berstatus siap.';
  }
  return 'PERINGATAN: Status penalaran memerlukan tinjauan. Kertas kerja ini belum final; kekurangan data dan pemeriksaan yang belum selesai harus dituntaskan sebelum digunakan sebagai analisis final.';
}

// ---------- V5.5 pipeline & workflow helpers (shared by text/pdf/docx) ----------

function pipelineGateLabel(analysis: any): string {
  const g = analysis?.pipeline_gate_readiness || analysis?.pipeline_gate || {};
  const rawStatus = String(g.status || '').toUpperCase();
  if (!rawStatus) return 'UNKNOWN';
  const score = Math.round(Number(g.score ?? analysis?.pipeline_gate?.score ?? 0));
  return `${rawStatus === 'READY' ? 'PASS' : rawStatus === 'DEGRADED' ? 'DEGRADED' : 'FAIL'} - ${score}%`;
}
function workingPaperReadinessScore(analysis: any): number {
  return Math.max(0, Math.min(100, Math.round(Number(
    analysis?.working_paper_readiness?.score ?? analysis?.case_working_paper?.working_paper_percentage?.percentage ?? analysis?.case_readiness?.overall_score ?? 0
  ))));
}
function analysisReadinessScore(analysis: any): number {
  const explicit = analysis?.analysis_readiness?.score ?? analysis?.analysis_readiness?.overall_score;
  if (explicit != null && Number.isFinite(Number(explicit))) return Math.max(0, Math.min(100, Math.round(Number(explicit))));
  const pipeline = Math.max(0, Math.min(100, Math.round(Number(analysis?.pipeline_gate?.score || 0))));
  return Math.min(pipeline, workingPaperReadinessScore(analysis));
}
function analysisReadinessReady(analysis: any): boolean {
  const explicitStatus = String(analysis?.analysis_readiness?.status || '').toUpperCase();
  if (explicitStatus) return explicitStatus === 'READY';
  return String(analysis?.pipeline_gate?.status || '').toUpperCase() === 'READY' && analysisReadinessScore(analysis) >= 80;
}
function analysisReadinessLabel(analysis: any): string {
  return `${analysisReadinessReady(analysis) ? 'Siap' : 'Perlu Tinjauan'} - ${analysisReadinessScore(analysis)}%`;
}
function pipelineGateSummary(analysis: any): string {
  const g = analysis?.pipeline_gate || {};
  if (!g.status) return '';
  return g.status === 'READY'
    ? `Pipeline gate internal lolos (${Math.round(Number(g.score || 0))}%). Kematangan kertas kerja dinilai terpisah.`
    : `Satu atau lebih pipeline gate internal belum lolos (${Math.round(Number(g.score || 0))}%).`;
}
function pipelineTraceRows(analysis: any): Array<{ label: string; status: string; ms: number; detail: string }> {
  const trace = Array.isArray(analysis?.pipeline_trace) ? analysis.pipeline_trace : [];
  return trace.map((s: any) => ({
    label: humanizeWorkflowText(s.label || humanizePipelineStage(s.id)),
    status: clean(String(s.status || 'DONE').toUpperCase()),
    ms: Math.round(Number(s.ms || 0)),
    detail: clean(s.detail || ''),
  }));
}
function humanizePipelineStage(id: any): string {
  const map: Record<string, string> = {
    ingest: 'Memeriksa cakupan dokumen',
    page_split: 'Memisahkan halaman sumber',
    role_classify: 'Mengklasifikasi peran sumber',
    evidence_model: 'Membangun evidence model',
    fact_claim_split: 'Memisahkan fakta dan klaim',
    actor_extract: 'Mengekstrak aktor',
    timeline_extract: 'Menyusun kronologi',
    anomaly_detect: 'Mendeteksi anomali',
    adverse_evidence: 'Menyiapkan adverse evidence',
    domain_route: 'Menentukan domain hukum',
    issue_graph: 'Menyusun isu hukum',
    query_build: 'Menyusun query hukum',
    law_discover: 'Menemukan kandidat hukum',
    identity_gate: 'Menyaring identitas instrumen',
    nexus_gate: 'Menyaring material nexus',
    forensic_reason: 'Menalar secara forensik',
    risk_score: 'Menghitung skor risiko',
    pipeline_gate: 'Menjalankan pipeline gate',
    working_paper: 'Menyusun kertas kerja',
  };
  return map[String(id || '')] || String(id || '').replaceAll('_', ' ');
}
function humanizeSourceRole(r: any): string {
  const map: Record<string, string> = {
    PLEADING_OR_SUBMISSION: 'Pengajuan / dokumen litigasi pihak',
    LITIGATION_SUBMISSION: 'Dokumen litigasi / pengajuan pihak',
    DEFENSE_SUBMISSION_WITH_EXHIBITS: 'Pembelaan dengan lampiran bukti',
    COMPLAINT_OR_PETITION: 'Pengaduan / permohonan',
    ADJUDICATIVE_DECISION: 'Putusan / penetapan',
    INVESTIGATION_OR_BAP: 'Berita Acara Pemeriksaan / BAP',
    CASE_NARRATIVE_OR_QUESTION: 'Narasi / pertanyaan klien',
    CONTRACT_OR_AGREEMENT: 'Kontrak / perjanjian',
    LEGAL_CORRESPONDENCE: 'Korespondensi hukum',
    MIXED_CASE_MATERIAL: 'Materi campuran — belum terklasifikasi',
    MIXED_OR_UNCLASSIFIED_SOURCE: 'Sumber campuran / belum terklasifikasi',
  };
  return map[String(r || '')] || String(r || '-').replaceAll('_', ' ');
}


function humanizeStatus(value: unknown): string {
  const raw = clean(value).toUpperCase();
  const map: Record<string, string> = {
    READY: 'Siap',
    DONE: 'Selesai',
    PARTIAL: 'Sebagian',
    DEGRADED: 'Perlu Tinjauan',
    DEGRADED_FALLBACK: 'Perlu Tinjauan',
    PENDING: 'Menunggu',
    UNKNOWN: 'Belum tersedia',
    HIGH: 'Tinggi',
    MEDIUM: 'Sedang',
    LOW: 'Rendah',
    PRIMARY: 'Utama',
    SECONDARY: 'Sekunder',
    NEUTRAL: 'Netral',
    FOREIGN: 'Di luar domain utama',
    SUBSTANTIVE: 'Substantif',
    PROCEDURAL: 'Prosedural',
    ADMINISTRATIVE: 'Administratif',
    EVIDENTIARY: 'Pembuktian',
    JURISDICTIONAL: 'Yurisdiksi',
    BACKGROUND: 'Latar belakang',
    LITIGATION_SUBMISSION: 'Dokumen litigasi / pengajuan pihak',
    READABLE: 'Terbaca',
    CIVIL_PLAINTIFF: 'Penggugat Perdata',
    CIVIL_DEFENDANT: 'Tergugat Perdata',
    CLAIMANT: 'Pemohon / Penggugat',
    RESPONDENT: 'Termohon / Tergugat',
  };
  return map[raw] || clean(value);
}

function humanizeEvidenceTag(value: unknown): string {
  const s = clean(value);
  if (!s) return '';
  return s
    .replace(/\[(FAKTA|KLAIM|REFERENSI|BUKTI LAWAN|ANOMALI)\s+H(\d+):\s*"([\s\S]*?)"\]/gi, (_m, kind, page, quote) => {
      const labels: Record<string,string> = {
        FAKTA: 'fakta',
        KLAIM: 'klaim',
        REFERENSI: 'bahan referensi',
        'BUKTI LAWAN': 'bukti lawan',
        ANOMALI: 'anomali',
      };
      return `Rujukan ${labels[String(kind).toUpperCase()] || String(kind).toLowerCase()}, halaman ${page}: "${clean(quote)}"`;
    })
    .replace(/\bNAMED_PERSON\b/g, 'Individu teridentifikasi')
    .replace(/\bNAMED_PARTY\b/g, 'Pihak teridentifikasi');
}

function humanizeBlocker(value: unknown): string {
  const s = clean(value);
  if (!s) return '';
  if (/adverse_evidence_analyzed/i.test(s)) {
    const specific = s.match(/\bspecific=(\d+)/i)?.[1] || '0';
    const total = s.match(/\btotal=(\d+)/i)?.[1] || '0';
    return `Analisis bukti yang merugikan atau bukti tandingan belum memadai (spesifik ${specific}; total ${total}).`;
  }
  return humanizePipelineDetail(
    s
      .replace(/\brole=([A-Z_]+)/gi, (_m, v) => `peran dokumen=${humanizeSourceRole(v)}`)
      .replace(/_/g, ' ')
  );
}

function humanizeWorkflowText(value: unknown): string {
  let s = clean(value);
  const pairs: Array<[RegExp, string]> = [
    [/\bCIVIL_PLAINTIFF\b/g, 'Penggugat Perdata'],
    [/\bCIVIL_DEFENDANT\b/g, 'Tergugat Perdata'],
    [/\bAssessing Case Role\b/gi, 'Menilai Posisi Perkara'],
    [/\bOrganizing Legal Facts & Chronology\b/gi, 'Menyusun Fakta Hukum & Kronologi'],
    [/\bEvaluating Allegations & Counter-Arguments\b/gi, 'Menilai Dalil & Tanggapan Lawan'],
    [/\bExamining Authority & Operational Duties\b/gi, 'Menilai Kewenangan & Kewajiban Hukum'],
    [/\bEvaluating Financial & Collateral Data\b/gi, 'Menilai Data Keuangan & Agunan'],
    [/\bReviewing Document Integrity & Procedure\b/gi, 'Menelaah Integritas Dokumen & Prosedur'],
    [/\bPlanning Witness & Expert Strategy\b/gi, 'Menyusun Strategi Saksi & Ahli'],
    [/\bDrafting Legal Response\b/gi, 'Menyusun Dokumen Hukum'],
    [/\bVerifying Sources, Citations & Next Step\b/gi, 'Memverifikasi Sumber, Rujukan & Langkah Lanjut'],
    [/\bCase role assessment\b/gi, 'Penilaian posisi perkara'],
    [/\bMandate boundary\b/gi, 'Batas mandat'],
    [/\bImmediate defense\/claim objectives\b/gi, 'Tujuan langsung pembelaan/klaim'],
    [/\bSubstantive risk matrix\b/gi, 'Matriks risiko substantif'],
    [/\bSource-role uncertainty\b/gi, 'Ketidakpastian peran dokumen'],
    [/\bDocument ingestion\b/gi, 'Pembacaan dokumen'],
    [/\bPrimary\b/gi, 'Domain utama'],
    [/\bsecondary\b/gi, 'domain pendukung'],
    [/\balternative domain\b/gi, 'domain alternatif'],
    [/\bcorroboration\b/gi, 'penguatan bukti'],
    [/\bmissing\/unknown\b/gi, 'data belum tersedia'],
    [/\btempus\b/gi, 'kesesuaian waktu berlaku'],
    [/\bfiling\b/gi, 'penggunaan dalam dokumen perkara'],
    [/\bremedy\b/gi, 'upaya hukum'],
    [/\bissue spotting\b/gi, 'identifikasi isu'],
    [/\bissue working hypothesis\b/gi, 'hipotesis kerja atas isu'],
    [/\beffective date\b/gi, 'tanggal berlaku'],
    [/\bREADY\b/g, 'Siap'],
    [/\bPARTIAL\b/g, 'Sebagian'],
    [/\bHIGH\b/g, 'Tinggi'],
    [/\bMEDIUM\b/g, 'Sedang'],
    [/\bLOW\b/g, 'Rendah'],
    [/\bOUTPUT\b/g, 'HASIL'],
    [/\bcivil plaintiff\b/gi, 'penggugat perdata'],
    [/\bcivil defendant\b/gi, 'tergugat perdata'],
    [/\bpleading\b/gi, 'tahap jawab-menjawab/pengajuan'],
    [/\bappeal\b/gi, 'tahap upaya hukum'],
    [/\bexecution\b/gi, 'tahap eksekusi'],
    [/\binvestigation\b/gi, 'tahap penyidikan'],
    [/\bprosecution\b/gi, 'tahap penuntutan'],
    [/\bevidence hearing\b/gi, 'tahap pembuktian'],
    [/\bpre litigation\b/gi, 'tahap pra-litigasi'],
    [/\bconsultation\b/gi, 'tahap konsultasi/penelaahan awal'],
    [/\bFact table\b/gi, 'Matriks fakta'],
    [/\bActor-action-evidence matrix\b/gi, 'Matriks aktor-tindakan-bukti'],
    [/\bChronology\b/gi, 'Kronologi'],
    [/\bSource inventory\b/gi, 'Daftar sumber'],
    [/\b(?:Coverage gaps|cakupan dokumen gaps)\b/gi, 'Dokumen yang belum tersedia'],
    [/\bProfessional verification queue\b/gi, 'Daftar verifikasi profesional'],
    [/\bVerification queue\b/gi, 'Hal yang perlu diverifikasi'],
    [/\bAllegation-response matrix\b/gi, 'Matriks dalil dan tanggapan'],
    [/\bElement-by-element defense\/claim map\b/gi, 'Pemetaan unsur per isu'],
    [/\bAdverse-evidence treatment\b/gi, 'Analisis bukti yang merugikan'],
    [/\bDocument integrity checklist\b/gi, 'Daftar pemeriksaan integritas dokumen'],
    [/\bProcedure exceptions\b/gi, 'Catatan prosedural'],
    [/\bCitation\/source verification\b/gi, 'Verifikasi rujukan hukum'],
    [/\bAuthority-duty module intentionally limited [-—] no formal-authority actor detected\.?/gi, 'Analisis kewenangan jabatan formal tidak menjadi fokus karena dokumen yang tersedia belum menunjukkan aktor dengan kewenangan formal yang perlu diuji.'],
    [/\bFinancial audit intentionally inactive [-—] no financial\/collateral content in source\.?/gi, 'Audit keuangan atau agunan tidak menjadi fokus karena dokumen yang tersedia belum menunjukkan hubungan finansial yang perlu diuji.'],
    [/\bWitness\/expert plan intentionally deferred [-—] no explicit witness or expert need detected\.?/gi, 'Strategi saksi atau ahli belum diprioritaskan karena kebutuhan spesifiknya belum tampak dari dokumen yang tersedia.'],
    [/\bDelegation\/approval verification\b/gi, 'Verifikasi delegasi dan persetujuan'],
    [/\bScope-of-authority verification\b/gi, 'Verifikasi ruang lingkup kewenangan'],
    [/\bWitness map with category & caution\b/gi, 'Peta saksi dan catatan kehati-hatian'],
    [/\bQuestion themes\b/gi, 'Tema pertanyaan'],
    [/\bExpert recommendation\b/gi, 'Rekomendasi ahli'],
    [/\bChronology memo\b/gi, 'Memo kronologi'],
    [/\bEvidence map\b/gi, 'Peta pembuktian'],
    [/\bLegal response\/objection\/defense outline\b/gi, 'Kerangka tanggapan, keberatan, atau pembelaan'],
    [/\bWitness question set\b/gi, 'Daftar pertanyaan saksi'],
    [/\bCritical unresolved questions\b/gi, 'Pertanyaan penting yang belum terjawab'],
    [/\bNext-action priorities\b/gi, 'Prioritas langkah lanjutan'],
    [/\bProfessional\s+Hal yang perlu diverifikasi\b/gi, 'Daftar verifikasi profesional'],
    [/\bProfessional\b/gi, 'Profesional'],
    [/\bauthority\b/gi, 'dasar hukum'],
    [/\bdrafting\b/gi, 'penyusunan dokumen hukum'],
    [/\bevidence support\b/gi, 'bukti pendukung'],
    [/\ballegation-response matrix\b/gi, 'matriks dalil dan tanggapan'],
    [/\bfact matrix\b/gi, 'matriks fakta'],
    [/\bprocedural stage\b/gi, 'tahap prosedural'],
    [/\bposture\b/gi, 'tahap perkara'],
    [/\bissues\b/gi, 'isu'],
    [/\bPertanyaan review\b/gi, 'Pertanyaan penelaahan'],
    [/\btimeline\b/gi, 'kronologi'],
    [/\bsource verification\b/gi, 'verifikasi sumber'],
    [/\bprocedural posture\b/gi, 'tahap prosedural'],
    [/\bverified citations\b/gi, 'rujukan hukum terverifikasi'],
    [/\badverse evidence\b/gi, 'bukti yang merugikan'],
    [/\blegal elements\b/gi, 'unsur hukum'],
  ];
  for (const [rx, replacement] of pairs) s = s.replace(rx, replacement);
  return cleanExportNarrative(s).replace(/\s{2,}/g, ' ').trim();
}

function humanizePipelineDetail(value: unknown): string {
  let s = clean(value);
  if (!s) return '';

  const replacements: Array<[RegExp, string | ((...args: any[]) => string)]> = [
    [/\bchars=(\d+)\b/gi, (_m: string, n: string) => `${Number(n).toLocaleString('id-ID')} karakter dibaca`],
    [/\bconfidence=(HIGH|MEDIUM|LOW)\b/gi, (_m: string, v: string) => `tingkat keyakinan ${humanizeStatus(v).toLowerCase()}`],
    [/\bconfidence=(\d+(?:\.\d+)?)\b/gi, (_m: string, v: string) => `tingkat keyakinan ${v}`],
    [/\bsecondary=(\d+)\b/gi, (_m: string, n: string) => `${n} domain sekunder`],
    [/\bissues=(\d+)\b/gi, (_m: string, n: string) => `${n} isu`],
    [/\blocal_candidates=(\d+)\b/gi, (_m: string, n: string) => `${n} kandidat corpus lokal`],
    [/\bstrict=(\d+)\b/gi, (_m: string, n: string) => `${n} kandidat lolos penyaringan`],
    [/\bfallback=(true|false)\b/gi, (_m: string, v: string) => v.toLowerCase() === 'true' ? 'jalur cadangan digunakan' : 'tanpa jalur cadangan'],
    [/\bforum=([A-Z_]+)\b/gi, (_m: string, v: string) => `forum ${humanizeStatus(v).toLowerCase()}`],
    [/\bregime=([A-Z_]+)\b/gi, (_m: string, v: string) => `rezim ${v === 'CIVIL' ? 'perdata' : humanizeStatus(v).toLowerCase()}`],
    [/\bpages=(\d+)\b/gi, (_m: string, n: string) => `${n} halaman`],
    [/\brepresented=(\d+)\b/gi, (_m: string, n: string) => `${n} halaman terwakili`],
    [/\bfacts=(\d+)\b/gi, (_m: string, n: string) => `${n} fakta tekstual`],
    [/\bclaims=(\d+)\b/gi, (_m: string, n: string) => `${n} klaim/dalil`],
    [/\bqueries=(\d+)\b/gi, (_m: string, n: string) => `${n} query hukum`],
    [/\bcandidates=(\d+)\b/gi, (_m: string, n: string) => `${n} kandidat hukum`],
    [/\busable=(\d+)\b/gi, (_m: string, n: string) => `${n} kandidat dapat digunakan`],
    [/\brejected=(\d+)\b/gi, (_m: string, n: string) => `${n} kandidat ditolak`],
    [/\breasoning_candidates=(\d+)\b/gi, (_m: string, n: string) => `${n} kandidat norma untuk penalaran`],
    [/\bstatus=(READY|DONE|PARTIAL|DEGRADED|DEGRADED_FALLBACK|PENDING|UNKNOWN)\b/gi, (_m: string, v: string) => `status ${humanizeStatus(v).toLowerCase()}`],
    [/\bstages=(\d+)\b/gi, (_m: string, n: string) => `${n} tahap kerja`],
    [/\bmatrix=(\d+)\b/gi, (_m: string, n: string) => `${n} baris matriks`],
    [/\brisks=(\d+)\b/gi, (_m: string, n: string) => `${n} risiko`],
    [/\boverall=(\d+)\b/gi, (_m: string, n: string) => `skor keseluruhan ${n}`],
    [/\breadiness=(\d+)\b/gi, (_m: string, n: string) => `kesiapan ${n}%`],
    [/\bgate=(READY|DEGRADED|DEGRADED_FALLBACK)\b/gi, (_m: string, v: string) => `status analisis ${humanizeStatus(v).toLowerCase()}`],
    [/\bscore=(\d+)\b/gi, (_m: string, n: string) => `skor kesiapan ${n}%`],
  ];

  for (const [rx, replacement] of replacements) s = s.replace(rx, replacement as any);
  return s.replace(/\s*;\s*/g, '; ').replace(/\s{2,}/g, ' ').trim();
}


function softenQuotedTruncation(value: string): string {
  return value.replace(/"([^"\n]{96,})"/g, (_m, inner) => {
    const t = String(inner).trim();
    if (!t || /[.!?:;)]$/.test(t) || /\.\.\.$/.test(t)) return `"${t}"`;
    return `"${t.replace(/[\s,;:-]+$/g, '')}..."`;
  });
}
function normalizePresentationPunctuation(value: string): string {
  return value
    .replace(/\.\s*;+/g, ';')
    .replace(/;\s*\./g, ';')
    .replace(/\.{2,}(?!\.)/g, '.')
    .replace(/;\s*;/g, ';')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])(?=[A-Za-zÀ-ÿ])/g, '$1 ')
    .trim();
}

function cleanExportNarrative(value: unknown): string {
  let s = humanizeEvidenceTag(value);
  if (!s) return '';

  // Compact binding tags -> professional reader-facing prose.
  s = s.replace(
    /\[(CORPUS|ONLINE)\s*[·|;]\s*(HIGH|MEDIUM|LOW)\s*[·|;]\s*domain=(PRIMARY|SECONDARY|NEUTRAL|FOREIGN)\s*[·|;]\s*fn=(SUBSTANTIVE|PROCEDURAL|ADMINISTRATIVE|EVIDENTIARY|JURISDICTIONAL|BACKGROUND)\s*[·|;]\s*bind=\d+\]/gi,
    (_m, source) =>
      `(${source === 'CORPUS' ? 'basis regulasi internal' : 'sumber resmi daring'})`
  );

  // Internal scoring/telemetry that must never appear in a client-facing working paper.
  s = s
    .replace(/\bStage1\s*=\s*\d+\s*[·|,;]?\s*/gi, '')
    .replace(/\bMaterial\s*=\s*\d+\s*[·|,;]?\s*/gi, '')
    .replace(/\bAnchor\s*=\s*\d+\s*[·|,;]?\s*/gi, '')
    .replace(/\bIssue\s*=\s*\d+\s*[·|,;]?\s*/gi, '')
    .replace(/\bFrase(?:\s+isu)?\s*=\s*\d+\s*[·|,;]?\s*/gi, '')
    .replace(/\bDomain\s+P\/S\/F\s*=\s*\d+\/\d+\/\d+\s*\.?/gi, '')
    .replace(/\bmargin\s*=\s*\d+\b/gi, '')
    .replace(/\bmissing\/unknown\s*=\s*\d+\b/gi, '')
    .replace(/\bscore\s*=\s*\d+\b/gi, '')
    .replace(/\bconfidence\s*=\s*([A-Z_]+|\d+(?:\.\d+)?)\b/gi, (_m, v) => {
      const hv = humanizeStatus(v);
      return /^\d/.test(String(v)) ? `tingkat keyakinan ${v}` : `tingkat keyakinan ${hv.toLowerCase()}`;
    })
    .replace(/\bsource\s+role\s*=\s*LITIGATION_SUBMISSION\b/gi, 'jenis dokumen: dokumen litigasi/pengajuan pihak')
    .replace(/\bLITIGATION_SUBMISSION\b/g, 'dokumen litigasi/pengajuan pihak')
    .replace(/\bPrimary\s*=\s*/gi, 'Domain utama: ')
    .replace(/\bprimary\s+domain\s*=\s*/gi, 'domain utama: ')
    .replace(/\bsecondary\s*=\s*/gi, 'domain pendukung: ')
    .replace(/\bsecondary\/alternative\s+domain\b/gi, 'domain pendukung atau alternatif')
    .replace(/\bPrimary domain\b/gi, 'Domain utama')
    .replace(/\bsecondary domain\b/gi, 'domain pendukung')
    .replace(/\bsubstantive rule\b/gi, 'kaidah hukum substantif')
    .replace(/\bprovenance\b/gi, 'sumber rujukan')
    .replace(/\bcoverage\b/gi, 'cakupan dokumen')
    .replace(/\bsignature\/approval\b/gi, 'tanda tangan dan persetujuan')
    .replace(/\bprocedural compliance\b/gi, 'kepatuhan prosedural')
    .replace(/\bcounter-evidence\b/gi, 'bukti tandingan')
    .replace(/\bRule\b/gi, 'Kaidah Hukum')
    .replace(/\bRetrieval\b/gi, 'Penelusuran hukum')
    .replace(/\bthreshold\b/gi, 'ambang')
    .replace(/\bnexus issue-specific\b/gi, 'keterkaitan khusus dengan isu')
    .replace(/\bissue-specific\b/gi, 'khusus dengan isu')
    .replace(/\bdomain-aligned\b/gi, 'selaras dengan domain perkara')
    .replace(/\bfunction-fit\b/gi, 'sesuai dengan fungsi norma')
    .replace(/\bmaterial-nexus\b/gi, 'keterkaitan material')
    .replace(/\bmaterial nexus\b/gi, 'keterkaitan material')
    .replace(/\bissue-anchored\b/gi, 'berbasis isu')
    .replace(/\bdomain-dominance ranking\b/gi, 'pemeringkatan kesesuaian domain')
    .replace(/\btempus\b/gi, 'kesesuaian waktu berlaku')
    .replace(/\bfiling\b/gi, 'penggunaan dalam dokumen perkara')
    .replace(/\bCounter-case\b/gi, 'Uji lawan')
    .replace(/\bcounter-reading\b/gi, 'pembacaan tandingan')
    .replace(/\bevidence support\b/gi, 'bukti pendukung')
    .replace(/\bcitation(?:s)?\b/gi, 'rujukan hukum')
    .replace(/\bpleading final\b/gi, 'dokumen perkara final')
    .replace(/\bposture\b/gi, 'tahap perkara')
    .replace(/\bworking paper\b/gi, 'kertas kerja')
    .replace(/\bissue working hypothesis\b/gi, 'hipotesis kerja atas isu')
    .replace(/\bissue spotting\b/gi, 'identifikasi isu')
    .replace(/\bremedy\b/gi, 'upaya hukum')
    .replace(/\blawyer\b/gi, 'advokat')
    .replace(/\bcorroboration\b/gi, 'penguatan bukti')
    .replace(/\breadable\b/gi, 'terbaca')
    .replace(/\beffective date\b/gi, 'tanggal berlaku')
    .replace(/\bcounter-evidence\b/gi, 'bukti tandingan')
    .replace(/\bRegulatory Corpus\b/gi, 'korpus regulasi internal')
    .replace(/\bcorpus\b/gi, 'korpus')
    .replace(/\b(HIGH|MEDIUM|LOW)\s+confidence\b/gi, (_m, v) => `tingkat keyakinan ${humanizeStatus(v).toLowerCase()}`)
    .replace(/\bdomain\s+(PRIMARY|SECONDARY|NEUTRAL|FOREIGN)\b/gi, (_m, v) => `${humanizeStatus(v).toLowerCase()}`)
    .replace(/\bfn=(SUBSTANTIVE|PROCEDURAL|ADMINISTRATIVE|EVIDENTIARY|JURISDICTIONAL|BACKGROUND)\b/gi, (_m, v) => `fungsi ${humanizeStatus(v).toLowerCase()}`)
    .replace(/\bdomain=(PRIMARY|SECONDARY|NEUTRAL|FOREIGN)\b/gi, (_m, v) => `${humanizeStatus(v).toLowerCase()}`)
    .replace(/\bbind=\d+\b/gi, '')
    .replace(/\bPOTENTIALLY_COMPATIBLE\b/g, 'kemungkinan sesuai dengan waktu peristiwa')
    .replace(/\bPOTENTIALLY_INCOMPATIBLE\b/g, 'kemungkinan tidak sesuai dengan waktu peristiwa')
    .replace(/\bUNVERIFIED\b/g, 'belum diverifikasi')
    .replace(/\bNexus substansi yang terdeteksi\s*:/gi, 'Keterkaitan dengan isu:')
    .replace(/\bnexus substansi\b/gi, 'keterkaitan dengan isu')
    .replace(/\bnexus faktual\b/gi, 'keterkaitan dengan fakta perkara')
    .replace(/\bclaim[- ]only\b/gi, 'masih berupa dalil pihak dan belum terverifikasi')
    .replace(/\bKLAIM KOSONG\b/gi, 'DALIL BELUM TERKONFIRMASI')
    .replace(/\bKesimpulan taktis sementara:\s*BERBASIS KLAIM\s*-\s*/gi, 'Penilaian sementara: masih berupa dalil pihak - ')
    .replace(/\bKesimpulan taktis sementara:\s*DIDUKUNG MATERI TEKSTUAL\s*-\s*/gi, 'Penilaian sementara: didukung dokumen yang tersedia - ')
    .replace(/\bKesimpulan taktis sementara:\s*CAMPURAN FAKTA\/KLAIM\s*-\s*/gi, 'Penilaian sementara: sebagian didukung fakta dokumen dan sebagian masih berupa dalil pihak - ')
    .replace(/\bKandidat yang ditemukan belum mempunyai keterkaitan material yang cukup spesifik dengan isu ini\.?/gi, 'Belum ditemukan dasar hukum yang cukup spesifik untuk diterapkan langsung pada isu ini.')
    .replace(/\bKandidat dari korpus internal dengan tingkat keyakinan (?:tinggi|sedang|rendah), terkait dengan domain (?:utama|pendukung)\.?/gi, 'Rujukan awal dari basis regulasi internal memiliki keterkaitan dengan isu yang dianalisis.')
    .replace(/\b\d+ pasal pada instrumen ini memuat istilah yang bersesuaian dengan isu\.?/gi, 'Pasal yang teridentifikasi memiliki keterkaitan tekstual dengan isu.')
    .replace(/\bIdentitas terbaca dari indeks otoritas resmi lokal \(snapshot katalog resmi\); belum diverifikasi langsung pada sesi ini\.?/gi, 'Identitas instrumen teridentifikasi dari katalog otoritas resmi; verifikasi langsung terhadap sumber resmi tetap diperlukan.')
    .replace(/\bsource quality\b/gi, 'kualitas sumber')
    .replace(/\bofficial identity\b/gi, 'identitas sumber hukum')
    .replace(/\bpipeline gate\b/gi, 'pemeriksaan kelengkapan analisis')
    .replace(/\bworking_paper\b/gi, 'kertas kerja')
    .replace(/\bregime_sync\b/gi, 'sinkronisasi rezim hukum')
    .replace(/\bquery hukum\b/gi, 'penelusuran dasar hukum')
    .replace(/\bSinyal domain\s*=\s*\d+\s*;\s*isu material\s*:/gi, 'Keterkaitan isu:')
    .replace(/\bFakta tekstual\s*=\s*(\d+)\s*;\s*klaim\s*=\s*(\d+)\s*;?\s*\.?/gi, (_m, facts, claims) => `Terdapat ${facts} fakta yang teridentifikasi dalam dokumen dan ${claims} dalil/klaim pihak.`)
    .replace(/\bPeristiwa bertanggal terdeteksi\s*=\s*(\d+)\.?/gi, (_m, n) => `Terdapat ${n} peristiwa bertanggal yang teridentifikasi.`)
    .replace(/\b(\d+) kandidat beridentitas dan tidak tertolak kesesuaian waktu berlaku tersedia;?/gi, (_m, n) => `Terdapat ${n} rujukan hukum yang teridentifikasi dan belum menunjukkan ketidaksesuaian waktu berlaku;`)
    .replace(/\b(\d+) kandidat beridentitas dan tidak tertolak tempus tersedia;?/gi, (_m, n) => `Terdapat ${n} rujukan hukum yang teridentifikasi dan belum menunjukkan ketidaksesuaian waktu berlaku;`)
    .replace(/\bVerifikasi authority final\b/gi, 'Verifikasi dasar hukum final')
    .replace(/\bisu dan authority yang terikat pada bukti\b/gi, 'isu dan dasar hukum yang didukung bukti')
    .replace(/\bdrafting\b/gi, 'penyusunan dokumen hukum')
    .replace(/\bProfessional\s+Hal yang perlu diverifikasi\b/gi, 'Daftar verifikasi profesional')
    .replace(/\bProfessional\b/gi, 'Profesional')
    .replace(/\bPENDING\b/gi, 'menunggu verifikasi')
    .replace(/\breasoning core\b/gi, 'proses analisis')
    .replace(/\bevidence-grounded\b/gi, 'berbasis bukti')
    .replace(/\bkandidat hukum\b/gi, 'rujukan hukum')
    .replace(/\bkandidat norma\b/gi, 'rujukan norma')
    .replace(/\bkandidat beridentitas\b/gi, 'rujukan hukum yang teridentifikasi')
    .replace(/\bkandidat\b/gi, 'rujukan')
    .replace(/\ballegation-response matrix\b/gi, 'matriks dalil dan tanggapan')
    .replace(/\bfact matrix\b/gi, 'matriks fakta')
    .replace(/\bprocedural stage\b/gi, 'tahap prosedural')
    .replace(/\bissues\b/gi, 'isu')
    .replace(/\bPertanyaan review\b/gi, 'Pertanyaan penelaahan')
    .replace(/\bgap pembuktian\b/gi, 'celah pembuktian')
    .replace(/Ni\s+Aovga\s+ara\s+Kuasa\s+Penggugat\s*\/\s*:?/gi, 'Kuasa Penggugat')
    .replace(/\bTerguagat\b/gi, 'Tergugat')
    .replace(/\bRekonyensi\b/gi, 'Rekonvensi')
    .replace(/\bmenjadiatas\b/gi, 'menjadi atas')
    .replace(/\[\s*DALIL BELUM TERKONFIRMASI\s*:[^\]]*\]/gi, 'Dalil ini masih memerlukan verifikasi bukti dokumen primer lebih lanjut.')
    .replace(/\bDALIL BELUM TERKONFIRMASI\b/gi, 'Dalil ini masih memerlukan verifikasi bukti dokumen primer lebih lanjut.')
    .replace(/\s*[→⇒⟶]\s*/g, ' → ')
    .replace(/\btahap\s+tahap\b/gi, 'tahap')
    .replace(/\bmasih\s+masih\b/gi, 'masih')
    .replace(/\bREADY\b/g, 'Siap')
    .replace(/\bPARTIAL\b/g, 'Sebagian')
    .replace(/\bDEGRADED_FALLBACK\b/g, 'Perlu Tinjauan')
    .replace(/\bDEGRADED\b/g, 'Perlu Tinjauan')
    .replace(/\bHIGH\b/g, 'Tinggi')
    .replace(/\bMEDIUM\b/g, 'Sedang')
    .replace(/\bLOW\b/g, 'Rendah')
    .replace(/\s+[·|]\s*(?=[.,;)]|$)/g, '')
    .replace(/\s*;\s*;/g, ';')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return normalizePresentationPunctuation(softenQuotedTruncation(s));
}

function humanizeProceduralStage(value: unknown): string {
  const raw = clean(value).toUpperCase();
  const map: Record<string,string> = {
    PRE_LITIGATION: 'Pra-litigasi',
    INVESTIGATION: 'Penyidikan',
    PROSECUTION: 'Penuntutan',
    EVIDENCE_HEARING: 'Pembuktian / pemeriksaan persidangan',
    PLEADING: 'Jawab-menjawab / pengajuan perkara',
    APPEAL: 'Upaya hukum',
    EXECUTION: 'Eksekusi',
    CONSULTATION: 'Konsultasi / penelaahan awal',
  };
  return map[raw] || humanizeStatus(value);
}

function lawyerFacingTitle(analysis: any): string {
  const raw = clean(titleOf(analysis));
  if (!raw || /^case analysis$/i.test(raw) || /^analisis kasus$/i.test(raw)) return 'Analisis Perkara';
  return raw;
}

function lawyerFacingDomains(analysis: any): { primary: string; secondary: string[] } {
  const domains = Array.isArray(analysis?.case_regulatory_snapshot?.domains) ? analysis.case_regulatory_snapshot.domains : [];
  const primary = clean(domains[0]?.label || '');
  const secondary = domains.slice(1).map((d: any) => clean(d?.label)).filter(Boolean);
  return { primary, secondary };
}

function lawyerFacingScope(analysis: any): string {
  const role = humanizeSourceRole(analysis?.source_role || analysis?.analysis_provenance?.source_role || analysis?.evidence_model?.source_role || '');
  const { primary, secondary } = lawyerFacingDomains(analysis);
  const stage = humanizeProceduralStage(analysis?.lawyer_workflow?.procedural_stage || '');
  const parts = [
    role ? `Dokumen sumber diklasifikasikan sebagai ${role.toLowerCase()}.` : '',
    primary ? `Fokus hukum utama berada pada ${primary}${secondary.length ? `, dengan isu pendukung pada ${secondary.join(' dan ')}` : ''}.` : '',
    stage && stage !== 'Belum tersedia' ? `Tahap perkara yang teridentifikasi: ${stage.toLowerCase()}.` : '',
    'Kertas kerja ini disusun untuk membantu penelaahan fakta, isu, dasar hukum, risiko, dan langkah tindak lanjut; kesimpulan final tetap memerlukan verifikasi dokumen primer dan sumber hukum resmi.',
  ];
  return parts.filter(Boolean).join(' ');
}

function lawyerFacingExecutiveSummary(analysis: any): string {
  const issues = (Array.isArray(analysis?.legal_issues) ? analysis.legal_issues : [])
    .map((x: any) => clean(x?.issue))
    .filter(Boolean)
    .slice(0, 4);
  const issueSentence = issues.length
    ? `Fokus analisis mencakup ${issues.map((x: string, i: number) => `${i + 1}) ${x}`).join(' ')}`
    : 'Fokus analisis mengikuti fakta, dalil, dan dokumen yang tersedia.';
  const verification = verificationStatus(analysis) === 'MENUNGGU VERIFIKASI'
    ? 'Beberapa fakta, dokumen, dan penerapan norma masih perlu dikonfirmasi sebelum digunakan sebagai pendapat hukum final.'
    : 'Verifikasi profesional tetap diperlukan sebelum dokumen digunakan untuk tindakan hukum final.';
  return `${issueSentence} ${verification}`;
}

function lawyerFacingReadinessNote(analysis: any): string {
  if (analysisReadinessReady(analysis)) return 'Analisis telah tersusun dan siap untuk penelaahan profesional sebelum digunakan sebagai dokumen hukum final.';
  return 'Analisis ini masih bersifat kertas kerja dan memerlukan penelaahan serta verifikasi profesional sebelum digunakan sebagai pendapat hukum final.';
}

function primaryLegalReferences(analysis: any): string[] {
  const rows = Array.isArray(analysis?.applicable_law) ? analysis.applicable_law : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of rows) {
    const reg = clean(x?.regulation || x?.source || x?.domain);
    const article = clean(x?.article || '');
    if (!reg) continue;
    const line = article && article !== '-' && !/PERLU VERIFIKASI/i.test(article) ? `${reg} - ${article}` : reg;
    const key = line.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(line); }
  }
  return out.slice(0, 12);
}

function professionalConclusions(analysis: any): string[] {
  const rows = Array.isArray(analysis?.legal_issues) ? analysis.legal_issues : [];
  const refs = primaryLegalReferences(analysis).slice(0, 4);
  const recommendations = (Array.isArray(analysis?.recommendations) ? analysis.recommendations : [])
    .map((x: any) => cleanExportNarrative(x).replace(/[.;]+$/g, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const stage = humanizeProceduralStage(analysis?.lawyer_workflow?.procedural_stage || '');

  const issueLabel = (x: any) => clean(x?.issue).replace(/\?+$/g, '').trim();
  const supported: string[] = [];
  const mixed: string[] = [];
  const claims: string[] = [];
  for (const row of rows) {
    const label = issueLabel(row);
    if (!label) continue;
    const conclusion = clean(row?.conclusion);
    if (/DIDUKUNG MATERI TEKSTUAL/i.test(conclusion)) supported.push(label);
    else if (/CAMPURAN FAKTA\s*\/\s*KLAIM/i.test(conclusion)) mixed.push(label);
    else if (/BERBASIS KLAIM|belum cukup untuk dinyatakan sebagai fakta hukum/i.test(conclusion)) claims.push(label);
  }

  const out: string[] = [];
  const focus = rows.map(issueLabel).filter(Boolean).slice(0, 3);
  if (focus.length) {
    out.push(`Berdasarkan dokumen yang tersedia, penilaian hukum sementara berfokus pada ${focus.map((x: string) => `"${x}"`).join(', ')}. Posisi akhir tetap bergantung pada verifikasi dokumen primer dan penerapan norma terhadap fakta perkara.`);
  }
  if (supported.length || mixed.length) {
    const parts: string[] = [];
    if (supported.length) parts.push(`isu yang telah memperoleh dukungan dokumen awal meliputi ${supported.slice(0, 3).map((x: string) => `"${x}"`).join(', ')}`);
    if (mixed.length) parts.push(`isu yang masih memuat campuran fakta dan dalil pihak meliputi ${mixed.slice(0, 2).map((x: string) => `"${x}"`).join(', ')}`);
    out.push(`${parts.join('; ')}. Bagian yang belum terkonfirmasi harus dipisahkan sebelum posisi hukum final ditetapkan.`);
  }
  if (claims.length) {
    out.push(`Isu ${claims.slice(0, 3).map((x: string) => `"${x}"`).join(', ')} masih bertumpu pada dalil pihak dan belum cukup untuk diperlakukan sebagai fakta hukum tanpa dukungan bukti primer atau bukti independen.`);
  }
  if (refs.length) {
    out.push(`Dasar hukum utama yang telah teridentifikasi meliputi ${refs.join('; ')}. Status berlaku, bunyi pasal, kesesuaian waktu, serta penerapannya terhadap fakta perkara tetap harus diverifikasi sebelum digunakan dalam dokumen hukum final.`);
  }
  if (stage && stage !== 'Belum tersedia' && stage !== 'Konsultasi / penelaahan awal') {
    out.push(`Perkara teridentifikasi berada pada tahap ${stage.toLowerCase()}; strategi dan penyusunan dokumen hukum harus tetap disesuaikan dengan posisi prosedural tersebut.`);
  }
  if (recommendations.length) {
    out.push(`Prioritas tindak lanjut: ${recommendations.join('; ')}.`);
  }
  if (!out.length) {
    out.push('Kesimpulan hukum final belum dapat dirumuskan dari materi yang tersedia. Verifikasi dokumen primer, dasar hukum, dan fakta material masih diperlukan sebelum tindakan hukum ditentukan.');
  }
  return out.slice(0, 6);
}

function professionalVerificationNote(analysis: any): string {
  const raw = clean(analysis?.verification_note || '');
  const note = cleanExportNarrative(raw);
  const technical = /pipeline|guard|nexus|candidate|kandidat|working_paper|claim-only|intentionally|pending|reasoning core|evidence-grounded|confidence|source role|diagnostik|telemetri/i;
  if (note && !technical.test(raw) && !technical.test(note)) return note;
  return 'Analisis ini disusun berdasarkan dokumen dan informasi yang tersedia. Sebelum digunakan untuk tindakan hukum, perlu dilakukan verifikasi terhadap dokumen asli, status dan bunyi norma, pasal yang relevan, yurisdiksi, forum, tenggang waktu, serta upaya hukum yang tersedia.';
}

// ---------- analysisToText ----------

export function analysisToText(analysis: any): string {
  const out: string[] = [
    titleOf(analysis),
    'LEXICORE - Laporan Analisis Perkara & Audit Hukum',
    `Status Penalaran: ${humanizeStatus(analysis?.analysis_provenance?.status || 'UNKNOWN')}`,
    `Kesiapan Analisis: ${analysisReadinessLabel(analysis)}`,
    `Jenis Dokumen: ${humanizeSourceRole(analysis?.source_role || analysis?.evidence_model?.source_role)}`,
    '',
  ];
  const section = (t: string, b?: unknown) => { const s = humanizeBlocker(b); if (s) out.push(t.toUpperCase(), s, ''); };
  const list = (t: string, a?: unknown[]) => {
    if (!Array.isArray(a) || !a.length) return;
    out.push(t.toUpperCase());
    a.forEach((x, i) => out.push(`${i + 1}. ${clean(x)}`));
    out.push('');
  };

  if (isDegradedReasoning(analysis)) {
    out.push(degradedReasoningWarning(analysis));
    const rl = reasoningAttemptLines(analysis);
    if (rl.length) {
      out.push('Riwayat percobaan reasoning core:');
      rl.forEach(line => out.push(`- ${line}`));
    }
    out.push('');
  }

  // Pipeline gate banner
  if (analysis?.pipeline_gate?.status) {
    out.push(`PIPELINE GATE: ${clean(analysis.pipeline_gate.status)} • ${Math.round(Number(analysis.pipeline_gate.score || 0))}%`);
    out.push(pipelineGateSummary(analysis));
    if (Array.isArray(analysis.pipeline_gate.blockers) && analysis.pipeline_gate.blockers.length) {
      out.push('Hal yang masih harus diselesaikan:');
      analysis.pipeline_gate.blockers.forEach((b: any) => out.push(`- ${humanizeBlocker(b)}`));
    }
    out.push('');
  }

  section('I. Konteks Perkara', analysis.summary);
  list('Fakta Material', analysis.facts);

  if (analysis.statement_buckets) {
    list('I-A. Fakta Tekstual', analysis.statement_buckets.textual_facts?.map((x: any) => `${clean(x.statement)} ${clean(x.evidence_tag)}`));
    list('I-B. Dalil/Klaim Pihak', analysis.statement_buckets.party_claims?.map((x: any) => `${clean(x.statement)} ${clean(x.evidence_tag)}`));
    list('I-C. Anomali/Kontradiksi', analysis.statement_buckets.anomalies?.map((x: any) => `${clean(x.statement)} ${clean(x.evidence_tag)}`));
  }

  // Pipeline trace
  const trace = pipelineTraceRows(analysis);
  if (trace.length) {
    out.push('I-D. JEJAK PROSES ANALISIS');
    trace.forEach((s, i) => out.push(`${String(i + 1).padStart(2, '0')}. ${s.label} - ${humanizeStatus(s.status)}${s.ms ? ` (${s.ms} ms)` : ''}${s.detail ? ` - ${humanizePipelineDetail(s.detail)}` : ''}`));
    out.push('');
  }

  { const rl = reasoningAttemptLines(analysis); if (rl.length) { out.push('REASONING CORE - RIWAYAT PERCOBAAN MODEL'); rl.forEach(l => out.push(l)); out.push(''); } }

  if (Array.isArray(analysis.actor_matrix) && analysis.actor_matrix.length) {
    out.push('MATRIKS AKTOR & STATUS HUKUM');
    analysis.actor_matrix.forEach((x: any) => out.push(`${clean(x.actor)} | ${clean(x.proven_status)} | ${clean(x.explicit_rights_obligations)} | ${clean(x.evidence_tag)}`));
    out.push('');
  }
  if (Array.isArray(analysis.verified_timeline) && analysis.verified_timeline.length) {
    out.push('KRONOLOGI TERPETAKAN (FAKTA/KLAIM)');
    analysis.verified_timeline.forEach((x: any) => out.push(`${clean(x.time)} | ${clean(x.event)} | ${clean(x.evidence_tag)}`));
    out.push('');
  }
  if (Array.isArray(analysis.legal_issues)) {
    out.push('II. ISU HUKUM');
    analysis.legal_issues.forEach((x: any, i: number) => {
      out.push(`${i + 1}. ${clean(x.issue)}`);
      if (x.rule) out.push(`Dasar / Kaidah Hukum: ${cleanExportNarrative(x.rule)}`);
      if (x.analysis) out.push(`Analisis: ${clean(x.analysis)}`);
      if (x.conclusion) out.push(`Kesimpulan: ${clean(x.conclusion)}`);
    });
    out.push('');
  }
  if (Array.isArray(analysis.applicable_law)) {
    out.push('III. DASAR HUKUM');
    analysis.applicable_law.forEach((x: any, i: number) => out.push(`${i + 1}. ${clean(x.regulation || x.source || x.domain)} ${clean(x.article)} - ${clean(x.relevance || x.status)}`));
    out.push('');
  }
  if (Array.isArray(analysis.legal_gaps) && analysis.legal_gaps.length) {
    out.push('III-A. BEDAH CELAH HUKUM & AMBIGUITAS');
    analysis.legal_gaps.forEach((x: any, i: number) => out.push(`${i + 1}. ${clean(x.gap)} | ${cleanExportNarrative(x.why_material)} | ${clean(x.evidence_tag)}`));
    out.push('');
  }
  if (Array.isArray(analysis.multi_path_diagnosis) && analysis.multi_path_diagnosis.length) {
    out.push('III-B. DIAGNOSIS MULTI-JALUR');
    analysis.multi_path_diagnosis.forEach((x: any, i: number) => out.push(`${i + 1}. ${clean(x.path)} [${clean(x.strength)}] | ${clean(x.legal_theory)} | ${cleanExportNarrative(x.application)} | Counter-case: ${cleanExportNarrative(x.counter_case)}`));
    out.push('');
  }
  if (Array.isArray(analysis.risk_matrix)) {
    out.push(`IV. MATRIKS RISIKO - ${Math.round(Number(analysis.overall_risk_score || 0))}/100`);
    analysis.risk_matrix.forEach((x: any, i: number) => out.push(`${i + 1}. [${clean(x.level)}] ${clean(x.clause)} | ${cleanExportNarrative(x.finding)} | Mitigasi: ${cleanExportNarrative(x.mitigation)}`));
    out.push('');
  }
  list('V. Argumen yang Menguatkan', analysis.arguments_for);
  list('Argumen Lawan / Kelemahan', analysis.arguments_against);
  section('VI. Skenario Terbaik', analysis.best_case);
  section('Skenario Terburuk', analysis.worst_case);
  list('VI-A. Adverse Evidence', (analysis.adverse_evidence || []).map((x: any) => `${clean(x.evidence_id)} hlm ${clean(x.page)} | ${clean(x.adverse_point)} | ${clean(x.analysis)}`));
  list('VII. Rencana Tindakan', analysis.recommendations);
  list('VII-A. Blank Spot Audit', analysis.blank_spot_questions);

  // Lawyer workflow (V5.5)
  const wf = analysis?.lawyer_workflow || {};
  if (wf.version) {
    out.push('IX. LAWYER WORKFLOW');
    out.push(`Orientasi: ${clean(wf.orientation)} | Pihak: ${clean(wf.represented_side_hint)} | Keyakinan: ${clean(wf.role_confidence)}`);
    if (wf.mandate_summary) out.push(`Mandat: ${clean(wf.mandate_summary)}`);
    out.push('');

    if (Array.isArray(wf.stages) && wf.stages.length) {
      out.push('IX-A. STAGES');
      wf.stages.forEach((s: any, i: number) => {
        out.push(`${i + 1}. [${clean(s.status)}] ${clean(s.label)}`);
        if (s.objective) out.push(`   Tujuan: ${clean(s.objective)}`);
        if (Array.isArray(s.outputs) && s.outputs.length) out.push(`   Output: ${s.outputs.map(clean).join('; ')}`);
      });
      out.push('');
    }
    if (Array.isArray(wf.allegation_response_matrix) && wf.allegation_response_matrix.length) {
      out.push('IX-B. ALLEGATION-RESPONSE MATRIX');
      wf.allegation_response_matrix.forEach((r: any, i: number) => {
        out.push(`${i + 1}. ${clean(r.issue)}`);
        if (Array.isArray(r.supporting_material) && r.supporting_material.length) out.push(`   Supporting: ${r.supporting_material.map(clean).join(' | ')}`);
        if (Array.isArray(r.counter_material) && r.counter_material.length) out.push(`   Counter: ${r.counter_material.map(clean).join(' | ')}`);
        if (Array.isArray(r.unresolved) && r.unresolved.length) out.push(`   Belum terselesaikan: ${r.unresolved.map(clean).join(' | ')}`);
      });
      out.push('');
    }
    if (Array.isArray(wf.authority_duty_matrix) && wf.authority_duty_matrix.length) {
      out.push('IX-C. AUTHORITY-DUTY MATRIX');
      wf.authority_duty_matrix.forEach((d: any, i: number) => {
        out.push(`${i + 1}. ${clean(d.actor)}${Array.isArray(d.roles) && d.roles.length ? ` (${d.roles.map(clean).join(', ')})` : ''}`);
        if (d.authority_question) out.push(`   Kewenangan: ${clean(d.authority_question)}`);
        if (d.operational_duty_question) out.push(`   Kewajiban operasional: ${clean(d.operational_duty_question)}`);
        if (d.verification) out.push(`   Verifikasi: ${clean(d.verification)}`);
      });
      out.push('');
    }
    const fin = wf.financial_collateral_audit || {};
    if ((fin.amounts || []).length || (fin.collateral_terms || []).length || (fin.repayment_terms || []).length || (fin.discrepancy_terms || []).length) {
      out.push('IX-D. FINANCIAL & COLLATERAL AUDIT');
      list('Nominal', fin.amounts);
      list('Agunan', fin.collateral_terms);
      list('Repayment', fin.repayment_terms);
      list('Discrepancy', fin.discrepancy_terms);
      list('Pertanyaan penelaahan', fin.review_questions);
    }
    const wit = wf.witness_strategy || {};
    if (Array.isArray(wit.witness_targets) && wit.witness_targets.length) {
      out.push('IX-E. WITNESS STRATEGY');
      wit.witness_targets.forEach((w: any, i: number) => {
        out.push(`${i + 1}. ${clean(w.witness)}${Array.isArray(w.roles) && w.roles.length ? ` (${w.roles.map(clean).join(', ')})` : ''}`);
        if (Array.isArray(w.question_themes) && w.question_themes.length) out.push(`   Tema pertanyaan: ${w.question_themes.map(clean).join(' | ')}`);
        if (Array.isArray(w.evidence_pages) && w.evidence_pages.length) out.push(`   Halaman: ${w.evidence_pages.join(', ')}`);
      });
      if (Array.isArray(wit.expert_domains) && wit.expert_domains.length) out.push(`   Ahli disarankan: ${wit.expert_domains.map(clean).join(' · ')}`);
      out.push('');
    }
    if (Array.isArray(wf.drafting_plan) && wf.drafting_plan.length) {
      out.push('IX-F. DRAFTING PLAN');
      wf.drafting_plan.forEach((p: any, i: number) => {
        out.push(`${i + 1}. [${clean(p.priority)}] ${clean(p.document)}`);
        if (p.purpose) out.push(`   Tujuan: ${clean(p.purpose)}`);
        if (Array.isArray(p.depends_on) && p.depends_on.length) out.push(`   Bergantung pada: ${p.depends_on.map(clean).join(', ')}`);
      });
      out.push('');
    }
    const di = wf.document_integrity_audit || {};
    if ((di.document_markers || []).length || (di.integrity_questions || []).length) {
      out.push('IX-G. DOCUMENT INTEGRITY AUDIT');
      list('Penanda dokumen', di.document_markers);
      list('Pertanyaan integritas', di.integrity_questions);
    }
    if (Array.isArray(wf.next_actions) && wf.next_actions.length) {
      out.push('IX-H. NEXT ACTIONS (STRATEGIS)');
      wf.next_actions.forEach((a: any, i: number) => out.push(`${i + 1}. ${clean(a)}`));
      out.push('');
    }
  }

  section('X. Catatan Verifikasi Profesional', analysis.verification_note);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ---------------- PDF ----------------

type PdfPage = { ops: string[]; pageNo: number };
function pdfEsc(s: string): string { return clean(s).replace(/[→⟶]/g, '->').replace(/⇒/g, '=>').replace(/·/g, ';').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, ''); }
function hexRgb(hex: string): [number, number, number] { return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255]; }
function fill(hex: string) { const [r, g, b] = hexRgb(hex); return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`; }
function stroke(hex: string) { const [r, g, b] = hexRgb(hex); return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`; }
function wrapText(text: string, maxChars: number): string[] {
  const words = clean(text).split(/\s+/).filter(Boolean); const out: string[] = []; let line = '';
  for (const w of words) { const n = line ? `${line} ${w}` : w; if (n.length > maxChars && line) { out.push(line); line = w; } else line = n; }
  if (line) out.push(line); return out.length ? out : [''];
}

export function createPdfBuffer(analysis: any): Buffer {
  const W = 595, H = 842, left = 113, right = 85, contentW = W - left - right, top = 85, bottom = 85;
  const pages: PdfPage[] = []; let p: PdfPage; let y = H - top;
  const fontRefs = { sans: 'F1', sansBold: 'F2', serif: 'F3', serifBold: 'F4' } as const;
  const newPage = () => { p = { ops: [], pageNo: pages.length + 1 }; pages.push(p); y = H - top; }; newPage();
  const text = (x: number, yy: number, s: string, size = 10, font: keyof typeof fontRefs = 'serif', color = DARK, wordSpace = 0) =>
    p.ops.push(`BT /${fontRefs[font]} ${size} Tf ${fill(color)} ${wordSpace > 0 ? `${wordSpace.toFixed(2)} Tw ` : ''}${x} ${yy} Td (${pdfEsc(s)}) Tj ET`);
  const approxWidth = (s: string, size: number) => {
    const chars = s.length;
    const spaces = (s.match(/ /g) || []).length;
    return Math.max(0, chars * size * 0.46 + spaces * size * 0.08);
  };
  const rect = (x: number, yy: number, w: number, h: number, fc?: string, sc?: string) => { let op = 'q '; if (fc) op += fill(fc) + ' '; if (sc) op += stroke(sc) + ' '; op += `${x} ${yy} ${w} ${h} re ${fc ? 'f' : ''}${sc ? ' S' : ''} Q`; p.ops.push(op); };
  const line = (x1: number, y1: number, x2: number, y2: number, c = MID, w = .6) => p.ops.push(`q ${stroke(c)} ${w} w ${x1} ${y1} m ${x2} ${y2} l S Q`);
  const ensure = (need: number) => { if (y - need < bottom) { newPage(); } };
  const para = (s: unknown, opts: { size?: number; bold?: boolean; indent?: number; firstLine?: number; after?: number; color?: string; justify?: boolean } = {}) => {
    const val = cleanExportNarrative(s); if (!val) return;
    const size = opts.size || 12;
    const indent = opts.indent || 0;
    const firstLine = opts.firstLine ?? (indent ? 0 : 28.35);
    const usable = contentW - indent - firstLine;
    const lineHeight = Math.max(18, size * 1.5);
    const lines = wrapText(val, Math.max(34, Math.floor(usable / (size * .49))));
    ensure(lines.length * lineHeight + 10);
    lines.forEach((ln, i) => {
      const x = left + indent + (i === 0 ? firstLine : 0);
      const available = contentW - indent - (i === 0 ? firstLine : 0);
      const spaces = (ln.match(/ /g) || []).length;
      let wordSpace = 0;
      if ((opts.justify ?? true) && i < lines.length - 1 && spaces >= 3) {
        const extra = available - approxWidth(ln, size);
        if (extra > 0) wordSpace = Math.min(2.4, extra / spaces);
      }
      text(x, y, ln, size, opts.bold ? 'serifBold' : 'serif', opts.color || DARK, wordSpace);
      y -= lineHeight;
    });
    y -= opts.after ?? 7;
  };
  const heading = (roman: string, title: string) => {
    ensure(38); y -= 6;
    text(left, y, `${roman}. ${title.toUpperCase()}`, 14, 'serifBold', DARK); y -= 10;
    line(left, y, left + contentW, y, GOLD, 1.2); y -= 20;
  };
  const bullet = (s: unknown, metric?: string) => {
    const prefix = metric ? `- ${metric} - ` : '- ';
    const val = prefix + cleanExportNarrative(s);
    const lines = wrapText(val, Math.max(34, Math.floor(contentW / (12 * .49))));
    ensure(lines.length * 18.75 + 5);
    lines.forEach((ln, i) => {
      text(left + (i ? 18 : 6), y, ln, 12, 'serif');
      y -= 18;
    });
    y -= 4;
  };
  const table = (headers: string[], rows: string[][], widths: number[]) => {
    const colX = [left]; for (let i = 0; i < widths.length; i++) colX.push(colX[i] + widths[i]);
    const rowHeight = (cells: string[], head = false) => Math.max(head ? 24 : 28, ...cells.map((c, i) => wrapText(c, Math.max(10, Math.floor(widths[i] / 5.6))).length * 12 + 9));
    const paintRow = (cells: string[], head = false) => {
      const rh = rowHeight(cells, head);
      for (let i = 0; i < cells.length; i++) {
        rect(colX[i], y - rh, widths[i], rh, head ? NAVY : (i % 2 === 0 ? 'FFFFFF' : 'F8F9FB'), MID);
        const ls = wrapText(cleanExportNarrative(cells[i]), Math.max(10, Math.floor(widths[i] / 5.6)));
        let ty = y - (head ? 16 : 14.5);
        ls.forEach(ln => { text(colX[i] + 4.5, ty, ln, 10, head ? 'sansBold' : 'sans', head ? 'FFFFFF' : DARK); ty -= 12; });
      }
      y -= rh;
    };
    const headerH = rowHeight(headers, true); if (y - headerH < bottom) newPage(); paintRow(headers, true);
    for (const r of rows) { const rh = rowHeight(r, false); if (y - rh < bottom) { newPage(); paintRow(headers, true); } paintRow(r, false); }
    y -= 12;
  };
  const drawHeaderFooter = (pg: PdfPage) => {
    const prev = p; p = pg;
    const profileName = clean(analysis?.user_name || '');
    if (profileName) {
      const headerY = H - 48;
      text(left, headerY, profileName, 9.5, 'serifBold', DARK);
      line(left, headerY - 8, W - right, headerY - 8, MID, .5);
    }
    line(left, 44, W - right, 44, MID, .7);
    text(W - right - 58, 30, `Halaman #${pg.pageNo}`, 8.25, 'sans', '666666');
    p = prev;
  };


  const cols = (weights: number[]) => {
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const vals = weights.map(w => contentW * w / total);
    const used = vals.slice(0, -1).reduce((a, b) => a + b, 0);
    vals[vals.length - 1] = contentW - used;
    return vals;
  };

  // ---- Lawyer-facing working paper ----
  text(left, y, 'ANALISA & PENDAPAT HUKUM', 18.75, 'serifBold', NAVY); y -= 30;
  text(left, y, lawyerFacingTitle(analysis), 13.5, 'serifBold', '4A4A4A'); y -= 24;
  const generatedAt = clean(analysis?.export_meta?.generated_at_wib || analysis?.export_meta?.generated_at || '');
  if (generatedAt) { text(left, y, `Tanggal analisis: ${generatedAt}`, 9, 'sans', '666666'); y -= 18; }
  para('Ruang Lingkup', { bold: true, size: 12, firstLine: 0, justify: false });
  para(lawyerFacingScope(analysis), { firstLine: 0 });
  para(lawyerFacingReadinessNote(analysis), { firstLine: 0, color: '666666', size: 9.5 });
  para(`Kesiapan Analisis: ${analysisReadinessLabel(analysis)}`, { firstLine: 0, bold: true, size: 10 });
  if (analysis?.pipeline_gate?.status) para(`Status Gate Analisis: ${pipelineGateLabel(analysis)}`, { firstLine: 0, color: '666666', size: 9.5 });

  heading('1', 'Ringkasan Eksekutif');
  para(lawyerFacingExecutiveSummary(analysis));

  heading('2', 'Kronologi Fakta dan Posisi Para Pihak');
  if (Array.isArray(analysis.actor_matrix) && analysis.actor_matrix.length) {
    para('Posisi Para Pihak', { bold: true, size: 12, firstLine: 0, justify: false });
    table(['AKTOR', 'STATUS / HAK-KEWAJIBAN', 'RUJUKAN SUMBER'], analysis.actor_matrix.map((x: any) => [clean(x.actor), `${humanizeEvidenceTag(x.proven_status)}\n${cleanExportNarrative(x.explicit_rights_obligations)}`, humanizeEvidenceTag(x.evidence_tag)]), cols([1.1, 2.5, 2.4]));
  }
  if (Array.isArray(analysis.verified_timeline) && analysis.verified_timeline.length) {
    para('Kronologi Fakta', { bold: true, size: 12, firstLine: 0, justify: false });
    table(['WAKTU', 'PERISTIWA', 'RUJUKAN SUMBER'], analysis.verified_timeline.map((x: any) => [clean(x.time), cleanExportNarrative(x.event), humanizeEvidenceTag(x.evidence_tag)]), cols([1.0, 2.7, 2.3]));
  }
  if (Array.isArray(analysis.facts) && analysis.facts.length) {
    para('Fakta Material yang Teridentifikasi', { bold: true, size: 12, firstLine: 0, justify: false });
    analysis.facts.forEach((x: unknown) => bullet(cleanExportNarrative(x)));
  }

  heading('3', 'Isu Hukum Utama dan Analisis');
  (analysis.legal_issues || []).forEach((x: any, i: number) => {
    para(`${i + 1}. ${clean(x.issue)}`, { bold: true, size: 11.25, firstLine: 0, justify: false });
    if (x.rule) para(`Dasar / Kaidah Hukum: ${cleanExportNarrative(x.rule)}`, { indent: 10 });
    if (x.analysis) para(cleanExportNarrative(x.analysis), { indent: 10 });
    if (x.conclusion) para(`Kesimpulan: ${cleanExportNarrative(x.conclusion)}`, { indent: 10, bold: true });
  });

  heading('4', 'Kerangka Hukum Relevan');
  if (Array.isArray(analysis.applicable_law) && analysis.applicable_law.length) {
    table(['PERATURAN', 'PASAL', 'RELEVANSI'], analysis.applicable_law.map((x: any) => [clean(x.regulation || x.source || x.domain), clean(x.article || '-'), cleanExportNarrative(x.relevance || x.status || '-')]), cols([2.0, 1.0, 3.0]));
  }
  if (Array.isArray(analysis.legal_gaps) && analysis.legal_gaps.length) {
    heading('4-A', 'Fakta dan Isu yang Perlu Diverifikasi');
    analysis.legal_gaps.forEach((x: any) => { para(cleanExportNarrative(x.gap), { bold: true }); para(`${cleanExportNarrative(x.why_material)} ${humanizeEvidenceTag(x.evidence_tag)}`, { indent: 10 }); });
  }
  if (Array.isArray(analysis.multi_path_diagnosis) && analysis.multi_path_diagnosis.length) {
    heading('4-B', 'Alternatif Jalur Hukum');
    analysis.multi_path_diagnosis.forEach((x: any) => { para(`${clean(x.path)} - ${humanizeStatus(x.strength)}`, { bold: true }); para(cleanExportNarrative(x.application)); para(`Uji lawan: ${cleanExportNarrative(x.counter_case)}`, { indent: 10 }); });
  }

  heading('5', 'Penilaian Risiko');
  if (Array.isArray(analysis.risk_matrix) && analysis.risk_matrix.length) {
    table(['RISIKO / ASPEK', 'TEMUAN', 'MITIGASI'], analysis.risk_matrix.map((x: any) => [`${humanizeStatus(x.level)}\n${cleanExportNarrative(x.clause)}`, cleanExportNarrative(x.finding), cleanExportNarrative(x.mitigation)]), cols([1.4, 2.3, 2.3]));
  }

  heading('6', 'Posisi Argumentasi');
  para('Argumen yang Menguatkan', { bold: true, size: 12 }); (analysis.arguments_for || []).forEach((x: unknown) => bullet(cleanExportNarrative(x)));
  para('Argumen Lawan / Kelemahan', { bold: true, size: 12 }); (analysis.arguments_against || []).forEach((x: unknown) => bullet(cleanExportNarrative(x)));

  heading('7', 'Skenario Litigasi');
  para('Skenario Terbaik', { bold: true, size: 12 }); para(cleanExportNarrative(analysis.best_case));
  para('Skenario Terburuk', { bold: true, size: 12 }); para(cleanExportNarrative(analysis.worst_case));

  heading('8', 'Rencana Tindakan');
  if (Array.isArray(analysis.recommendations) && analysis.recommendations.length) {
    table(['NO.', 'PRIORITAS', 'TINDAKAN'], analysis.recommendations.map((x: unknown, i: number) => [String(i + 1), `P${Math.min(3, Math.floor(i / 2) + 1)}`, cleanExportNarrative(x)]), cols([0.45, 0.8, 4.75]));
  }
  if (Array.isArray(analysis.adverse_evidence) && analysis.adverse_evidence.length) {
    para('Bukti yang Merugikan / Pembacaan Lawan', { bold: true, size: 12, firstLine: 0, justify: false });
    analysis.adverse_evidence.forEach((x: any) => bullet(`${clean(x.evidence_id)} hlm ${clean(x.page)} - ${cleanExportNarrative(x.adverse_point)} - ${cleanExportNarrative(x.analysis)}`));
  }
  if (Array.isArray(analysis.blank_spot_questions) && analysis.blank_spot_questions.length) {
    para('Hal yang Masih Perlu Diklarifikasi', { bold: true, size: 12, firstLine: 0, justify: false });
    analysis.blank_spot_questions.map((x: unknown) => cleanExportNarrative(x)).filter((x: string) => x && !/Bagaimana gap berikut akan ditutup/i.test(x)).forEach((x: string) => bullet(x));
  }

  // ---- Lawyer Workflow (V5.5) ----
  const wf = analysis?.lawyer_workflow || {};
  if (wf.version) {
    heading('9', 'Strategi Penanganan Perkara');
    para(humanizeWorkflowText(wf.mandate_summary || '-'), { bold: true });
    table(['ORIENTASI', 'PIHAK', 'TINGKAT KEYAKINAN'], [[humanizeWorkflowText(wf.orientation || '-'), clean(wf.represented_side_hint || '-'), humanizeStatus(wf.role_confidence || '-')]], cols([1.4, 3.6, 1.0]));

    if (Array.isArray(wf.stages) && wf.stages.length) {
      para('Tahapan Kerja', { bold: true, size: 12, firstLine: 0, justify: false });
      table(['LANGKAH', 'TUJUAN', 'HASIL'], wf.stages.map((s: any) => [humanizeWorkflowText(s.label), cleanExportNarrative(s.objective), (s.outputs || []).map(humanizeWorkflowText).join('\n')]), cols([1.5, 2.8, 1.7]));
    }
    if (Array.isArray(wf.allegation_response_matrix) && wf.allegation_response_matrix.length) {
      para('Matriks Dalil dan Tanggapan', { bold: true, size: 12, firstLine: 0, justify: false });
      wf.allegation_response_matrix.forEach((r: any, i: number) => {
        para(`${i + 1}. Isu: ${cleanExportNarrative(r.issue)}`, { bold: true, firstLine: 0 });
        para(`Dukungan: ${(r.supporting_material || []).map(cleanExportNarrative).join('; ') || '-'}`, { indent: 14, firstLine: 0 });
        para(`Tanggapan lawan: ${(r.counter_material || []).map(cleanExportNarrative).join('; ') || '-'}`, { indent: 14, firstLine: 0 });
        para(`Belum terjawab: ${(r.unresolved || []).map(cleanExportNarrative).join('; ') || '-'}`, { indent: 14, firstLine: 0 });
      });
    }
    if (Array.isArray(wf.authority_duty_matrix) && wf.authority_duty_matrix.length) {
      para('Matriks Kewenangan dan Tanggung Jawab', { bold: true, size: 12, firstLine: 0, justify: false });
      table(['AKTOR', 'KEWENANGAN', 'KEWAJIBAN OPERASIONAL'], wf.authority_duty_matrix.map((d: any) => [`${clean(d.actor)}\n${(d.roles || []).map(humanizeWorkflowText).join(', ')}`, cleanExportNarrative(d.authority_question), cleanExportNarrative(d.operational_duty_question)]), cols([1.4, 2.1, 2.5]));
    }
    const fin = wf.financial_collateral_audit || {};
    if ((fin.amounts || []).length || (fin.collateral_terms || []).length || (fin.repayment_terms || []).length || (fin.discrepancy_terms || []).length) {
      para('Audit Keuangan dan Agunan', { bold: true, size: 12, firstLine: 0, justify: false });
      if ((fin.amounts || []).length) { para('Nominal', { bold: true }); fin.amounts.forEach((a: any) => bullet(a)); }
      if ((fin.collateral_terms || []).length) { para('Agunan', { bold: true }); fin.collateral_terms.forEach((a: any) => bullet(a)); }
      if ((fin.repayment_terms || []).length) { para('Pembayaran kembali', { bold: true }); fin.repayment_terms.forEach((a: any) => bullet(a)); }
      if ((fin.discrepancy_terms || []).length) { para('Ketidaksesuaian', { bold: true }); fin.discrepancy_terms.forEach((a: any) => bullet(a)); }
      if ((fin.review_questions || []).length) { para('Pertanyaan penelaahan', { bold: true }); fin.review_questions.forEach((q: any) => bullet(humanizeWorkflowText(q))); }
    }
    const wit = wf.witness_strategy || {};
    if (Array.isArray(wit.witness_targets) && wit.witness_targets.length) {
      para('Strategi Saksi', { bold: true, size: 12, firstLine: 0, justify: false });
      table(['SAKSI', 'PERAN', 'TEMA PERTANYAAN', 'HALAMAN'], wit.witness_targets.map((w: any) => [clean(w.witness), (w.roles || []).map(clean).join(', '), (w.question_themes || []).map(clean).join('\n'), (w.evidence_pages || []).join(', ')]), cols([1.2, 1.1, 3.0, 0.7]));
      if (Array.isArray(wit.expert_domains) && wit.expert_domains.length) para(`Ahli disarankan: ${wit.expert_domains.map(clean).join(' · ')}`, { indent: 10, size: 9 });
    }
    if (Array.isArray(wf.drafting_plan) && wf.drafting_plan.length) {
      para('Rencana Penyusunan Dokumen', { bold: true, size: 12, firstLine: 0, justify: false });
      table(['DOKUMEN', 'TUJUAN', 'PRIORITAS', 'BERGANTUNG PADA'], wf.drafting_plan.map((p: any) => [humanizeWorkflowText(p.document), cleanExportNarrative(p.purpose), clean(p.priority), (p.depends_on || []).map(humanizeWorkflowText).join(', ')]), cols([1.6, 2.4, 0.7, 1.3]));
    }
    const di = wf.document_integrity_audit || {};
    if ((di.document_markers || []).length || (di.integrity_questions || []).length) {
      para('Audit Integritas Dokumen', { bold: true, size: 12, firstLine: 0, justify: false });
      if ((di.document_markers || []).length) { para('Penanda dokumen', { bold: true }); di.document_markers.forEach((a: any) => bullet(a)); }
      if ((di.integrity_questions || []).length) { para('Pertanyaan integritas', { bold: true }); di.integrity_questions.forEach((q: any) => bullet(q)); }
    }
    if (Array.isArray(wf.next_actions) && wf.next_actions.length) {
      para('Tindakan Lanjutan Strategis', { bold: true, size: 12, firstLine: 0, justify: false });
      wf.next_actions.forEach((a: any) => bullet(cleanExportNarrative(a)));
    }
  }

  heading('10', 'Pendapat Hukum / Kesimpulan');
  const conclusions = professionalConclusions(analysis);
  if (conclusions.length) conclusions.forEach((c: string, i: number) => bullet(`${i + 1}. ${c}`));
  else para('Kesimpulan akhir belum dapat dirumuskan dari materi yang tersedia dan memerlukan verifikasi lebih lanjut.');

  const refs = primaryLegalReferences(analysis);
  if (refs.length) {
    heading('11', 'Rujukan Hukum Utama');
    refs.forEach((r: string) => bullet(r));
  }

  heading('12', 'Catatan Profesional');
  para(professionalVerificationNote(analysis), { bold: true, color: RED });
  pages.forEach(drawHeaderFooter);

  const objects: string[] = []; const add = (b: string) => { objects.push(b); return objects.length; }; const catalog = add(''); const pagesId = add('');
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const f3 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>');
  const f4 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>');
  const pageIds: number[] = [];
  pages.forEach(pg => {
    const s = pg.ops.join('\n'); const cid = add(`<< /Length ${Buffer.byteLength(s, 'ascii')} >>\nstream\n${s}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R /F4 ${f4} 0 R >> >> /Contents ${cid} 0 R >>`));
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((b, i) => { offsets[i + 1] = Buffer.byteLength(pdf, 'binary'); pdf += `${i + 1} 0 obj\n${b}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

// ---------------- DOCX ----------------
function crc32(buf: Buffer): number { let crc = 0xffffffff; for (const byte of buf) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function u16(n: number) { const b = Buffer.alloc(2); b.writeUInt16LE(n & 0xffff); return b; }
function u32(n: number) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }
function zipStore(files: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8'); const crc = crc32(file.data);
    const local = Buffer.concat([Buffer.from('504b0304', 'hex'), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), name, file.data]);
    locals.push(local);
    const central = Buffer.concat([Buffer.from('504b0102', 'hex'), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]);
    centrals.push(central); offset += local.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  return Buffer.concat([...locals, ...centrals, Buffer.concat([Buffer.from('504b0506', 'hex'), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(offset), u16(0)])]);
}
function run(text: unknown, opts: { bold?: boolean; color?: string; size?: number; font?: 'serif' | 'sans' } = {}): string {
  const font = opts.font === 'sans' ? 'Arial' : 'Times New Roman';
  return `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>${opts.bold ? '<w:b/>' : ''}${opts.color ? `<w:color w:val="${opts.color}"/>` : ''}${opts.size ? `<w:sz w:val="${opts.size * 2}"/><w:szCs w:val="${opts.size * 2}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xmlEscape(clean(text) || ' ')}</w:t></w:r>`;
}
function p(text: unknown, style?: string, opts: { bold?: boolean; color?: string; size?: number; align?: 'left' | 'center' | 'right' | 'both'; after?: number; before?: number; line?: number; left?: number; firstLine?: number; hanging?: number; keepNext?: boolean; font?: 'serif' | 'sans' } = {}): string {
  const ind = (opts.left || opts.firstLine || opts.hanging)
    ? `<w:ind${opts.left ? ` w:left="${opts.left}"` : ''}${opts.firstLine ? ` w:firstLine="${opts.firstLine}"` : ''}${opts.hanging ? ` w:hanging="${opts.hanging}"` : ''}/>`
    : '';
  const pp = `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${opts.keepNext ? '<w:keepNext/>' : ''}<w:jc w:val="${opts.align || 'both'}"/>${ind}<w:spacing w:line="${opts.line ?? 360}" w:lineRule="auto" w:after="${opts.after ?? 140}" w:before="${opts.before ?? 0}"/></w:pPr>`;
  return `<w:p>${pp}${run(text, opts)}</w:p>`;
}
function tc(content: string, width: number, shade?: string, white = false): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:fill="${shade || 'FFFFFF'}"/><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar></w:tcPr>${content.replace(/<w:rPr>/g, white ? '<w:rPr><w:color w:val="FFFFFF"/>' : '<w:rPr>')}</w:tc>`;
}
function table(headers: string[], rows: string[][], widths: number[]): string {
  const borders = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7C0CE"/><w:left w:val="single" w:sz="4" w:color="B7C0CE"/><w:bottom w:val="single" w:sz="4" w:color="B7C0CE"/><w:right w:val="single" w:sz="4" w:color="B7C0CE"/><w:insideH w:val="single" w:sz="4" w:color="D8DEE8"/><w:insideV w:val="single" w:sz="4" w:color="D8DEE8"/></w:tblBorders>';
  const row = (cells: string[], head = false) => `<w:tr><w:trPr>${head ? '<w:tblHeader/>' : ''}<w:cantSplit/></w:trPr>${cells.map((c, i) => tc(p(cleanExportNarrative(c), undefined, { bold: head, size: 10, font: 'serif', align: 'left', after: 0, line: 240 }), widths[i], head ? NAVY : 'FFFFFF', head)).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/>${borders}</w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${row(headers, true)}${rows.map(r => row(r, false)).join('')}</w:tbl>`;
}

export function createDocxBuffer(analysis: any): Buffer {
  const body: string[] = [];
  const DOCX_CONTENT_W = 7937;
  const dcols = (weights: number[]) => { const total = weights.reduce((a,b)=>a+b,0)||1; const vals = weights.map(w => Math.floor(DOCX_CONTENT_W*w/total)); vals[vals.length-1] += DOCX_CONTENT_W - vals.reduce((a,b)=>a+b,0); return vals; };
  body.push(p('ANALISA & PENDAPAT HUKUM', 'Title', { align: 'left' }));
  body.push(p(lawyerFacingTitle(analysis), 'Subtitle', { align: 'left' }));
  const generatedAt = clean(analysis?.export_meta?.generated_at_wib || analysis?.export_meta?.generated_at || '');
  if (generatedAt) body.push(p(`Tanggal analisis: ${generatedAt}`, undefined, { font: 'sans', size: 9, color: '666666', align: 'left' }));
  body.push(p('Ruang Lingkup', 'Heading2', { align: 'left' }));
  body.push(p(lawyerFacingScope(analysis), undefined, { align: 'both' }));
  body.push(p(lawyerFacingReadinessNote(analysis), undefined, { color: '666666', font: 'sans', size: 9.5, align: 'both' }));
  body.push(p(`Kesiapan Analisis: ${analysisReadinessLabel(analysis)}`, undefined, { bold:true, font:'sans', size:10, align:'left' }));
  if (analysis?.pipeline_gate?.status) body.push(p(`Status Gate Analisis: ${pipelineGateLabel(analysis)}`, undefined, { color:'666666', font:'sans', size:9.5, align:'left' }));

  body.push(p('Daftar Isi', 'TOCHeading', { align: 'left' }));
  body.push('<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Daftar isi akan diperbarui otomatis saat dokumen dibuka.</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>');

  const h1 = (roman: string, title: string) => body.push(p(`${roman}. ${title.toUpperCase()}`, 'Heading1', { align: 'left', keepNext: true }));
  const h2 = (t: string) => body.push(p(t, 'Heading2', { align: 'left', keepNext: true }));
  const prose = (t: unknown, opts: { bold?: boolean; color?: string; size?: number; firstLine?: number; left?: number } = {}) =>
    body.push(p(cleanExportNarrative(t), undefined, { align: 'both', line: 360, after: 140, firstLine: opts.firstLine ?? 567, left: opts.left, bold: opts.bold, color: opts.color, size: opts.size ?? 12, font: 'serif' }));
  const item = (t: unknown) => body.push(p(`• ${cleanExportNarrative(t)}`, undefined, { align: 'both', line: 360, after: 120, left: 567, hanging: 284, size: 12, font: 'serif' }));

  h1('1', 'Ringkasan Eksekutif');
  prose(lawyerFacingExecutiveSummary(analysis));

  h1('2', 'Kronologi Fakta dan Posisi Para Pihak');
  if (Array.isArray(analysis.actor_matrix) && analysis.actor_matrix.length) {
    h2('Posisi Para Pihak');
    body.push(table(['AKTOR', 'STATUS / HAK-KEWAJIBAN', 'RUJUKAN SUMBER'], analysis.actor_matrix.map((x: any) => [clean(x.actor), `${humanizeEvidenceTag(x.proven_status)} | ${cleanExportNarrative(x.explicit_rights_obligations)}`, humanizeEvidenceTag(x.evidence_tag)]), dcols([1.1, 2.5, 2.4])));
  }
  if (Array.isArray(analysis.verified_timeline) && analysis.verified_timeline.length) {
    h2('Kronologi Fakta');
    body.push(table(['WAKTU', 'PERISTIWA', 'RUJUKAN SUMBER'], analysis.verified_timeline.map((x: any) => [clean(x.time), cleanExportNarrative(x.event), humanizeEvidenceTag(x.evidence_tag)]), dcols([1.0, 2.7, 2.3])));
  }
  if (Array.isArray(analysis.facts) && analysis.facts.length) { h2('Fakta Material yang Teridentifikasi'); analysis.facts.forEach(item); }

  h1('3', 'Isu Hukum Utama dan Analisis');
  (analysis.legal_issues || []).forEach((x: any, i: number) => {
    h2(`${i + 1}. ${clean(x.issue)}`);
    if (x.rule) prose(`Dasar / Kaidah Hukum: ${cleanExportNarrative(x.rule)}`);
    if (x.analysis) prose(cleanExportNarrative(x.analysis));
    if (x.conclusion) prose(`Kesimpulan: ${cleanExportNarrative(x.conclusion)}`, { bold: true, firstLine: 0 });
  });

  h1('4', 'Kerangka Hukum Relevan');
  if (Array.isArray(analysis.applicable_law) && analysis.applicable_law.length) {
    body.push(table(['PERATURAN', 'PASAL', 'RELEVANSI'], analysis.applicable_law.map((x: any) => [clean(x.regulation || x.source || x.domain), clean(x.article || '-'), cleanExportNarrative(x.relevance || x.status || '-')]), dcols([2.0, 1.0, 3.0])));
  }
  if (Array.isArray(analysis.legal_gaps) && analysis.legal_gaps.length) {
    h1('4-A', 'Fakta dan Isu yang Perlu Diverifikasi');
    analysis.legal_gaps.forEach((x: any) => { h2(cleanExportNarrative(x.gap)); prose(`${cleanExportNarrative(x.why_material)} ${humanizeEvidenceTag(x.evidence_tag)}`); });
  }
  if (Array.isArray(analysis.multi_path_diagnosis) && analysis.multi_path_diagnosis.length) {
    h1('4-B', 'Alternatif Jalur Hukum');
    analysis.multi_path_diagnosis.forEach((x: any) => { h2(`${clean(x.path)} - ${humanizeStatus(x.strength)}`); prose(x.application); prose(`Uji lawan: ${cleanExportNarrative(x.counter_case)}`, { firstLine: 0 }); });
  }

  h1('5', 'Penilaian Risiko');
  if (Array.isArray(analysis.risk_matrix) && analysis.risk_matrix.length) {
    body.push(table(['RISIKO / ASPEK', 'TEMUAN', 'MITIGASI'], analysis.risk_matrix.map((x: any) => [`${humanizeStatus(x.level)} - ${cleanExportNarrative(x.clause)}`, cleanExportNarrative(x.finding), cleanExportNarrative(x.mitigation)]), dcols([1.4, 2.3, 2.3])));
  }

  h1('6', 'Posisi Argumentasi');
  h2('Argumen yang Menguatkan'); (analysis.arguments_for || []).forEach(item);
  h2('Argumen Lawan / Kelemahan'); (analysis.arguments_against || []).forEach(item);

  h1('7', 'Skenario Litigasi');
  h2('Skenario Terbaik'); if (analysis.best_case) prose(analysis.best_case);
  h2('Skenario Terburuk'); if (analysis.worst_case) prose(analysis.worst_case);

  h1('8', 'Rencana Tindakan');
  if (Array.isArray(analysis.recommendations) && analysis.recommendations.length) {
    body.push(table(['NO.', 'PRIORITAS', 'TINDAKAN'], analysis.recommendations.map((x: unknown, i: number) => [String(i + 1), `P${Math.min(3, Math.floor(i / 2) + 1)}`, cleanExportNarrative(x)]), dcols([0.5, 1.2, 4.3])));
  }
  if (Array.isArray(analysis.adverse_evidence) && analysis.adverse_evidence.length) {
    h2('Bukti yang Merugikan / Pembacaan Lawan');
    analysis.adverse_evidence.forEach((x: any) => item(`${clean(x.evidence_id)} hlm ${clean(x.page)} - ${cleanExportNarrative(x.adverse_point)} - ${cleanExportNarrative(x.analysis)}`));
  }
  if (Array.isArray(analysis.blank_spot_questions) && analysis.blank_spot_questions.length) {
    h2('Hal yang Masih Perlu Diklarifikasi');
    analysis.blank_spot_questions.map((x: unknown) => cleanExportNarrative(x)).filter((x: string) => x && !/Bagaimana gap berikut akan ditutup/i.test(x)).forEach(item);
  }

  // ---- Lawyer Workflow (V5.5) ----
  const wf = analysis?.lawyer_workflow || {};
  if (wf.version) {
    h1('9', 'Strategi Penanganan Perkara');
    if (wf.mandate_summary) prose(humanizeWorkflowText(wf.mandate_summary), { bold: true, firstLine: 0 });
    body.push(table(['ORIENTASI', 'PIHAK', 'TINGKAT KEYAKINAN'], [[humanizeWorkflowText(wf.orientation || '-'), clean(wf.represented_side_hint || '-'), humanizeStatus(wf.role_confidence || '-')]], dcols([1.3, 3.0, 1.7])));

    if (Array.isArray(wf.stages) && wf.stages.length) {
      h2('Tahapan Kerja');
      body.push(table(['LANGKAH', 'TUJUAN', 'HASIL'], wf.stages.map((s: any) => [humanizeWorkflowText(s.label), cleanExportNarrative(s.objective), (s.outputs || []).map(humanizeWorkflowText).join('\n')]), dcols([1.5, 2.8, 1.7])));
    }
    if (Array.isArray(wf.allegation_response_matrix) && wf.allegation_response_matrix.length) {
      h2('Matriks Dalil dan Tanggapan');
      wf.allegation_response_matrix.forEach((r: any, i: number) => {
        body.push(p(`${i + 1}. Isu: ${cleanExportNarrative(r.issue)}`, undefined, { bold: true, size: 11, align: 'both', line: 240, after: 60, firstLine: 0 }));
        body.push(p(`Dukungan: ${(r.supporting_material || []).map(cleanExportNarrative).join('; ') || '-'}`, undefined, { size: 10.5, align: 'both', line: 240, after: 40, left: 360 }));
        body.push(p(`Tanggapan lawan: ${(r.counter_material || []).map(cleanExportNarrative).join('; ') || '-'}`, undefined, { size: 10.5, align: 'both', line: 240, after: 40, left: 360 }));
        body.push(p(`Belum terjawab: ${(r.unresolved || []).map(cleanExportNarrative).join('; ') || '-'}`, undefined, { size: 10.5, align: 'both', line: 240, after: 100, left: 360 }));
      });
    }
    if (Array.isArray(wf.authority_duty_matrix) && wf.authority_duty_matrix.length) {
      h2('Matriks Kewenangan dan Tanggung Jawab');
      body.push(table(['AKTOR', 'KEWENANGAN', 'KEWAJIBAN OPERASIONAL'], wf.authority_duty_matrix.map((d: any) => [`${clean(d.actor)}\n${(d.roles || []).map(humanizeWorkflowText).join(', ')}`, cleanExportNarrative(d.authority_question), cleanExportNarrative(d.operational_duty_question)]), dcols([1.4, 2.1, 2.5])));
    }
    const fin = wf.financial_collateral_audit || {};
    if ((fin.amounts || []).length || (fin.collateral_terms || []).length || (fin.repayment_terms || []).length || (fin.discrepancy_terms || []).length) {
      h2('Audit Keuangan dan Agunan');
      if ((fin.amounts || []).length) { h2('Nominal'); fin.amounts.forEach(item); }
      if ((fin.collateral_terms || []).length) { h2('Agunan'); fin.collateral_terms.forEach(item); }
      if ((fin.repayment_terms || []).length) { h2('Pembayaran kembali'); fin.repayment_terms.forEach(item); }
      if ((fin.discrepancy_terms || []).length) { h2('Ketidaksesuaian'); fin.discrepancy_terms.forEach(item); }
      if ((fin.review_questions || []).length) { h2('Pertanyaan penelaahan'); fin.review_questions.forEach((q: any) => item(humanizeWorkflowText(q))); }
    }
    const wit = wf.witness_strategy || {};
    if (Array.isArray(wit.witness_targets) && wit.witness_targets.length) {
      h2('Strategi Saksi');
      body.push(table(['SAKSI', 'PERAN', 'TEMA PERTANYAAN', 'HALAMAN'], wit.witness_targets.map((w: any) => [clean(w.witness), (w.roles || []).map(clean).join(', '), (w.question_themes || []).map(clean).join('\n'), (w.evidence_pages || []).join(', ')]), dcols([1.2, 1.1, 3.0, 0.7])));
      if (Array.isArray(wit.expert_domains) && wit.expert_domains.length) body.push(p(`Ahli disarankan: ${wit.expert_domains.map(clean).join(' · ')}`, undefined, { size: 9 }));
    }
    if (Array.isArray(wf.drafting_plan) && wf.drafting_plan.length) {
      h2('Rencana Penyusunan Dokumen');
      body.push(table(['DOKUMEN', 'TUJUAN', 'PRIORITAS', 'BERGANTUNG PADA'], wf.drafting_plan.map((pl: any) => [humanizeWorkflowText(pl.document), cleanExportNarrative(pl.purpose), clean(pl.priority), (pl.depends_on || []).map(humanizeWorkflowText).join(', ')]), dcols([1.6, 2.4, 0.7, 1.3])));
    }
    const di = wf.document_integrity_audit || {};
    if ((di.document_markers || []).length || (di.integrity_questions || []).length) {
      h2('Audit Integritas Dokumen');
      if ((di.document_markers || []).length) { h2('Penanda dokumen'); di.document_markers.forEach(item); }
      if ((di.integrity_questions || []).length) { h2('Pertanyaan integritas'); di.integrity_questions.forEach(item); }
    }
    if (Array.isArray(wf.next_actions) && wf.next_actions.length) {
      h2('Tindakan Lanjutan Strategis');
      wf.next_actions.forEach((a: any) => item(cleanExportNarrative(a)));
    }
  }

  h1('10', 'Pendapat Hukum / Kesimpulan');
  const conclusions = professionalConclusions(analysis);
  if (conclusions.length) conclusions.forEach((c: string, i: number) => item(`${i + 1}. ${c}`));
  else prose('Kesimpulan akhir belum dapat dirumuskan dari materi yang tersedia dan memerlukan verifikasi lebih lanjut.', { firstLine: 0 });

  const refs = primaryLegalReferences(analysis);
  if (refs.length) {
    h1('11', 'Rujukan Hukum Utama');
    refs.forEach((r: string) => item(r));
  }

  h1('12', 'Catatan Profesional');
  body.push(p(professionalVerificationNote(analysis), undefined, { bold: true, color: RED }));

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1701" w:bottom="1701" w:left="2268" w:header="680" w:footer="680"/></w:sectPr></w:body></w:document>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="both"/><w:spacing w:line="360" w:lineRule="auto" w:after="140"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="left"/><w:spacing w:before="180" w:after="70"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="left"/><w:spacing w:after="220"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="666666"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="260" w:after="100"/><w:outlineLvl w:val="0"/><w:pbdr><w:bottom w:val="single" w:sz="10" w:space="4" w:color="${GOLD}"/></w:pbdr></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="${DARK}"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="70"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style></w:styles>`;
  const profileName = clean(analysis?.user_name || '');
  const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="left"/><w:pbdr><w:bottom w:val="single" w:sz="4" w:color="${MID}"/></w:pbdr></w:pPr>${profileName ? run(profileName, { bold: true, size: 10, font: 'serif', color: DARK }) : ''}</w:p></w:hdr>`;
  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/></w:pPr>${run('Halaman #', { size: 9, font: 'serif', color: '666666' })}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/></w:settings>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`;
  return zipStore([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
    { name: '_rels/.rels', data: Buffer.from(rels) },
    { name: 'word/document.xml', data: Buffer.from(documentXml) },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(docRels) },
    { name: 'word/styles.xml', data: Buffer.from(stylesXml) },
    { name: 'word/settings.xml', data: Buffer.from(settingsXml) },
    { name: 'word/header1.xml', data: Buffer.from(headerXml) },
    { name: 'word/footer1.xml', data: Buffer.from(footerXml) },
  ]);
}

// ---------------- Generic Working Document (unchanged) ----------------
export interface WorkingDocumentBlock {
  type: 'heading' | 'paragraph' | 'list' | 'table';
  level?: number;
  text?: string;
  items?: string[];
  rows?: string[][];
}

export function createWorkingDocumentDocxBuffer(input: { title: string; subtitle?: string; blocks: WorkingDocumentBlock[]; user_name?: string }): Buffer {
  const body: string[] = [];
  body.push(p(input.title || 'LexiCore Working Document', 'Title', { align: 'left' }));
  if (input.subtitle) body.push(p(input.subtitle, 'Subtitle', { align: 'left' }));
  for (const block of input.blocks || []) {
    if (!block) continue;
    if (block.type === 'heading') body.push(p(block.text || '', (block.level || 2) <= 1 ? 'Heading1' : 'Heading2', { align: 'left' }));
    else if (block.type === 'list') (block.items || []).forEach(x => body.push(p(`• ${clean(x)}`, undefined, { align: 'both' })));
    else if (block.type === 'table' && Array.isArray(block.rows) && block.rows.length) {
      const rows = block.rows.map(r => r.map(clean)); const headers = rows.shift() || [];
      if (headers.length) { const widths = headers.map(() => Math.floor(9100 / headers.length)); body.push(table(headers, rows, widths)); }
    } else if (block.text) {
      const paragraphs = clean(block.text).split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
      paragraphs.forEach(x => body.push(p(x, undefined, { align: 'both' })));
    }
  }
  body.push(p('Dokumen kerja LexiCore. Verifikasi profesional wajib dilakukan sebelum digunakan untuk kepentingan hukum.', undefined, { bold: true, color: RED, size: 9, font: 'sans' }));

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1701" w:bottom="1701" w:left="2268" w:header="680" w:footer="680"/></w:sectPr></w:body></w:document>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="both"/><w:spacing w:line="360" w:lineRule="auto" w:after="140"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="38"/><w:szCs w:val="38"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="666666"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/><w:pbdr><w:bottom w:val="single" w:sz="10" w:space="4" w:color="${GOLD}"/></w:pbdr></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style></w:styles>`;
  const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="left"/></w:pPr>${clean(input.user_name || '') ? run(clean(input.user_name), { bold: true, size: 10, font: 'serif', color: DARK }) : ''}</w:p></w:hdr>`;
  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/></w:pPr>${run('Halaman #', { size: 9, font: 'serif', color: '666666' })}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`;
  return zipStore([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
    { name: '_rels/.rels', data: Buffer.from(rels) },
    { name: 'word/document.xml', data: Buffer.from(documentXml) },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(docRels) },
    { name: 'word/styles.xml', data: Buffer.from(stylesXml) },
    { name: 'word/header1.xml', data: Buffer.from(headerXml) },
    { name: 'word/footer1.xml', data: Buffer.from(footerXml) },
  ]);
}