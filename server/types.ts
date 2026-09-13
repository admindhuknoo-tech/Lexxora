export interface LegalRegulation {
  id: string;
  nomor: string;
  tahun: number;
  tentang: string;
  jenis: string;
  hierarchy_rank: number;
  status: string;
  effective_date?: string;
  promulgation_date?: string;
  jdih_source?: string;
  official_url?: string;
  domain_tags?: string[];
  articles?: Array<{
    id: string;
    regulation_id: string;
    pasal: string;
    content: string;
    topic?: string;
    keywords?: string[];
  }>;
  metadata?: any;
}

export interface FirmProfile {
  id?: number;
  display_name: string;
  professional_name: string;
  firm_name: string;
  credentials: string;
  email: string;
  office_address: string;
  phone: string;
  watermark_text: string;
  branding_mode: string;
  configured: boolean;
  first_run_required: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LegalDraft {
  id: number;
  title: string;
  doc_type: string;
  template_key?: string;
  party1?: string;
  party2?: string;
  effective_date?: string;
  duration?: string;
  prompt?: string;
  content: string;
  status?: string;
  created_at: string;
  updated_at?: string;
}

export interface ContractAnalysis {
  id: number;
  title?: string;
  filename: string;
  source_text?: string;
  word_count: number;
  risk_score: 'LOW' | 'MEDIUM' | 'HIGH';
  risks: Array<{
    clause?: string;
    risk: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    mitigation: string;
  }>;
  protective_clauses?: Array<{
    name: string;
    status: 'PRESENT' | 'MISSING' | 'WEAK';
    recommendation: string;
  }>;
  summary: string;
  raw_analysis?: string;
  created_at: string;
}

export interface LegalResearchNote {
  id: number;
  title: string;
  source_type?: string;
  citation?: string;
  jurisdiction?: string;
  keywords?: string[];
  summary: string;
  content?: string;
  source_text?: string;
  created_at: string;
}

export interface ComplianceAssessment {
  id: number;
  entity?: string;
  title?: string;
  category: string;
  score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  answers?: Record<string, any>;
  matrix: Array<{
    area: string;
    rule: string;
    status: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    mitigation: string;
  }>;
  risk_matrix?: any[];
  custom_controls?: any[];
  system_question_count?: number;
  custom_question_count?: number;
  professional_verification?: string;
  answered_count?: number;
  missing_count?: number;
  completion_percentage?: number;
  summary?: string;
  created_at: string;
}

export interface ClientCommunication {
  id: number;
  client_id?: string;
  client_name: string;
  legal_position?: string;
  whatsapp_number?: string;
  client_email?: string;
  client_address?: string;
  matter?: string;
  status?: string;
  updated_at?: string;
  document_type: string;
  subject: string;
  message: string;
  case_ref?: string;
  created_at: string;
}

export interface CaseRiskItem {
  clause: string;
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  finding: string;
  mitigation: string;
}

export interface CaseAnalysisRecord {
  id: number;
  title: string;
  input_type: 'narrative' | 'document' | 'narrative+document';
  filename?: string;
  source_text: string;
  facts: string[];
  incriminating_facts?: string[];
  mitigating_facts?: string[];
  legal_issues: Array<{
    issue: string;
    rule?: string;
    analysis?: string;
    conclusion?: string;
  }>;
  applicable_law: Array<{
    domain: string;
    source: string;
    status: string;
    regulation?: string;
    article?: string;
    relevance?: string;
  }>;
  summary: string;
  legal_analysis: string;
  arguments_for: string[];
  arguments_against: string[];
  evidence_needed: string[];
  evidentiary_gaps?: string[];
  risks: string[];
  risk_matrix: CaseRiskItem[];
  overall_risk_score: number;
  best_case: string;
  worst_case: string;
  verification_note: string;
  recommendations: string[];
  coverage_note?: string;
  case_posture?: string;
  domain_classification?: any;
  analysis_provenance?: any;
  case_readiness?: any;
  case_working_paper?: any;
  regulatory_matches?: any[];
  regulatory_intelligence?: any;
  regulatory_corpus_status?: any;
  norm_conflicts?: any;
  document_reading?: any;
  official_verification?: any;
  case_regulatory_snapshot?: any;
  document_ingestion?: any;
  professional_verification?: string;
  created_at: string;
}
