import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import dotenv from 'dotenv';
import { randomUUID, createHash } from 'crypto';
import { db } from './server/db';
import {
  isLocalReasoningAvailable,
  getLocalReasoningStatus,
  generateLegalDraftAI,
  reviewContractAI,
  generateCommunicationAI,
  summarizeSourceDeterministically
} from './server/localReasoning';
import { runCaseAnalysis, CASE_ANALYSIS_CONTRACT_VERSION } from './server/caseAnalysis';
import { createDocxBuffer, createPdfBuffer, createWorkingDocumentDocxBuffer } from './server/exporters';
import { extractUploadedDocument } from './server/documentIngestion';
import { caseJobStore, type CaseJobProgress } from './server/caseJobStore';
import { caseLifecycleState, isCaseAnalysisFinalized, validateReasoningDocumentIntegrity } from './server/caseIntegrityPolicy.mjs';

// Load local developer credentials first, then fall back to .env without overriding them.
dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MAX_UPLOAD_MB = Math.max(1, Math.min(100, Number(process.env.MAX_UPLOAD_MB || 50)));
const allowedUploadExtensions = new Set(['.txt','.md','.csv','.json','.xml','.html','.htm','.rtf','.docx','.pdf','.png','.jpg','.jpeg','.webp','.tif','.tiff']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const supported = allowedUploadExtensions.has(ext) || mime.startsWith('text/') || mime.startsWith('image/') || mime === 'application/pdf' || /wordprocessingml|rtf/.test(mime);
    if (!supported) return cb(new Error(`Format berkas tidak didukung: ${ext || mime || 'tidak dikenal'}`));
    cb(null, true);
  }
});

// -----------------------------------------------------------------------------
// Production hardening middleware (dependency-free to keep deployment stable).
// -----------------------------------------------------------------------------
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use((req, res, next) => {
  const requestId = String(req.headers['x-request-id'] || '').trim().slice(0, 96) || randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https:");
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (process.env.NODE_ENV === 'production' && (req.secure || forwardedProto === 'https')) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

const allowedOrigins = new Set(String(process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean));
app.use((req, res, next) => {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return next();
  if (allowedOrigins.size && !allowedOrigins.has(origin)) {
    return res.status(403).json({ success:false, error:'Origin tidak diizinkan untuk mengakses LexiCore.' });
  }
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  next();
});

app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(JSON.stringify({
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      event: 'http_request',
      request_id: res.locals.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Number(durationMs.toFixed(1))
    }));
  });
  next();
});

function createRateLimit(windowMs: number, max: number) {
  const buckets = new Map<string, { count:number; resetAt:number }>();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
  }, Math.max(60_000, windowMs));
  (cleanup as any).unref?.();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = `${req.ip || req.socket.remoteAddress || 'unknown'}:${req.path}`;
    const now = Date.now();
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count:0, resetAt:now + windowMs } : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ success:false, error:'Terlalu banyak permintaan pada proses berat. Tunggu sebentar lalu coba kembali.' });
    }
    next();
  };
}
const expensiveAnalysisLimit = createRateLimit(60_000, Math.max(2, Number(process.env.ANALYSIS_RATE_LIMIT_PER_MIN || 6)));
const externalHealthLimit = createRateLimit(60_000, Math.max(2, Number(process.env.EXTERNAL_HEALTH_RATE_LIMIT_PER_MIN || 10)));

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

// In-flight progress tracker for Case Analysis. The Map is the fast runtime
// view; caseJobStore mirrors it to disk so browser/proxy timeout does not erase
// job identity, progress, or the reserved history record.
type RuntimeCaseProgress = CaseJobProgress;
const progressMap = new Map<string, RuntimeCaseProgress>();
const progressPersistState = new Map<string, { at:number; percent:number; stage:string; page?:number; completed?:number }>();

function scheduleProgressCleanup(progressId: string, delayMs: number): void {
  const timer = setTimeout(() => progressMap.delete(progressId), delayMs);
  // Cleanup timers are bookkeeping only and must not prevent graceful shutdown.
  (timer as any).unref?.();
}

function setCaseProgress(progressId: string, patch: Partial<RuntimeCaseProgress>): RuntimeCaseProgress {
  const previous = progressMap.get(progressId) || caseJobStore.get(progressId)?.progress || {
    percent: 0, stage: 'QUEUED', detail: 'Case Analysis masuk antrean.', updated_at: new Date().toISOString()
  };
  const incomingPercent = Number(patch.percent ?? previous.percent ?? 0);
  const next: RuntimeCaseProgress = {
    ...previous,
    ...patch,
    // A parallel OCR worker may report pages out of order. UI progress must
    // never move backwards merely because another lane emitted later.
    percent: Math.max(Number(previous.percent || 0), Number.isFinite(incomingPercent) ? incomingPercent : 0),
    updated_at: new Date().toISOString(),
    failed_pages: Array.from(new Set([...(previous.failed_pages || []), ...(patch.failed_pages || [])])).sort((a,b)=>a-b),
  };
  progressMap.set(progressId, next);
  const now = Date.now();
  const persisted = progressPersistState.get(progressId);
  const shouldPersist = !persisted
    || now - persisted.at >= 750
    || persisted.stage !== next.stage
    || persisted.page !== next.page
    || persisted.completed !== next.pages_completed
    || Math.abs(Number(next.percent || 0) - persisted.percent) >= 0.5
    || Number(next.percent || 0) >= 100;
  if (shouldPersist) {
    caseJobStore.updateProgress(progressId, next);
    progressPersistState.set(progressId, { at:now, percent:Number(next.percent || 0), stage:next.stage, page:next.page, completed:next.pages_completed });
  }
  return next;
}

// Restore durable history snapshots after a runtime restart. A RUNNING job
// cannot still be executing after process restart, so it becomes explicitly
// recoverable rather than pretending to be alive forever.
caseJobStore.markInterruptedRunningJobs();
for (const job of caseJobStore.list(500)) {
  if (job.record_snapshot?.id) db.restoreCaseAnalysis(job.record_snapshot);
  progressMap.set(job.token, job.progress);
}

// -------------------------------------------------------------
// 1. Health & AI Status
// -------------------------------------------------------------
const processStartedAt = new Date().toISOString();
app.get('/api/live', (_req, res) => res.json({ status:'ok', service:'lexicore', check:'liveness' }));
app.get('/api/ready', (_req, res) => {
  const templateCount = Object.keys(db.getTemplates() || {}).length;
  const regulationCount = db.getRegulations().length;
  const ready = templateCount > 0 && regulationCount > 0;
  return res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    check: 'readiness',
    references: { templates: templateCount, regulations: regulationCount },
    storage_mode: 'IN_MEMORY_TRANSIENT'
  });
});
app.get('/api/health', (_req, res) => {
  const memory = process.memoryUsage();
  res.json({
    status: 'ok',
    version: '1.4.0-local-forensic',
    baseline: 'V6.12.2-PERFORMANCE-PREDEPLOY',
    system: 'LexiCore Lawyer Operating System',
    reasoning_core: 'LOCAL_DETERMINISTIC',
    external_ai_required: false,
    node_env: process.env.NODE_ENV || 'development',
    started_at: processStartedAt,
    uptime_seconds: Math.round(process.uptime()),
    memory_mb: { rss: Math.round(memory.rss / 1048576), heap_used: Math.round(memory.heapUsed / 1048576) },
    storage_mode: 'IN_MEMORY_TRANSIENT'
  });
});

app.get('/api/ai/status', (req, res) => {
  const status = getLocalReasoningStatus();
  res.json({
    success: true,
    available: isLocalReasoningAvailable(),
    provider: status.provider,
    model: status.model,
    external_ai_required: false,
    api_key_required: false,
    mode: 'LOCAL_DETERMINISTIC'
  });
});

// -------------------------------------------------------------
// 2. License & Profile
// -------------------------------------------------------------
app.get('/api/license/status', (req, res) => {
  res.json({
    success: true,
    data: db.getLicenseStatus(),
    license: db.getLicenseStatus()
  });
});

app.post('/api/license/install', (req, res) => {
  res.json({
    success: true,
    message: 'Lisensi terverifikasi dan aktif untuk LexiCore Local Forensic Runtime.',
    data: db.getLicenseStatus()
  });
});

app.post('/api/license/remove', (req, res) => {
  res.json({
    success: true,
    message: 'Lisensi lokal direset.'
  });
});

app.get('/api/profile', (req, res) => {
  res.json({
    success: true,
    data: db.getProfile()
  });
});

const handleProfileUpdate = (req: express.Request, res: express.Response) => {
  const data = req.body || {};
  const updated = db.updateProfile(data);
  res.json({
    success: true,
    message: 'Profil identitas firma berhasil disimpan',
    data: updated
  });
};

app.put('/api/profile', handleProfileUpdate);
app.post('/api/profile', handleProfileUpdate);

app.get('/api/ocr/status', (req, res) => {
  res.json({
    success: true,
    local_text_extraction: true,
    docx_local_extraction: true,
    pdf_text_layer_extraction: true,
    scan_ocr_available: true,
    mode: 'LOCAL_TESSERACT_OCR',
    api_key_required: false,
    engine: 'Tesseract.js + PDF.js + @napi-rs/canvas',
    message: 'TXT/RTF/DOCX/PDF text-layer dibaca lokal; scan/foto dan PDF image-only diproses OCR lokal. Tidak ada external AI/API key yang diperlukan.'
  });
});

// -------------------------------------------------------------
// 3. Dashboard Metrics
// -------------------------------------------------------------
app.get('/api/dashboard/metrics', (req, res) => {
  res.json({
    success: true,
    metrics: db.getDashboardMetrics()
  });
});

