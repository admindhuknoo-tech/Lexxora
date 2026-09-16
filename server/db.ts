import fs from 'fs';
import path from 'path';
import {
  LegalRegulation,
  FirmProfile,
  LegalDraft,
  ContractAnalysis,
  LegalResearchNote,
  ComplianceAssessment,
  ClientCommunication,
  CaseAnalysisRecord
} from './types';

class LexicoreDB {
  private regulations: LegalRegulation[] = [];
  private templates: Record<string, any> = {};
  private complianceRules: Record<string, any> = {};
  
  private profile: FirmProfile = {
    display_name: 'Kantor Advokat & Konsultan Hukum LexiCore',
    professional_name: 'Advokat & Praktisi Hukum',
    firm_name: 'LexiCore Law Office & Partners',
    credentials: 'S.H., M.H.',
    email: 'advokat@lexicore.id',
    office_address: 'Gedung Kemitraan Hukum, Jl. Rasuna Said No. 12, Jakarta',
    phone: '+62 812-3456-7890',
    watermark_text: 'LEXICORE WORKING PAPER',
    branding_mode: 'co_brand',
    configured: true,
    first_run_required: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  private drafts: LegalDraft[] = [];
  private contractAnalyses: ContractAnalysis[] = [];
  private legalResearch: LegalResearchNote[] = [];
  private complianceAssessments: ComplianceAssessment[] = [];
  private clientCommunications: ClientCommunication[] = [];
  private caseAnalyses: CaseAnalysisRecord[] = [];
  private auditLogs: Array<{ id: number; action: string; details: string; timestamp: string }> = [];
  private normConflictAnalyses = 0;

  private nextId = {
    draft: 1,
    contractAnalysis: 1,
    research: 1,
    compliance: 1,
    communication: 1,
    caseAnalysis: 1,
    audit: 1
  };

  constructor() {
    this.initData();
  }

  private initData() {
    try {
      const regPath = path.join(process.cwd(), 'src', 'data', 'regulations.json');
      if (fs.existsSync(regPath)) {
        const raw = fs.readFileSync(regPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.regulations = parsed.map((item: any) => {
          let articles = item.articles;
          if (typeof articles === 'string') {
            try { articles = JSON.parse(articles); } catch { articles = []; }
          }
          let domainTags = item.domain_tags;
          if (typeof domainTags === 'string') {
            try { domainTags = JSON.parse(domainTags); } catch { domainTags = []; }
          }
          let metadata = item.metadata;
          if (typeof metadata === 'string') {
            try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
          }
          return {
            ...item,
            articles: Array.isArray(articles) ? articles : [],
            domain_tags: Array.isArray(domainTags) ? domainTags : [],
            metadata: metadata || {}
          };
        });
      }
    } catch (e) {
      console.warn('Failed to load regulations.json:', e);
    }

    try {
      const tmplPath = path.join(process.cwd(), 'src', 'data', 'templates.json');
      if (fs.existsSync(tmplPath)) {
        const raw = fs.readFileSync(tmplPath, 'utf8');
        this.templates = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Failed to load templates.json:', e);
    }

    try {
      const compPath = path.join(process.cwd(), 'src', 'data', 'compliance.json');
      if (fs.existsSync(compPath)) {
        const raw = fs.readFileSync(compPath, 'utf8');
        this.complianceRules = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Failed to load compliance.json:', e);
    }

    // Case history starts empty. LexiCore never seeds fabricated legal matters.
  }


  // License
  getLicenseStatus() {
    return {
      allowed: true,
      status: 'ACTIVE_LOCAL',
      message: 'Lisensi LexiCore aktif untuk Local Forensic Runtime',
      installation_id: 'LEXICORE-LOCAL-RUNTIME',
      tier: 'ENTERPRISE_LIFETIME',
      features: [
        'full_case_analysis',
        'deterministic_forensic_reasoning',
        'regulatory_intelligence_48_statutes',
        'legal_drafting_43_templates',
        'contract_risk_review',
        'compliance_matrix',
        'client_communication'
      ],
      expires_at: 'Managed by license policy'
    };
  }

  // Profile
  getProfile(): FirmProfile {
    return { ...this.profile };
  }

  updateProfile(data: Partial<FirmProfile>): FirmProfile {
    this.profile = {
      ...this.profile,
      ...data,
      configured: true,
      updated_at: new Date().toISOString()
    };
    this.logAudit('PROFILE_UPDATED', `Identitas firma diperbarui: ${this.profile.display_name}`);
    return this.getProfile();
  }

  // Regulations
  getRegulations(): LegalRegulation[] {
    return this.regulations;
  }

  searchRegulations(query: string, domain?: string): any[] {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      return this.regulations.slice(0, 20);
    }
    return this.regulations.filter((r) => {
      const matchText = (
        r.nomor + ' ' +
        r.tentang + ' ' +
        (r.domain_tags || []).join(' ') + ' ' +
        (r.articles || []).map(a => a.pasal + ' ' + a.content).join(' ')
      ).toLowerCase();
      const matchDomain = !domain || (r.domain_tags || []).some(t => t.toLowerCase().includes(domain.toLowerCase()));
      return matchText.includes(q) && matchDomain;
    });
  }

  // Templates
  getTemplates() {
    return this.templates;
  }

  // Compliance Rules
  getComplianceRules() {
    return this.complianceRules;
  }

  // Drafts
  getDrafts(limit = 30): LegalDraft[] {
    return this.drafts.slice(-limit).reverse();
  }

  getDraft(id: number): LegalDraft | undefined {
    return this.drafts.find(d => d.id === id);
  }

  saveDraft(data: Omit<LegalDraft, 'id' | 'created_at'>): LegalDraft {
    const item: LegalDraft = {
      ...data,
      id: this.nextId.draft++,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.drafts.push(item);
    this.logAudit('DRAFT_SAVED', `Legal draft disimpan: ${item.title}`);
    return item;
  }

  updateDraft(id: number, data: Partial<LegalDraft>): LegalDraft | null {
    const idx = this.drafts.findIndex(d => d.id === id);
    if (idx === -1) return null;
    this.drafts[idx] = {
      ...this.drafts[idx],
      ...data,
      updated_at: new Date().toISOString()
    };
    return this.drafts[idx];
  }

  deleteDraft(id: number): boolean {
    const idx = this.drafts.findIndex(d => d.id === id);
    if (idx === -1) return false;
    this.drafts.splice(idx, 1);
    this.logAudit('DRAFT_DELETED', `Draft ID ${id} dihapus`);
    return true;
  }

  // Contract Analyses
  getContractAnalyses(limit = 30): ContractAnalysis[] {
    return this.contractAnalyses.slice(-limit).reverse();
  }

  getContractAnalysis(id: number): ContractAnalysis | undefined {
    return this.contractAnalyses.find(a => a.id === id);
  }

  saveContractAnalysis(data: Omit<ContractAnalysis, 'id' | 'created_at'>): ContractAnalysis {
    const item: ContractAnalysis = {
      ...data,
      id: this.nextId.contractAnalysis++,
      created_at: new Date().toISOString()
    };
    this.contractAnalyses.push(item);
    this.logAudit('CONTRACT_REVIEWED', `Review kontrak: ${item.filename}`);
    return item;
  }

  deleteContractAnalysis(id: number): boolean {
    const idx = this.contractAnalyses.findIndex(a => a.id === id);
    if (idx === -1) return false;
    this.contractAnalyses.splice(idx, 1);
    return true;
  }

  // Research
  getLegalResearch(limit = 30): LegalResearchNote[] {
    return this.legalResearch.slice(-limit).reverse();
  }

  getLegalResearchItem(id: number): LegalResearchNote | undefined {
    return this.legalResearch.find(r => r.id === id);
  }

  saveLegalResearch(data: Omit<LegalResearchNote, 'id' | 'created_at'>): LegalResearchNote {
    const item: LegalResearchNote = {
      ...data,
      id: this.nextId.research++,
      created_at: new Date().toISOString()
    };
    this.legalResearch.push(item);
    this.logAudit('RESEARCH_SAVED', `Riset hukum disimpan: ${item.title}`);
    return item;
  }

  deleteLegalResearch(id: number): boolean {
    const idx = this.legalResearch.findIndex(r => r.id === id);
    if (idx === -1) return false;
    this.legalResearch.splice(idx, 1);
    return true;
  }

  // Compliance
  getComplianceAssessments(limit = 30): ComplianceAssessment[] {
    return this.complianceAssessments.slice(-limit).reverse();
  }

  getComplianceAssessment(id: number): ComplianceAssessment | undefined {
    return this.complianceAssessments.find(c => c.id === id);
  }

  saveComplianceAssessment(data: Omit<ComplianceAssessment, 'id' | 'created_at'>): ComplianceAssessment {
    const item: ComplianceAssessment = {
      ...data,
      id: this.nextId.compliance++,
      created_at: new Date().toISOString()
    };
    this.complianceAssessments.push(item);
    this.logAudit('COMPLIANCE_ASSESSED', `Penilaian kepatuhan: ${item.category} (${item.risk_level})`);
    return item;
  }

  deleteComplianceAssessment(id: number): boolean {
    const idx = this.complianceAssessments.findIndex(c => c.id === id);
    if (idx === -1) return false;
    this.complianceAssessments.splice(idx, 1);
    return true;
  }

  // Client Communication
  getClientCommunications(limit = 30): ClientCommunication[] {
    return this.clientCommunications.slice(-limit).reverse();
  }

  getClientCommunication(id: number): ClientCommunication | undefined {
    return this.clientCommunications.find(c => c.id === id);
  }

  saveClientCommunication(data: Omit<ClientCommunication, 'id' | 'created_at'>): ClientCommunication {
    const now = new Date().toISOString();
    const item: ClientCommunication = {
      ...data,
      id: this.nextId.communication++,
      created_at: now,
      updated_at: now
    };
    this.clientCommunications.push(item);
    this.logAudit('COMMUNICATION_CREATED', `Komunikasi klien: ${item.client_name} (${item.document_type})`);
    return item;
  }

  updateClientCommunication(id: number, data: Partial<ClientCommunication>): ClientCommunication | null {
    const idx = this.clientCommunications.findIndex(c => c.id === id);
    if (idx === -1) return null;
    this.clientCommunications[idx] = {
      ...this.clientCommunications[idx],
      ...data,
      id,
      updated_at: new Date().toISOString()
    };
    this.logAudit('COMMUNICATION_UPDATED', `Komunikasi klien ID ${id} diperbarui`);
    return this.clientCommunications[idx];
  }

  deleteClientCommunication(id: number): boolean {
    const idx = this.clientCommunications.findIndex(c => c.id === id);
    if (idx === -1) return false;
    this.clientCommunications.splice(idx, 1);
    return true;
  }

  // Case Analyses
  getCaseAnalyses(limit = 30): CaseAnalysisRecord[] {
    return this.caseAnalyses.slice(-limit).reverse();
  }

  getCaseAnalysis(id: number): CaseAnalysisRecord | undefined {
    return this.caseAnalyses.find(c => c.id === id);
  }

  saveCaseAnalysis(data: Omit<CaseAnalysisRecord, 'id' | 'created_at'>): CaseAnalysisRecord {
    const item: CaseAnalysisRecord = {
      ...data,
      id: this.nextId.caseAnalysis++,
      created_at: new Date().toISOString()
    };
    this.caseAnalyses.push(item);
    this.logAudit('CASE_ANALYZED', `Case analysis dijalankan: ${item.title}`);
    return item;
  }

  deleteCaseAnalysis(id: number): boolean {
    const idx = this.caseAnalyses.findIndex(c => c.id === id);
    if (idx === -1) return false;
    this.caseAnalyses.splice(idx, 1);
    return true;
  }

  // ---------------------------------------------------------------------
  // Cross-module binding (Living Lifecycle): menu 1 Client, 2 Draft,
  // 3 Contract Review, 4 Case Analysis, 6 Compliance & Risk all reference
  // the same `client_id` and, where the record originates from a case,
  // the same `case_id`. These lookups let each panel pull the other
  // panels' records instead of staying siloed history lists.
  // ---------------------------------------------------------------------

  getDraftsByCase(caseId: number): LegalDraft[] {
    return this.drafts.filter(d => d.case_id === caseId).reverse();
  }

  getContractAnalysesByCase(caseId: number): ContractAnalysis[] {
    return this.contractAnalyses.filter(c => c.case_id === caseId).reverse();
  }

  getComplianceAssessmentsByCase(caseId: number): ComplianceAssessment[] {
    return this.complianceAssessments.filter(c => c.case_id === caseId).reverse();
  }

  getLegalResearchByCase(caseId: number): LegalResearchNote[] {
    return this.legalResearch.filter(r => r.case_id === caseId).reverse();
  }

  getClientCommunicationsByCase(caseId: number): ClientCommunication[] {
    return this.clientCommunications.filter(c => c.case_id === caseId).reverse();
  }

  // Everything on record for a single Case Analysis, across every other
  // menu — this is what powers "client bisa memanggil dokumen kasus" and
  // the Case panel's "Dokumen & Aktivitas Terkait" section.
  getCaseRelatedRecords(caseId: number) {
    const caseAnalysis = this.getCaseAnalysis(caseId) || null;
    return {
      case_analysis: caseAnalysis,
      drafts: this.getDraftsByCase(caseId),
      contract_reviews: this.getContractAnalysesByCase(caseId),
      compliance_assessments: this.getComplianceAssessmentsByCase(caseId),
      research_notes: this.getLegalResearchByCase(caseId),
      client_communications: this.getClientCommunicationsByCase(caseId)
    };
  }

  // Distinct clients seen anywhere in the system (client communications are
  // the entry point for a client identity, menu 1), each with a rollup of
  // how many records in every other module reference that client_id.
  getClientDirectory(): Array<{ client_id: string; client_name: string; matter?: string; counts: Record<string, number>; last_activity: string }> {
    const byId = new Map<string, { client_id: string; client_name: string; matter?: string; counts: Record<string, number>; last_activity: string }>();
    const touch = (client_id?: string, client_name?: string, matter?: string, ts?: string, bucket?: keyof any) => {
      const id = String(client_id || '').trim();
      if (!id) return;
      const cur = byId.get(id) || { client_id: id, client_name: client_name || id, matter, counts: {}, last_activity: ts || '' };
      if (client_name && !cur.client_name) cur.client_name = client_name;
      if (matter && !cur.matter) cur.matter = matter;
      if (bucket) cur.counts[bucket as string] = (cur.counts[bucket as string] || 0) + 1;
      if (ts && ts > cur.last_activity) cur.last_activity = ts;
      byId.set(id, cur);
    };
    this.clientCommunications.forEach(c => touch(c.client_id, c.client_name, c.matter, c.created_at, 'client_documents'));
    this.caseAnalyses.forEach(c => touch(c.client_id, c.client_name, c.title, c.created_at, 'case_analyses'));
    this.drafts.forEach(d => touch(d.client_id, d.client_name, d.title, d.created_at, 'drafts'));
    this.contractAnalyses.forEach(c => touch(c.client_id, c.client_name, c.filename, c.created_at, 'contract_reviews'));
    this.complianceAssessments.forEach(c => touch(c.client_id, c.client_name, c.entity, c.created_at, 'risk_assessments'));
    this.legalResearch.forEach(r => touch(r.client_id, r.client_name, r.title, r.created_at, 'research_notes'));
    return [...byId.values()].sort((a, b) => (b.last_activity || '').localeCompare(a.last_activity || ''));
  }

  // Full cross-module timeline for one client: their own cases plus every
  // draft/review/compliance/research record tagged with that client_id,
  // OR tagged only with a case_id that belongs to one of that client's cases
  // (covers records generated from a case before/without an explicit client
  // tag of their own).
  getClientTimeline(clientId: string) {
    const id = String(clientId || '').trim();
    const cases = this.caseAnalyses.filter(c => c.client_id === id);
    const caseIds = new Set(cases.map(c => c.id));
    const belongs = (x: { client_id?: string; case_id?: number }) => x.client_id === id || (x.case_id != null && caseIds.has(x.case_id));
    return {
      client_id: id,
      cases,
      drafts: this.drafts.filter(belongs).reverse(),
      contract_reviews: this.contractAnalyses.filter(belongs).reverse(),
      compliance_assessments: this.complianceAssessments.filter(belongs).reverse(),
      research_notes: this.legalResearch.filter(belongs).reverse(),
      client_communications: this.clientCommunications.filter(c => c.client_id === id || (c.case_id != null && caseIds.has(c.case_id))).reverse()
    };
  }

  // Audit Logs
  logAudit(action: string, details: string) {
    this.auditLogs.unshift({
      id: this.nextId.audit++,
      action,
      details,
      timestamp: new Date().toISOString()
    });
    if (this.auditLogs.length > 500) {
      this.auditLogs.pop();
    }
  }

  getAuditLogs(limit = 50) {
    return this.auditLogs.slice(0, limit);
  }

  recordNormConflictAnalysis(): void {
    this.normConflictAnalyses += 1;
    this.logAudit('NORM_CONFLICT_ANALYZED', 'Analisis konflik norma dijalankan');
  }

  // Metrics
  getDashboardMetrics() {
    return {
      drafts: this.drafts.length,
      contract_reviews: this.contractAnalyses.length,
      regulatory_corpus: this.regulations.length,
      research_notes: this.legalResearch.length,
      risk_assessments: this.complianceAssessments.length,
      case_analyses: this.caseAnalyses.length,
      norm_conflict_analyses: this.normConflictAnalyses,
      client_documents: this.clientCommunications.length
    };
  }

  // Clear history by category
  clearCategory(kind: string): boolean {
    switch (kind) {
      case 'drafts':
        this.drafts = [];
        return true;
      case 'contract_reviews':
      case 'analyses':
        this.contractAnalyses = [];
        return true;
      case 'research_notes':
      case 'research':
        this.legalResearch = [];
        return true;
      case 'risk_assessments':
      case 'compliance':
        this.complianceAssessments = [];
        return true;
      case 'client_documents':
      case 'communications':
        this.clientCommunications = [];
        return true;
      case 'case_analyses':
        this.caseAnalyses = [];
        return true;
      default:
        return false;
    }
  }

  clearAllHistory(): void {
    this.drafts = [];
    this.contractAnalyses = [];
    this.legalResearch = [];
    this.complianceAssessments = [];
    this.clientCommunications = [];
    this.caseAnalyses = [];
  }
}

export const db = new LexicoreDB();
