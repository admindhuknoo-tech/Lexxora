import { inflateRawSync, inflateSync } from 'node:zlib';
import { ocrImageLocal, ocrPdfLocal } from './localOcr';

export interface DocumentIngestionResult {
  text: string;
  mode: 'TEXT' | 'RTF' | 'DOCX_LOCAL' | 'PDF_LOCAL_TEXT' | 'LOCAL_OCR';
  pages_total?: number;
  pages_ocr?: number;
  coverage_ratio: number;
  manual_review_required: boolean;
  warning?: string;
  average_ocr_confidence?: number;
  page_confidences?: Array<{ page: number; confidence: number; status: 'OK' | 'FAILED' }>;
  failed_pages?: number[];
  source_quality?: {
    status: 'GOOD' | 'REVIEW_REQUIRED' | 'INSUFFICIENT';
    minimum_analysis_confidence: number;
    usable_pages: number;
    low_confidence_pages: number[];
    excluded_pages: number[];
    excluded_spans?: number;
    repaired_spans?: number;
  };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function normalizeLegalText(input: unknown): string {
  let text = String(input ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\uFFFD+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Reject classic binary-as-text contamination rather than allowing it into legal facts.
  if (text.length) {
    const sample = text.slice(0, 12000);
    const readable = [...sample].filter(ch => ch === '\n' || ch === '\t' || /[\p{L}\p{N}\p{P}\p{Zs}]/u.test(ch)).length;
    const ratio = readable / Math.max(1, [...sample].length);
    if (ratio < 0.72) text = '';
  }
  return text;
}

function stripRtf(buffer: Buffer): string {
  const src = buffer.toString('latin1');
  let out = src
    .replace(/\\u(-?\d+)\??/g, (_, n) => {
      const v = Number(n); return String.fromCharCode(v < 0 ? v + 65536 : v);
    })
    .replace(/\\'(\w{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\{\\\*[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '');
  return normalizeLegalText(out);
}

function findZipEntry(buffer: Buffer, wanted: string): Buffer | null {
  // Minimal ZIP central-directory reader, sufficient for standard DOCX packages.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  let pos = centralOffset;
  while (pos + 46 <= buffer.length && buffer.readUInt32LE(pos) === 0x02014b50) {
    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const fileNameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.subarray(pos + 46, pos + 46 + fileNameLen).toString('utf8');
    if (name === wanted && localOffset + 30 <= buffer.length && buffer.readUInt32LE(localOffset) === 0x04034b50) {
      const localNameLen = buffer.readUInt16LE(localOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return Buffer.from(compressed);
      if (method === 8) return inflateRawSync(compressed);
      return null;
    }
    pos += 46 + fileNameLen + extraLen + commentLen;
  }
  return null;
}

function extractDocx(buffer: Buffer): string {
  const xml = findZipEntry(buffer, 'word/document.xml');
  if (!xml) return '';
  const raw = xml.toString('utf8')
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, '$1')
    .replace(/<[^>]+>/g, '');
  return normalizeLegalText(decodeXmlEntities(raw));
}

function pdfUnescapeLiteral(s: string): string {
  return s
    .replace(/\\([\\()])/g, '$1')
    .replace(/\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\t/g, '\t')
    .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
}

function extractTextFromPdfStream(stream: Buffer): string {
  const src = stream.toString('latin1');
  const blocks = src.match(/BT[\s\S]*?ET/g) || [];
  const out: string[] = [];
  for (const block of blocks) {
    const literals = [...block.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)].map(m => m[0].replace(/\s*Tj$/, '').slice(1, -1));
    const arrays = [...block.matchAll(/\[(.*?)\]\s*TJ/gs)];
    literals.forEach(v => out.push(pdfUnescapeLiteral(v)));
    arrays.forEach(a => {
      const pieces = [...a[1].matchAll(/\((?:\\.|[^\\)])*\)/g)].map(m => pdfUnescapeLiteral(m[0].slice(1, -1)));
      if (pieces.length) out.push(pieces.join(''));
    });
  }
  return out.join('\n');
}

function extractPdfText(buffer: Buffer): { text: string; pages: number } {
  const latin = buffer.toString('latin1');
  const pages = Math.max(1, (latin.match(/\/Type\s*\/Page\b/g) || []).length);
  const chunks: string[] = [];
  const re = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin))) {
    const dict = m[1];
    const start = m.index + m[0].indexOf(m[2]);
    const raw = buffer.subarray(start, start + Buffer.byteLength(m[2], 'latin1'));
    let decoded = raw;
    try {
      if (/\/FlateDecode\b/.test(dict)) decoded = inflateSync(raw);
    } catch { continue; }
    const t = extractTextFromPdfStream(decoded);
    if (t) chunks.push(t);
  }
  return { text: normalizeLegalText(chunks.join('\n')), pages };
}

