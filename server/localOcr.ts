import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export type LocalOcrProgress = {
  percent: number;
  stage: 'OCR_PREPARE' | 'OCR_PAGE' | 'OCR_COMPLETE';
  detail: string;
  page?: number;
  pages?: number;
};

export type LocalOcrResult = {
  text: string;
  pages: number;
  pages_succeeded: number;
  failed_pages: number[];
  average_confidence: number;
  page_confidences: Array<{ page: number; confidence: number; status: 'OK' | 'FAILED' }>;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name] || '');
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(Math.round(parsed), min, max);
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          try { onTimeout?.(); } catch { /* timeout cleanup is best-effort */ }
          reject(new Error(`${label} melewati batas waktu ${Math.ceil(ms / 1000)} detik`));
        }, ms);
        // A watchdog must not keep the Node process alive by itself.
        (timer as any).unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function workerOptions(logger?: (message: any) => void): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  const explicitLangPath = String(process.env.OCR_LANG_PATH || '').trim();
  if (explicitLangPath) {
    options.langPath = explicitLangPath;
  } else {
    // Ship Indonesian traineddata as an npm dependency so OCR does not need an API key
    // or a language-data download from a third-party CDN at runtime.
    const require = createRequire(path.join(process.cwd(), 'package.json'));
    try {
      const indData = require('@tesseract.js-data/ind');
      if (indData?.langPath) options.langPath = indData.langPath;
    } catch { /* dependency error is reported by createWorker later */ }
  }
  const cachePath = String(process.env.OCR_CACHE_PATH || '').trim();
  if (cachePath) options.cachePath = cachePath;
  if (logger) options.logger = logger;
  return options;
}

async function createLocalWorker(onProgress?: (p: LocalOcrProgress) => void, page = 1, pages = 1) {
  const { createWorker } = await import('tesseract.js');
  const langs = String(process.env.OCR_LANGS || 'ind').trim() || 'ind';
  let lastReported = -1;
  return createWorker(langs, undefined, workerOptions((message: any) => {
    if (message?.status !== 'recognizing text') return;
    const fraction = Number(message.progress || 0);
    const local = Math.round(fraction * 100);
    if (local < lastReported + 5 && local < 100) return;
    lastReported = local;
    const pageBase = 30 + ((page - 1) / Math.max(1, pages)) * 13;
    const pageSpan = 13 / Math.max(1, pages);
    onProgress?.({
      percent: Math.round(Math.min(43, pageBase + pageSpan * fraction)),
      stage: 'OCR_PAGE',
      detail: `OCR lokal halaman ${page}/${pages} • ${local}%`,
      page,
      pages
    });
  }) as any);
}

async function recognizeImageBuffer(
  image: Buffer,
  onProgress?: (p: LocalOcrProgress) => void,
  page = 1,
  pages = 1,
  worker?: any
): Promise<{ text: string; confidence: number }> {
  const ownWorker = !worker;
  const activeWorker = worker || await createLocalWorker(onProgress, page, pages);
  const timeoutMs = envNumber('OCR_PAGE_TIMEOUT_MS', 120_000, 15_000, 600_000);
  try {
    const result: any = await withTimeout(activeWorker.recognize(image), timeoutMs, `OCR lokal halaman ${page}`, () => { void Promise.resolve(activeWorker.terminate?.()).catch(() => undefined); });
    return {
      text: String(result?.data?.text || ''),
      confidence: Number(result?.data?.confidence || 0)
    };
  } finally {
    if (ownWorker) {
      try { await activeWorker.terminate(); } catch { /* best effort */ }
    }
  }
}

