import { inflateRawSync, inflateSync } from 'node:zlib';
import { getAI } from './gemini';

export interface DocumentIngestionResult {
  text: string;
  mode: 'TEXT' | 'RTF' | 'DOCX_LOCAL' | 'PDF_LOCAL_TEXT' | 'AI_DOCUMENT_READING' | 'AI_OCR';
  pages_total?: number;
  pages_ocr?: number;
  coverage_ratio: number;
  manual_review_required: boolean;
  warning?: string;
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

async function extractWithAI(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const ai = getAI();
  if (!ai) return '';
  // Keep inline documents bounded. Larger files must have a usable local text layer or be split externally.
  if (buffer.length > 20 * 1024 * 1024) return '';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: buffer.toString('base64') } },
          { text: `Transkripsikan isi dokumen hukum "${filename}" secara setia ke teks biasa. Jangan menganalisis, jangan merangkum, jangan menambah fakta. Pertahankan urutan paragraf, nomor pasal, tanggal, nominal, nama pihak, dan heading. Jika bagian tidak terbaca, tandai [TIDAK TERBACA].` }
        ]
      }],
      config: { temperature: 0 }
    });
    return normalizeLegalText(response.text || '');
  } catch (e) {
    console.warn('Document AI reading failed:', e);
    return '';
  }
}

export async function extractUploadedDocument(buffer: Buffer, originalName: string, mimeType = ''): Promise<DocumentIngestionResult> {
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
    const aiText = await extractWithAI(buffer, 'application/pdf', originalName);
    if (aiText.length >= 80) {
      return { text: aiText, mode: 'AI_DOCUMENT_READING', pages_total: local.pages, pages_ocr: local.pages, coverage_ratio: 1, manual_review_required: /\[TIDAK TERBACA\]/i.test(aiText) };
    }
    throw new Error('PDF tidak memiliki text layer yang dapat dibaca. OCR dokumen tidak tersedia/berhasil; tambahkan narasi manual atau gunakan PDF dengan text layer.');
  }
  if (/^image\//i.test(mimeType) || ['.png','.jpg','.jpeg','.webp','.tif','.tiff'].includes(ext)) {
    const mt = mimeType && /^image\//i.test(mimeType) ? mimeType : ext === '.png' ? 'image/png' : 'image/jpeg';
    const aiText = await extractWithAI(buffer, mt, originalName);
    if (aiText.length >= 40) return { text: aiText, mode: 'AI_OCR', pages_total: 1, pages_ocr: 1, coverage_ratio: 1, manual_review_required: /\[TIDAK TERBACA\]/i.test(aiText) };
    throw new Error('Scan/foto tidak dapat dibaca. OCR berbantuan AI tidak tersedia/berhasil; masukkan kronologi secara manual.');
  }

  throw new Error(`Format berkas ${ext || mimeType || 'tidak dikenal'} belum didukung untuk pembacaan hukum.`);
}