// -------------------------------------------------------------
// 4. Legal Drafting
// -------------------------------------------------------------
let draftingTemplateIndexCache: { body:any; etag:string } | null = null;
function getDraftingTemplateIndexCache() {
  if (draftingTemplateIndexCache) return draftingTemplateIndexCache;
  const templates = db.getTemplates() as Record<string, any>;
  const entries = Object.entries(templates || {});
  const summaries = Object.fromEntries(entries.map(([key, x]: [string, any]) => [key, {
    id: x?.id,
    name: x?.name || key,
    display_name: x?.display_name || x?.name || key,
    category: x?.category || 'Lainnya',
    domain: x?.domain,
    section: x?.section,
    subsection: x?.subsection,
    p1: x?.p1,
    p2: x?.p2,
    party1_label: x?.party1_label,
    party2_label: x?.party2_label,
    prompt_label: x?.prompt_label || x?.prompt,
    duration: !!x?.duration,
    forum_sensitive: !!x?.forum_sensitive,
    source_grade: x?.source_grade,
    catalog_warning: x?.catalog_warning,
    official_source_count: Array.isArray(x?.official_source_details) ? x.official_source_details.length : 0
  }]));
  const rows = Object.values(summaries) as any[];
  const body = {
    success: true,
    data: summaries,
    count: rows.length,
    official_reference_count: rows.filter((x:any) => Number(x?.official_source_count || 0) > 0).length,
    categories: Array.from(new Set(rows.map((x:any) => x?.category).filter(Boolean))).sort()
  };
  const serialized = JSON.stringify(body);
  const etag = `"${createHash('sha1').update(serialized).digest('hex')}"`;
  draftingTemplateIndexCache = { body, etag };
  return draftingTemplateIndexCache;
}

app.get('/api/drafting/templates', (req, res) => {
  const cached = getDraftingTemplateIndexCache();
  res.setHeader('Cache-Control', 'private, max-age=300, must-revalidate');
  res.setHeader('ETag', cached.etag);
  if (String(req.headers['if-none-match'] || '') === cached.etag) return res.status(304).end();
  return res.json(cached.body);
});

app.get('/api/drafting/template/:key', (req, res) => {
  const templates = db.getTemplates() as Record<string, any>;
  const key = decodeURIComponent(req.params.key || '');
  const template = templates[key] || Object.values(templates).find((x:any) => x?.id === key || x?.name === key || x?.display_name === key);
  if (!template) return res.status(404).json({ success:false, error:'Template tidak ditemukan' });
  const etag = `"${createHash('sha1').update(JSON.stringify(template)).digest('hex')}"`;
  res.setHeader('Cache-Control', 'private, max-age=300, must-revalidate');
  res.setHeader('ETag', etag);
  if (String(req.headers['if-none-match'] || '') === etag) return res.status(304).end();
  return res.json({ success:true, template });
});

app.post('/api/generate/draft', async (req, res) => {
  try {
    const { doc_type, party1, party2, effective_date, duration, prompt, client_id, client_name, case_id } = req.body || {};
    const templates = db.getTemplates() as Record<string, any>;
    const template = templates[doc_type] || Object.values(templates).find((x:any) => x?.id === doc_type || x?.name === doc_type || x?.display_name === doc_type);
    const resolvedDocType = template?.display_name || template?.name || doc_type || 'Perjanjian';
    const profile = db.getProfile();
    const content = await generateLegalDraftAI({
      doc_type: resolvedDocType,
      party1,
      party2,
      effective_date,
      duration,
      prompt,
      profile,
      template
    });

    const parsedCaseId = Number.parseInt(String(case_id ?? ''), 10);
    const saved = db.saveDraft({
      title: `${resolvedDocType} - ${party1 || 'P1'} & ${party2 || 'P2'}`,
      doc_type: resolvedDocType,
      template_key: template?.name || template?.id || String(doc_type || ''),
      party1,
      party2,
      effective_date,
      duration,
      prompt,
      content,
      status: 'DRAFT_KERJA',
      client_id: client_id ? String(client_id).trim() : undefined,
      client_name: client_name ? String(client_name).trim() : undefined,
      case_id: Number.isInteger(parsedCaseId) && parsedCaseId > 0 ? parsedCaseId : undefined
    });

    res.json({
      success: true,
      draft_id: saved.id,
      draft: saved,
      content
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal menyusun legal draft' });
  }
});

app.get('/api/drafts', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 30;
  res.json({
    success: true,
    data: db.getDrafts(limit)
  });
});


app.post('/api/drafts', (req, res) => {
  try {
    const body = req.body || {};
    const content = String(body.content || '').trim();
    if (content.length < 20) {
      return res.status(400).json({ success:false, error:'Isi draft belum memadai untuk disimpan.' });
    }
    const parsedCaseId = Number.parseInt(String(body.case_id ?? ''), 10);
    const saved = db.saveDraft({
      title: String(body.title || body.doc_type || 'Legal Draft').trim(),
      doc_type: String(body.doc_type || 'Legal Draft').trim(),
      template_key: body.template_key ? String(body.template_key) : undefined,
      party1: body.party1 ? String(body.party1) : undefined,
      party2: body.party2 ? String(body.party2) : undefined,
      effective_date: body.effective_date ? String(body.effective_date) : undefined,
      duration: body.duration !== undefined ? String(body.duration) : undefined,
      prompt: body.prompt ? String(body.prompt) : undefined,
      content,
      status: String(body.status || 'saved'),
      client_id: body.client_id ? String(body.client_id).trim() : undefined,
      client_name: body.client_name ? String(body.client_name).trim() : undefined,
      case_id: Number.isInteger(parsedCaseId) && parsedCaseId > 0 ? parsedCaseId : undefined
    });
    return res.status(201).json({ success:true, draft_id:saved.id, data:saved, draft:saved });
  } catch (err:any) {
    return res.status(500).json({ success:false, error:err.message || 'Gagal menyimpan draft.' });
  }
});

app.get('/api/drafts/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const draft = db.getDraft(id);
  if (!draft) {
    return res.status(404).json({ success: false, error: 'Draft tidak ditemukan' });
  }
  res.json({ success: true, data: draft, draft });
});

app.put('/api/drafts/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const updated = db.updateDraft(id, req.body || {});
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Draft tidak ditemukan' });
  }
  res.json({ success: true, data: updated, draft: updated });
});


app.get('/api/drafts/:id/export/docx', (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const draft = db.getDraft(id);
    if (!draft) return res.status(404).json({ success: false, error: 'Draft tidak ditemukan' });
    const lines = String(draft.content || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
    const blocks = lines.map(line => ({
      type: /^(PASAL\s+\d+|BAB\s+[IVXLCDM]+|[A-Z][A-Z\s/&-]{8,})$/i.test(line) ? 'heading' : 'paragraph',
      level: 2,
      text: line
    } as any));
    const data = createWorkingDocumentDocxBuffer({ title: draft.title || draft.doc_type || 'Legal Draft', subtitle: draft.doc_type || '', blocks, user_name: db.getProfile().display_name });
    const safe = String(draft.title || 'Legal-Draft').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,100) || 'Legal-Draft';
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition',`attachment; filename="${safe}.docx"`);
    res.setHeader('Content-Length',String(data.length));
    return res.send(data);
  } catch (err:any) { return res.status(500).json({ success:false, error:err.message || 'Gagal mengekspor draft.' }); }
});

app.post('/api/export/document/docx', (req, res) => {
  try {
    const title = String(req.body?.title || 'LexiCore Working Document').trim();
    const subtitle = String(req.body?.subtitle || '').trim();
    const rawBlocks = Array.isArray(req.body?.blocks) ? req.body.blocks.slice(0,500) : [];
    const blocks = rawBlocks.map((b:any) => ({
      type: ['heading','paragraph','list','table'].includes(String(b?.type)) ? b.type : 'paragraph',
      level: Math.max(1, Math.min(4, Number(b?.level || 2))),
      text: typeof b?.text === 'string' ? b.text.slice(0,200000) : undefined,
      items: Array.isArray(b?.items) ? b.items.slice(0,200).map((x:any)=>String(x).slice(0,5000)) : undefined,
      rows: Array.isArray(b?.rows) ? b.rows.slice(0,300).map((r:any)=>Array.isArray(r)?r.slice(0,12).map((x:any)=>String(x).slice(0,10000)):[]) : undefined
    }));
    if (!blocks.length) return res.status(400).json({ success:false, error:'Tidak ada isi dokumen untuk diekspor.' });
    const data = createWorkingDocumentDocxBuffer({ title, subtitle, blocks, user_name: db.getProfile().display_name });
    const safe = title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,100) || 'LexiCore-Working-Document';
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition',`attachment; filename="${safe}.docx"`);
    res.setHeader('Content-Length',String(data.length));
    return res.send(data);
  } catch (err:any) { return res.status(500).json({ success:false, error:err.message || 'Gagal mengekspor DOCX.' }); }
});
app.delete('/api/drafts/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const success = db.deleteDraft(id);
  res.json({ success });
});