export type DocumentIngestionProgress = {
  percent: number;
  stage: 'OCR_PREPARE' | 'OCR_PAGE' | 'OCR_COMPLETE';
  detail: string;
  page?: number;
  pages?: number;
};

type DocumentIngestionProgressCallback = (progress: DocumentIngestionProgress) => void;

function ocrAnalysisThreshold(): number {
  const raw = Number(process.env.OCR_MIN_ANALYSIS_CONFIDENCE || '60');
  if (!Number.isFinite(raw)) return 60;
  return Math.max(40, Math.min(90, Math.round(raw)));
}

type OcrLineQuality = {
  tokens: string[];
  noisyCount: number;
  normalWords: number;
  allCapsLong: number;
  weirdPunct: number;
  ratio: number;
};

function measureOcrLineQuality(raw: string): OcrLineQuality {
  const line = String(raw || '').trim();
  const tokens = line
    .replace(/[“”"'`()[\]{}<>:;,]/g, ' ')
    .split(/\s+/)
    .map(t => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.\/-]+$/gu, ''))
    .filter(Boolean);
  const single = tokens.filter(t => /^\p{L}$/u.test(t)).length;
  const shortCaps = tokens.filter(t => /^[A-Z]{2,3}$/.test(t)).length;
  const mixedCaseTiny = tokens.filter(t => /^[A-Za-z]{2,3}$/.test(t) && /[A-Z]/.test(t) && /[a-z]/.test(t)).length;
  const alphaNumNoise = tokens.filter(t => /[A-Za-z]/.test(t) && /\d/.test(t) && !/^\d+[A-Za-z]?$/i.test(t) && !/^(?:UU|PP|SE|No|Nomor)?\.?\d+[A-Za-z\/-]*$/i.test(t)).length;
  const allCapsLong = tokens.filter(t => /^[A-Z]{4,}$/.test(t)).length;
  const normalWords = tokens.filter(t => /^[A-Za-zÀ-ÿ]{4,}$/.test(t) && /[aeiouAEIOU]/.test(t)).length;
  const weirdPunct = (line.match(/[#$%^*_=+|~]/g) || []).length;
  const noisyCount = single + shortCaps + mixedCaseTiny + alphaNumNoise;
  return { tokens, noisyCount, normalWords, allCapsLong, weirdPunct, ratio: noisyCount / Math.max(1, tokens.length) };
}

function looksLikeOcrGarbageLine(raw: string): boolean {
  const line = String(raw || '').trim();
  if (!line || /^--- HALAMAN\s+\d+\s+---$/i.test(line) || /^\[HALAMAN DIKELUARKAN/i.test(line)) return false;
  if (/\b(?:camscanner|scanned\s+by|dipindai\s+dengan)\b/i.test(line)) return true;

  const q = measureOcrLineQuality(line);
  if (q.tokens.length < 4) return false;

  // Strong OCR-noise signatures only. Keep ordinary legal headings, names, addresses,
  // citations and all-caps prose unless the line is dominated by fragmented tokens.
  if (q.tokens.length >= 6 && q.ratio >= 0.45 && q.normalWords <= Math.ceil(q.tokens.length * 0.45)) return true;
  if (q.tokens.length >= 5 && q.noisyCount >= 4 && q.allCapsLong >= 1 && q.weirdPunct >= 1) return true;
  if (q.tokens.length <= 8 && q.noisyCount >= Math.ceil(q.tokens.length * 0.65) && q.normalWords <= 1) return true;
  return false;
}

const LEGAL_RECOVERY_ANCHOR = /\b(?:Jawaban(?:\s+Pertama)?|Gugatan|Penggugat|Tergugat|Bahwa|Eksepsi|Petitum|Posita|Berdasarkan|Surat\s+Kuasa|Menghukum|Memohon|Sertipikat|Putusan|Perkara|Terdakwa|Penuntut\s+Umum|Majelis\s+Hakim)\b/i;

function salvageMixedOcrLine(raw: string): { text: string; repaired: boolean; excluded: boolean } {
  const line = String(raw || '').trim();
  if (!line) return { text: raw, repaired: false, excluded: false };
  if (looksLikeOcrGarbageLine(line)) return { text: '', repaired: false, excluded: true };

  // Mixed-content OCR is common in headers/letterheads: a damaged visual fragment can
  // be concatenated with a valid legal sentence on the same OCR line. If the prefix is
  // materially noisy but the suffix begins at a legal anchor and is linguistically
  // usable, retain only the legal suffix instead of keeping or dropping the whole line.
  const anchor = LEGAL_RECOVERY_ANCHOR.exec(line);
  if (anchor && anchor.index >= 12) {
    const prefix = line.slice(0, anchor.index).trim();
    const suffix = line.slice(anchor.index).trim();
    const pq = measureOcrLineQuality(prefix);
    const sq = measureOcrLineQuality(suffix);
    const prefixLooksNoisy = pq.tokens.length >= 6 && (
      pq.ratio >= 0.30 ||
      (pq.noisyCount >= 4 && pq.normalWords <= Math.ceil(pq.tokens.length * 0.55)) ||
      /\b(?:MENGEGGT|MANGA\s+MPA\s+EDAN|brranaradd|\bPAI\s+fY\b)\b/i.test(prefix)
    );
    const suffixLooksUsable = sq.tokens.length >= 3 && sq.ratio < 0.45 && sq.normalWords >= 1;
    if (prefixLooksNoisy && suffixLooksUsable) return { text: suffix, repaired: true, excluded: false };
  }

  return { text: raw, repaired: false, excluded: false };
}

function repairOcrStructuralLine(raw: string): { text: string; repaired: boolean } {
  const line = String(raw || '').trim();
  // OCR/layout may merge a Roman party number + separator word with the actual name.
  // Repair only this narrow structure; do not rewrite ordinary "A melawan B" case titles.
  const m = line.match(/^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\s+Melawan\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ.'’-]{2,}(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ.'’-]{2,}){0,3})$/u);
  if (m) return { text: m[1], repaired: true };
  return { text: raw, repaired: false };
}

export function applyOcrSpanQualityGuard(text: string): {
  text: string;
  excluded_spans: number;
  repaired_spans: number;
} {
  const src = String(text || '');
  if (!src) return { text: '', excluded_spans: 0, repaired_spans: 0 };

  // V6.11.3 root-cause fix: Tesseract frequently wraps one visual header/contact
  // block across several physical lines. A line-only guard can drop the first
  // obviously broken line while leaving adjacent fragments alive; evidenceModel
  // later normalizes page whitespace and those surviving fragments are rejoined
  // with the legal sentence, recreating the apparent "leak".
  //
  // Sanitize at two levels:
  //   1) physical OCR line (precise exclusions / narrow structural repairs)
  //   2) logical OCR block (wrapped lines joined only within the same paragraph)
  // This keeps page boundaries and blank-line paragraph boundaries intact while
  // ensuring a damaged multi-line prefix cannot survive merely because each
  // individual wrapped line looks marginally plausible.
  let excluded = 0;
  let repaired = 0;
  const out: string[] = [];
  let block: string[] = [];

  const flushBlock = () => {
    if (!block.length) return;
    const kept: string[] = [];
    for (const rawLine of block) {
      const salvaged = salvageMixedOcrLine(rawLine);
      if (salvaged.excluded) {
        excluded++;
        continue;
      }
      let candidate = salvaged.text;
      if (salvaged.repaired) repaired++;
      const fixed = repairOcrStructuralLine(candidate);
      if (fixed.repaired) repaired++;
      candidate = fixed.text;
      if (candidate.trim()) kept.push(candidate.trim());
    }

    if (kept.length) {
      const logicalBlock = kept.join(' ').replace(/\s+/g, ' ').trim();
      const blockSalvaged = salvageMixedOcrLine(logicalBlock);
      if (blockSalvaged.excluded) {
        excluded++;
      } else {
        let finalText = blockSalvaged.text;
        if (blockSalvaged.repaired) repaired++;
        const fixedBlock = repairOcrStructuralLine(finalText);
        if (fixedBlock.repaired) repaired++;
        finalText = fixedBlock.text.trim();
        if (finalText) out.push(finalText);
      }
    }
    block = [];
  };

  for (const rawLine of src.split('\n')) {
    const line = String(rawLine || '');
    if (/^--- HALAMAN\s+\d+\s+---$/i.test(line.trim())) {
      flushBlock();
      out.push(line.trim());
      continue;
    }
    if (!line.trim()) {
      flushBlock();
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    block.push(line);
  }
  flushBlock();

  return {
    text: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    excluded_spans: excluded,
    repaired_spans: repaired,
  };
}

export function applyOcrSourceQualityGuard(
  text: string,
  pageConfidences: Array<{ page: number; confidence: number; status: 'OK' | 'FAILED' }> = [],
): {
  text: string;
  status: 'GOOD' | 'REVIEW_REQUIRED' | 'INSUFFICIENT';
  minimum_analysis_confidence: number;
  usable_pages: number;
  low_confidence_pages: number[];
  excluded_pages: number[];
  excluded_spans: number;
  repaired_spans: number;
} {
  const threshold = ocrAnalysisThreshold();
  const lowConfidencePages = pageConfidences
    .filter(p => p.status === 'OK' && Number(p.confidence || 0) < 75)
    .map(p => p.page);
  const excludedPages = pageConfidences
    .filter(p => p.status === 'FAILED' || Number(p.confidence || 0) < threshold)
    .map(p => p.page);
  const excluded = new Set(excludedPages);
  const usablePages = pageConfidences.filter(p => p.status === 'OK' && !excluded.has(p.page)).length;

  let guardedText = String(text || '');
  const pageBlock = /--- HALAMAN\s+(\d+)\s+---\n([\s\S]*?)(?=\n\n--- HALAMAN\s+\d+\s+---|$)/g;
  const matches = [...guardedText.matchAll(pageBlock)];
  if (matches.length) {
    guardedText = matches.map(m => {
      const page = Number(m[1]);
      if (excluded.has(page)) {
        return `--- HALAMAN ${page} ---\n[HALAMAN DIKELUARKAN DARI ANALISIS OTOMATIS KARENA KUALITAS OCR RENDAH]`;
      }
      return m[0].trim();
    }).join('\n\n');
  } else if (pageConfidences.length === 1 && excluded.has(pageConfidences[0].page)) {
    guardedText = '';
  }

  const spanGuard = applyOcrSpanQualityGuard(guardedText);
  guardedText = spanGuard.text;

  const status = usablePages <= 0 && pageConfidences.length > 0
    ? 'INSUFFICIENT'
    : excludedPages.length > 0 || lowConfidencePages.length > 0 || spanGuard.excluded_spans > 0 || spanGuard.repaired_spans > 0
      ? 'REVIEW_REQUIRED'
      : 'GOOD';

  return {
    text: guardedText,
    status,
    minimum_analysis_confidence: threshold,
    usable_pages: usablePages || (pageConfidences.length ? 0 : 1),
    low_confidence_pages: lowConfidencePages,
    excluded_pages: excludedPages,
    excluded_spans: spanGuard.excluded_spans,
    repaired_spans: spanGuard.repaired_spans,
  };
}

function ocrCoverage(text: string, confidence = 0): { coverage: number; manualReview: boolean } {
  const clean = String(text || '').trim();
  if (!clean) return { coverage: 0, manualReview: true };
  const lines = clean.split(/\n+/).map(v => v.trim()).filter(Boolean);
  const unreadable = lines.filter(v => /\[TIDAK TERBACA\]/i.test(v)).length;
  const suspicious = lines.filter(v => (v.match(/\?/g) || []).length >= Math.max(4, Math.floor(v.length * 0.2))).length;
  const structuralCoverage = Math.max(0, Math.min(1, 1 - (unreadable + suspicious) / Math.max(1, lines.length)));
  const confidenceCoverage = confidence > 0 ? Math.max(0, Math.min(1, confidence / 100)) : structuralCoverage;
  const coverage = Math.min(structuralCoverage, confidenceCoverage);
  return { coverage, manualReview: coverage < 0.86 || unreadable > 0 || confidence < 70 };
}

export async function extractUploadedDocument(buffer: Buffer, originalName: string, mimeType = '', onProgress?: DocumentIngestionProgressCallback): Promise<DocumentIngestionResult> {
  const name = String(originalName || 'document').toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const plain = ['.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm'];

  if (plain.includes(ext) || /^text\//i.test(mimeType)) {
    const text = normalizeLegalText(buffer.toString('utf8'));
    if (!text) throw new Error('Berkas teks tidak berisi teks yang dapat dibaca.');
    return { text, mode: 'TEXT', coverage_ratio: 1, manual_review_required: false };
  }
  if (ext === '.rtf' || /rtf/i.test(mimeType)) {
    const text = stripRtf(buffer);
    if (!text) throw new Error('RTF tidak dapat dibaca sebagai teks hukum yang valid.');
    return { text, mode: 'RTF', coverage_ratio: 1, manual_review_required: false };
  }
  if (ext === '.docx' || /wordprocessingml/i.test(mimeType)) {
    const text = extractDocx(buffer);
    if (!text) throw new Error('DOCX tidak memiliki document.xml yang dapat dibaca atau berkas rusak.');
    return { text, mode: 'DOCX_LOCAL', coverage_ratio: 1, manual_review_required: false };
  }
  if (ext === '.pdf' || mimeType === 'application/pdf') {
    const local = extractPdfText(buffer);
    if (local.text.length >= 200) {
      return { text: local.text, mode: 'PDF_LOCAL_TEXT', pages_total: local.pages, coverage_ratio: 1, manual_review_required: false };
    }

    // Image-only/scanned PDF: render every page locally and run Tesseract OCR.
    // No Gemini/Google API key is required for document reading.
    try {
      const localOcr = await ocrPdfLocal(buffer, onProgress);
      const rawText = normalizeLegalText(localOcr.text);
      if (rawText.length < 80) throw new Error(`hasil OCR terlalu pendek (${rawText.length} karakter)`);
      const sourceQuality = applyOcrSourceQualityGuard(rawText, localOcr.page_confidences);
      const text = normalizeLegalText(sourceQuality.text);
      if (sourceQuality.status === 'INSUFFICIENT' || text.length < 80) {
        throw new Error(`kualitas OCR tidak cukup untuk analisis otomatis; periksa dokumen asli atau unggah scan yang lebih jelas`);
      }
      const quality = ocrCoverage(text, localOcr.average_confidence);
      const pagesTotal = localOcr.pages || local.pages || 1;
      const pagesSucceeded = localOcr.pages_succeeded || Math.max(0, pagesTotal - (localOcr.failed_pages?.length || 0));
      const pageCoverage = pagesSucceeded / Math.max(1, pagesTotal);
      const coverage = Math.min(quality.coverage, pageCoverage);
      const failedPages = localOcr.failed_pages || [];
      const manualReview = quality.manualReview || failedPages.length > 0 || pageCoverage < 0.999 || sourceQuality.status !== 'GOOD';
      return {
        text,
        mode: 'LOCAL_OCR',
        pages_total: pagesTotal,
        pages_ocr: pagesSucceeded,
        coverage_ratio: coverage,
        manual_review_required: manualReview,
        average_ocr_confidence: localOcr.average_confidence,
        page_confidences: localOcr.page_confidences,
        failed_pages: failedPages,
        source_quality: sourceQuality,
        warning: sourceQuality.excluded_pages.length
          ? `OCR lokal mengecualikan halaman ${sourceQuality.excluded_pages.join(', ')} dari analisis otomatis karena kualitasnya di bawah ambang ${sourceQuality.minimum_analysis_confidence}%. Cocokkan halaman tersebut dengan dokumen asli.`
          : (sourceQuality.excluded_spans || 0) > 0 || (sourceQuality.repaired_spans || 0) > 0
          ? `OCR lokal menahan ${sourceQuality.excluded_spans || 0} potongan teks yang terindikasi rusak dan menormalkan ${sourceQuality.repaired_spans || 0} potongan struktur. Cocokkan bagian penting dengan dokumen asli.`
          : failedPages.length
          ? `OCR lokal membaca ${pagesSucceeded}/${pagesTotal} halaman. Halaman gagal: ${failedPages.join(', ')}. Confidence rata-rata ${Math.round(localOcr.average_confidence)}%; halaman gagal wajib diperiksa manual.`
          : manualReview
            ? `OCR lokal selesai untuk ${pagesTotal} halaman dengan confidence rata-rata ${Math.round(localOcr.average_confidence)}%. Cocokkan bagian penting dengan dokumen asli sebelum digunakan.`
            : `OCR lokal selesai untuk ${pagesTotal} halaman dengan confidence rata-rata ${Math.round(localOcr.average_confidence)}%.`
      };
    } catch (e: any) {
      throw new Error(`PDF scan/image-only terdeteksi. OCR lokal gagal: ${String(e?.message || e)}. Tidak diperlukan external AI/API key.`);
    }
  }
  if (/^image\//i.test(mimeType) || ['.png','.jpg','.jpeg','.webp','.tif','.tiff'].includes(ext)) {
    try {
      const localOcr = await ocrImageLocal(buffer, onProgress);
      const rawText = normalizeLegalText(localOcr.text);
      if (rawText.length < 40) throw new Error(`hasil OCR terlalu pendek (${rawText.length} karakter)`);
      const sourceQuality = applyOcrSourceQualityGuard(rawText, localOcr.page_confidences);
      if (sourceQuality.status === 'INSUFFICIENT') {
        throw new Error(`kualitas OCR ${Math.round(localOcr.average_confidence)}% berada di bawah ambang analisis otomatis ${sourceQuality.minimum_analysis_confidence}%; unggah gambar yang lebih jelas`);
      }
      const text = normalizeLegalText(sourceQuality.text);
      const quality = ocrCoverage(text, localOcr.average_confidence);
      return {
        text,
        mode: 'LOCAL_OCR',
        pages_total: 1,
        pages_ocr: 1,
        coverage_ratio: quality.coverage,
        manual_review_required: quality.manualReview || sourceQuality.status !== 'GOOD',
        average_ocr_confidence: localOcr.average_confidence,
        page_confidences: localOcr.page_confidences,
        failed_pages: localOcr.failed_pages,
        source_quality: sourceQuality,
        warning: quality.manualReview || sourceQuality.status !== 'GOOD'
          ? `OCR lokal selesai dengan confidence ${Math.round(localOcr.average_confidence)}%. ${sourceQuality.excluded_spans ? `${sourceQuality.excluded_spans} potongan teks terindikasi rusak ditahan. ` : ''}Periksa hasil terhadap gambar asli.`
          : `OCR lokal selesai dengan confidence ${Math.round(localOcr.average_confidence)}%.`
      };
    } catch (e: any) {
      throw new Error(`Scan/foto tidak dapat ditranskripsikan oleh OCR lokal: ${String(e?.message || e)}. Tidak diperlukan external AI/API key.`);
    }
  }

  throw new Error(`Format berkas ${ext || mimeType || 'tidak dikenal'} belum didukung untuk pembacaan hukum.`);
}
