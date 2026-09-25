export const DEFAULT_MIN_REASONING_PAGE_COVERAGE = 0.60;

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function countPageMarkers(text) {
  return (String(text || '').match(/^---\s*HALAMAN\s+\d+\s*---\s*$/gim) || []).length;
}

export function splitMarkedPages(text) {
  const source = String(text || '');
  const marker = /---\s*HALAMAN\s+(\d+)\s*---/gi;
  const matches = [...source.matchAll(marker)];
  if (!matches.length) return [{ page: 1, text: source }];
  return matches.map((m, i) => {
    const start = (m.index || 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index || source.length) : source.length;
    return { page: Number(m[1]) || i + 1, text: source.slice(start, end).replace(/^\s+|\s+$/g, '') };
  });
}

export function semanticSourceText(text) {
  return String(text || '')
    .replace(/^---\s*HALAMAN\s+\d+\s*---\s*$/gim, ' ')
    .replace(/^\[(?:HALAMAN\s+DIKELUARKAN[^\]]*|OCR[^\]]*|TIDAK\s+TERBACA[^\]]*)\]\s*$/gim, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


export function assessOcrExtractedPage(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const words = normalized.match(/[A-Za-zÀ-ÿ]{3,}/g) || [];
  const legalAnchors = normalized.match(/\b(?:bahwa|tersangka|terdakwa|penyidik|jaksa|pengadilan|putusan|pasal|undang[- ]undang|peraturan|surat|kredit|debitur|bank|saksi|advokat|keterangan|pemeriksaan|permohonan|perjanjian|direktur|agunan|jaminan|komite|nasabah)\b/gi) || [];
  const alphaChars = (normalized.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const alphaRatio = normalized.length ? alphaChars / normalized.length : 0;
  const placeholderOnly = /^\[(?:OCR|TIDAK|HALAMAN)/i.test(normalized);
  // Presence is the hard coverage signal. Keep imperfect OCR when it still contains
  // enough human-language material to be reviewed; confidence is handled separately.
  const contentPresent = !placeholderOnly && normalized.length >= 40 && words.length >= 6 && alphaRatio >= 0.22;
  const contentUsable = contentPresent && (
    (normalized.length >= 160 && words.length >= 22 && alphaRatio >= 0.35) ||
    (normalized.length >= 90 && words.length >= 12 && legalAnchors.length >= 1)
  );
  return {
    normalized_length: normalized.length,
    word_count: words.length,
    legal_anchor_count: legalAnchors.length,
    alpha_ratio: alphaRatio,
    placeholder_only: placeholderOnly,
    content_present: contentPresent,
    content_usable: contentUsable,
  };
}

export function assessOcrPageCoverage(pageConfidences = [], totalPages, threshold = 60, minCoverage = DEFAULT_MIN_REASONING_PAGE_COVERAGE) {
  const rows = Array.isArray(pageConfidences) ? pageConfidences : [];
  const total = Math.max(1, Math.round(num(totalPages, rows.length || 1)));
  // Confidence is advisory, not a binary readability verdict. Tesseract can report
  // confidence below the nominal threshold on dense legal scans that still yield
  // structurally usable text. Exclude a low-confidence page only when the ingestion
  // layer also marks its extracted text as unusable. Hard OCR failures remain excluded.
  const excludedPages = rows
    .filter(p => String(p?.status || '') === 'FAILED' || p?.content_present === false)
    .map(p => num(p?.page))
    .filter(p => p > 0);
  const excluded = new Set(excludedPages);
  const usablePages = rows.filter(p => String(p?.status || '') === 'OK' && !excluded.has(num(p?.page))).length;
  const observedPages = new Set(rows.map(p => num(p?.page)).filter(p => p > 0)).size;
  const missingPages = Math.max(0, total - observedPages);
  const effectiveUsable = Math.max(0, usablePages);
  const pageCoverage = effectiveUsable / total;
  const lowConfidencePages = rows
    .filter(p => String(p?.status || '') === 'OK' && num(p?.confidence) < 75)
    .map(p => num(p?.page))
    .filter(p => p > 0);
  const weakContentPages = rows
    .filter(p => String(p?.status || '') === 'OK' && p?.content_present !== false && p?.content_usable === false)
    .map(p => num(p?.page))
    .filter(p => p > 0);
  const status = effectiveUsable <= 0 || pageCoverage < minCoverage
    ? 'INSUFFICIENT'
    : excludedPages.length > 0 || lowConfidencePages.length > 0 || weakContentPages.length > 0 || missingPages > 0
      ? 'REVIEW_REQUIRED'
      : 'GOOD';
  return { status, totalPages: total, usablePages: effectiveUsable, pageCoverage, excludedPages, lowConfidencePages, weakContentPages, missingPages, minCoverage };
}

export function effectiveIngestionCoverage(ingestion = {}) {
  const total = Math.max(0, Math.round(num(ingestion?.pages_total)));
  const explicit = num(ingestion?.coverage_ratio, 1);
  if (total <= 1) return Math.max(0, Math.min(1, explicit));
  const read = Math.max(0, Math.round(num(ingestion?.pages_ocr, total)));
  return Math.max(0, Math.min(1, explicit, read / total));
}

/**
 * Validate whether a document ingestion result is safe to enter legal reasoning.
 * @param {{
 *   inputType?: unknown,
 *   text?: unknown,
 *   ingestion?: Record<string, any> | null,
 *   minCoverage?: number
 * }} [options]
 */
export function validateReasoningDocumentIntegrity({ inputType, text, ingestion, minCoverage = DEFAULT_MIN_REASONING_PAGE_COVERAGE } = {}) {
  const kind = String(inputType || 'narrative');
  const src = String(text || '');
  if (kind === 'narrative') return { ok: src.trim().length >= 40, reasons: src.trim().length >= 40 ? [] : ['narrative_too_short'] };
  const reasons = [];
  if (!ingestion || typeof ingestion !== 'object') reasons.push('document_ingestion_missing');
  const mode = String(ingestion?.mode || '').toUpperCase();
  if (!mode || mode === 'PENDING') reasons.push('document_ingestion_not_final');
  const semantic = semanticSourceText(src);
  if (semantic.length < 80) reasons.push('semantic_source_too_short');
  if (String(ingestion?.source_quality?.status || '').toUpperCase() === 'INSUFFICIENT') reasons.push('source_quality_insufficient');
  const coverage = effectiveIngestionCoverage(ingestion || {});
  if (coverage < minCoverage) reasons.push('page_coverage_below_minimum');
  const total = Math.max(0, Math.round(num(ingestion?.pages_total)));
  const markers = countPageMarkers(src);
  if (total > 1) {
    const minimumMarkers = Math.max(1, Math.ceil(total * Math.min(0.90, Math.max(minCoverage, coverage))));
    if (markers < minimumMarkers) reasons.push('page_structure_incomplete');
  }
  return { ok: reasons.length === 0, reasons, coverage, semantic_length: semantic.length, page_markers: markers, pages_total: total };
}

/**
 * Validate whether the semantic model has enough material structure to support legal reasoning.
 * @param {{
 *   inputType?: unknown,
 *   text?: unknown,
 *   evidence?: Record<string, any> | null
 * }} [options]
 */
export function validateSemanticModelIntegrity({ inputType, text, evidence } = {}) {
  const kind = String(inputType || 'narrative');
  if (kind === 'narrative') return { ok: true, reasons: [] };
  const srcLen = semanticSourceText(text).length;
  const e = evidence || {};
  const counts = {
    facts: Array.isArray(e.textual_facts) ? e.textual_facts.length : 0,
    claims: Array.isArray(e.party_claims) ? e.party_claims.length : 0,
    supporting: Array.isArray(e.supporting_evidence) ? e.supporting_evidence.length : 0,
    actors: Array.isArray(e.actors) ? e.actors.length : 0,
    timeline: Array.isArray(e.timeline) ? e.timeline.length : 0,
    issues: Array.isArray(e.issue_seeds) ? e.issue_seeds.length : 0,
  };
  const material = Object.values(counts).reduce((a, b) => a + b, 0);
  const reasons = [];
  if (srcLen >= 1200 && material === 0) reasons.push('semantic_model_empty_for_material_document');
  if (srcLen >= 5000 && material < 2) reasons.push('semantic_model_materiality_too_low');
  return { ok: reasons.length === 0, reasons, source_length: srcLen, material_count: material, counts };
}

export function caseLifecycleState(record = {}) {
  const provenance = record?.analysis_provenance || {};
  const explicit = String(provenance?.job_status || record?.job_status || '').toUpperCase();
  if (explicit) return explicit === 'COMPLETE' ? 'COMPLETED' : explicit;
  const reading = String(record?.document_reading?.status || '').toUpperCase();
  const ingestionMode = String(record?.document_ingestion?.mode || '').toUpperCase();
  if (reading === 'PROCESSING' || ingestionMode === 'PENDING' || record?.summary === 'Case Analysis sedang diproses.') return 'RUNNING';
  if (reading === 'FAILED_RECOVERABLE') return 'FAILED_RECOVERABLE';
  // Legacy records before durable jobs had no explicit lifecycle marker. Treat them
  // as completed only when they contain a substantive analysis payload.
  const substantive = (Array.isArray(record?.legal_issues) && record.legal_issues.length > 0)
    || (Array.isArray(record?.facts) && record.facts.length > 0)
    || (String(record?.legal_analysis || '').trim().length > 0);
  return substantive ? 'COMPLETED_LEGACY' : 'UNKNOWN';
}

export function isCaseAnalysisFinalized(record = {}) {
  const state = caseLifecycleState(record);
  const finalizedFlag = record?.analysis_provenance?.finalized;
  if (finalizedFlag === false) return false;
  if (state === 'COMPLETED') return finalizedFlag !== false;
  if (state === 'COMPLETED_LEGACY') return true;
  return false;
}