// -------------------------------------------------------------
// 5. Contract Review
// -------------------------------------------------------------
app.post('/api/review', expensiveAnalysisLimit, upload.single('file') as any, async (req, res) => {
  try {
    let text = req.body?.source_text || req.body?.text || '';
    let filename = req.body?.filename || 'dokumen-kontrak.txt';

    if (req.file) {
      filename = req.file.originalname;
      const ingested = await extractUploadedDocument(req.file.buffer, req.file.originalname, req.file.mimetype);
      const integrity = validateReasoningDocumentIntegrity({ inputType:'document', text:ingested.text, ingestion:ingested });
      if (!integrity.ok) {
        return res.status(422).json({ success:false, error:'Integritas hasil ingestion belum cukup untuk review kontrak.', integrity });
      }
      text = ingested.text || text;
    }

    if (!text || text.trim().length < 30) {
      return res.status(400).json({
        success: false,
        error: 'Teks kontrak minimal 30 karakter diperlukan untuk dilakukan review klausul.'
      });
    }

    const reviewResult: any = await reviewContractAI(text, filename);
    const normalizedReview: any = {
      ...reviewResult,
      contract_type: reviewResult.contract_type || 'KONTRAK_UMUM',
      parties: Array.isArray(reviewResult.parties) ? reviewResult.parties : [],
      clause_evaluations: Array.isArray(reviewResult.clause_evaluations) ? reviewResult.clause_evaluations : (reviewResult.risks || []).map((r:any, i:number) => ({
        article_number: String(i + 1),
        existing_clause: r.clause || 'Klausul terkait',
        risk_loophole: r.risk || r.finding || 'Risiko perlu ditelaah.',
        recommended_redraft: r.mitigation || 'Susun ulang klausul secara proporsional dan verifikasi terhadap transaksi.'
      }))
    };
    const parsedCaseId = Number.parseInt(String(req.body?.case_id ?? ''), 10);
    const saved = db.saveContractAnalysis({
      ...normalizedReview,
      title: filename,
      source_text: text,
      client_id: req.body?.client_id ? String(req.body.client_id).trim() : undefined,
      client_name: req.body?.client_name ? String(req.body.client_name).trim() : undefined,
      case_id: Number.isInteger(parsedCaseId) && parsedCaseId > 0 ? parsedCaseId : undefined
    });

    res.json({
      success: true,
      analysis_id: saved.id,
      analysis: saved,
      data: saved
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal memproses review kontrak' });
  }
});

app.get('/api/analyses', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 30;
  res.json({
    success: true,
    data: db.getContractAnalyses(limit)
  });
});

// -------------------------------------------------------------
// 6. Legal Research & Regulations
// -------------------------------------------------------------
app.get('/api/regulations/catalog', (req, res) => {
  res.json({
    success: true,
    data: db.getRegulations(),
    count: db.getRegulations().length
  });
});

app.get('/api/regulations/search', (req, res) => {
  const q = (req.query.q as string) || '';
  const domain = (req.query.domain as string) || '';
  const results = db.searchRegulations(q, domain);
  res.json({
    success: true,
    data: results,
    count: results.length
  });
});

app.get('/api/regulatory-intelligence/catalog', (req, res) => {
  const regulations = db.getRegulations();
  res.json({
    success: true,
    count: regulations.length,
    catalog: regulations,
    data: regulations
  });
});

app.get('/api/regulatory-intelligence/graph', (req, res) => {
  const regs = db.getRegulations();
  const nodes = regs.slice(0, 20).map(r => ({ id: r.id, label: r.nomor, type: r.jenis }));
  const links: any[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    links.push({ source: nodes[i].id, target: nodes[i + 1].id, relation: 'REGULATORY_REFERENCE' });
  }
  res.json({
    success: true,
    graph: { nodes, links }
  });
});

app.get('/api/regulatory-intelligence/timeline', (req, res) => {
  const regs = db.getRegulations()
    .filter(r => r.tahun)
    .sort((a, b) => a.tahun - b.tahun)
    .slice(0, 25)
    .map(r => ({
      year: r.tahun,
      title: r.nomor,
      about: r.tentang,
      status: r.status
    }));

  res.json({
    success: true,
    timeline: regs
  });
});

app.post('/api/regulatory-intelligence/compare', (req, res) => {
  const { reg1_id, reg2_id } = req.body || {};
  const regs = db.getRegulations();
  const r1 = regs.find(r => r.id === reg1_id);
  const r2 = regs.find(r => r.id === reg2_id);
  if (!r1 || !r2) return res.status(400).json({ success:false, error:'Dua regulasi yang valid wajib dipilih. LexiCore tidak akan mengganti pilihan yang tidak valid dengan regulasi lain secara otomatis.' });

  res.json({
    success: true,
    comparison: {
      reg1: r1,
      reg2: r2,
      hierarchy_check: (r1.hierarchy_rank || 10) < (r2.hierarchy_rank || 10)
        ? `${r1.nomor} memiliki derajat hierarki lebih tinggi (Lex Superior Derogat Legi Inferiori).`
        : `${r2.nomor} berkedudukan setara atau lebih tinggi.`,
      temporal_check: (r1.tahun || 0) > (r2.tahun || 0)
        ? `${r1.nomor} (${r1.tahun}) merupakan hukum yang lebih baru dibanding ${r2.nomor} (${r2.tahun}) (Lex Posterior Derogat Legi Priori).`
        : `${r2.nomor} (${r2.tahun}) diundangkan lebih mutakhir.`
    }
  });
});

app.post('/api/norm-conflicts', (req, res) => {
  const { context, provisions } = req.body || {};
  const rows = Array.isArray(provisions) ? provisions.map((x:any)=>String(x).trim()).filter(Boolean) : [];
  if (rows.length < 2) return res.status(400).json({ success:false, error:'Minimal dua norma diperlukan untuk analisis konflik.' });
  const rank = (x:string) => /^UUD/i.test(x)?1:/^TAP/i.test(x)?2:/^(UU|PERPPU)/i.test(x)?3:/^PP\b/i.test(x)?4:/^PERPRES/i.test(x)?5:/^(PERDA|PERGUB|PERBUP|PERWALI)/i.test(x)?7:6;
  const year = (x:string) => Number((x.match(/(?:19|20)\d{2}/)||[])[0]||0);
  const anchor = rows[0];
  const matrix = rows.slice(1).map((b:string,i:number)=>{
    const ra=rank(anchor), rb=rank(b), ya=year(anchor), yb=year(b);
    let principle='NONE', applicable='NOT_DETERMINED', effect='Tidak ada norma yang otomatis disisihkan hanya dari sitasi; materi, ruang lingkup, delegasi, tempus, dan status berlaku wajib diperiksa.';
    if(ra!==rb){principle='LEX_SUPERIOR'; applicable=ra<rb?anchor:b; effect='Norma berhierarki lebih rendah tidak boleh bertentangan dengan norma yang lebih tinggi, tetapi konflik materiil tetap harus dibuktikan.';}
    else if(ya&&yb&&ya!==yb){principle='LEX_POSTERIOR_CANDIDATE'; applicable=ya>yb?anchor:b; effect='Norma yang lebih baru hanya mengesampingkan norma lama bila setingkat dan mengatur materi yang sama/bertentangan; lex specialis dan ketentuan transisi tetap harus diuji.';}
    return { pair_label:`Aturan A vs Aturan ${String.fromCharCode(66+i)}`, norm_a:{label:'Aturan A',citation:anchor}, norm_b:{label:`Aturan ${String.fromCharCode(66+i)}`,citation:b}, same_subject_matter:false, antinomy_identified:false, contradiction_analysis: context ? `Konteks pengguna: ${String(context).slice(0,1200)}. Konflik normatif belum dinyatakan final tanpa membandingkan bunyi norma.` : 'Belum ada konteks faktual yang cukup untuk menyatakan antinomi.', principle_applied:principle, applicable_law:applicable, legal_effect:effect, resolution_status:'PROFESSIONAL_VERIFICATION_REQUIRED' };
  });
  const data={ detector_mode:'NORM_CONFLICT_AUDIT', professional_verification:'PENDING', rule_comparison_matrix:matrix, summary:{resolved_candidates:matrix.filter((x:any)=>x.applicable_law!=='NOT_DETERMINED').length,potential_conflicts:0,relationship_only:matrix.length}, principle_method:{LEX_SUPERIOR:'Bandingkan hierarki dan kewenangan pembentuk.',LEX_SPECIALIS:'Uji kekhususan subjek, objek, dan ruang lingkup; tidak diasumsikan otomatis.',LEX_POSTERIOR:'Gunakan hanya untuk norma setingkat dengan materi yang sama serta cek ketentuan transisi.'}, coverage_note:'Hasil ini adalah issue spotting. Bunyi norma, status berlaku, tempus, delegasi, dan nexus perkara wajib diverifikasi sebelum menentukan norma yang berlaku.'};
  db.recordNormConflictAnalysis();
  res.json({ success:true, data, regulatory_matches:[] });
});

app.post('/api/research/search', (req, res) => {
  const { query, mode = 'hybrid', focus = 'mixed', limit = 12 } = req.body || {};
  const results = db.searchRegulations(String(query || ''), '').slice(0, Math.max(1, Math.min(30, Number(limit)||12)));
  const local_results = results.map((r:any)=>({ title:`${r.nomor} tentang ${r.tentang}`, status:r.status || 'UNKNOWN', verification_status:'LOCAL_CORPUS_CANDIDATE', official_url:r.official_url || '', source_type:r.jenis || 'regulation' }));
  const online_results = mode === 'offline' ? [] : results.filter((r:any)=>r.official_url).map((r:any)=>({ title:`${r.nomor} tentang ${r.tentang}`, source_name:r.jdih_source || 'Sumber resmi', url:r.official_url, verification_status:'URL_FROM_LOCAL_CORPUS_NOT_YET_FETCH_VERIFIED' }));
  const data={ query, mode, research_focus:focus, local_results, online_results, research_note: mode==='online' && !online_results.length ? 'Tidak ada URL sumber resmi pada corpus lokal untuk query ini.' : 'Hasil online di sini adalah tautan sumber resmi kandidat dari corpus lokal; isi dan relevansi belum dinyatakan terverifikasi sampai dokumen dibuka/diperiksa.' };
  res.json({ success:true, data, count:local_results.length });
});

app.post('/api/research/summarize', async (req, res) => {
  const { title } = req.body || {};
  const text = String(req.body?.source_text || req.body?.text || '');
  const type = String(req.body?.source_type || req.body?.type || 'Yurisprudensi / Doktrin');
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return res.status(400).json({ success:false, error:'Teks sumber wajib diisi. LexiCore tidak akan membuat ringkasan doktrin/yurisprudensi tanpa materi sumber.' });
  }
  const summary = summarizeSourceDeterministically(normalized, 4000);

  const sourceType = type || 'Yurisprudensi / Doktrin';
  const saved:any = db.saveLegalResearch({
    title: title || 'Riset Hukum',
    source_type: sourceType,
    citation: req.body?.citation ? String(req.body.citation) : undefined,
    jurisdiction: req.body?.jurisdiction ? String(req.body.jurisdiction) : 'Indonesia',
    summary,
    content: text,
    source_text: text,
    keywords: []
  });
  saved.source_label = sourceType;
  saved.issue = title || 'Isu riset';
  saved.holding = summary;
  saved.reasoning = summary;
  saved.research_payload = { chronology: summary, ratio_decidendi: summary, disposition: 'PERLU VERIFIKASI DARI SUMBER', legal_rule: 'PERLU VERIFIKASI DARI TEKS SUMBER', legal_rule_status:'UNVERIFIED', professional_verification:'PENDING', doctrine_topic:title || 'Riset Hukum', doctrine_thesis:summary, doctrine_analysis:summary, doctrine_implication:'Gunakan hanya setelah sumber, sitasi, dan konteks diverifikasi.' };

  res.json({
    success: true,
    summary,
    data: saved
  });
});

app.get('/api/research', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 30;
  res.json({
    success: true,
    data: db.getLegalResearch(limit)
  });
});

