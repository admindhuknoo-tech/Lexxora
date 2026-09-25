import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as osMod from 'node:os';

export type LocalOcrProgress = {
  percent: number;
  stage: 'OCR_PREPARE' | 'OCR_PAGE' | 'OCR_COMPLETE';
  detail: string;
  page?: number;
  pages?: number;
  // V-OCR-RESILIENCE: aggregate, monotonic counters so a caller (durable job
  // store, UI) always has an authoritative "how far are we really" signal,
  // independent of any single worker's fine-grained recognition progress.
  // Field names/shapes match DocumentIngestionProgress in documentIngestion.ts
  // exactly (pages_completed: running count; failed_pages: the actual page
  // numbers, not a count) since these objects flow straight through to it
  // and then into server.ts's setCaseProgress() unchanged.
  pages_completed?: number;
  failed_pages?: number[];
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

export function envNumber(name: string, fallback: number, min: number, max: number): number {
  // An unset/blank environment variable must use the configured default.
  // Number('') and Number('   ') are both 0; parsing before checking for a
  // value therefore clamps an absent setting to `min` instead of `fallback`.
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
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

// V-OCR-RESILIENCE: wraps an onProgress callback so the percent it emits can
// never move backward. With N parallel lanes reporting independently, lane B
// finishing page 2 can otherwise arrive after lane A already reported deep
// progress on page 7, making the UI progress bar visibly jump backward. This
// wrapper is the single point all progress (per-worker granular AND
// per-page aggregate) flows through, so ordering across lanes never regresses
// what the caller sees.
function makeMonotonicProgress(onProgress?: (p: LocalOcrProgress) => void) {
  let maxPercent = -1;
  return (p: LocalOcrProgress) => {
    const percent = Math.max(p.percent, maxPercent);
    maxPercent = percent;
    onProgress?.({ ...p, percent });
  };
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

async function createLocalWorker(
  onProgress?: (p: LocalOcrProgress) => void,
  page = 1,
  pages = 1,
  getActivePage?: () => number,
) {
  const { createWorker } = await import('tesseract.js');
  const langs = String(process.env.OCR_LANGS || 'ind').trim() || 'ind';
  let lastReportedLocal = -1;
  let lastReportedPage = -1;
  return createWorker(langs, undefined, workerOptions((message: any) => {
    if (message?.status !== 'recognizing text') return;
    const activePage = clamp(Math.round(Number(getActivePage?.() || page || 1)), 1, Math.max(1, pages));
    const fraction = clamp(Number(message.progress || 0), 0, 1);
    const local = Math.round(fraction * 100);
    // Reused Tesseract workers previously captured page=1 and therefore stopped
    // producing meaningful progress for subsequent PDF pages. Reset the throttle
    // whenever the active page changes and emit every 2% of OCR recognition.
    if (activePage !== lastReportedPage) {
      lastReportedPage = activePage;
      lastReportedLocal = -1;
    }
    if (local < lastReportedLocal + 2 && local < 100) return;
    lastReportedLocal = local;
    const pageBase = 30 + ((activePage - 1) / Math.max(1, pages)) * 13;
    const pageSpan = 13 / Math.max(1, pages);
    const exactPercent = Math.min(43, pageBase + pageSpan * fraction);
    onProgress?.({
      percent: Math.round(exactPercent * 10) / 10,
      stage: 'OCR_PAGE',
      detail: `OCR lokal halaman ${activePage}/${pages} • ${local}%`,
      page: activePage,
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
  onProgress?.({ percent: 44, stage: 'OCR_COMPLETE', detail: `OCR lokal selesai • confidence ${Math.round(res.confidence)}%`, pages_completed: 1, failed_pages: [] });
  return { text: res.text, pages: 1, pages_succeeded: 1, failed_pages: [], average_confidence: res.confidence, page_confidences: [{ page: 1, confidence: res.confidence, status: 'OK' }] };
}

export async function ocrPdfLocal(
  buffer: Buffer,
  onProgressRaw?: (p: LocalOcrProgress) => void
): Promise<LocalOcrResult> {
  // All progress — per-worker granular AND per-page aggregate — flows through
  // this single monotonic wrapper (see makeMonotonicProgress above).
  const onProgress = makeMonotonicProgress(onProgressRaw);

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
  let workers: Array<{ worker: any; state: { page: number }; alive: boolean }> = [];

  // V-OCR-RESILIENCE: aggregate, monotonic bookkeeping shared across every
  // lane. This is what a durable job store polls to persist
  // completed_pages/failed_pages independent of any single worker's chatter.
  let completedCount = 0;
  const failedPageNumbers: number[] = [];
  function reportPageDone(pageNum: number, status: 'OK' | 'FAILED') {
    if (status === 'OK') completedCount++; else failedPageNumbers.push(pageNum);
    const done = completedCount + failedPageNumbers.length;
    const percent = Math.min(43, 30 + (done / pages) * 13);
    onProgress?.({
      percent: Math.round(percent * 10) / 10,
      stage: 'OCR_PAGE',
      detail: `${done}/${pages} halaman diproses (${completedCount} berhasil, ${failedPageNumbers.length} gagal).`,
      page: done,
      pages,
      pages_completed: completedCount,
      failed_pages: [...failedPageNumbers],
    });
  }

  try {
    // V-OCR-PARALLEL: pages were previously processed strictly one-at-a-time,
    // reusing a single Tesseract worker. Root cause of long documents (e.g. a
    // 36-page scanned Berita Acara Pemeriksaan) appearing to "hang" at the UI
    // level was not an actual hang: Tesseract recognition genuinely takes
    // several seconds to tens of seconds per page, and 36 pages processed
    // strictly serially can legitimately take 10-15+ minutes wall-clock,
    // longer than the client's own safety timeout. Tesseract's createWorker()
    // spawns a real worker_thread per call, so running several workers
    // concurrently gives genuine multi-core speedup for the recognition step
    // (the dominant cost) — not just a cosmetic change. Rendering (pdf.js +
    // @napi-rs/canvas) still executes on the main JS thread and therefore
    // still interleaves rather than running in true parallel, but it is a
    // small fraction of total per-page time next to OCR recognition itself.
    //
    // V-OCR-RESILIENCE: the default pool size is intentionally conservative
    // (2, not "cpuCount - 1"). Each Tesseract worker_thread carries its own
    // WASM/language-data footprint; on modest hardware (or a machine already
    // running other case-analysis work) a wide pool caused memory pressure
    // and made individual pages slower to recognize, not faster. Operators
    // with headroom can still raise OCR_WORKERS explicitly.
    const cpuCount = (() => { try { return osMod.cpus().length; } catch { return 2; } })();
    const poolSize = Math.max(1, Math.min(
      envNumber('OCR_WORKERS', Math.min(2, Math.max(1, cpuCount)), 1, 8),
      pages,
    ));

    workers = await Promise.all(
      Array.from({ length: poolSize }, () => ({ page: 1 }))
        .map(async (state) => {
          const w = await createLocalWorker(onProgress, 1, pages, () => state.page);
          return { worker: w, state, alive: true };
        })
    );

    let nextPage = 1;
    const claimNextPage = (): number | null => {
      if (nextPage > pages) return null;
      return nextPage++;
    };

    const results = new Map<number, { text: string; confidence: number; status: 'OK' | 'FAILED'; error?: string }>();

    async function renderPageToPng(pageNum: number): Promise<Buffer> {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const factory = new NodeCanvasFactory();
      const target = factory.create(viewport.width, viewport.height);
      try {
        const renderTask = page.render({ canvasContext: target.context, viewport, canvasFactory: factory });
        const renderTimeoutMs = envNumber('OCR_RENDER_TIMEOUT_MS', 60_000, 10_000, 300_000);
        await withTimeout(renderTask.promise, renderTimeoutMs, `Render PDF halaman ${pageNum}`, () => {
          try { renderTask.cancel?.(); } catch { /* best effort */ }
        });
        return target.canvas.toBuffer('image/png');
      } finally {
        factory.destroy(target);
        try { page.cleanup?.(); } catch { /* best effort */ }
      }
    }

    // V-OCR-RESILIENCE: a single watchdog covering render + recognize for one
    // page as one unit. The two inner timeouts (OCR_RENDER_TIMEOUT_MS,
    // OCR_PAGE_TIMEOUT_MS) remain as fast, specific failure signals; this
    // outer one is the backstop that guarantees the *whole* per-page
    // operation — including anything between or after them that isn't itself
    // covered by a timeout — cannot hang a lane indefinitely.
    const pageWatchdogMs = envNumber('OCR_PAGE_WATCHDOG_MS', 240_000, 30_000, 900_000);

    async function processOnePage(lane: { worker: any; state: { page: number }; alive: boolean }, pageNum: number): Promise<void> {
      lane.state.page = pageNum;
      const png = await renderPageToPng(pageNum);
      const timeoutMs = envNumber('OCR_PAGE_TIMEOUT_MS', 120_000, 15_000, 600_000);
      const activeWorker = lane.worker;
      const result: any = await withTimeout(activeWorker.recognize(png), timeoutMs, `OCR lokal halaman ${pageNum}`, () => {
        void Promise.resolve(activeWorker.terminate?.()).catch(() => undefined);
      });
      results.set(pageNum, {
        text: String(result?.data?.text || '').trim(),
        confidence: Number(result?.data?.confidence || 0),
        status: 'OK',
      });
    }

    async function runLane(lane: { worker: any; state: { page: number }; alive: boolean }): Promise<void> {
      for (;;) {
        const pageNum = claimNextPage();
        if (pageNum === null) return;
        try {
          await withTimeout(
            processOnePage(lane, pageNum),
            pageWatchdogMs,
            `Operasi halaman ${pageNum}`,
            () => { lane.alive = false; }
          );
          reportPageDone(pageNum, 'OK');
        } catch (err: any) {
          const message = String(err?.message || err);
          results.set(pageNum, { text: '', confidence: 0, status: 'FAILED', error: message });
          console.warn(`OCR lokal halaman ${pageNum}/${pages} gagal; proses dilanjutkan:`, message);
          reportPageDone(pageNum, 'FAILED');
          // V-OCR-RESILIENCE: replace the lane's worker after ANY fatal error
          // for this page — not only a matched timeout message. A crashed or
          // now-unreliable worker_thread that "successfully" rejects with a
          // non-timeout error (native crash, OOM, corrupted state) must not be
          // reused for the next page either.
          try {
            lane.worker = await createLocalWorker(onProgress, pageNum, pages, () => lane.state.page);
            lane.alive = true;
          } catch {
            // Worker recreation itself failed: this lane cannot continue.
            // Remaining unclaimed pages are still safe — every other live
            // lane keeps pulling from the same shared queue via
            // claimNextPage(), and the post-loop fill-in below marks any page
            // no lane ever claimed as FAILED so the operation still
            // terminates with a well-formed, if partial, result.
            lane.alive = false;
            return;
          }
        }
      }
    }

    // V-OCR-RESILIENCE: global backstop. Per-page and per-lane safeguards
    // above are the primary defense, but this outer bound guarantees the
    // overall Promise.all can never hang the caller forever even in an
    // unanticipated failure mode (e.g. a hung worker.terminate() call that
    // never resolves). On trip, every worker is force-terminated and any page
    // that never got a result is recorded as failed below.
    const jobWatchdogMs = envNumber(
      'OCR_JOB_WATCHDOG_MS',
      clamp(pages * pageWatchdogMs, 300_000, 3_600_000),
      60_000,
      7_200_000,
    );
    try {
      await withTimeout(
        Promise.all(workers.map(runLane)).then(() => undefined),
        jobWatchdogMs,
        'Operasi OCR PDF keseluruhan',
        () => { /* onTimeout: workers are force-terminated in the finally block below */ }
      );
    } catch (err: any) {
      console.warn('OCR lokal: batas waktu global tercapai, menyelesaikan dengan hasil sebagian:', err?.message || err);
    }

    for (let i = 1; i <= pages; i++) {
      const r = results.get(i);
      if (!r) {
        // No lane ever claimed or finished this page (all lanes died, or the
        // global watchdog above tripped first). Keep the output well-formed
        // rather than silently dropping a page.
        texts.push(`--- HALAMAN ${i} ---\n[OCR TIDAK DIPROSES]`);
        pageConfidences.push({ page: i, confidence: 0, status: 'FAILED' });
        failedPages.push(i);
        continue;
      }
      if (r.status === 'OK') {
        texts.push(`--- HALAMAN ${i} ---\n${r.text || '[OCR TIDAK MENGHASILKAN TEKS]'}`);
        confidences.push(r.confidence);
        pageConfidences.push({ page: i, confidence: r.confidence, status: 'OK' });
      } else {
        texts.push(`--- HALAMAN ${i} ---\n[OCR GAGAL: ${(r.error || '').replace(/\s+/g, ' ').slice(0, 180)}]`);
        pageConfidences.push({ page: i, confidence: 0, status: 'FAILED' });
        failedPages.push(i);
      }
    }
  } finally {
    await Promise.all(workers.map(w => Promise.resolve(w.worker?.terminate?.()).catch(() => undefined)));
    try { await pdf.destroy?.(); } catch { /* best effort */ }
  }

  const average = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
  onProgress?.({
    percent: 44,
    stage: 'OCR_COMPLETE',
    detail: `OCR lokal selesai untuk ${pages} halaman • confidence rata-rata ${Math.round(average)}%.`,
    pages,
    page: pages,
    pages_completed: pages - failedPages.length,
    failed_pages: failedPages,
  });
  const succeeded = pages - failedPages.length;
  if (!succeeded) throw new Error(`OCR lokal gagal pada seluruh ${pages} halaman.`);
  return { text: texts.join('\n\n'), pages, pages_succeeded: succeeded, failed_pages: failedPages, average_confidence: average, page_confidences: pageConfidences };
}

// ============================================================
// TEST-ONLY EXPORTS — compatibility contract retained from V31.
// ------------------------------------------------------------
// These helpers are pure and have no production side effects. Historical
// deterministic regression suites import them directly; removing this export
// makes `tsc --noEmit` fail even though the OCR runtime itself still builds.
// Keep this surface stable across OCR implementation changes.
// ============================================================
function createOcrProgressTracker(
  pages: number,
  onProgress?: (p: LocalOcrProgress) => void,
) {
  const fractions = new Map<number, number>();
  const settled = new Set<number>();
  const failed = new Set<number>();
  let lastPercent = 29;

  const emit = (page: number, detail: string) => {
    let work = settled.size;
    for (const [p, fraction] of fractions) {
      if (!settled.has(p)) work += clamp(fraction, 0, 100) / 100;
    }
    const calculated = 30 + (13 * work / Math.max(1, pages));
    const percent = Math.round(Math.max(lastPercent, Math.min(43, calculated)) * 10) / 10;
    lastPercent = percent;
    onProgress?.({
      percent,
      stage: 'OCR_PAGE',
      detail: `${detail} • selesai ${settled.size}/${pages}${failed.size ? ` • gagal ${failed.size}` : ''}`,
      page,
      pages,
      pages_completed: settled.size,
      failed_pages: [...failed].sort((a,b)=>a-b),
    });
  };

  return {
    update(page: number, localPercent: number, detail = `OCR lokal halaman ${page}/${pages}`) {
      if (settled.has(page)) return;
      fractions.set(page, Math.max(fractions.get(page) || 0, clamp(localPercent, 0, 99.9)));
      emit(page, detail);
    },
    settle(page: number, isFailed: boolean) {
      fractions.set(page, 100);
      settled.add(page);
      if (isFailed) failed.add(page);
      emit(page, `Halaman ${page}/${pages} ${isFailed ? 'gagal dan ditandai untuk pemeriksaan manual' : 'selesai'}`);
    },
    snapshot() {
      return {
        percent: lastPercent,
        completed: settled.size,
        failed: [...failed].sort((a,b)=>a-b),
      };
    },
  };
}

async function runBoundedPageTasks<L>(
  pages: number,
  lanes: L[],
  task: (page: number, lane: L) => Promise<void>,
): Promise<void> {
  let nextPage = 1;
  const claim = (): number | null => nextPage <= pages ? nextPage++ : null;
  const runLane = async (lane: L) => {
    for (;;) {
      const page = claim();
      if (page === null) return;
      try {
        await task(page, lane);
      } catch (err) {
        // Production page processing owns the detailed containment. This final
        // guard preserves the V31 invariant that one unexpected page failure
        // cannot prevent sibling lanes from claiming later pages.
        console.warn(`OCR lane page ${page} gagal tak terduga; lane dilanjutkan:`, (err as any)?.message || err);
      }
    }
  };
  await Promise.allSettled(lanes.map(runLane));
}

export const __test__ = {
  withTimeout,
  createOcrProgressTracker,
  runBoundedPageTasks,
  envNumber,
};
