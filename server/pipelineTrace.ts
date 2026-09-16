/**
 * Deterministic pipeline tracer. Replaces LLM-produced "reasoning narration".
 *
 * RULES:
 * - Labels are generic and pipeline-stage based, never case-specific.
 * - The tracer records only stages that actually execute.
 * - Output is stable across runs given the same input.
 * - No party names, no matter numbers, no domain-specific nouns.
 */

export type StepStatus = 'RUNNING' | 'DONE' | 'SKIPPED' | 'FAILED';

export interface PipelineStep {
  id: string;
  label_id: string;
  label_en: string;
  started_at: number;
  ended_at?: number;
  status: StepStatus;
  detail?: string;
}

export const STAGE_LABELS = {
  ingest:            { id:'Memeriksa cakupan dokumen',      en:'Assessing document coverage' },
  page_split:        { id:'Memisahkan halaman sumber',      en:'Splitting source pages' },
  role_classify:     { id:'Mengklasifikasi peran sumber',   en:'Classifying source role' },
  evidence_model:    { id:'Membangun evidence model',       en:'Building evidence model' },
  fact_claim_split:  { id:'Memisahkan fakta dan klaim',     en:'Separating facts from claims' },
  actor_extract:     { id:'Mengekstrak aktor',              en:'Extracting actors' },
  timeline_extract:  { id:'Menyusun kronologi',             en:'Building timeline' },
  anomaly_detect:    { id:'Mendeteksi anomali',             en:'Detecting anomalies' },
  adverse_evidence:  { id:'Menyiapkan adverse evidence',    en:'Preparing adverse evidence' },
  domain_route:      { id:'Menentukan domain hukum',        en:'Routing legal domain' },
  issue_graph:       { id:'Menyusun isu hukum',             en:'Building issue graph' },
  query_build:       { id:'Menyusun query hukum',           en:'Building law queries' },
  law_discover:      { id:'Menemukan kandidat hukum',       en:'Discovering law candidates' },
  identity_gate:     { id:'Menyaring identitas instrumen',  en:'Filtering instrument identity' },
  local_corpus_route:{ id:'Merutekan Regulatory Corpus',   en:'Routing Regulatory Corpus' },
  nexus_gate:        { id:'Menyaring material nexus',       en:'Filtering material nexus' },
  forensic_reason:   { id:'Menalar secara forensik',        en:'Reasoning forensically' },
  lawyer_workflow:    { id:'Menyusun strategi kerja advokat', en:'Building lawyer workflow' },
  risk_score:        { id:'Menghitung skor risiko',         en:'Scoring risk' },
  pipeline_gate:     { id:'Menjalankan pipeline gate',      en:'Running pipeline gate' },
  working_paper:     { id:'Menyusun working paper',         en:'Building working paper' },
} as const;

export type StageId = keyof typeof STAGE_LABELS;

export class PipelineTracer {
  private steps: PipelineStep[] = [];
  private active = new Map<string, PipelineStep>();

  begin(id: StageId, detail?: string): PipelineStep {
    const labels = STAGE_LABELS[id];
    const s: PipelineStep = {
      id, label_id: labels.id, label_en: labels.en,
      started_at: Date.now(), status: 'RUNNING', detail,
    };
    this.active.set(id, s);
    this.steps.push(s);
    return s;
  }

  end(id: StageId, detail?: string): void {
    const s = this.active.get(id);
    if (!s) return;
    s.ended_at = Date.now();
    s.status = 'DONE';
    if (detail) s.detail = detail;
    this.active.delete(id);
  }

  skip(id: StageId, reason?: string): void {
    const labels = STAGE_LABELS[id];
    const s: PipelineStep = {
      id, label_id: labels.id, label_en: labels.en,
      started_at: Date.now(), ended_at: Date.now(),
      status: 'SKIPPED', detail: reason,
    };
    this.steps.push(s);
  }

  fail(id: StageId, reason: string): void {
    const s = this.active.get(id);
    if (!s) return;
    s.ended_at = Date.now();
    s.status = 'FAILED';
    s.detail = reason;
    this.active.delete(id);
  }

  all(): PipelineStep[] { return [...this.steps]; }

  /** Public view for UI/PDF/DOCX — never contains case data. */
  summarize(): Array<{ id: string; label: string; status: StepStatus; ms: number; detail?: string }> {
    return this.steps.map(s => ({
      id: s.id,
      label: s.label_id,                      // default ID; UI can switch to label_en
      status: s.status,
      ms: s.ended_at ? s.ended_at - s.started_at : 0,
      detail: s.detail,                       // must be generic or statistic only
    }));
  }
}