// Official legal source health check
app.get('/api/legal-sources', (req, res) => {
  res.json({
    success: true,
    sources: [
      { id: 'jdih_bpk', name: 'JDIH Badan Pemeriksa Keuangan (BPK)', status: 'CONFIGURED_NOT_YET_CHECKED', url: 'https://peraturan.bpk.go.id' },
      { id: 'jdih_kemkumham', name: 'JDIH Kemenkumham RI', status: 'CONFIGURED_NOT_YET_CHECKED', url: 'https://jdihn.go.id' },
      { id: 'ma_putusan', name: 'Direktori Putusan Mahkamah Agung', status: 'CONFIGURED_NOT_YET_CHECKED', url: 'https://putusan3.mahkamahagung.go.id' },
      { id: 'setneg', name: 'JDIH Kementerian Sekretariat Negara RI', status: 'CONFIGURED_NOT_YET_CHECKED', url: 'https://jdih.setneg.go.id' }
    ]
  });
});

app.get('/api/legal-sources/health', externalHealthLimit, async (req, res) => {
  const sources = [
    { id:'jdih_bpk', name:'JDIH BPK RI', url:'https://peraturan.bpk.go.id', authoritative:true },
    { id:'jdihn', name:'JDIHN Kemenkumham', url:'https://jdihn.go.id', authoritative:true },
    { id:'putusan_ma', name:'Direktori Putusan MA RI', url:'https://putusan3.mahkamahagung.go.id', authoritative:true },
    { id:'setneg', name:'JDIH Setneg RI', url:'https://jdih.setneg.go.id', authoritative:true }
  ];
  const rows = await Promise.all(sources.map(async src=>{const started=Date.now();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);try{const r=await fetch(src.url,{signal:controller.signal,headers:{'User-Agent':'LexiCore-Health/1.0'}});return {...src,reachable:r.ok,status:r.ok?'REACHABLE':'HTTP_ERROR',http_status:r.status,latency_ms:Date.now()-started};}catch{return {...src,reachable:false,status:'UNREACHABLE',latency_ms:Date.now()-started};}finally{clearTimeout(timer)}}));
  const online = rows.filter(x=>x.reachable).length;
  res.json({ success:true, overall_health:online===rows.length?'ALL_REACHABLE':online?'PARTIAL':'UNREACHABLE', data:rows, sources:rows, note:'Health check hanya menguji keterjangkauan host; tidak membuktikan status berlaku, isi pasal, atau relevansi perkara.' });
});

app.get('/api/legal-sources/search', (req, res) => {
  const q = (req.query.q as string) || '';
  const results = db.searchRegulations(q);
  res.json({
    success: true,
    query: q,
    results: results.slice(0, 10)
  });
});

// -------------------------------------------------------------
// 7. Compliance & Risk Assessment
// -------------------------------------------------------------
app.get('/api/compliance/questions', (req, res) => {
  const category = (req.query.category as string) || 'General Corporate';
  const rules = db.getComplianceRules();
  const categoryRules = rules.rules?.[category] || rules.rules?.['General Corporate'] || [];

  res.json({
    success: true,
    category,
    questions: categoryRules,
    data: { category, questions: categoryRules }
  });
});

app.post('/api/compliance/assess', (req, res) => {
  const { category, answers = {}, entity, custom_controls = [], preview = false, client_id, client_name, case_id } = req.body || {};
  const rules = db.getComplianceRules();
  const cat = category || 'General Corporate';
  const categoryRules = rules.rules?.[cat] || rules.rules?.['General Corporate'] || [];
  const customControls = Array.isArray(custom_controls) ? custom_controls.slice(0,100) : [];

  const riskValue = (level:string) => level === 'HIGH' ? 85 : level === 'MEDIUM' ? 50 : level === 'LOW' ? 15 : 0;
  const normalizeLevel = (value:any):'LOW'|'MEDIUM'|'HIGH'|'NA' => {
    const v=String(value||'').toUpperCase();
    if(v==='HIGH'||v==='MEDIUM'||v==='LOW'||v==='NA') return v as any;
    return 'MEDIUM';
  };
  const matrix:any[] = [];
  let weightedRisk = 0;
  let totalWeight = 0;
  let answeredSystem = 0;
  const missingSystem:string[] = [];

  for (const q of categoryRules) {
    const key = q.key || q.id || q.question;
    const ans = answers?.[key] ?? answers?.[q.id] ?? answers?.[q.question] ?? '';
    const hasAnswer = ans !== '' && ans !== null && ans !== undefined;
    const option = Array.isArray(q.options) ? q.options.find((o:any)=>String(o.value)===String(ans)) : undefined;
    const value=String(ans||'').toLowerCase();
    let level:'LOW'|'MEDIUM'|'HIGH'|'NA' = value==='na' ? 'NA' : value==='yes' ? 'LOW' : value==='partial' ? 'MEDIUM' : value==='no' ? 'HIGH' : normalizeLevel(option?.risk_level || q.severity || 'MEDIUM');
    const weight = q.severity === 'HIGH' ? 3 : q.severity === 'MEDIUM' ? 2 : 1;
    if (hasAnswer) {
      answeredSystem += 1;
      if(level!=='NA'){ weightedRisk += riskValue(level)*weight; totalWeight += 100*weight; }
    } else {
      missingSystem.push(String(q.question || key));
    }
    matrix.push({
      control_group:q.group || q.area || cat,
      risk_identification:q.risk || q.question,
      answer_label:hasAnswer ? (option?.label || String(ans)) : 'Belum dijawab',
      control_status:!hasAnswer?'UNANSWERED':level==='NA'?'NA':level==='LOW'?'COMPLIANT':level==='MEDIUM'?'PARTIAL':'NON_COMPLIANT',
      risk_level:!hasAnswer?'MEDIUM':level==='NA'?'LOW':level,
      legal_justification:q.question || 'Kontrol kepatuhan sistem.',
      legal_basis:q.basis || q.legal_basis || 'Dasar hukum perlu diverifikasi sesuai sektor dan tempus.',
      sanction_basis:q.sanctions || 'Konsekuensi hukum/operasional perlu diverifikasi berdasarkan regulasi yang berlaku.',
      mitigation_checklist:Array.isArray(q.actions)&&q.actions.length?q.actions:['Verifikasi kontrol dan dokumentasikan tindak lanjut.'],
      source:'SYSTEM'
    });
  }

  if (!preview && missingSystem.length) {
    return res.status(400).json({
      success:false,
      error:`Assessment belum lengkap: ${missingSystem.length} pertanyaan sistem belum dijawab.`,
      missing_count:missingSystem.length,
      missing_questions:missingSystem.slice(0,20)
    });
  }

  for (const q of customControls) {
    const key=String(q?.key || 'custom_'+matrix.length);
    const ans=answers?.[key] ?? '';
    const option=Array.isArray(q?.options)?q.options.find((o:any)=>String(o.value)===String(ans)):undefined;
    let level=normalizeLevel(option?.risk_level || q?.severity || 'MEDIUM');
    const material=normalizeLevel(q?.severity || 'MEDIUM');
    const weight=material==='HIGH'?3:material==='MEDIUM'?2:1;
    if(level!=='NA'){ weightedRisk += riskValue(level)*weight; totalWeight += 100*weight; }
    matrix.push({
      control_group:q?.group || 'Kontrol Tambahan',
      risk_identification:q?.risk || q?.question || 'Kontrol tambahan pengguna',
      answer_label:option?.label || String(ans || 'Belum dijawab'),
      control_status:level==='NA'?'NA':level==='LOW'?'COMPLIANT':level==='MEDIUM'?'PARTIAL':'NON_COMPLIANT',
      risk_level:level==='NA'?'LOW':level,
      legal_justification:q?.question || 'Kontrol tambahan yang ditetapkan pengguna.',
      legal_basis:q?.basis || 'USER DEFINED — dasar hukum belum diverifikasi.',
      sanction_basis:q?.sanctions || 'USER DEFINED — konsekuensi belum diverifikasi.',
      mitigation_checklist:Array.isArray(q?.actions)&&q.actions.length?q.actions:['Tetapkan mitigasi dan PIC yang dapat diaudit.'],
      source:'USER_DEFINED'
    });
  }

  const riskPercent = totalWeight ? Math.round((weightedRisk / totalWeight) * 100) : 0;
  const score = Math.max(0, Math.min(100, 100-riskPercent));
  const risk_level:'LOW'|'MEDIUM'|'HIGH' = riskPercent >= 67 ? 'HIGH' : riskPercent >= 34 ? 'MEDIUM' : 'LOW';
  const legacyMatrix = matrix.map((r:any)=>({
    area:r.control_group,
    rule:r.risk_identification,
    status:r.control_status,
    severity:r.risk_level,
    mitigation:(r.mitigation_checklist||[]).join('; ')
  }));
  const payload:any = {
    entity: entity || 'Entitas / Klien',
    title: String(req.body?.title || `Compliance Audit: ${cat}`),
    category: cat,
    score,
    risk_level,
    answers,
    matrix: legacyMatrix,
    risk_matrix: matrix,
    custom_controls: customControls,
    system_question_count: categoryRules.length,
    custom_question_count: customControls.length,
    answered_count: answeredSystem,
    missing_count: missingSystem.length,
    completion_percentage: categoryRules.length ? Math.round((answeredSystem / categoryRules.length) * 100) : 100,
    professional_verification:'PENDING',
    summary:`Assessment ${cat}: completion ${categoryRules.length ? Math.round((answeredSystem/categoryRules.length)*100) : 100}%; compliance score ${score}/100; risk exposure ${riskPercent}/100 (${risk_level}).`,
    client_id: client_id ? String(client_id).trim() : undefined,
    client_name: client_name ? String(client_name).trim() : undefined,
    case_id: Number.isInteger(Number.parseInt(String(case_id ?? ''), 10)) && Number.parseInt(String(case_id ?? ''), 10) > 0 ? Number.parseInt(String(case_id), 10) : undefined
  };
  const result = preview ? { ...payload, id:0, created_at:new Date().toISOString(), preview:true } : db.saveComplianceAssessment(payload);
  return res.json({ success:true, assessment:result, data:result, preview:Boolean(preview) });
});

app.get('/api/compliance', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 30;
  res.json({
    success: true,
    data: db.getComplianceAssessments(limit)
  });
});

// -------------------------------------------------------------
// 8. Client Communications
// -------------------------------------------------------------
app.get('/api/communications', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 30;
  res.json({
    success: true,
    data: db.getClientCommunications(limit)
  });
});

