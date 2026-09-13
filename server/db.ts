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

    // Demo data is opt-in only. Production/default workspaces must not start with fabricated case history.
    if (process.env.LEXICORE_SEED_DEMO === '1') this.seedInitialCase();
  }

  private seedInitialCase() {
    const seedCase: CaseAnalysisRecord = {
      id: this.nextId.caseAnalysis++,
      title: 'Sengketa Penguasaan Tanah Waris dan Peralihan Hak',
      input_type: 'narrative',
      source_text: 'Terdapat sebidang tanah pertanian/sawah bersertifikat hak milik atas nama ayah yang telah meninggal dunia. Pewaris meninggalkan seorang anak laki-laki usia 8 tahun dan seorang saudara kandung yang mengklaim telah menguasai dan menggarap sawah tersebut selama 5 tahun serta berusaha mengalihkan hak ke pihak ketiga dengan surat di bawah tangan tanpa persetujuan wali anak yang sah.',
      facts: [
        'Objek berupa sebidang tanah pertanian/sawah bersertifikat Hak Milik atas nama ayah kandung (pewaris).',
        'Pewaris telah meninggal dunia dan meninggalkan satu orang anak laki-laki kandung berusia 8 tahun (di bawah umur/belum dewasa).',
        'Saudara kandung pewaris (paman) menguasai fisik sawah selama 5 tahun terakhir.',
        'Terdapat upaya paman mengalihkan hak objek sawah kepada pihak ketiga berdasarkan surat di bawah tangan tanpa penetapan perwalian pengadilan.'
      ],
      incriminating_facts: [
        'Penguasaan fisik lahan sawah telah berlangsung 5 tahun di bawah saudara kandung pewaris tanpa perlawanan aktif sebelumnya.'
      ],
      mitigating_facts: [
        'SHM masih sah terdaftar atas nama ayah kandung anak.',
        'Anak kandung adalah ahli waris golongan I yang sah menurut Pasal 852 KUHPerdata.',
        'Peralihan hak atas tanah milik anak di bawah umur tanpa penetapan izin jual dari Pengadilan Negeri batal demi hukum.'
      ],
      legal_issues: [
        {
          issue: 'Kedudukan hukum anak di bawah umur (8 tahun) sebagai ahli waris sah dan kebutuhan penetapan perwalian.',
          rule: 'Pasal 852 KUHPerdata jo. Pasal 47 & Pasal 48 UU No. 1/1974 tentang Perkawinan jo. UU No. 16/2019.',
          analysis: 'Anak kandung berhak mutlak mewarisi harta peninggalan ayahnya (Legitieme Portie). Karena masih berusia 8 tahun, anak belum cakap melakukan perbuatan hukum sendiri dan memerlukan wali yang ditetapkan pengadilan.',
          conclusion: 'Hak kepemilikan mutlak berada pada anak; segala transaksi pengalihan hak oleh pihak ketiga tanpa persetujuan perwalian pengadilan adalah tidak sah dan melawan hukum.'
        },
        {
          issue: 'Keabsahan pengalihan hak tanah pertanian bersertifikat melalui surat di bawah tangan oleh pihak non-pemilik.',
          rule: 'Pasal 1365 KUHPerdata (PMH) jo. Pasal 19 & Pasal 37 PP No. 24/1997 tentang Pendaftaran Tanah.',
          analysis: 'Peralihan hak milik atas tanah wajib dibuktikan dengan Akta PPAT dan didaftarkan ke Kantor Pertanahan (BPN). Surat di bawah tangan dari pihak yang bukan pemilik sah tidak memiliki kekuatan hukum untuk memindahkan hak.',
          conclusion: 'Tindakan saudara kandung mengalihkan tanah merupakan Perbuatan Melawan Hukum (PMH) dan berpotensi memicu tindak pidana penggelapan hak atas barang tidak bergerak (Pasal 385 KUHP).'
        }
      ],
      applicable_law: [
        { domain: 'Hukum Waris & Perdata', source: 'KUHPerdata Pasal 830, 852 (Hak Waris Golongan I)', status: 'BERLAKU' },
        { domain: 'Hukum Perkawinan & Perwalian', source: 'UU No. 1/1974 jo UU 16/2019 Pasal 47, 48 (Kewalian Anak)', status: 'BERLAKU' },
        { domain: 'Hukum Agraria & Pertanahan', source: 'PP No. 24/1997 Pasal 37 (Akta PPAT untuk Peralihan Hak)', status: 'BERLAKU' },
        { domain: 'Hukum Acara Perdata', source: 'HIR Pasal 118 / RBg Pasal 142 (Kompetensi Pengadilan Negeri Objek Tanah)', status: 'BERLAKU' }
      ],
      summary: 'Perkara menyangkut tanah waris bersertifikat atas nama pewaris yang dikuasai saudara kandung dan diduga hendak dialihkan kepada pihak ketiga, sementara ahli waris utama masih di bawah umur. Isu utama mencakup hak waris, perwalian, keabsahan peralihan hak, perlindungan aset, dan pembuktian.',
      legal_analysis: 'Secara yuridis, hak atas tanah sawah bersertifikat milik almarhum ayah demi hukum beralih kepada anak laki-lakinya selaku ahli waris sah. Klaim penguasaan fisik oleh saudara kandung tidak menggugurkan hak kepemilikan pemegang hak yang sah pada sertifikat.',
      arguments_for: [
        'Sertifikat Hak Milik adalah alat bukti hak yang kuat dan otentik menurut Pasal 32 ayat (1) PP 24/1997.',
        'Anak kandung terlindungi secara hukum dari pengalihan harta warisan sepihak oleh pihak non-wali sah.'
      ],
      arguments_against: [
        'Perlu antisipasi dalil itikad baik pembeli pihak ketiga dan dalil pemeliharaan/ongkos garap selama 5 tahun.'
      ],
      evidence_needed: [
        'Asli Sertifikat Hak Milik (SHM) objek sawah.',
        'Kutipan Akta Kematian Pewaris dari Disdukcapil.',
        'Kutipan Akta Kelahiran Anak Laki-Laki dan Kartu Keluarga.',
        'Surat Keterangan Waris (SKW) yang dilegalisir pejabat berwenang.',
        'Bukti fisik surat di bawah tangan yang dibuat saudara kandung (bila ada salinannya).'
      ],
      risks: [
        'Risiko pengalihan fisik lebih lanjut ke pihak ketiga beritikad baik sebelum dilakukan pemblokiran sertifikat di Kantor Pertanahan (BPN).',
        'Potensi friksi keluarga dan perlawanan fisik di lokasi sawah saat panen.'
      ],
      risk_matrix: [
        { clause: 'Pengalihan kepada pihak ketiga', level: 'HIGH', finding: 'Objek berisiko dialihkan sebelum pengamanan administratif atau yudisial dilakukan.', mitigation: 'Segera verifikasi status sertipikat dan tempuh langkah pengamanan yang sah sesuai hasil verifikasi.' },
        { clause: 'Pembuktian kewenangan wali', level: 'MEDIUM', finding: 'Ahli waris masih di bawah umur sehingga tindakan hukum atas harta memerlukan pembuktian kapasitas wali.', mitigation: 'Lengkapi dokumen kewarisan dan penetapan/otorisasi perwalian yang relevan.' }
      ],
      overall_risk_score: 70,
      best_case: 'Status hak dan kewarisan terverifikasi, pengalihan dapat dicegah, dan penguasaan objek dipulihkan melalui penyelesaian atau putusan yang efektif.',
      worst_case: 'Objek terlanjur dialihkan kepada pihak ketiga dan sengketa berkembang menjadi pembuktian berlapis mengenai hak, itikad baik, serta kewenangan perwalian.',
      verification_note: 'Verifikasi profesional masih PENDING. Hasil ini wajib diperiksa terhadap dokumen asli, status pertanahan aktual, tempus, dan hukum positif sebelum digunakan.',
      recommendations: [
        'Segera ajukan Permohonan Blokir Sertifikat ke Kantor Pertanahan (BPN) setempat untuk mencegah perubahan nama/beban hak tanggungan.',
        'Ajukan permohonan penetapan wali anak di bawah umur ke Pengadilan Negeri setempat.',
        'Kirimkan Surat Teguran/Somasi Resmi kepada saudara kandung dan pembeli di bawah tangan.',
        'Siapkan gugatan Perbuatan Melawan Hukum (PMH) ke Pengadilan Negeri dengan permohonan Sita Jaminan (Conservatoir Beslag).'
      ],
      case_posture: 'PERDATA_WARIS_AGRARIA',
      domain_classification: {
        posture: 'PERDATA_WARIS_AGRARIA',
        primary_domain: 'Hukum Perdata & Agraria',
        domains: [
          { id: 'civil_property', label: 'Hukum Kebendaan & Agraria', confidence: 0.95 },
          { id: 'inheritance', label: 'Hukum Waris & Perwalian', confidence: 0.92 }
        ]
      },
      analysis_provenance: {
        mode: 'AI_ASSISTED_LEGAL_ENGINE',
        provider: 'Google Gemini',
        model: 'gemini-3.8-flash',
        timestamp: new Date().toISOString()
      },
      case_readiness: {
        metric: 'CASE_PREPARATION_COMPLETENESS',
        label: 'Case Readiness / Kelengkapan Persiapan',
        overall_score: 85,
        confidence: 'HIGH',
        dimensions: {
          facts_completeness: { score: 90, label: 'Fakta & Subjek Terpetakan' },
          evidence_robustness: { score: 80, label: 'Bukti Otentik (SHM & Akta Kematian/Lahir)' },
          legal_basis_authority: { score: 90, label: 'Norma KUHPerdata & PP 24/1997 Sah' },
          procedural_strategy: { score: 80, label: 'Strategi Blokir BPN & PMH Siap' }
        }
      },
      case_working_paper: {
        format_version: '1.0',
        working_paper_percentage: {
          metric: 'CASE_ANALYSIS_READINESS',
          label: 'Case Readiness / Analysis Completeness',
          percentage: 85,
          confidence: 'HIGH',
          variables_increasing: [
            { variable: 'Kepemilikan SHM Terdaftar Otentik', impact: 25, basis: 'SHM atas nama pewaris memiliki kekuatan pembuktian sempurna' },
            { variable: 'Kedudukan Ahli Waris Golongan I Mutlak', impact: 25, basis: 'Pasal 852 KUHPerdata anak kandung adalah ahli waris mutlak' },
            { variable: 'Ketiadaan Izin Wali Pengadilan', impact: 20, basis: 'Transaksi di bawah tangan atas aset anak batal demi hukum' }
          ],
          variables_decreasing: [
            { variable: 'Penguasaan Fisik 5 Tahun oleh Paman', impact: -10, basis: 'Perlu pengamanan fisik dan peringatan hukum tertulis' },
            { variable: 'Belum Terbit Penetapan Wali Pengadilan', impact: -5, basis: 'Perlu penetapan wali untuk legal standing beracara di pengadilan' }
          ]
        }
      },
      document_reading: {
        status: 'VERIFIED',
        segments_read: 4,
        segments_total: 4,
        characters: 840
      },
      created_at: new Date().toISOString()
    };
    this.caseAnalyses.push(seedCase);
  }

  // License
  getLicenseStatus() {
    return {
      allowed: true,
      status: 'ACTIVE_STUDIO',
      message: 'Lisensi LexiCore Enterprise Cloud Aktif (AI Studio Environment)',
      installation_id: 'LEXICORE-PRO-AISTUDIO-BUILD',
      tier: 'ENTERPRISE_LIFETIME',
      features: [
        'full_case_analysis',
        'ai_deep_synthesis',
        'regulatory_intelligence_48_statutes',
        'legal_drafting_43_templates',
        'contract_risk_review',
        'compliance_matrix',
        'client_communication'
      ],
      expires_at: 'Lifetime Active Cloud Session'
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
