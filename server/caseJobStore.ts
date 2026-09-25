import fs from 'node:fs';
import path from 'node:path';

export type CaseJobStatus = 'RUNNING' | 'COMPLETED' | 'FAILED_RECOVERABLE' | 'ERROR';

export type CaseJobProgress = {
  percent: number;
  stage: string;
  detail: string;
  case_id?: number;
  error?: string;
  updated_at: string;
  page?: number;
  pages?: number;
  pages_completed?: number;
  failed_pages?: number[];
};

export type CaseJobState = {
  token: string;
  status: CaseJobStatus;
  case_id: number;
  title: string;
  filename?: string;
  input_type: 'narrative' | 'document' | 'narrative+document';
  created_at: string;
  updated_at: string;
  request: {
    narrative: string;
    regulatory_mode?: string;
    manual_official_sources?: string;
    client_id?: string;
    client_name?: string;
    mimetype?: string;
    originalname?: string;
  };
  progress: CaseJobProgress;
  record_snapshot?: any;
  source_file?: string;
};

function safeToken(token: string): string {
  return String(token || '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 160) || 'unknown';
}

function defaultRoot(): string {
  const explicit = String(process.env.LEXICORE_CASE_JOB_DIR || '').trim();
  if (explicit) return explicit;
  const base = String(process.env.APPDATA || process.env.XDG_CONFIG_HOME || process.env.HOME || process.cwd()).trim();
  return path.join(base, 'LexiCore', 'case-jobs');
}

export class CaseJobStore {
  readonly root: string;
  constructor(root = defaultRoot()) {
    this.root = root;
    fs.mkdirSync(this.root, { recursive: true });
  }

  private dir(token: string): string { return path.join(this.root, safeToken(token)); }
  private metaPath(token: string): string { return path.join(this.dir(token), 'job.json'); }

  private atomicWriteJson(filePath: string, value: any): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    try {
      fs.renameSync(tmp, filePath);
    } catch {
      // Windows may refuse replacement by rename when destination exists.
      fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      try { fs.unlinkSync(tmp); } catch { /* best effort */ }
    }
  }

  create(state: Omit<CaseJobState, 'created_at' | 'updated_at'>): CaseJobState {
    const now = new Date().toISOString();
    const job: CaseJobState = { ...state, created_at: now, updated_at: now };
    this.atomicWriteJson(this.metaPath(job.token), job);
    return job;
  }

  get(token: string): CaseJobState | null {
    try {
      const file = this.metaPath(token);
      if (!fs.existsSync(file)) return null;
      return JSON.parse(fs.readFileSync(file, 'utf8')) as CaseJobState;
    } catch {
      return null;
    }
  }

  update(token: string, patch: Partial<CaseJobState>): CaseJobState | null {
    const current = this.get(token);
    if (!current) return null;
    const next: CaseJobState = {
      ...current,
      ...patch,
      request: patch.request ? { ...current.request, ...patch.request } : current.request,
      progress: patch.progress ? { ...current.progress, ...patch.progress } : current.progress,
      updated_at: new Date().toISOString(),
    };
    this.atomicWriteJson(this.metaPath(token), next);
    return next;
  }

  updateProgress(token: string, patch: Partial<CaseJobProgress>): CaseJobState | null {
    const current = this.get(token);
    if (!current) return null;
    const now = new Date().toISOString();
    return this.update(token, {
      progress: { ...current.progress, ...patch, updated_at: now },
    });
  }

  saveSource(token: string, buffer: Buffer, originalName = 'source.bin'): string {
    const ext = path.extname(originalName || '').slice(0, 12).replace(/[^A-Za-z0-9.]/g, '') || '.bin';
    const file = path.join(this.dir(token), `source${ext}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
    this.update(token, { source_file: file });
    return file;
  }

  readSource(token: string): Buffer | null {
    const job = this.get(token);
    try {
      if (!job?.source_file || !fs.existsSync(job.source_file)) return null;
      return fs.readFileSync(job.source_file);
    } catch {
      return null;
    }
  }

  deleteSource(token: string): void {
    const job = this.get(token);
    try { if (job?.source_file && fs.existsSync(job.source_file)) fs.unlinkSync(job.source_file); } catch { /* best effort */ }
    if (job?.source_file) this.update(token, { source_file: undefined });
  }

  list(limit = 100): CaseJobState[] {
    let dirs: string[] = [];
    try { dirs = fs.readdirSync(this.root); } catch { return []; }
    const jobs = dirs.map(d => this.get(d)).filter((x): x is CaseJobState => Boolean(x));
    return jobs.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, Math.max(1, limit));
  }

  findByCaseId(caseId: number): CaseJobState | null {
    const id = Number(caseId || 0);
    if (!Number.isInteger(id) || id <= 0) return null;
    return this.list(1000).find(job => Number(job.case_id) === id) || null;
  }

  markInterruptedRunningJobs(): CaseJobState[] {
    const changed: CaseJobState[] = [];
    for (const job of this.list(1000)) {
      if (job.status !== 'RUNNING') continue;
      const interruptedAt = new Date().toISOString();
      const snapshot = job.record_snapshot ? {
        ...job.record_snapshot,
        summary: job.record_snapshot.summary === 'Case Analysis sedang diproses.' ? 'Case Analysis belum selesai.' : job.record_snapshot.summary,
        verification_note: 'Proses sebelumnya terhenti karena runtime berhenti dan dapat dipulihkan dari job lokal.',
        analysis_provenance: {
          ...(job.record_snapshot.analysis_provenance || {}),
          job_status:'FAILED_RECOVERABLE',
          progress_token:job.token,
          timestamp:interruptedAt,
        },
        document_reading: { ...(job.record_snapshot.document_reading || {}), status:'FAILED_RECOVERABLE' },
      } : undefined;
      const next = this.update(job.token, {
        status: 'FAILED_RECOVERABLE',
        record_snapshot: snapshot,
        progress: {
          ...job.progress,
          stage: 'INTERRUPTED',
          detail: 'Proses sebelumnya terhenti karena runtime berhenti. Job dapat dilanjutkan dari sumber lokal yang tersimpan.',
          error: 'Runtime interrupted before completion',
          updated_at: interruptedAt,
        },
      });
      if (next) changed.push(next);
    }
    return changed;
  }
}

export const caseJobStore = new CaseJobStore();