app.post('/api/communications', (req, res) => {
  const { client_name, legal_position, whatsapp_number, document_type, subject, message, client_id, case_ref, case_id, client_email, client_address, matter, status } = req.body || {};
  if (!message || String(message).trim() === '') {
    return res.status(400).json({ success: false, error: 'Isi pesan komunikasi wajib diisi' });
  }

  const parsedCaseId = Number.parseInt(String(case_id ?? ''), 10);
  const saved = db.saveClientCommunication({
    client_id: client_id || `CLI-${Date.now().toString().slice(-4)}`,
    client_name: client_name || 'Klien',
    legal_position,
    whatsapp_number,
    client_email,
    client_address,
    matter,
    status: status || 'draft',
    document_type: document_type || 'Surat Pemberitahuan',
    subject: subject || 'Pemberitahuan Perkembangan Perkara',
    message,
    case_ref: case_ref || matter,
    case_id: Number.isInteger(parsedCaseId) && parsedCaseId > 0 ? parsedCaseId : undefined
  });

  res.json({
    success: true,
    communication_id: saved.id,
    data: saved,
    message: 'Komunikasi klien berhasil disimpan'
  });
});

app.put('/api/communications/:id', (req, res) => {
  const id = Number.parseInt(String(req.params.id || ''), 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success:false, error:'ID komunikasi tidak valid.' });
  const body = req.body || {};
  const current = db.getClientCommunication(id);
  if (!current) return res.status(404).json({ success:false, error:'Dokumen komunikasi klien tidak ditemukan.' });
  const message = body.message !== undefined ? String(body.message).trim() : current.message;
  if (!message) return res.status(400).json({ success:false, error:'Isi pesan komunikasi wajib diisi.' });
  const updated = db.updateClientCommunication(id, {
    client_id: body.client_id !== undefined ? String(body.client_id) : current.client_id,
    client_name: body.client_name !== undefined ? String(body.client_name) : current.client_name,
    client_email: body.client_email !== undefined ? String(body.client_email) : current.client_email,
    whatsapp_number: body.whatsapp_number !== undefined ? String(body.whatsapp_number) : current.whatsapp_number,
    client_address: body.client_address !== undefined ? String(body.client_address) : current.client_address,
    legal_position: body.legal_position !== undefined ? String(body.legal_position) : current.legal_position,
    document_type: body.document_type !== undefined ? String(body.document_type) : current.document_type,
    subject: body.subject !== undefined ? String(body.subject) : current.subject,
    matter: body.matter !== undefined ? String(body.matter) : current.matter,
    case_ref: body.case_ref !== undefined ? String(body.case_ref) : (body.matter !== undefined ? String(body.matter) : current.case_ref),
    case_id: body.case_id !== undefined ? (Number.isInteger(Number.parseInt(String(body.case_id), 10)) && Number.parseInt(String(body.case_id), 10) > 0 ? Number.parseInt(String(body.case_id), 10) : undefined) : current.case_id,
    status: body.status !== undefined ? String(body.status) : current.status,
    message
  });
  return res.json({ success:true, data:updated, communication:updated });
});

app.post('/api/communication/generate', async (req, res) => {
  try {
    const { client_name, legal_position, document_type, key_points, client_address, matter, progress, requested_documents, deadline, next_step } = req.body || {};
    const profile = db.getProfile();
    const contextualPoints = [
      key_points,
      matter ? `Matter/perkara: ${matter}` : '',
      client_address ? `Alamat/domisili klien: ${client_address}` : '',
      progress ? `Perkembangan/status saat ini: ${progress}` : '',
      requested_documents ? `Dokumen yang diminta/diperlukan: ${requested_documents}` : '',
      deadline ? `Tenggat: ${deadline}` : '',
      next_step ? `Langkah berikutnya: ${next_step}` : ''
    ].filter(Boolean).join('\n');
    const content = await generateCommunicationAI({
      client_name,
      legal_position,
      document_type,
      key_points: contextualPoints,
      firm_name: profile.display_name
    });
    const subjectMap:Record<string,string> = {
      client_update: 'Pemberitahuan Perkembangan Perkara',
      document_request: 'Permintaan Kelengkapan Dokumen',
      legal_service_consultation: 'Konfirmasi Konsultasi Hukum'
    };
    const subject = subjectMap[String(document_type || '')] || String(document_type || 'Komunikasi Hukum');

    res.json({
      success: true,
      message: content,
      data: { content, message: content, subject }
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message || 'Gagal membuat draf komunikasi' });
  }
});

app.post('/api/communication/whatsapp-link', (req, res) => {
  const { whatsapp_number, subject, message } = req.body || {};
  let digits = String(whatsapp_number || '').replace(/\D/g, '');

  // Normalisasi nomor Indonesia ke format internasional tanpa tanda +.
  if (digits.startsWith('620')) {
    digits = '62' + digits.substring(3);
  } else if (digits.startsWith('0')) {
    digits = '62' + digits.substring(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  } else if (!digits.startsWith('62') && digits.length >= 9) {
    digits = '62' + digits;
  }

  if (!/^62\d{8,13}$/.test(digits)) {
    return res.status(400).json({
      success: false,
      error: 'Nomor WhatsApp tidak valid. Gunakan format 08xxxxxxxxxx atau 62xxxxxxxxxx.'
    });
  }

  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) {
    return res.status(400).json({ success: false, error: 'Isi pesan WhatsApp masih kosong.' });
  }

  const cleanSubject = String(subject || '').trim();
  const text = cleanSubject && !cleanMessage.startsWith(cleanSubject)
    ? `*${cleanSubject}*\n\n${cleanMessage}`
    : cleanMessage;
  const link = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

  res.json({
    success: true,
    whatsapp_url: link,
    whatsapp_link: link,
    whatsapp_number: digits,
    phone: digits
  });
});

// -------------------------------------------------------------
// 9. Case Analysis (Evidence-to-Action)
// -------------------------------------------------------------
function reserveCaseAnalysisRecord(meta: {
  title:string; filename?:string; input_type:'narrative'|'document'|'narrative+document';
  narrative:string; client_id?:string; client_name?:string; progressId:string;
}) {
  return db.saveCaseAnalysis({
    title: meta.title,
    input_type: meta.input_type,
    filename: meta.filename,
    source_text: meta.narrative || '',
    client_id: meta.client_id,
    client_name: meta.client_name,
    facts: [], legal_issues: [], applicable_law: [],
    summary: 'Case Analysis sedang diproses.',
    legal_analysis: '', arguments_for: [], arguments_against: [],
    evidence_needed: [], evidentiary_gaps: [], risks: [], risk_matrix: [], overall_risk_score: 0,
    best_case: '', worst_case: '',
    verification_note: 'Analisis masih berjalan. Hasil substantif belum tersedia.',
    recommendations: [],
    analysis_provenance: {
      mode:'DETERMINISTIC_FORENSIC_ENGINE', provider:'LexiCore Local Kernel',
      job_status:'RUNNING', progress_token:meta.progressId, finalized:false, timestamp:new Date().toISOString(),
    },
    case_readiness: {}, case_working_paper: {}, analysis_readiness: {},
    document_reading: { status:'PROCESSING', segments_read:0, segments_total:0, characters:0 },
    document_ingestion: { mode: meta.filename ? 'PENDING' : 'TEXT', coverage_ratio: meta.filename ? 0 : 1, manual_review_required:false },
    professional_verification:'PENDING',
  } as any);
}

function markCaseJobFailure(caseId:number, progressId:string, err:any) {
  const message = String(err?.message || err || 'Gagal menjalankan Case Analysis');
  const current = db.getCaseAnalysis(caseId);
  if (!current) return null;
  const updated = db.updateCaseAnalysis(caseId, {
    summary:'Case Analysis belum selesai.',
    verification_note:`Proses terhenti dan dapat dipulihkan. ${message}`,
    analysis_provenance:{ ...(current as any).analysis_provenance, job_status:'FAILED_RECOVERABLE', progress_token:progressId, finalized:false, error:message, timestamp:new Date().toISOString() },
    document_reading:{ ...(current as any).document_reading, status:'FAILED_RECOVERABLE' },
  } as any);
  if (updated) caseJobStore.update(progressId, { record_snapshot:updated });
  return updated;
}