export async function ocrImageLocal(
  buffer: Buffer,
  onProgress?: (p: LocalOcrProgress) => void
): Promise<LocalOcrResult> {
  onProgress?.({ percent: 29, stage: 'OCR_PREPARE', detail: 'Menyiapkan Tesseract OCR lokal tanpa API key.' });
  const res = await recognizeImageBuffer(buffer, onProgress, 1, 1);
  onProgress?.({ percent: 44, stage: 'OCR_COMPLETE', detail: `OCR lokal selesai • confidence ${Math.round(res.confidence)}%` });
  return { text: res.text, pages: 1, pages_succeeded: 1, failed_pages: [], average_confidence: res.confidence, page_confidences: [{ page: 1, confidence: res.confidence, status: 'OK' }] };
}

export async function ocrPdfLocal(
  buffer: Buffer,
  onProgress?: (p: LocalOcrProgress) => void
): Promise<LocalOcrResult> {
  onProgress?.({ percent: 29, stage: 'OCR_PREPARE', detail: 'Menyiapkan renderer PDF dan Tesseract OCR lokal tanpa API key.' });

  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const canvasMod: any = await import('@napi-rs/canvas');
  const { createCanvas, DOMMatrix, ImageData, Path2D } = canvasMod;

  // pdf.js expects these browser primitives when rendering in Node.
  if (!(globalThis as any).DOMMatrix && DOMMatrix) (globalThis as any).DOMMatrix = DOMMatrix;
  if (!(globalThis as any).ImageData && ImageData) (globalThis as any).ImageData = ImageData;
  if (!(globalThis as any).Path2D && Path2D) (globalThis as any).Path2D = Path2D;

  class NodeCanvasFactory {
    create(width: number, height: number) {
      const canvas = createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
      const context = canvas.getContext('2d');
      return { canvas, context };
    }
    reset(target: any, width: number, height: number) {
      target.canvas.width = Math.max(1, Math.ceil(width));
      target.canvas.height = Math.max(1, Math.ceil(height));
    }
    destroy(target: any) {
      target.canvas.width = 1;
      target.canvas.height = 1;
      target.canvas = null;
      target.context = null;
    }
  }

  // pdfjs-dist v6 requires an explicit WASM base URL for JBIG2/OpenJPEG/QCMS
  // image decoders. Resolve it from the installed package so OCR stays fully local
  // and works in both tsx (ESM) and the production CJS bundle.
  const requireFromProject = createRequire(path.join(process.cwd(), 'package.json'));
  const pdfjsRoot = path.dirname(requireFromProject.resolve('pdfjs-dist/package.json'));
  const dirUrl = (dir: string) => pathToFileURL(path.join(pdfjsRoot, dir) + path.sep).href;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    wasmUrl: dirUrl('wasm'),
    standardFontDataUrl: dirUrl('standard_fonts'),
    cMapUrl: dirUrl('cmaps'),
    cMapPacked: true,
    iccUrl: dirUrl('iccs')
  });
  const pdf = await loadingTask.promise;
  const pages = Number(pdf.numPages || 0);
  if (!pages) throw new Error('PDF tidak memiliki halaman yang dapat dirender untuk OCR lokal.');

  // Legal case files are commonly dozens of pages. Do not allow an accidental
  // OCR_MAX_PAGES=1 (or similarly tiny value) to disable normal case files.
  // The minimum effective ceiling is 50 pages; operators can raise it up to 500.
  const configuredMaxPages = Number(process.env.OCR_MAX_PAGES || '');
  const maxPages = envNumber('OCR_MAX_PAGES', 150, 50, 500);
  if (Number.isFinite(configuredMaxPages) && configuredMaxPages > 0 && configuredMaxPages < 50) {
    console.warn(`OCR_MAX_PAGES=${configuredMaxPages} terlalu rendah untuk dokumen perkara; menggunakan batas aman ${maxPages} halaman.`);
  }
  if (pages > maxPages) {
    throw new Error(`PDF memiliki ${pages} halaman dan melewati batas OCR lokal ${maxPages} halaman. Naikkan OCR_MAX_PAGES (maksimum 500) bila seluruh dokumen memang harus diproses.`);
  }

  // 160 DPI is a better default for long legal PDFs: materially faster than 180 DPI
  // while still preserving ordinary typed Indonesian legal text. It remains configurable.
  const dpi = envNumber('OCR_PDF_DPI', 160, 120, 300);
  const scale = dpi / 72;
  const texts: string[] = [];
  const confidences: number[] = [];
  const pageConfidences: Array<{ page: number; confidence: number; status: 'OK' | 'FAILED' }> = [];
  const failedPages: number[] = [];
  let worker: any = null;

  try {
    // Reuse one worker across all pages; this is substantially faster than loading language data per page.
    worker = await createLocalWorker(undefined, 1, pages);
    for (let i = 1; i <= pages; i++) {
      if (!worker) worker = await createLocalWorker(undefined, i, pages);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const factory = new NodeCanvasFactory();
      const target = factory.create(viewport.width, viewport.height);

      onProgress?.({
        percent: Math.round(30 + ((i - 1) / pages) * 13),
        stage: 'OCR_PAGE',
        detail: `Merender dan membaca halaman ${i}/${pages} secara lokal.`,
        page: i,
        pages
      });

      const renderTask = page.render({
        canvasContext: target.context,
        viewport,
        canvasFactory: factory
      });
      const renderTimeoutMs = envNumber('OCR_RENDER_TIMEOUT_MS', 60_000, 10_000, 300_000);
      await withTimeout(renderTask.promise, renderTimeoutMs, `Render PDF halaman ${i}`, () => {
        try { renderTask.cancel?.(); } catch { /* best effort */ }
      });
      const png: Buffer = target.canvas.toBuffer('image/png');

      const timeoutMs = envNumber('OCR_PAGE_TIMEOUT_MS', 120_000, 15_000, 600_000);
      try {
        const activeWorker = worker;
        const result: any = await withTimeout(activeWorker.recognize(png), timeoutMs, `OCR lokal halaman ${i}`, () => {
          // Terminate the timed-out worker so the next page is not queued behind a hung recognition.
          if (worker === activeWorker) worker = null;
          void Promise.resolve(activeWorker.terminate?.()).catch(() => undefined);
        });
        const pageText = String(result?.data?.text || '').trim();
        const confidence = Number(result?.data?.confidence || 0);
        texts.push(`--- HALAMAN ${i} ---\n${pageText || '[OCR TIDAK MENGHASILKAN TEKS]'}`);
        confidences.push(confidence);
        pageConfidences.push({ page: i, confidence, status: 'OK' });
      } catch (err: any) {
        if (/melewati batas waktu/i.test(String(err?.message || err))) worker = null;
        failedPages.push(i);
        pageConfidences.push({ page: i, confidence: 0, status: 'FAILED' });
        texts.push(`--- HALAMAN ${i} ---\n[OCR GAGAL: ${String(err?.message || err).replace(/\s+/g, ' ').slice(0, 180)}]`);
        console.warn(`OCR lokal halaman ${i}/${pages} gagal; proses dilanjutkan:`, err?.message || err);
      } finally {
        factory.destroy(target);
        try { page.cleanup?.(); } catch { /* best effort */ }
      }
    }
  } finally {
    try { await worker?.terminate(); } catch { /* best effort */ }
    try { await pdf.destroy?.(); } catch { /* best effort */ }
  }

  const average = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
  onProgress?.({
    percent: 44,
    stage: 'OCR_COMPLETE',
    detail: `OCR lokal selesai untuk ${pages} halaman • confidence rata-rata ${Math.round(average)}%.`,
    pages,
    page: pages
  });
  const succeeded = pages - failedPages.length;
  if (!succeeded) throw new Error(`OCR lokal gagal pada seluruh ${pages} halaman.`);
  return { text: texts.join('\n\n'), pages, pages_succeeded: succeeded, failed_pages: failedPages, average_confidence: average, page_confidences: pageConfidences };
}