async function executeCaseAnalysisJob(progressId:string, caseId:number, requestData:any, fileBuffer?:Buffer) {
  const supplementalNarrative = String(requestData?.narrative || '').trim();
  let narrative = supplementalNarrative;
  const title = String(requestData?.title || 'Case Analysis Perkara');
  const filename = String(requestData?.originalname || '');
  let documentIngestion:any = null;

  try {
    setCaseProgress(progressId, { percent:15, stage:'UPLOAD_STORED', detail:'Dokumen tersimpan lokal; memulai pembacaan materi perkara.', case_id:caseId });

    if (fileBuffer) {
      setCaseProgress(progressId, { percent:28, stage:'DOCUMENT_READING', detail:'Mengekstrak teks dokumen tanpa memasukkan data biner ke analisis.', case_id:caseId });
      documentIngestion = await extractUploadedDocument(
        fileBuffer,
        filename || 'source.bin',
        String(requestData?.mimetype || ''),
        (ocrProgress) => {
          setCaseProgress(progressId, {
            percent: Math.max(28, Math.min(44, Number(ocrProgress.percent || 28))),
            stage: ocrProgress.stage,
            detail: ocrProgress.detail,
            case_id:caseId,
            page:ocrProgress.page,
            pages:ocrProgress.pages,
            pages_completed:ocrProgress.pages_completed,
            failed_pages:ocrProgress.failed_pages,
          });
        }
      );
      narrative = `${narrative}\n\n${documentIngestion.text || ''}`.trim();
    }

    if (!narrative || narrative.trim().length < 40) {
      throw new Error('Narasi perkara minimal 40 karakter diperlukan untuk menjalankan Case Analysis.');
    }

    setCaseProgress(progressId, { percent:45, stage:'DOCUMENT_READING_COMPLETE', detail:'Teks perkara dipetakan, mengidentifikasi subjek dan isu hukum.', case_id:caseId });
    setCaseProgress(progressId, { percent:65, stage:'CASE_MAPPING', detail:'Menyusun matriks pembuktian dan mensintesis dasar hukum positif.', case_id:caseId });

    const result = await runCaseAnalysis({
      title,
      narrative,
      filename,
      input_type: requestData?.input_type || (fileBuffer ? (supplementalNarrative ? 'narrative+document' : 'document') : 'narrative'),
      regulatory_mode: requestData?.regulatory_mode || 'hybrid',
      official_source_strategy: String(requestData?.manual_official_sources || '').split(/\r?\n|;/).map((x:string)=>x.trim()).filter(Boolean).length ? 'manual_plus_auto' : 'auto',
      manual_official_sources: String(requestData?.manual_official_sources || '').split(/\r?\n|;/).map((x:string)=>x.trim()).filter(Boolean).slice(0,20),
      document_ingestion: documentIngestion || undefined,
      supplemental_narrative: supplementalNarrative || undefined,
      client_id: requestData?.client_id ? String(requestData.client_id).trim() : undefined,
      client_name: requestData?.client_name ? String(requestData.client_name).trim() : undefined,
      existing_case_id: caseId,
      on_progress: ({ percent, stage, detail }) => {
        setCaseProgress(progressId, { percent:Math.max(65, Math.min(99, Number(percent || 65))), stage, detail, case_id:caseId });
      }
    });

    const finalizedResult = db.updateCaseAnalysis(result.id, {
      analysis_provenance:{ ...(result as any).analysis_provenance, job_status:'COMPLETED', progress_token:progressId, finalized:true, timestamp:new Date().toISOString() },
    } as any) || result;
    const completed = setCaseProgress(progressId, { percent:100, stage:'COMPLETED', detail:'Working paper siap ditinjau.', case_id:finalizedResult.id, pages_completed:documentIngestion?.pages_total || undefined, failed_pages:documentIngestion?.failed_pages || [] });
    caseJobStore.update(progressId, { status:'COMPLETED', progress:completed, record_snapshot:finalizedResult });
    // Source binary is needed only while a job is recoverable. Delete it after
    // successful completion; the legal working paper/history record remains.
    caseJobStore.deleteSource(progressId);
    scheduleProgressCleanup(progressId, 15 * 60 * 1000);
    return finalizedResult;
  } catch (err:any) {
    const message = String(err?.message || err || 'Gagal menjalankan Case Analysis');
    const recoverable = Boolean(caseJobStore.readSource(progressId) || supplementalNarrative.length >= 40);
    const failed = setCaseProgress(progressId, { percent:100, stage:recoverable?'FAILED_RECOVERABLE':'ERROR', detail:message, error:message, case_id:caseId });
    const snapshot = markCaseJobFailure(caseId, progressId, err);
    caseJobStore.update(progressId, { status:recoverable?'FAILED_RECOVERABLE':'ERROR', progress:failed, record_snapshot:snapshot || undefined });
    scheduleProgressCleanup(progressId, 15 * 60 * 1000);
    throw err;
  }
}

app.get('/api/case-analysis', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 30;
  const data = db.getCaseAnalyses(limit).map((record:any) => {
    const job = caseJobStore.findByCaseId(record.id);
    return {
      ...record,
      job_status: job?.status || caseLifecycleState(record),
      job_progress: job?.progress || null,
      finalized: isCaseAnalysisFinalized(record),
    };
  });
  res.json({ success:true, data });
});

function requireFinalizedCaseAnalysis(record:any, res:express.Response, operation:string): boolean {
  if (isCaseAnalysisFinalized(record)) {
    const contract = String(record?.analysis_provenance?.contract_version || '');
    if (contract === CASE_ANALYSIS_CONTRACT_VERSION) return true;
    res.status(409).json({
      success:false,
      error:`Case Analysis dibuat dengan canonical contract lama (${contract || 'UNVERSIONED'}). Jalankan ulang analisis sebelum ${operation.toLowerCase()} agar PDF/DOCX tidak mengekspor hasil runtime lama.`,
      case_id:record?.id,
      contract_version:contract || 'UNVERSIONED',
      required_contract_version:CASE_ANALYSIS_CONTRACT_VERSION,
      reanalysis_required:true,
    });
    return false;
  }
  const state = caseLifecycleState(record);
  const job = record?.id ? caseJobStore.findByCaseId(record.id) : null;
  res.status(409).json({
    success:false,
    error:`Case Analysis belum final (${state}). ${operation} diblokir agar hasil sementara tidak diperlakukan sebagai pendapat hukum final.`,
    case_id:record?.id,
    job_status:job?.status || state,
    progress:job?.progress || null,
    recoverable:(job?.status || state)==='FAILED_RECOVERABLE',
    resume_url:job?.status==='FAILED_RECOVERABLE' ? `/api/case-analysis/resume/${encodeURIComponent(job.token)}` : undefined,
  });
  return false;
}

app.get('/api/case-analysis/progress/:token', (req, res) => {
  const token = req.params.token;
  const durable = caseJobStore.get(token);
  const progress = progressMap.get(token) || durable?.progress || { percent:0, stage:'UNKNOWN', detail:'Progress token tidak ditemukan.', updated_at:new Date().toISOString() };
  res.json({ success:true, data:progress, durable_status:durable?.status || null });
});

app.get('/api/case-analysis/result/:token', (req, res) => {
  const token = req.params.token;
  const durable = caseJobStore.get(token);
  const progress = progressMap.get(token) || durable?.progress;
  if (!progress && !durable) return res.status(404).json({ success:false, error:'Progress token tidak ditemukan.' });

  if (durable?.record_snapshot?.id && !db.getCaseAnalysis(durable.record_snapshot.id)) {
    db.restoreCaseAnalysis(durable.record_snapshot);
  }

  if (durable?.status === 'COMPLETED' || ['COMPLETE','COMPLETED'].includes(String(progress?.stage || ''))) {
    const caseId = Number(progress?.case_id || durable?.case_id || 0);
    const result = caseId ? db.getCaseAnalysis(caseId) : durable?.record_snapshot;
    if (result) return res.json({ success:true, pending:false, data:result, case_id:result.id, recovered:true });
  }
  if (durable?.status === 'FAILED_RECOVERABLE' || progress?.stage === 'FAILED_RECOVERABLE') {
    return res.status(409).json({ success:false, pending:false, recoverable:true, data:progress, case_id:durable?.case_id, resume_url:`/api/case-analysis/resume/${encodeURIComponent(token)}` });
  }
  if (durable?.status === 'ERROR' || progress?.stage === 'ERROR') {
    return res.status(500).json({ success:false, error:progress?.error || progress?.detail || 'Case Analysis gagal.' });
  }
  return res.status(202).json({ success:true, pending:true, data:progress, case_id:durable?.case_id });
});

app.post('/api/case-analysis/resume/:token', expensiveAnalysisLimit, async (req, res) => {
  const token = req.params.token;
  const job = caseJobStore.get(token);
  if (!job) return res.status(404).json({ success:false, error:'Job Case Analysis tidak ditemukan.' });
  if (job.status === 'COMPLETED') {
    if (job.record_snapshot?.id && !db.getCaseAnalysis(job.record_snapshot.id)) db.restoreCaseAnalysis(job.record_snapshot);
    const result = db.getCaseAnalysis(job.case_id) || job.record_snapshot;
    return res.json({ success:true, data:result, case_id:job.case_id, recovered:true });
  }
  const runtime = progressMap.get(token);
  if (job.status === 'RUNNING' && runtime && !['ERROR','FAILED_RECOVERABLE','COMPLETE','COMPLETED'].includes(runtime.stage)) {
    return res.status(409).json({ success:false, error:'Job masih berjalan.', progress:runtime });
  }
  const source = caseJobStore.readSource(token) || undefined;
  if (job.input_type !== 'narrative' && !source) return res.status(410).json({ success:false, error:'Sumber dokumen untuk resume tidak tersedia.' });
  const resetProgress:RuntimeCaseProgress = {
    percent:0, stage:'RESUMING', detail:'Memulihkan job Case Analysis dari checkpoint lokal.', case_id:job.case_id,
    updated_at:new Date().toISOString(), failed_pages:[]
  };
  progressMap.set(token, resetProgress);
  progressPersistState.delete(token);
  caseJobStore.update(token, { status:'RUNNING', progress:resetProgress });
  try {
    const result = await executeCaseAnalysisJob(token, job.case_id, { ...job.request, title:job.title, input_type:job.input_type }, source);
    return res.json({ success:true, data:result, case_id:result.id, resumed:true });
  } catch (err:any) {
    return res.status(500).json({ success:false, error:String(err?.message || err) });
  }
});

app.post('/api/case-analysis', expensiveAnalysisLimit, upload.single('file') as any, async (req, res) => {
  const progressId = String((req.headers['x-lexicore-progress-id'] as string) || `prog-${Date.now()}`);
  const durableExisting = caseJobStore.get(progressId);
  const runtimeExisting = progressMap.get(progressId);
  if (runtimeExisting && !['ERROR','FAILED_RECOVERABLE','COMPLETE','COMPLETED'].includes(runtimeExisting.stage)) {
    return res.status(409).json({ success:false, error:'Case Analysis dengan token yang sama masih berjalan.', progress:runtimeExisting, case_id:runtimeExisting.case_id });
  }
  if (durableExisting?.status === 'COMPLETED') {
    if (durableExisting.record_snapshot?.id && !db.getCaseAnalysis(durableExisting.record_snapshot.id)) db.restoreCaseAnalysis(durableExisting.record_snapshot);
    const prior = db.getCaseAnalysis(durableExisting.case_id) || durableExisting.record_snapshot;
    if (prior) return res.json({ success:true, data:prior, case_id:durableExisting.case_id, recovered:true });
  }
  if (durableExisting && durableExisting.status !== 'ERROR') {
    return res.status(409).json({ success:false, error:'Token sudah memiliki job yang dapat dipulihkan. Gunakan endpoint resume, jangan membuat job duplikat.', progress:durableExisting.progress, case_id:durableExisting.case_id, recoverable:durableExisting.status==='FAILED_RECOVERABLE' });
  }

  const supplementalNarrative = String(req.body?.narrative || '').trim();
  const title = String(req.body?.title || 'Case Analysis Perkara');
  const filename = req.file?.originalname || '';
  const inputType:'narrative'|'document'|'narrative+document' = req.file ? (supplementalNarrative ? 'narrative+document' : 'document') : 'narrative';
  const clientId = req.body?.client_id ? String(req.body.client_id).trim() : undefined;
  const clientName = req.body?.client_name ? String(req.body.client_name).trim() : undefined;

  const placeholder = reserveCaseAnalysisRecord({ title, filename, input_type:inputType, narrative:supplementalNarrative, client_id:clientId, client_name:clientName, progressId });
  const initialProgress:RuntimeCaseProgress = { percent:15, stage:'UPLOAD_STORED', detail:'Job Case Analysis tersimpan dan siap diproses.', case_id:placeholder.id, updated_at:new Date().toISOString() };
  caseJobStore.create({
    token:progressId, status:'RUNNING', case_id:placeholder.id, title, filename, input_type:inputType,
    request:{ narrative:supplementalNarrative, regulatory_mode:req.body?.regulatory_mode || 'hybrid', manual_official_sources:String(req.body?.manual_official_sources || ''), client_id:clientId, client_name:clientName, mimetype:req.file?.mimetype || '', originalname:filename },
    progress:initialProgress, record_snapshot:placeholder,
  });
  if (req.file) caseJobStore.saveSource(progressId, req.file.buffer, filename);
  progressMap.set(progressId, initialProgress);

  try {
    const result = await executeCaseAnalysisJob(progressId, placeholder.id, { ...caseJobStore.get(progressId)?.request, title, input_type:inputType }, req.file?.buffer);
    if (!res.writableEnded) return res.json({ success:true, data:result, case_id:result.id });
  } catch (err:any) {
    console.error('Case analysis error:', err);
    if (!res.writableEnded) return res.status(500).json({ success:false, error:String(err?.message || err), case_id:placeholder.id, recoverable:true, progress_token:progressId });
  }
});

app.get('/api/case-analysis/:case_id/regulatory-snapshot', (req, res) => {
  const id = parseInt(req.params.case_id);
  const c = db.getCaseAnalysis(id);
  if (!c) {
    return res.status(404).json({ success: false, error: 'Snapshot tidak ditemukan' });
  }
  res.json({
    success: true,
    data: c.case_regulatory_snapshot || {}
  });
});

// -------------------------------------------------------------
// Living Lifecycle bindings: Client (1) / Draft (2) / Contract Review (3) /
// Case Analysis (4) cross-reference each other via client_id + case_id, and
// Case Analysis can push its findings straight into Compliance & Risk (6).
// -------------------------------------------------------------

// Everything on record for one case, across every other menu. Menu 1
// (Client) uses this to let an intake worker "call up" a case's generated
// documents when the client requests them.
app.get('/api/case-analysis/:case_id/related', (req, res) => {
  const id = Number.parseInt(req.params.case_id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success:false, error:'ID Case Analysis tidak valid.' });
  const c = db.getCaseAnalysis(id);
  if (!c) return res.status(404).json({ success:false, error:'Case Analysis tidak ditemukan.' });
  res.json({ success:true, data: db.getCaseRelatedRecords(id) });
});

// Directory of distinct clients seen anywhere in the system, with a rollup
// of how many records exist for them per module — feeds the Client-panel
// "cari klien / kaitkan kasus" picker.
app.get('/api/clients', (req, res) => {
  res.json({ success:true, data: db.getClientDirectory() });
});

// Full cross-module timeline for one client_id.
app.get('/api/clients/:clientId/timeline', (req, res) => {
  const clientId = String(req.params.clientId || '').trim();
  if (!clientId) return res.status(400).json({ success:false, error:'client_id wajib diisi.' });
  res.json({ success:true, data: db.getClientTimeline(clientId) });
});

// Case Analysis (4) -> Legal Drafting (2): compose a working draft directly
// from a case's proven parties, legal issues and recommendations instead of
// starting the Draft panel from a blank template. The new draft inherits
// the case's client_id/case_id so the lifecycle stays linked.
app.post('/api/case-analysis/:case_id/generate-draft', async (req, res) => {
  try {
    const caseId = Number.parseInt(req.params.case_id, 10);
    if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ success:false, error:'ID Case Analysis tidak valid.' });
    const c = db.getCaseAnalysis(caseId);
    if (!c) return res.status(404).json({ success:false, error:'Case Analysis tidak ditemukan.' });
    if (!requireFinalizedCaseAnalysis(c, res, 'Pembuatan legal draft')) return;

    const templates = db.getTemplates() as Record<string, any>;
    const requestedType = String(req.body?.doc_type || 'Legal Opinion');
    const template = templates[requestedType] || Object.values(templates).find((x:any) => x?.id === requestedType || x?.name === requestedType || x?.display_name === requestedType);
    const resolvedDocType = template?.display_name || template?.name || requestedType;

    const actors: any[] = Array.isArray((c as any).actor_matrix) ? (c as any).actor_matrix : [];
    const party1 = String(req.body?.party1 || c.client_name || actors[0]?.actor || 'Klien').trim();
    const party2 = String(req.body?.party2 || actors[1]?.actor || 'Pihak lawan/terkait').trim();

    const issueLines = (c.legal_issues || []).slice(0,6).map((li,i) => `${i+1}. ${li.issue}${li.conclusion ? ' — ' + li.conclusion : ''}`).join('\n');
    const recLines = (c.recommendations || []).slice(0,6).map((r,i) => `${i+1}. ${r}`).join('\n');
    const prompt = [
      `Sumber: Case Analysis #${caseId} — ${c.title}`,
      c.summary ? `Ringkasan perkara: ${c.summary}` : '',
      issueLines ? `Isu hukum yang teridentifikasi:\n${issueLines}` : '',
      recLines ? `Rekomendasi dari Case Analysis:\n${recLines}` : '',
      'Draft ini disusun dari hasil Case Analysis dan tetap harus diverifikasi terhadap dokumen asli, kewenangan, forum, tenggang, dan hukum positif sebelum digunakan.'
    ].filter(Boolean).join('\n\n');

    const profile = db.getProfile();
    const content = await generateLegalDraftAI({ doc_type: resolvedDocType, party1, party2, prompt, profile, template });

    const saved = db.saveDraft({
      title: `${resolvedDocType} - Case #${caseId} - ${party1}`,
      doc_type: resolvedDocType,
      template_key: template?.name || template?.id || requestedType,
      party1,
      party2,
      prompt,
      content,
      status: 'DRAFT_KERJA',
      client_id: c.client_id,
      client_name: c.client_name,
      case_id: caseId,
      source: 'case_analysis'
    });

    db.logAudit('DRAFT_FROM_CASE', `Legal draft disusun dari Case Analysis #${caseId}: ${saved.title}`);
    res.json({ success:true, draft_id: saved.id, draft: saved, content });
  } catch (err:any) {
    res.status(500).json({ success:false, error: err.message || 'Gagal menyusun draft dari Case Analysis.' });
  }
});

// Case Analysis (4) -> Compliance & Risk (6): turn the case's own risk
// matrix / overall risk score directly into a Compliance Assessment record,
// instead of requiring the risk team to re-answer the whole questionnaire
// from scratch for a matter that was already analyzed.
app.post('/api/case-analysis/:case_id/generate-compliance', (req, res) => {
  try {
    const caseId = Number.parseInt(req.params.case_id, 10);
    if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ success:false, error:'ID Case Analysis tidak valid.' });
    const c = db.getCaseAnalysis(caseId);
    if (!c) return res.status(404).json({ success:false, error:'Case Analysis tidak ditemukan.' });
    if (!requireFinalizedCaseAnalysis(c, res, 'Pembuatan compliance/risk assessment')) return;

    const rows = Array.isArray(c.risk_matrix) ? c.risk_matrix : [];
    const matrix = rows.map((r:any) => ({
      control_group: 'Case Analysis',
      risk_identification: r.clause || r.finding || 'Risiko dari Case Analysis',
      answer_label: r.finding || '-',
      control_status: r.level === 'HIGH' ? 'NON_COMPLIANT' : r.level === 'MEDIUM' ? 'PARTIAL' : 'COMPLIANT',
      risk_level: r.level || 'MEDIUM',
      legal_justification: r.finding || 'Temuan risiko dari Case Analysis.',
      legal_basis: 'Lihat applicable_law pada Case Analysis terkait — perlu diverifikasi ulang.',
      sanction_basis: 'Konsekuensi hukum/operasional perlu diverifikasi berdasarkan regulasi yang berlaku.',
      mitigation_checklist: r.mitigation ? [r.mitigation] : ['Verifikasi temuan dan dokumentasikan tindak lanjut.'],
      source: 'CASE_ANALYSIS'
    }));
    const legacyMatrix = matrix.map((r:any) => ({ area:r.control_group, rule:r.risk_identification, status:r.control_status, severity:r.risk_level, mitigation:(r.mitigation_checklist||[]).join('; ') }));
    const score = Math.max(0, Math.min(100, 100 - Number(c.overall_risk_score || 0)));
    const risk_level:'LOW'|'MEDIUM'|'HIGH' = Number(c.overall_risk_score||0) >= 67 ? 'HIGH' : Number(c.overall_risk_score||0) >= 34 ? 'MEDIUM' : 'LOW';

    const saved = db.saveComplianceAssessment({
      entity: req.body?.entity || c.client_name || c.title,
      title: `Compliance & Risk — Case #${caseId}: ${c.title}`,
      category: String(req.body?.category || 'Litigation & Dispute Risk'),
      score,
      risk_level,
      matrix: legacyMatrix,
      risk_matrix: matrix,
      custom_controls: [],
      system_question_count: matrix.length,
      custom_question_count: 0,
      answered_count: matrix.length,
      missing_count: 0,
      completion_percentage: 100,
      professional_verification: 'PENDING',
      summary: `Diturunkan langsung dari Case Analysis #${caseId}. Overall risk score perkara: ${c.overall_risk_score ?? '-'}/100 (${risk_level}). Tetap memerlukan verifikasi profesional sebelum dipakai sebagai kesimpulan kepatuhan.`,
      client_id: c.client_id,
      client_name: c.client_name,
      case_id: caseId,
      source: 'case_analysis'
    } as any);

    db.logAudit('COMPLIANCE_FROM_CASE', `Compliance assessment disusun dari Case Analysis #${caseId}`);
    res.json({ success:true, assessment: saved, data: saved });
  } catch (err:any) {
    res.status(500).json({ success:false, error: err.message || 'Gagal menyusun compliance assessment dari Case Analysis.' });
  }
});

function buildCaseExportIdentity(caseId: number) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const pick = (type: string) => parts.find(x => x.type === type)?.value || '00';
  const date = `${pick('year')}${pick('month')}${pick('day')}`;
  const time = `${pick('hour')}${pick('minute')}${pick('second')}`;
  const token = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return {
    id: `LC-CA${caseId}-${date}-${time}-${token}`,
    generated_at: now.toISOString(),
    generated_at_wib: `${pick('day')}-${pick('month')}-${pick('year')} ${pick('hour')}:${pick('minute')}:${pick('second')} WIB`,
  };
}

app.get('/api/case-analysis/export/:fmt/:case_id', (req, res) => {
  try {
    const fmt = String(req.params.fmt || '').toLowerCase();
    const caseId = Number.parseInt(String(req.params.case_id || ''), 10);

    if (!Number.isInteger(caseId) || caseId <= 0) {
      return res.status(400).json({ success: false, error: 'ID Case Analysis tidak valid.' });
    }

    const analysis = db.getCaseAnalysis(caseId);
    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: 'Case Analysis tidak ditemukan. Buka ulang hasil dari Riwayat Case atau jalankan analisis kembali.'
      });
    }
    if (!requireFinalizedCaseAnalysis(analysis, res, 'Ekspor PDF/DOCX')) return;

    const safeTitle = String(analysis.title || 'Case-Analysis-LexiCore')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100) || 'Case-Analysis-LexiCore';

    const exportMeta = buildCaseExportIdentity(caseId);
    const profile = db.getProfile();
    const exportAnalysis = {
      ...analysis,
      user_name: profile.configured ? String(profile.display_name || '').trim() : '',
      user_profile: {
        display_name: String(profile.display_name || '').trim(),
        professional_name: String(profile.professional_name || '').trim(),
        firm_name: String(profile.firm_name || '').trim(),
        credentials: String(profile.credentials || '').trim(),
      },
      export_meta: { ...exportMeta, case_analysis_id: caseId, format: fmt.toUpperCase() },
    };
    const exportBaseName = `${safeTitle}__${exportMeta.id}`;
    res.setHeader('X-LexiCore-Export-Id', exportMeta.id);
    res.setHeader('X-LexiCore-Export-Time', exportMeta.generated_at);
    res.setHeader('X-LexiCore-Analysis-Contract', CASE_ANALYSIS_CONTRACT_VERSION);

    if (fmt === 'pdf') {
      const data = createPdfBuffer(exportAnalysis);
      db.logAudit('CASE_ANALYSIS_EXPORT', `Case Analysis #${caseId} exported PDF | ${exportMeta.id}`);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${exportBaseName}.pdf"`);
      res.setHeader('Content-Length', String(data.length));
      res.setHeader('Cache-Control', 'no-store');
      return res.send(data);
    }

    if (fmt === 'docx') {
      const data = createDocxBuffer(exportAnalysis);
      db.logAudit('CASE_ANALYSIS_EXPORT', `Case Analysis #${caseId} exported DOCX | ${exportMeta.id}`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${exportBaseName}.docx"`);
      res.setHeader('Content-Length', String(data.length));
      res.setHeader('Cache-Control', 'no-store');
      return res.send(data);
    }

    return res.status(400).json({ success: false, error: 'Format ekspor hanya mendukung PDF atau DOCX.' });
  } catch (err: any) {
    console.error('Case analysis export error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Gagal mengekspor Case Analysis.' });
  }
});

// Compatibility route: accepts ONLY a tiny case_id payload, never the full working paper.
app.post('/api/case-analysis/export/:fmt', (req, res) => {
  const fmt = String(req.params.fmt || '').toLowerCase();
  const caseId = Number.parseInt(String(req.body?.case_id || req.body?.id || ''), 10);
  if (!Number.isInteger(caseId) || caseId <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Export memerlukan case_id. Working paper lengkap tidak boleh dikirim ulang dari browser.'
    });
  }
  return res.redirect(307, `/api/case-analysis/export/${encodeURIComponent(fmt)}/${caseId}`);
});

// -------------------------------------------------------------
// 10. Audit Logs & History Cleanup
// -------------------------------------------------------------
app.get('/api/audit/logs', (req, res) => {
  res.json({
    success: true,
    logs: db.getAuditLogs()
  });
});

app.get('/api/history/:kind/:id', (req, res) => {
  const kind = String(req.params.kind || '');
  const id = Number.parseInt(String(req.params.id || ''), 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success:false, error:'ID riwayat tidak valid.' });
  let data:any;
  switch (kind) {
    case 'drafts': data=db.getDraft(id); break;
    case 'contract_reviews':
    case 'analyses': data=db.getContractAnalysis(id); break;
    case 'research_notes':
    case 'research': data=db.getLegalResearchItem(id); break;
    case 'risk_assessments':
    case 'compliance': data=db.getComplianceAssessment(id); break;
    case 'client_documents':
    case 'communications': data=db.getClientCommunication(id); break;
    case 'case_analyses': data=db.getCaseAnalysis(id); break;
    default: return res.status(400).json({ success:false, error:'Jenis riwayat tidak dikenali.' });
  }
  if (!data) return res.status(404).json({ success:false, error:'Riwayat tidak ditemukan.' });
  return res.json({ success:true, data });
});

app.delete('/api/history/:kind/:id', (req, res) => {
  const { kind, id } = req.params;
  const numId = parseInt(id);
  let ok = false;

  switch (kind) {
    case 'drafts':
      ok = db.deleteDraft(numId);
      break;
    case 'contract_reviews':
    case 'analyses':
      ok = db.deleteContractAnalysis(numId);
      break;
    case 'research_notes':
    case 'research':
      ok = db.deleteLegalResearch(numId);
      break;
    case 'risk_assessments':
    case 'compliance':
      ok = db.deleteComplianceAssessment(numId);
      break;
    case 'client_documents':
    case 'communications':
      ok = db.deleteClientCommunication(numId);
      break;
    case 'case_analyses':
      ok = db.deleteCaseAnalysis(numId);
      break;
  }

  res.json({ success: ok });
});

app.delete('/api/history/:kind', (req, res) => {
  const kind = req.params.kind;
  const before = kind==='drafts' ? db.getDrafts(100000).length
    : (kind==='contract_reviews'||kind==='analyses') ? db.getContractAnalyses(100000).length
    : (kind==='research_notes'||kind==='research') ? db.getLegalResearch(100000).length
    : (kind==='risk_assessments'||kind==='compliance') ? db.getComplianceAssessments(100000).length
    : (kind==='client_documents'||kind==='communications') ? db.getClientCommunications(100000).length
    : kind==='case_analyses' ? db.getCaseAnalyses(100000).length : 0;
  const ok = db.clearCategory(kind);
  return res.status(ok?200:400).json({ success:ok, deleted:ok?before:0, error:ok?undefined:'Jenis riwayat tidak dikenali.' });
});

app.delete('/api/history', (req, res) => {
  db.clearAllHistory();
  res.json({ success: true, message: 'Seluruh riwayat kerja berhasil dibersihkan' });
});

// API error boundary: never leak Express/Multer HTML error pages into the desktop UI.
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!String(req.path || '').startsWith('/api/')) return next(err);
  const code = String(err?.code || '');
  const type = String(err?.type || '');
  if (code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success:false, error:`Ukuran berkas melebihi batas ${MAX_UPLOAD_MB} MB. Ringkas atau pecah dokumen sebelum diunggah.` });
  }
  if (type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({ success:false, error:'Payload permintaan terlalu besar. Gunakan upload dokumen atau endpoint berbasis ID; jangan kirim ulang working paper lengkap.' });
  }
  // Unhandled API error: logged as structured JSON without request bodies or stack disclosure.
  console.error(JSON.stringify({ level:'error', event:'api_error', request_id:res.locals.requestId, path:req.path, message:String(err?.message || err), code:String(err?.code || '') }));
  const status = Number(err?.status || err?.statusCode || 500);
  return res.status(status >= 400 && status < 600 ? status : 500).json({
    success:false,
    error: status >= 500 ? 'Terjadi kesalahan internal pada API LexiCore.' : String(err?.message || 'Permintaan tidak dapat diproses.')
  });
});

// -------------------------------------------------------------
// 11. Vite Dev Middleware & Static Production Serving
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Serve build-time Brotli/Gzip variants without adding runtime compression dependencies.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const pathname = decodeURIComponent(String(req.path || '/'));
      const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      if (!/\.(?:html|css|js|json|svg)$/i.test(rel)) return next();
      const absolute = path.resolve(distPath, rel);
      if (!absolute.startsWith(path.resolve(distPath) + path.sep) && absolute !== path.resolve(distPath, 'index.html')) return next();
      const accept = String(req.headers['accept-encoding'] || '');
      const candidate = /\bbr\b/.test(accept) && fs.existsSync(absolute + '.br')
        ? { file:absolute + '.br', encoding:'br' }
        : /\bgzip\b/.test(accept) && fs.existsSync(absolute + '.gz')
          ? { file:absolute + '.gz', encoding:'gzip' }
          : null;
      if (!candidate) return next();
      const ext = path.extname(absolute).toLowerCase();
      const types: Record<string,string> = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };
      res.setHeader('Content-Encoding', candidate.encoding);
      res.setHeader('Vary', 'Accept-Encoding');
      if (types[ext]) res.setHeader('Content-Type', types[ext]);
      const base = path.basename(absolute);
      if (base === 'index.html') res.setHeader('Cache-Control', 'no-cache');
      else if (/\.v\d+/i.test(base) || /\.[a-f0-9]{8,}\./i.test(base)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.sendFile(candidate.file);
    });
    app.use(express.static(distPath, {
      etag: true,
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        const base = path.basename(filePath);
        if (base === 'index.html') res.setHeader('Cache-Control', 'no-cache');
        else if (/\.v\d+/i.test(base) || /\.[a-f0-9]{8,}\./i.test(base)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(JSON.stringify({ level:'info', event:'server_started', port:PORT, node_env:process.env.NODE_ENV || 'development', baseline:'V6.12.2-PERFORMANCE-PREDEPLOY' }));
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(JSON.stringify({ level:'info', event:'server_shutdown', signal }));
    const force = setTimeout(() => process.exit(1), 10_000);
    (force as any).unref?.();
    server.close(() => {
      clearTimeout(force);
      process.exit(0);
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch(err => {
  console.error(JSON.stringify({ level:'error', event:'server_start_failed', message:String(err?.message || err) }));
  process.exitCode = 1;
});
