import { db } from './db';
import { CaseAnalysisRecord, CaseRiskItem, LegalRegulation } from './types';
import { normalizeLegalText, DocumentIngestionResult } from './documentIngestion';
import { buildOfficialLawQueries, discoverOfficialLaw, inferTempusYearFromCase } from './officialLawRetriever';
import { buildEvidenceModel, classifySourceRole } from './evidenceModel';
import { inferLegalContext, authorityAnchorsForContext, deriveOntologyIssues, LEGAL_DOMAIN_PROFILES, LegalDomainId } from './legalOntology';
import { reasonForensically } from './forensicReasoner';
import { buildLawyerWorkflow } from './lawyerWorkflow';
import { PipelineTracer } from './pipelineTrace';

export interface CaseAnalysisInput {
  title: string;
  narrative: string;
  filename?: string;
  input_type?: 'narrative' | 'document' | 'narrative+document';
  regulatory_mode?: 'offline' | 'hybrid' | 'online' | string;
  official_source_strategy?: 'auto' | 'manual' | 'manual_plus_auto' | string;
  manual_official_sources?: string[];
  document_ingestion?: DocumentIngestionResult;
  supplemental_narrative?: string;
  // Living-lifecycle binding: when a case is opened from (or tagged with) a
  // known client, every downstream artifact generated from this case
  // (draft, compliance assessment) inherits the same identity automatically.
  client_id?: string;
  client_name?: string;
}

type ApplicableLaw = { domain:string;source:string;status:string;regulation:string;article:string;relevance:string;source_url?:string;verification_status?:string;tempus_status?:string };
type RegulatoryMode = 'offline' | 'hybrid' | 'online';

function normalizeRegulatoryMode(value: unknown): RegulatoryMode {
  const v = String(value || 'hybrid').toLowerCase();
  if (v === 'offline' || v === 'local' || v === 'lokal') return 'offline';
  if (v === 'online') return 'online';
  return 'hybrid';
}
function regulatoryModeLabel(mode: RegulatoryMode) {
  return mode === 'offline' ? 'LOCAL_ONLY' : mode === 'online' ? 'OFFICIAL_ONLINE_ONLY' : 'LOCAL_PLUS_OFFICIAL_ONLINE';
}

const LEVEL_SCORE: Record<CaseRiskItem['level'], number> = { HIGH: 85, MEDIUM: 55, LOW: 25 };

function safeString(v: unknown): string { return normalizeLegalText(v); }

/**
 * V6.11.1 — single-source sanitized text contract.
 * When document ingestion is present, its sanitized text is the only document
 * text allowed into semantic analysis. A separately typed user narrative may
 * be prepended, but the merged/raw upload narrative is never trusted as the
 * document source.
 */
export function resolveCanonicalAnalysisText(input: CaseAnalysisInput): string {
  const sanitizedDocument = safeString(input.document_ingestion?.text);
  if (sanitizedDocument) {
    const supplemental = safeString(input.supplemental_narrative);
    return [supplemental, sanitizedDocument].filter(Boolean).join('\n\n').trim();
  }
  return safeString(input.narrative);
}
function safeArray(v: unknown): string[] { return Array.isArray(v) ? v.map(safeString).filter(x => x.length >= 3).slice(0, 50) : []; }
function unique<T>(items: T[]): T[] { return [...new Set(items)]; }

type SourcePage = { page: number; text: string };
function splitSourcePages(text: string): SourcePage[] {
  const marker = /---\s*HALAMAN\s+(\d+)\s*---/gi;
  const matches = [...text.matchAll(marker)];
  if (!matches.length) return [{ page: 1, text }];
  const pages: SourcePage[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = (matches[i].index || 0) + matches[i][0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index || text.length) : text.length;
    pages.push({ page: Number(matches[i][1]) || i + 1, text: safeString(text.slice(start, end)) });
  }
  return pages;
}
function buildPageBalancedAnalysisText(text: string, maxChars = 110000) {
  const pages = splitSourcePages(text);
  if (text.length <= maxChars) return { text, char_coverage: 1, page_coverage: 1, pages_total: pages.length, pages_represented: pages.length };
  const overhead = pages.length * 28;
  const perPage = Math.max(900, Math.floor((maxChars - overhead) / Math.max(1, pages.length)));
  const blocks = pages.map(p => {
    if (p.text.length <= perPage) return `--- HALAMAN ${p.page} ---\n${p.text}`;
    const head = Math.floor(perPage * 0.68);
    const tail = Math.max(180, perPage - head - 70);
    return `--- HALAMAN ${p.page} ---\n${p.text.slice(0, head)}\n[...HALAMAN DIPADATKAN...]\n${p.text.slice(-tail)}`;
  });
  const out = blocks.join('\n\n').slice(0, maxChars);
  return { text: out, char_coverage: Math.min(1, out.length / Math.max(1, text.length)), page_coverage: 1, pages_total: pages.length, pages_represented: pages.length };
}

export function detectSourceRole(text: string): string {
  return classifySourceRole(text).role;
}

function extractEvidenceLedger(text: string) {
  const pages = splitSourcePages(text);
  const out: Array<{ id: string; page: number; context: string }> = [];
  const seen = new Set<string>();
  for (const p of pages) {
    const ids = [...p.text.matchAll(/\b(?:Bukti\s*)?([TP]-\d{1,3})\b/gi)];
    for (const m of ids) {
      const id = String(m[1]).toUpperCase();
      const key = `${id}@${p.page}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const idx = m.index || 0;
      out.push({ id, page: p.page, context: safeString(p.text.slice(Math.max(0, idx - 180), idx + 420)) });
    }
  }
  return out.slice(0, 160);
}

function extractSourceLawCitations(text: string): ApplicableLaw[] {
  const normalized = text.replace(/\s+/g, ' ');

  // Generic regulation-year sanity guard. OCR can mutate year digits;
  // reject implausible years without hardcoding any instrument number/name.
  const currentYear = new Date().getFullYear();
  const MIN_REGULATION_YEAR = 1945;
  const MAX_REGULATION_YEAR = currentYear + 1;
  const isValidRegulationYear = (y:number):boolean =>
    Number.isFinite(y) && y >= MIN_REGULATION_YEAR && y <= MAX_REGULATION_YEAR;

  const regRe = /\b(Undang[- ]Undang|UU|Peraturan\s+DKPP|Peraturan\s+KPU|PKPU|Peraturan\s+Menteri[^,.;]{0,80}?)\s+(?:Republik\s+Indonesia\s+)?Nomor\s+([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/gi;
  const rawMatches = [...normalized.matchAll(regRe)];
  const matches = rawMatches.filter(m => isValidRegulationYear(Number(m[3])));
  const out: ApplicableLaw[] = []; const seen = new Set<string>();
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]; const reg = safeString(`${m[1]} Nomor ${m[2]} Tahun ${m[3]}`); const key = reg.toLowerCase();
    if (seen.has(key)) continue; seen.add(key);
    const idx = m.index || 0; const next = i + 1 < matches.length ? (matches[i + 1].index || normalized.length) : normalized.length;
    const localStart = Math.max(0, idx - 180); const localEnd = Math.min(next, idx + 280); const local = normalized.slice(localStart, localEnd);
    const articles: string[] = [];
    const esc = String(m[2]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const r of [
      new RegExp(`Pasal\\s+\\d+[A-Za-z]?(?:\\s+ayat\\s*\\([^)]*\\))?(?:\\s+huruf\\s+[a-z])?[^.]{0,90}${esc}[^.]{0,30}${m[3]}`, 'gi'),
      new RegExp(`${esc}[^.]{0,30}${m[3]}[^.]{0,110}Pasal\\s+\\d+[A-Za-z]?(?:\\s+ayat\\s*\\([^)]*\\))?(?:\\s+huruf\\s+[a-z])?`, 'gi'),
    ]) {
      for (const hit of local.matchAll(r)) {
        const a = hit[0].match(/Pasal\s+\d+[A-Za-z]?(?:\s+ayat\s*\([^)]*\))?(?:\s+huruf\s+[a-z])?/i);
        if (a) articles.push(safeString(a[0]));
      }
    }
    out.push({ domain:'Rujukan eksplisit dokumen', source:reg, status:'SOURCE_CITED_UNVERIFIED', regulation:reg, article: unique(articles).slice(0,8).join(', ') || 'PERLU VERIFIKASI', relevance:'Rujukan disebut langsung dalam dokumen sumber. Identitas instrumen, versi pada tempus perkara, bunyi pasal, dan penerapannya tetap harus diverifikasi.' });
  }
  return out.slice(0, 16);
}

function classifyDomain(text: string, regimeCtx?:RegimeContext) {
  const rawContext=inferLegalContext(text);
  const context=regimeCtx?reconcileLegalContextWithRegime(rawContext,regimeCtx):rawContext;
  return {
    posture:context.primary.id, domain:context.primary.label,
    score:context.primary.score, confidence:context.confidence,
    ambiguous:context.ambiguous, margin:context.margin,
    secondary:context.secondary.map(x=>({posture:x.id,domain:x.label,score:x.score})),
    legal_context:context,
    regime_sync:(context as any).regime_sync||null,
  };
}

// ============================================================
// LOCAL CORPUS — TWO-STAGE RETRIEVAL (V5.5.4.6)
// ============================================================
// STAGE 1: broad recall over the entire curated Regulatory Corpus.
// STAGE 2: material ranking using issue terms, authority anchors,
//          article topic/keywords/content, and explicit citations.
// FALLBACK: Local mode must not collapse to zero merely because
//           ontology vocabulary is narrower than corpus wording.
// ============================================================

interface Stage1Candidate {
  regulation: LegalRegulation;
  stage1_score: number;
}

interface Stage2Candidate extends Stage1Candidate {
  material_score: number;
  issue_hits: number;
  issue_phrase_hits: number;
  anchor_hits: number;
  article_hits: number;
  citation_hit: boolean;
  primary_aligned: number;
  secondary_aligned: number;
  foreign_aligned: number;
  domain_alignment: 'PRIMARY' | 'SECONDARY' | 'NEUTRAL' | 'FOREIGN';
  ranked_articles?: any[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  regime_note: string | null;
}

interface DomainRankingContext {
  primary_id: LegalDomainId;
  primary_anchors: string[];
  secondary_anchors: string[];
  foreign_anchors: string[];
}

function buildDomainRankingContext(
  primaryId: LegalDomainId,
  secondaryIds: LegalDomainId[],
): DomainRankingContext {
  const relevant = new Set<LegalDomainId>([primaryId, ...secondaryIds]);
  const primaryProfile = LEGAL_DOMAIN_PROFILES.find(p => p.id === primaryId);
  const primary_anchors = (primaryProfile?.authority_anchors || []).map(normalizeSearchToken);
  const secondary_anchors: string[] = [];
  const foreign_anchors: string[] = [];

  for (const p of LEGAL_DOMAIN_PROFILES) {
    if (p.id === primaryId) continue;
    const lower = p.authority_anchors.map(normalizeSearchToken);
    if (relevant.has(p.id)) secondary_anchors.push(...lower);
    else foreign_anchors.push(...lower);
  }

  return {
    primary_id: primaryId,
    primary_anchors: unique(primary_anchors.filter(Boolean)),
    secondary_anchors: unique(secondary_anchors.filter(Boolean)),
    foreign_anchors: unique(foreign_anchors.filter(Boolean)),
  };
}

function normalizeSearchToken(value: unknown): string {
  return safeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9à-ÿ\s./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// FORUM + REGIME CONTEXT (V5.5.4.6.4)
// ------------------------------------------------------------
// forum  — dari court mention (decisive).
// regime — hanya dari substantive regime markers.
// Personal identity (agama individu) tidak mengubah forum/regime.
// ============================================================
type DetectedForum = 'UMUM' | 'AGAMA' | 'MILITER' | 'TUN' | 'NIAGA' | 'UNSPECIFIED';
type DetectedRegime =
  | 'UNSPECIFIED'
  | 'CRIMINAL'
  | 'CIVIL'
  | 'ISLAMIC'
  | 'CUSTOMARY'
  | 'ADMINISTRATIVE'
  | 'AMBIGUOUS';

interface RegimeContext {
  forum: DetectedForum;
  regime: DetectedRegime;
  signals: {
    forum_explicit: string[];
    criminal_procedural: string[];
    civil_procedural: string[];
    administrative_procedural: string[];
    islamic_substantive: string[];
    civil_substantive: string[];
    customary_substantive: string[];
    personal_identity: string[];
  };
}

function detectCaseRegimeContext(text: string): RegimeContext {
  const lower = safeString(text).toLowerCase();

  // ---- FORUM: independent from regime ----
  const forum_explicit: string[] = [];
  let forum: DetectedForum = 'UNSPECIFIED';

  if (/\bpengadilan\s+tipikor\b|\bpengadilan\s+tindak\s+pidana\s+korupsi\b/i.test(lower)) {
    forum = 'UMUM';
    forum_explicit.push('pengadilan_tipikor');
  } else if (/\bpengadilan\s+negeri\b/i.test(lower)) {
    forum = 'UMUM';
    forum_explicit.push('pengadilan_negeri');
  } else if (/\bpengadilan\s+agama\b/i.test(lower)) {
    forum = 'AGAMA';
    forum_explicit.push('pengadilan_agama');
  } else if (/\bpengadilan\s+militer\b/i.test(lower)) {
    forum = 'MILITER';
    forum_explicit.push('pengadilan_militer');
  } else if (/\bpengadilan\s+tata\s+usaha\s+negara\b|\bptun\b/i.test(lower)) {
    forum = 'TUN';
    forum_explicit.push('ptun');
  } else if (/\bpengadilan\s+niaga\b/i.test(lower)) {
    forum = 'NIAGA';
    forum_explicit.push('pengadilan_niaga');
  } else if (/\bpn\s+[a-z]/i.test(lower)) {
    forum = 'UMUM';
    forum_explicit.push('pn_abbrev');
  }

  // ---- REGIME: evidence-backed procedural/substantive signals ----
  const criminal_procedural: string[] = [];
  for (const [label, rx] of [
    ['terdakwa', /\bterdakwa\b/i],
    ['tersangka', /\btersangka\b/i],
    ['jaksa-penuntut-umum', /\bjaksa\s+penuntut\s+umum\b|\bpenuntut\s+umum\b/i],
    ['dakwaan', /\bdakwaan\b|\bsurat\s+dakwaan\b/i],
    ['pledoi', /\bpledoi\b|\bnota\s+pembelaan\b/i],
    ['tuntutan-pidana', /\btuntutan\s+(?:pidana|jaksa)\b/i],
    ['tipikor', /\btipikor\b|\btindak\s+pidana\s+korupsi\b/i],
    ['korupsi', /\bkorupsi\b/i],
    ['kuhp', /\bkuhp\b|\bkitab\s+undang-undang\s+hukum\s+pidana\b/i],
    ['kuhap', /\bkuhap\b|\bkitab\s+undang-undang\s+hukum\s+acara\s+pidana\b/i],
    ['penyidikan', /\bpenyidikan\b|\bpenyidik\b/i],
    ['penahanan', /\bpenahanan\b|\bpenangkapan\b/i],
    ['pid-sus', /\bpid\.?\s*sus\b/i],
    ['pidana-khusus', /\bpidana\s+khusus\b/i],
  ] as const) {
    if (rx.test(lower)) criminal_procedural.push(label);
  }

  const civil_procedural: string[] = [];
  for (const [label, rx] of [
    ['penggugat', /\bpenggugat\b/i],
    ['tergugat', /\btergugat\b/i],
    ['gugatan', /\bgugatan\b|\bsurat\s+gugatan\b/i],
    ['replik', /\breplik\b|\brepliek\b/i],
    ['duplik', /\bduplik\b/i],
    ['jawaban-tergugat', /\bjawaban\s+(?:tergugat|penggugat)\b/i],
    ['wanprestasi', /\bwanprestasi\b/i],
    ['pmh', /\bperbuatan\s+melawan\s+hukum\b|\bpmh\b/i],
    ['somasi', /\bsomasi\b/i],
    ['pdt-g', /\bpdt\.?\s*g\b/i],
    ['pdt-p', /\bpdt\.?\s*p\b/i],
    ['perjanjian', /\bperjanjian\b/i],
    ['perikatan', /\bperikatan\b/i],
  ] as const) {
    if (rx.test(lower)) civil_procedural.push(label);
  }

  const administrative_procedural: string[] = [];
  for (const [label, rx] of [
    ['ptun', /\bptun\b|\bpengadilan\s+tata\s+usaha\s+negara\b/i],
    ['ktun', /\bkeputusan\s+tata\s+usaha\s+negara\b|\bktun\b/i],
    ['sengketa-tun', /\bsengketa\s+tata\s+usaha\s+negara\b/i],
  ] as const) {
    if (rx.test(lower)) administrative_procedural.push(label);
  }

  const islamic_substantive: string[] = [];
  for (const [label, rx] of [
    ['khi', /\bkompilasi\s+hukum\s+islam\b|\bkhi\b/i],
    ['waris-islam', /\bhukum\s+waris\s+islam\b|\bkewarisan\s+islam\b/i],
    ['faraid', /\bfaraid\b|\bfaraidh\b|\bmawaris\b/i],
    ['hadhanah', /\bhadhanah\b/i],
    ['nafkah', /\bnafkah\b/i],
    ['cerai-talak', /\bcerai\s+talak\b|\btalak\b/i],
  ] as const) {
    if (rx.test(lower)) islamic_substantive.push(label);
  }

  const civil_substantive: string[] = [];
  for (const [label, rx] of [
    ['kuhperdata', /\bkuhperdata\b|\bburgerlijk\b/i],
    ['staatsblad-1847', /\bstaatsblad\s+1847\b/i],
    ['pasal-1365', /\bpasal\s+1365\b/i],
    ['pasal-1320', /\bpasal\s+1320\b/i],
    ['legitime-portie', /\blegitime\s+portie\b|\blegitieme\s+portie\b/i],

    // V6.7.3 — generic civil transaction/property-transfer signals.
    // These allow a non-litigation contract narrative to resolve CIVIL
    // without requiring gugatan/penggugat/replik/wanprestasi wording.
    ['jual-beli', /\bjual\s+beli\b|\bmenjual\b|\bdijual\b/i],
    ['ppjb-ajb', /\bppjb\b|\bajb\b|pengikatan\s+jual\s+beli/i],
    ['staged-payment', /\bpembayaran\s+bertahap\b|\buang\s+muka\b|\bdp\b|\btermin\b/i],
    ['cancellation-restitution', /\bpembatalan\b|\bpengakhiran\b|pengembalian\s+(?:uang|pembayaran)|\brestitusi\b/i],
    ['land-title-transfer', /\bshm\b|\bsertifikat\b[^.;]{0,80}\b(?:pecah|pemecahan|balik\s+nama|peralihan)\b|\bpemecahan\s+(?:shm|sertifikat)\b/i],
  ] as const) {
    if (rx.test(lower)) civil_substantive.push(label);
  }

  const customary_substantive: string[] = [];
  for (const [label, rx] of [
    ['hukum-adat', /\bhukum\s+adat\b/i],
    ['mha', /\bmasyarakat\s+hukum\s+adat\b/i],
    ['tanah-adat', /\btanah\s+adat\b/i],
  ] as const) {
    if (rx.test(lower)) customary_substantive.push(label);
  }

  // Personal identity is audit-only. It must never choose a legal regime.
  const personal_identity: string[] = [];
  for (const term of ['kristen','katolik','hindu','buddha','konghucu','islam','muslim']) {
    if (lower.includes(term)) personal_identity.push(term);
  }

  const candidates: Array<{
    regime: DetectedRegime;
    count: number;
    decisiveCount: number;
    signals: string[];
  }> = [
    {
      regime: 'CRIMINAL',
      count: criminal_procedural.length,
      decisiveCount: criminal_procedural.filter(s => /dakwaan|tipikor|pid-sus|kuhp|kuhap|tuntutan-pidana/.test(s)).length,
      signals: criminal_procedural,
    },
    {
      regime: 'ADMINISTRATIVE',
      count: administrative_procedural.length,
      decisiveCount: administrative_procedural.filter(s => /ptun|ktun|sengketa-tun/.test(s)).length,
      signals: administrative_procedural,
    },
    {
      regime: 'CIVIL',
      count: civil_procedural.length + civil_substantive.length,
      decisiveCount: civil_procedural.filter(s => /gugatan|replik|duplik|pdt-g|pdt-p/.test(s)).length,
      signals: [...civil_procedural, ...civil_substantive],
    },
    {
      regime: 'ISLAMIC',
      count: islamic_substantive.length,
      decisiveCount: islamic_substantive.filter(s => /khi|faraid|hadhanah|cerai-talak/.test(s)).length,
      signals: islamic_substantive,
    },
    {
      regime: 'CUSTOMARY',
      count: customary_substantive.length,
      decisiveCount: 0,
      signals: customary_substantive,
    },
  ];

  candidates.sort((a,b) => {
    if (a.decisiveCount !== b.decisiveCount) return b.decisiveCount - a.decisiveCount;
    return b.count - a.count;
  });

  let regime: DetectedRegime = 'UNSPECIFIED';
  const top = candidates[0];
  const runner = candidates[1];

  if (top && (top.decisiveCount > 0 || top.count >= 2)) {
    const runnerStrong = Boolean(runner && (runner.decisiveCount > 0 || runner.count >= 2));
    const exactStructuralTie =
      runnerStrong &&
      top.decisiveCount === runner.decisiveCount &&
      top.count === runner.count &&
      top.decisiveCount > 0;

    regime = exactStructuralTie ? 'AMBIGUOUS' : top.regime;
  }

  // Forum reconciliation only for forums that are regime-specific.
  // UMUM is intentionally NOT mapped to CIVIL because it handles both criminal and civil cases.
  if (forum === 'AGAMA' && regime === 'UNSPECIFIED') regime = 'ISLAMIC';
  if (forum === 'TUN' && regime === 'UNSPECIFIED') regime = 'ADMINISTRATIVE';

  return {
    forum,
    regime,
    signals: {
      forum_explicit,
      criminal_procedural,
      civil_procedural,
      administrative_procedural,
      islamic_substantive,
      civil_substantive,
      customary_substantive,
      personal_identity,
    },
  };
}


// ============================================================
// DOMAIN ↔ REGIME RECONCILIATION (V6.7.3)
// ============================================================
type LegalContextResult = ReturnType<typeof inferLegalContext>;

function regimeSignalStrength(ctx: RegimeContext): {strong:boolean;total:number;decisive:number} {
  if (ctx.regime==='CRIMINAL') {
    const s=ctx.signals.criminal_procedural;
    const decisive=s.filter(x=>/dakwaan|tipikor|pid-sus|kuhp|kuhap|tuntutan-pidana|tersangka|terdakwa|penyidikan|penahanan/.test(x)).length;
    return {strong:(decisive>=1 && s.length>=2)||s.length>=4,total:s.length,decisive};
  }
  if (ctx.regime==='CIVIL') {
    const p=ctx.signals.civil_procedural;
    const s=ctx.signals.civil_substantive;
    const decisive=p.filter(x=>/gugatan|replik|duplik|pdt-g|pdt-p|wanprestasi|somasi/.test(x)).length;
    const total=p.length+s.length;
    return {strong:decisive>=1||total>=2,total,decisive};
  }
  if (ctx.regime==='ADMINISTRATIVE') {
    const s=ctx.signals.administrative_procedural;
    return {strong:s.length>=1,total:s.length,decisive:s.length};
  }
  if (ctx.regime==='ISLAMIC') {
    const s=ctx.signals.islamic_substantive;
    return {strong:s.length>=2,total:s.length,decisive:s.filter(x=>/khi|faraid|hadhanah|cerai-talak/.test(x)).length};
  }
  if (ctx.regime==='CUSTOMARY') {
    const s=ctx.signals.customary_substantive;
    return {strong:s.length>=2,total:s.length,decisive:0};
  }
  return {strong:false,total:0,decisive:0};
}

function compatibleDomainIdsForRegime(regime:DetectedRegime):LegalDomainId[] {
  if(regime==='CRIMINAL') return ['PIDANA_MATERIIL_FORMIL'];
  if(regime==='ADMINISTRATIVE') return ['TUN_ADMINISTRASI'];
  if(regime==='CIVIL') return [
    'PERDATA_KONTRAKTUAL','PERDATA_UMUM','AGRARIA_PERTANAHAN',
    'KORPORASI_BISNIS','KELUARGA_WARIS','KETENAGAKERJAAN_PHI'
  ];
  if(regime==='ISLAMIC') return ['KELUARGA_WARIS'];
  if(regime==='CUSTOMARY') return ['AGRARIA_PERTANAHAN'];
  return [];
}

function reconcileLegalContextWithRegime(
  raw:LegalContextResult,
  regimeCtx:RegimeContext,
):LegalContextResult & {regime_sync?:{
  applied:boolean;from:string;to:string;reason:string;
  total_signals:number;decisive_signals:number;
}} {
  const strength=regimeSignalStrength(regimeCtx);
  const compatible=compatibleDomainIdsForRegime(regimeCtx.regime);
  const primaryId=raw.primary.id as LegalDomainId;

  if(!strength.strong || !compatible.length || regimeCtx.regime==='UNSPECIFIED' || regimeCtx.regime==='AMBIGUOUS' || compatible.includes(primaryId)){
    return {
      ...raw,
      regime_sync:{
        applied:false,from:primaryId,to:primaryId,
        reason:!strength.strong?'regime_not_strong':compatible.includes(primaryId)?'already_compatible':'no_reconciliation_target',
        total_signals:strength.total,decisive_signals:strength.decisive,
      },
    };
  }

  const target=(raw.scores||[])
    .filter((x:any)=>compatible.includes(x.id as LegalDomainId) && Number(x.score||0)>0)
    .sort((a:any,b:any)=>Number(b.score||0)-Number(a.score||0))[0];

  if(!target){
    return {
      ...raw,
      regime_sync:{
        applied:false,from:primaryId,to:primaryId,
        reason:'compatible_domain_has_no_positive_score',
        total_signals:strength.total,decisive_signals:strength.decisive,
      },
    };
  }

  const priorPrimary=raw.primary;
  // A profile-less placeholder (the "belum final" fallback) carries no issue templates
  // downstream (see deriveOntologyIssues' `.filter(x=>x.profile)`); it must not be
  // reintroduced as a secondary domain candidate just because regime sync displaced it.
  const carryPrior=priorPrimary.profile ? [priorPrimary as (typeof raw.scores)[number]] : [];
  const secondary=[
    ...carryPrior,
    ...(raw.secondary||[]).filter((x:any)=>x.id!==target.id && x.id!==priorPrimary.id),
  ].filter((x,i,arr)=>arr.findIndex(y=>y.id===x.id)===i).slice(0,3);

  const promotedConfidence=(strength.decisive>=2||strength.total>=4)
    ? 'HIGH'
    : strength.strong ? 'MEDIUM' : raw.confidence;

  return {
    ...raw,
    primary:target,
    secondary,
    confidence:promotedConfidence as any,
    ambiguous:false,
    margin:Number(target.score||0)-Number(secondary[0]?.score||0),
    regime_sync:{
      applied:true,from:primaryId,to:String(target.id),
      reason:`strong_${String(regimeCtx.regime).toLowerCase()}_regime`,
      total_signals:strength.total,decisive_signals:strength.decisive,
    },
  };
}

function prioritizeIssuesForDomain<T extends {domain?:string}>(issues:T[],primaryId:LegalDomainId):T[] {
  return issues
    .map((issue,index)=>({issue,index,priority:issue.domain===primaryId?0:1}))
    .sort((a,b)=>a.priority-b.priority||a.index-b.index)
    .map(x=>x.issue);
}

function downgradeTier(tier:'HIGH'|'MEDIUM'|'LOW', steps:number):'HIGH'|'MEDIUM'|'LOW' {
  const order:Array<'HIGH'|'MEDIUM'|'LOW'>=['HIGH','MEDIUM','LOW'];
  return order[Math.min(order.length-1, order.indexOf(tier)+Math.max(0,steps))];
}

type InstrumentRegimeScope =
  | 'UNIVERSAL'
  | 'CRIMINAL'
  | 'CIVIL'
  | 'ISLAMIC'
  | 'CUSTOMARY'
  | 'ADMINISTRATIVE'
  | 'MILITARY'
  | 'OTHER';

function inferredRegimeScope(reg: LegalRegulation): InstrumentRegimeScope {
  const explicit = safeString((reg as any).regime_scope).toUpperCase();
  if (['UNIVERSAL','CRIMINAL','CIVIL','ISLAMIC','CUSTOMARY','ADMINISTRATIVE','MILITARY','OTHER'].includes(explicit)) {
    return explicit as InstrumentRegimeScope;
  }

  const hay = normalizeSearchToken(
    `${reg.nomor||''} ${reg.tentang||''} ${reg.jenis||''} ${(reg.domain_tags||[]).join(' ')}`
  );

  if (/kuhp|kuhap|tindak pidana|pidana khusus|tipikor|korupsi|narkotika|terorisme|pencucian uang/.test(hay)) return 'CRIMINAL';
  if (/kompilasi hukum islam|\bkhi\b|peradilan agama|pengadilan agama|waris islam|ekonomi syariah/.test(hay)) return 'ISLAMIC';
  if (/ptun|tata usaha negara|\bktun\b|administrasi negara/.test(hay)) return 'ADMINISTRATIVE';
  if (/burgerlijk|staatsblad 1847|kuhperdata|kitab undang undang hukum perdata|perikatan|wanprestasi/.test(hay)) return 'CIVIL';
  if (/hukum adat|masyarakat hukum adat|\bulayat\b|tanah adat/.test(hay)) return 'CUSTOMARY';
  if (/peradilan militer|pengadilan militer/.test(hay)) return 'MILITARY';
  return 'UNIVERSAL';
}

function inferredJurisdictionForum(reg: LegalRegulation): 'UMUM'|'AGAMA'|'MILITER'|'TUN'|'NIAGA'|'ANY' {
  const explicit = safeString((reg as any).jurisdiction_forum).toUpperCase();
  if (['UMUM','AGAMA','MILITER','TUN','NIAGA','ANY'].includes(explicit)) return explicit as any;
  const hay = normalizeSearchToken(`${reg.nomor||''} ${reg.tentang||''} ${reg.jenis||''} ${(reg.domain_tags||[]).join(' ')}`);
  if (/peradilan agama|pengadilan agama/.test(hay)) return 'AGAMA';
  if (/peradilan militer|pengadilan militer/.test(hay)) return 'MILITER';
  if (/tata usaha negara|\bptun\b/.test(hay)) return 'TUN';
  if (/pengadilan niaga|peradilan niaga/.test(hay)) return 'NIAGA';
  if (/peradilan umum|pengadilan negeri/.test(hay)) return 'UMUM';
  return 'ANY';
}

function applyRegimeGuard(
  reg: LegalRegulation,
  currentTier:'HIGH'|'MEDIUM'|'LOW',
  regimeCtx:RegimeContext,
): { tier:'HIGH'|'MEDIUM'|'LOW'; note:string|null } {
  const scope = inferredRegimeScope(reg);
  const instrumentForum = inferredJurisdictionForum(reg);
  const { forum, regime } = regimeCtx;
  let tier = currentTier;
  const notes:string[]=[];

  // Regime and forum are independent dimensions.
  // Never infer CIVIL merely because forum=UMUM.
  if (scope !== 'UNIVERSAL' && scope !== 'OTHER' && scope !== 'MILITARY') {
    if (regime === 'UNSPECIFIED') {
      tier = downgradeTier(tier,1);
      notes.push(`rezim perkara belum terkunci; lingkup instrumen=${scope}`);
    } else if (regime === 'AMBIGUOUS') {
      tier = downgradeTier(tier,1);
      notes.push(`rezim perkara ambigu; lingkup instrumen=${scope}`);
    } else if (scope !== regime) {
      tier = downgradeTier(tier,2);
      notes.push(`lingkup instrumen=${scope} tidak cocok dengan rezim perkara=${regime}`);
    }
  }

  if (instrumentForum !== 'ANY') {
    if (forum === 'UNSPECIFIED') {
      tier = downgradeTier(tier,1);
      notes.push(`forum perkara belum terkunci; forum instrumen=${instrumentForum}`);
    } else if (instrumentForum !== forum) {
      tier = downgradeTier(tier,2);
      notes.push(`forum instrumen=${instrumentForum} tidak cocok dengan forum perkara=${forum}`);
    }
  }

  return { tier, note: notes.length ? notes.join('; ') : null };
}

function stage1LexicalScore(reg: LegalRegulation, tokens: string[]): number {
  // Stage-1 deliberately stays broad. Article bodies are excluded here so
  // generic vocabulary in long provisions does not dominate candidate recall.
  const hay = normalizeSearchToken(
    `${reg.nomor || ''} ${reg.tentang || ''} ${reg.jenis || ''} ${(reg.domain_tags || []).join(' ')}`
  );

  let score = 0;
  for (const raw of tokens) {
    const t = normalizeSearchToken(raw);
    if (t.length < 4 || !hay.includes(t)) continue;
    score += t.includes(' ') ? 3 : 1;
  }
  return score;
}

function regulationCitationIdentity(reg: LegalRegulation): { number?: string; year?: string; family?: string } {
  const nomor = normalizeSearchToken(reg.nomor);
  const yearMatch = `${reg.nomor || ''} ${reg.tahun || ''}`.match(/\b(19|20)\d{2}\b/);
  const numberMatch = nomor.match(/\b(?:no\.?|nomor)\s*([0-9a-z./-]+)/i)
    || nomor.match(/\b(?:uu|pp|perpres|perppu|perda|perbup|perwali|permen)\s*([0-9a-z./-]+)\b/i);
  const familyMatch = nomor.match(/\b(uu|undang[- ]undang|pp|peraturan pemerintah|perpres|peraturan presiden|perppu|perda|perbup|perwali|permen)\b/i);

  return {
    number: numberMatch?.[1],
    year: reg.tahun ? String(reg.tahun) : yearMatch?.[0],
    family: familyMatch?.[1],
  };
}

function explicitCitationHit(reg: LegalRegulation, sourceText: string): boolean {
  const src = normalizeSearchToken(sourceText);
  const regNomor = normalizeSearchToken(reg.nomor);

  // Strongest signal: the corpus instrument label itself appears in source.
  if (regNomor.length >= 6 && src.includes(regNomor)) return true;

  const id = regulationCitationIdentity(reg);
  if (!id.number || !id.year) return false;

  const numberHit = new RegExp(`\\b(?:no\\.?|nomor)?\\s*${id.number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(src);
  const yearHit = src.includes(id.year);
  if (!numberHit || !yearHit) return false;

  // If family is available, require at least a compatible family token.
  if (id.family) {
    const fam = normalizeSearchToken(id.family);
    const aliases =
      /\buu|undang/.test(fam) ? ['uu', 'undang undang', 'undang-undang'] :
      /\bpp|peraturan pemerintah/.test(fam) ? ['pp', 'peraturan pemerintah'] :
      /\bperpres|peraturan presiden/.test(fam) ? ['perpres', 'peraturan presiden'] :
      /\bperppu/.test(fam) ? ['perppu'] :
      /\bperda/.test(fam) ? ['perda', 'peraturan daerah'] :
      /\bperbup/.test(fam) ? ['perbup', 'peraturan bupati'] :
      /\bperwali/.test(fam) ? ['perwali', 'peraturan wali kota', 'peraturan walikota'] :
      /\bpermen/.test(fam) ? ['permen', 'peraturan menteri'] :
      [fam];
    return aliases.some(a => src.includes(a));
  }

  return true;
}

function scoreArticleMaterial(
  article: any,
  issueTerms: string[],
  anchors: string[],
  sourceText: string,
): { score: number; matched: boolean } {
  const hay = normalizeSearchToken(
    `${safeString(article?.pasal)} ${safeString(article?.topic)} ${(article?.keywords || []).join(' ')} ${safeString(article?.content)}`
  );
  if (!hay) return { score: 0, matched: false };

  let score = 0;
  let matched = false;

  for (const raw of issueTerms) {
    const t = normalizeSearchToken(raw);
    if (t.length < 4 || !hay.includes(t)) continue;
    matched = true;
    score += t.includes(' ') ? 8 : 4;
  }
  for (const raw of anchors) {
    const a = normalizeSearchToken(raw);
    if (a.length < 4 || !hay.includes(a)) continue;
    matched = true;
    score += a.includes(' ') ? 4 : 2;
  }

  // Small source-language overlap bonus, capped so long pleadings do not swamp
  // issue-specific matches.
  const sourceTokens = unique((normalizeSearchToken(sourceText).match(/[a-zà-ÿ]{6,}/g) || [])).slice(0, 80);
  let lexical = 0;
  for (const token of sourceTokens) {
    if (hay.includes(token)) lexical++;
    if (lexical >= 5) break;
  }
  score += lexical;

  return { score, matched };
}

interface Stage2MaterialResult {
  material_score: number;
  issue_hits: number;
  issue_phrase_hits: number;
  anchor_hits: number;
  article_hits: number;
  citation_hit: boolean;
  primary_aligned: number;
  secondary_aligned: number;
  foreign_aligned: number;
  domain_alignment: 'PRIMARY' | 'SECONDARY' | 'NEUTRAL' | 'FOREIGN';
  ranked_articles: any[];
}

function stage2MaterialScore(
  reg: LegalRegulation,
  issueTerms: string[],
  anchors: string[],
  sourceText: string,
  domainCtx: DomainRankingContext,
): Stage2MaterialResult {
  const hay = normalizeSearchToken(
    `${reg.nomor || ''} ${reg.tentang || ''} ${reg.jenis || ''} ${(reg.domain_tags || []).join(' ')}`
  );
  const normalizedIssues = unique(issueTerms.map(normalizeSearchToken).filter(x => x.length >= 4));
  const normalizedAnchors = unique(anchors.map(normalizeSearchToken).filter(x => x.length >= 4));

  // Issue-specific signals dominate generic domain anchors.
  let issue_hits = 0;
  let issue_phrase_hits = 0;
  for (const t of normalizedIssues) {
    if (!hay.includes(t)) continue;
    issue_hits++;
    if (t.includes(' ')) issue_phrase_hits++;
  }

  let anchor_hits = 0;
  for (const a of normalizedAnchors) if (hay.includes(a)) anchor_hits++;

  // Article-level material nexus is preserved from V5.5.4.6 and ranked.
  const rankedArticles = (reg.articles || [])
    .map((article:any) => ({ article, ...scoreArticleMaterial(article, normalizedIssues, normalizedAnchors, sourceText) }))
    .sort((a:any,b:any) => b.score - a.score);

  const article_hits = rankedArticles.filter((x:any) => x.matched && x.score > 0).length;
  const citation_hit = explicitCitationHit(reg, sourceText);

  // Domain dominance comes entirely from the existing ontology authority_anchors.
  let primary_aligned = 0;
  for (const a of domainCtx.primary_anchors) {
    if (a.length >= 4 && hay.includes(a)) primary_aligned++;
  }

  let secondary_aligned = 0;
  for (const a of domainCtx.secondary_anchors) {
    if (a.length >= 4 && hay.includes(a)) secondary_aligned++;
  }

  let foreign_aligned = 0;
  for (const a of domainCtx.foreign_anchors) {
    if (a.length >= 4 && hay.includes(a)) foreign_aligned++;
  }

  let domain_alignment: 'PRIMARY' | 'SECONDARY' | 'NEUTRAL' | 'FOREIGN' = 'NEUTRAL';
  if (primary_aligned > 0) domain_alignment = 'PRIMARY';
  else if (secondary_aligned > 0) domain_alignment = 'SECONDARY';
  else if (foreign_aligned > 0) domain_alignment = 'FOREIGN';

  const issue_component =
    issue_phrase_hits * 15 +
    issue_hits * 6;

  // Generic anchors are deliberately weaker than issue-specific terms.
  const anchor_component = anchor_hits * 2;

  // Preserve article materiality and top-article quality from the baseline.
  const article_component =
    Math.min(article_hits, 6) * 5 +
    Math.min(16, rankedArticles[0]?.score || 0);

  // Explicit citation remains the strongest direct-source signal.
  const citation_component = citation_hit ? 25 : 0;

  // Primary > secondary; foreign-only alignment is penalized.
  const domain_component =
    primary_aligned * 4 +
    secondary_aligned * 2 -
    foreign_aligned * 5;

  const material_score =
    issue_component +
    anchor_component +
    article_component +
    citation_component +
    domain_component;

  return {
    material_score,
    issue_hits,
    issue_phrase_hits,
    anchor_hits,
    article_hits,
    citation_hit,
    primary_aligned,
    secondary_aligned,
    foreign_aligned,
    domain_alignment,
    ranked_articles: rankedArticles.filter((x:any) => x.score > 0).slice(0, 5).map((x:any) => x.article),
  };
}

function confidenceTier(m: Stage2MaterialResult): 'HIGH' | 'MEDIUM' | 'LOW' {
  // Explicit citation wins: the source itself named the instrument.
  if (m.citation_hit) return 'HIGH';

  // Foreign-only instruments that do not answer the actual issue are demoted.
  if (
    m.foreign_aligned > 0 &&
    m.primary_aligned === 0 &&
    m.secondary_aligned === 0 &&
    m.issue_hits === 0 &&
    m.issue_phrase_hits === 0
  ) return 'LOW';

  // Strong issue + domain agreement.
  if (m.issue_phrase_hits > 0 && (m.primary_aligned > 0 || m.secondary_aligned > 0)) return 'HIGH';

  // Strong issue/article materiality can still be HIGH even if metadata does not
  // expose an ontology anchor.
  if (m.material_score >= 34 && m.article_hits >= 2 && m.issue_hits >= 1) return 'HIGH';

  if (m.issue_phrase_hits > 0) return 'MEDIUM';
  if (m.issue_hits >= 2 && (m.primary_aligned > 0 || m.secondary_aligned > 0)) return 'MEDIUM';
  if (m.issue_hits >= 2) return 'MEDIUM';
  if (m.primary_aligned >= 1 && (m.issue_hits >= 1 || m.article_hits >= 1)) return 'MEDIUM';
  if (m.secondary_aligned >= 1 && m.issue_hits >= 1 && m.article_hits >= 1) return 'MEDIUM';

  // Generic anchors alone are not enough unless supported by article nexus.
  if (m.anchor_hits >= 2 && m.article_hits >= 1 && m.domain_alignment !== 'FOREIGN') return 'MEDIUM';
  return 'LOW';
}

function matchRegulations(
  text: string,
  domain: string,
  issueTerms: string[],
  domainCtx: DomainRankingContext,
  regimeCtx: RegimeContext,
) {
  const allRegs = db.getRegulations();
  if (!allRegs.length) {
    return {
      rows: [],
      diagnostics: {
        corpus_size: 0,
        stage1_size: 0,
        strict_count: 0,
        fallback_used: false,
        fallback_reason: 'CORPUS_EMPTY',
        selected_count: 0,
        confidence_counts: { high: 0, medium: 0, low: 0 },
        domain_ranking: {
          primary_id: domainCtx.primary_id,
          primary_anchors_count: domainCtx.primary_anchors.length,
          secondary_anchors_count: domainCtx.secondary_anchors.length,
          foreign_anchors_count: domainCtx.foreign_anchors.length,
        },
        top_stage1: [],
      },
    };
  }

  const anchors = authorityAnchorsForContext(domain, text.slice(0, 18000))
    .map(normalizeSearchToken)
    .filter(Boolean);

  // Stage 1 remains broad and recall-oriented. Issue/ontology vocabulary leads,
  // while case-language tokens only provide a capped recall supplement.
  const caseTokens = unique((normalizeSearchToken(text.slice(0, 12000)).match(/[a-zà-ÿ]{5,}/g) || []))
    .filter(x => !new Set(['dengan','dalam','untuk','bahwa','tersebut','adalah','pihak','perkara','hukum','tahun','nomor']).has(x))
    .slice(0, 35);

  const stage1Tokens = unique([
    ...issueTerms.map(normalizeSearchToken),
    ...domainCtx.primary_anchors,
    ...domainCtx.secondary_anchors,
    ...anchors,
    ...((normalizeSearchToken(domain).match(/[a-zà-ÿ]{5,}/g) || []) as string[]),
    ...caseTokens,
  ]).filter(x => x.length >= 4).slice(0, 100);

  let stage1: Stage1Candidate[] = allRegs
    .map(regulation => ({ regulation, stage1_score: stage1LexicalScore(regulation, stage1Tokens) }))
    .sort((a,b) => b.stage1_score - a.stage1_score)
    .slice(0, Math.min(18, allRegs.length));

  // Explicit citations are scanned against the FULL corpus and promoted into
  // Stage 1 so a directly-cited instrument cannot be hidden by lexical ranking.
  const citationRegs = allRegs
    .filter(regulation => explicitCitationHit(regulation, text))
    .map(regulation => ({ regulation, stage1_score: 50 }));

  const seenStage1 = new Set(stage1.map(c => safeString(c.regulation.id)));
  for (const c of citationRegs) {
    if (!seenStage1.has(safeString(c.regulation.id))) stage1.unshift(c);
  }
  stage1 = stage1.slice(0, Math.min(20, allRegs.length));

  // Stage 2: issue-anchored material ranking + domain dominance.
  const withMaterial: Stage2Candidate[] = stage1.map(c => {
    const m = stage2MaterialScore(c.regulation, issueTerms, anchors, text, domainCtx);
    const baseTier = confidenceTier(m);
    const guarded = applyRegimeGuard(c.regulation, baseTier, regimeCtx);
    // A direct citation in the case source is provenance, so it may remain HIGH even
    // when the regime/forum guard warns that applicability still needs verification.
    const finalTier:'HIGH'|'MEDIUM'|'LOW' = m.citation_hit ? 'HIGH' : guarded.tier;
    return { ...c, ...m, confidence: finalTier, regime_note: guarded.note };
  });

  const strict = withMaterial
    .filter(c =>
      (c.confidence === 'HIGH' || c.confidence === 'MEDIUM') &&
      c.material_score > 0
    )
    .sort((a,b) =>
      Number(b.citation_hit) - Number(a.citation_hit) ||
      (b.domain_alignment === 'PRIMARY' ? 1 : b.domain_alignment === 'SECONDARY' ? 0.5 : 0) -
      (a.domain_alignment === 'PRIMARY' ? 1 : a.domain_alignment === 'SECONDARY' ? 0.5 : 0) ||
      b.material_score - a.material_score ||
      b.stage1_score - a.stage1_score
    );

  const fallbackUsed = strict.length === 0;
  let chosen = strict.length
    ? strict
    : withMaterial
        .sort((a,b) =>
          Number(b.citation_hit) - Number(a.citation_hit) ||
          b.material_score - a.material_score ||
          b.stage1_score - a.stage1_score
        )
        .slice(0, 8);

  // Local corpus remains fail-soft: non-empty corpus must never collapse to zero.
  if (!chosen.length && allRegs.length) {
    chosen = allRegs.slice(0, Math.min(5, allRegs.length)).map(regulation => ({
      regulation,
      stage1_score: 0,
      material_score: 0,
      issue_hits: 0,
      issue_phrase_hits: 0,
      anchor_hits: 0,
      article_hits: 0,
      citation_hit: false,
      primary_aligned: 0,
      secondary_aligned: 0,
      foreign_aligned: 0,
      domain_alignment: 'NEUTRAL' as const,
      ranked_articles: [],
      confidence: 'LOW' as const,
      regime_note: null,
    }));
  }

  const rows = chosen.slice(0, 8).map(c => {
    const material = stage2MaterialScore(c.regulation, issueTerms, anchors, text, domainCtx);
    return {
      regulation: c.regulation,
      relevance_score: Math.min(
        0.95,
        Math.max(0.15, 0.26 + c.stage1_score * 0.02 + Math.max(0, c.material_score) * 0.015)
      ),
      material_confidence: c.confidence,
      domain_alignment: c.domain_alignment,
      regime_note: c.regime_note || null,
      matched_articles: material.ranked_articles.length
        ? material.ranked_articles
        : (c.regulation.articles || []).slice(0, 2),
      anchor_hits: c.anchor_hits,
      issue_hits: c.issue_hits,
      issue_phrase_hits: c.issue_phrase_hits,
      article_hits: c.article_hits,
      citation_hit: c.citation_hit,
      explicit_hit: c.citation_hit,
      primary_aligned: c.primary_aligned,
      secondary_aligned: c.secondary_aligned,
      foreign_aligned: c.foreign_aligned,
      best_article_score: material.ranked_articles.length ? (material.article_hits ? material.material_score : 0) : 0,
      stage1_score: c.stage1_score,
      material_score: c.material_score,
    };
  });

  return {
    rows,
    diagnostics: {
      corpus_size: allRegs.length,
      stage1_size: stage1.length,
      strict_count: strict.length,
      fallback_used: fallbackUsed,
      fallback_reason: fallbackUsed ? 'NO_HIGH_OR_MEDIUM_MATERIAL_MATCH' : '',
      selected_count: rows.length,
      confidence_counts: {
        high: rows.filter(r => r.material_confidence === 'HIGH').length,
        medium: rows.filter(r => r.material_confidence === 'MEDIUM').length,
        low: rows.filter(r => r.material_confidence === 'LOW').length,
      },
      domain_ranking: {
        primary_id: domainCtx.primary_id,
        primary_anchors_count: domainCtx.primary_anchors.length,
        secondary_anchors_count: domainCtx.secondary_anchors.length,
        foreign_anchors_count: domainCtx.foreign_anchors.length,
      },
      regime_guard: {
        regime: regimeCtx.regime,
        forum: regimeCtx.forum,
        signals: regimeCtx.signals,
        downgraded_count: rows.filter(r => Boolean(r.regime_note)).length,
      },
      top_stage1: stage1.slice(0, 8).map(c => ({
        nomor: c.regulation.nomor,
        tentang: (c.regulation.tentang || '').slice(0, 100),
        score: c.stage1_score,
      })),
      selected_domain_alignment: rows.map(r => ({
        nomor: r.regulation.nomor,
        confidence: r.material_confidence,
        domain_alignment: r.domain_alignment,
        primary_aligned: r.primary_aligned,
        secondary_aligned: r.secondary_aligned,
        foreign_aligned: r.foreign_aligned,
        material_score: r.material_score,
      })),
    },
  };
}

function localCorpusCandidatesFromMatches(matches:any[], issueTerms:string[], tempusYear?:number): any[] {
  return (matches || []).map((m:any) => {
    const reg = m.regulation as LegalRegulation;
    const statusText = safeString(reg.status).toLowerCase();
    const inactive = /dicabut|tidak berlaku|repealed|revoked|expired/.test(statusText);
    const future = Boolean(tempusYear && reg.tahun && reg.tahun > tempusYear);
    const confidence = (m.material_confidence || 'LOW') as 'HIGH'|'MEDIUM'|'LOW';
    const excerpt = (m.matched_articles || []).slice(0,4)
      .map((a:any)=>`${safeString(a.pasal)} ${safeString(a.topic)} ${safeString(a.content)}`)
      .join(' | ');

    return {
      provider:'LOCAL_CORPUS',
      query:issueTerms.slice(0,10).join(' '),
      title:`${safeString(reg.nomor)}${reg.tentang?` tentang ${safeString(reg.tentang)}`:''}`,
      url:safeString(reg.official_url)||`local://regulation/${encodeURIComponent(safeString(reg.id))}`,
      source_domain:'LOCAL_REGULATORY_CORPUS',
      status:'IDENTITY_VERIFIED',
      instrument_type:safeString(reg.jenis)||undefined,
      number:safeString(reg.nomor)||undefined,
      year:Number(reg.tahun)||undefined,
      subject:safeString(reg.tentang)||undefined,
      effective_status:safeString(reg.status)||'LOCAL_CORPUS_STATUS_UNKNOWN',
      excerpt:excerpt||safeString(reg.tentang),
      fetched_at:new Date().toISOString(),
      tempus_status:future?'POTENTIALLY_INCOMPATIBLE':'POTENTIALLY_COMPATIBLE',
      identity_match:m.citation_hit?'EXACT':'TOPICAL',
      query_kind:'LOCAL_CORPUS',
      source_origin:'LOCAL',
      material_nexus_score:Math.round(Number(m.relevance_score||0)*100),
      material_nexus_status:inactive?'REJECTED':'VERIFIED',
      hierarchy_status:'ALLOWED',
      verification_reasons:[
        'candidate resolved from Regulatory Corpus two-stage retrieval',
        `material confidence=${confidence}`,
        `stage1=${m.stage1_score||0}; material=${m.material_score||0}`,
        `issue hits=${m.issue_hits||0}; phrase hits=${m.issue_phrase_hits||0}; article hits=${m.article_hits||0}`,
        m.citation_hit?'explicit citation detected in case source':'no explicit citation; ranked by local material nexus',
        confidence==='LOW'
          ? 'LOW_CONFIDENCE fallback candidate: verify extra carefully before relying on it'
          : 'material nexus passed local corpus confidence gate',
        'professional verification remains required before filing',
      ],
    };
  }).filter((c:any)=>c.material_nexus_status==='VERIFIED'&&c.tempus_status!=='POTENTIALLY_INCOMPATIBLE');
}

function officialCandidateRejected(candidate:any): boolean {
  const effective = safeString(candidate?.effective_status || candidate?.status_hint || '').toLowerCase();
  const tempus = safeString(candidate?.tempus_status || '').toUpperCase();
  if (/tidak\s+berlaku|dicabut|repealed|revoked|expired|superseded/.test(effective)) return true;
  if (tempus === 'POTENTIALLY_INCOMPATIBLE' || tempus === 'INCOMPATIBLE') return true;
  return false;
}

const GENERIC_NEXUS_TOKENS = new Set(['hukum','perkara','pihak','bukti','pembuktian','prosedur','remedy','forum','kewenangan','status','dokumen','tindakan','peraturan','indonesia','republik','tahun','nomor']);
// ============================================================
// ISSUE-AUTHORITY BINDING (V5.5.4.6.3)
// ============================================================
interface BindableCandidate {
  title: string;
  source_kind: 'LOCAL' | 'OFFICIAL';
  source_label: string;
  article_summary: string;
  domain_tags: string[];
  article_text_pool: string;
  material_confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  citation_hit: boolean;
  regime_note: string | null;
  domain_alignment: 'PRIMARY' | 'SECONDARY' | 'NEUTRAL' | 'FOREIGN';
  authority_identity: string;
  instrument_type?: string;
  number?: string;
  year?: number;
  effective_status?: string;
  tempus_status: 'UNVERIFIED'|'POTENTIALLY_COMPATIBLE'|'POTENTIALLY_INCOMPATIBLE';
}

interface BoundAuthority {
  source_label: string;
  source_kind: 'LOCAL' | 'OFFICIAL';
  binding_score: number;
  matched_terms: string[];
  article_summary: string;
  material_confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  regime_note: string | null;
  domain_alignment: 'PRIMARY' | 'SECONDARY' | 'NEUTRAL' | 'FOREIGN';
  authority_identity: string;
  tempus_status: 'UNVERIFIED'|'POTENTIALLY_COMPATIBLE'|'POTENTIALLY_INCOMPATIBLE';
  effective_status?: string;
  binding_reason: string;
}

function authorityIdentityKey(input:{source_kind:string; instrument_type?:string; number?:string; year?:number; source_label:string}):string{
  const type=normalizeSearchToken(input.instrument_type||'');
  const number=normalizeSearchToken(input.number||'');
  const year=Number(input.year)||0;
  if(type && number && year) return `${type}:${number}:${year}`;
  return `${input.source_kind}:${normalizeSearchToken(input.source_label)}`;
}

function inferCandidateRegime(titleAndTags: string): DetectedRegime {
  const lower = normalizeSearchToken(titleAndTags);

  if (/\b(?:kuhp|kuhap|tindak pidana korupsi|tipikor|pidana khusus|narkotika|terorisme|pencucian uang)\b/i.test(lower)) {
    return 'CRIMINAL';
  }
  if (/\b(?:kompilasi hukum islam|khi\b|peradilan agama|waris islam|ekonomi syariah|perbankan syariah|zakat|wakaf)\b/i.test(lower)) {
    return 'ISLAMIC';
  }
  if (/\b(?:ptun|keputusan tata usaha negara|ktun|sengketa tata usaha negara|administrasi negara)\b/i.test(lower)) {
    return 'ADMINISTRATIVE';
  }
  if (/\b(?:hukum adat|masyarakat hukum adat|tanah adat|hutan adat|ulayat)\b/i.test(lower)) {
    return 'CUSTOMARY';
  }
  if (/\b(?:kuhperdata|burgerlijk|perjanjian|perikatan|wanprestasi|perbuatan melawan hukum|ganti rugi|waris perdata)\b/i.test(lower)) {
    return 'CIVIL';
  }

  return 'UNSPECIFIED';
}

function candidateRegimeCompatible(
  candidate: { title:string; domain_tags?:string[] },
  caseRegime:DetectedRegime,
  caseText:string,
): { compatible:boolean; reason:string; candidate_regime:DetectedRegime } {
  const hay = `${candidate.title} ${(candidate.domain_tags||[]).join(' ')}`;
  const candidateRegime = inferCandidateRegime(hay);

  if (caseRegime === 'UNSPECIFIED' || caseRegime === 'AMBIGUOUS' || candidateRegime === 'UNSPECIFIED') {
    return { compatible:true, reason:'rezim netral/belum terkunci', candidate_regime:candidateRegime };
  }
  if (candidateRegime === caseRegime) {
    return { compatible:true, reason:`rezim authority=${candidateRegime} cocok`, candidate_regime:candidateRegime };
  }

  // V6.8.3 — strict applicability for issue binding. A mere mention of a
  // foreign forum/regime in the source does not make that authority applicable
  // to the current case regime. Cross-regime materials may remain in retrieval
  // diagnostics, but cannot be promoted into the issue rule layer.
  return {
    compatible:false,
    reason:`rezim authority=${candidateRegime} tidak cocok dengan rezim perkara=${caseRegime}`,
    candidate_regime:candidateRegime,
  };
}

const ISSUE_GENERIC_TERMS = new Set([
  'hukum','perkara','pihak','bukti','pembuktian','prosedur','forum','kewenangan',
  'dokumen','tindakan','peraturan','indonesia','republik','tahun','nomor','hak',
  'kewajiban','hubungan','unsur','perbuatan','status','upaya hukum','remedy',
  'pasal','undang undang','peraturan pemerintah','peraturan menteri',
]);

function isIssueSpecificTerm(term:string):boolean {
  const n = normalizeSearchToken(term);
  if (!n || n.length < 4) return false;
  if (ISSUE_GENERIC_TERMS.has(n)) return false;
  const tokens=n.split(/\s+/).filter(Boolean);
  return tokens.some(tok => tok.length >= 5 && !ISSUE_GENERIC_TERMS.has(tok));
}

function containsNormalizedTerm(hay:string, term:string):boolean {
  const h=normalizeSearchToken(hay);
  const t=normalizeSearchToken(term);
  if (!h || !t) return false;
  const esc=t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
  return new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`,'i').test(h);
}


function isConsumerLawAuthority(c:BindableCandidate):boolean {
  const hay=normalizeSearchToken(
    `${c.title||''} ${(c.domain_tags||[]).join(' ')} ${c.article_summary||''}`
  );
  return /\bperlindungan konsumen\b|\bhak konsumen\b|\bpelaku usaha\b|\bklausula baku\b|\bconsumer protection\b/i.test(hay);
}

function hasConsumerRelationshipEvidence(caseText:string):boolean {
  const t=normalizeSearchToken(caseText);

  // Strong direct relationship.
  if(/\bkonsumen\b/.test(t) && /\bpelaku usaha\b/.test(t)) return true;

  // Consumer + transactional/product/service context.
  if(
    /\bkonsumen\b/.test(t) &&
    /\b(?:produk|barang|jasa|membeli|pembelian|garansi|refund|pengembalian dana|klausula baku)\b/.test(t)
  ) return true;

  // Standalone consumer-law factual markers.
  if(/\bcacat produk\b|\bklaim garansi\b|\bklausula baku\b|\bhak konsumen\b|\bperlindungan konsumen\b/.test(t)) return true;

  return false;
}

function bindIssuesToAuthorities(
  issues:any[],
  ontologyIssues:Array<{ question?:string; issue?:string; id:string; query_terms:string[]; domain:string }>,
  pool:BindableCandidate[],
  caseDomainCtx:DomainRankingContext,
  caseText:string,
  caseRegime:DetectedRegime,
):any[] {
  const ontologyByText = new Map<string,{ id:string; query_terms:string[]; domain:string }>();
  const ontologyById = new Map<string,{ id:string; query_terms:string[]; domain:string }>();
  for (const o of ontologyIssues) {
    const record={ id:safeString(o.id), query_terms:o.query_terms||[], domain:safeString(o.domain) };
    const key = safeString(o.question || o.issue).toLowerCase();
    if (key) ontologyByText.set(key,record);
    if (record.id) ontologyById.set(record.id,record);
  }

  return (issues||[]).map((issue:any)=>{
    const issueText=safeString(issue?.issue).toLowerCase();
    const issueId=safeString(issue?.issue_id);
    const meta=(issueId?ontologyById.get(issueId):undefined)||ontologyByText.get(issueText);

    if (!meta || !meta.query_terms.length) {
      return {
        ...issue,
        rule:issue.rule || 'Belum ada norma spesifik yang aman untuk dinyatakan sebagai kaidah hukum. Penelusuran belum memiliki metadata yang cukup spesifik untuk isu ini.',
        bound_authorities:[],
      };
    }

    const terms=unique(meta.query_terms.map(t=>normalizeSearchToken(t)).filter(t=>t.length>=4));
    const scored:BoundAuthority[]=[];

    for (const c of pool) {
      // V6.8.3 — Authority Applicability Guard.
      // A candidate already downgraded by the corpus regime/forum guard must not
      // re-enter issue binding merely because the source text mentions that foreign
      // forum/regime. It remains visible in retrieval diagnostics only.
      if (c.regime_note) {
        const rej=((c as any).__applicability_rejections ||= []);
        if (rej.length<24) rej.push({ issue:meta.id, reason:`authority applicability rejected: ${c.regime_note}` });
        continue;
      }

      // GATE 0.5 — authority identity + temporal applicability.
      // Discovery is not applicability. A candidate that is inactive or post-dates
      // the material case tempus must not bind into a substantive issue rule.
      const effectiveText=safeString(c.effective_status||'').toLowerCase();
      if (/tidak\s+berlaku|dicabut|repealed|revoked|expired|superseded/.test(effectiveText)) {
        const rej=((c as any).__temporal_rejections ||= []);
        if (rej.length<24) rej.push({issue:meta.id,reason:`status authority tidak aktif: ${c.effective_status}`});
        continue;
      }
      if (c.tempus_status==='POTENTIALLY_INCOMPATIBLE') {
        const rej=((c as any).__temporal_rejections ||= []);
        if (rej.length<24) rej.push({issue:meta.id,reason:'authority terbit setelah tempus perkara'});
        continue;
      }

      // GATE 1 — domain alignment.
      if (c.domain_alignment === 'FOREIGN' && !c.citation_hit) continue;

      // GATE 1.5 — consumer-law relationship guard (V6.7.4).
      // A generic damages/wanprestasi term is not enough to turn an ordinary
      // private sale into a consumer-law relationship. Consumer-law authority
      // requires factual consumer relationship evidence in the source itself.
      if (isConsumerLawAuthority(c) && !hasConsumerRelationshipEvidence(caseText)) {
        const rej=((c as any).__consumer_rejections ||= []);
        if (rej.length<24) rej.push({
          issue:meta.id,
          reason:'otoritas perlindungan konsumen ditolak: hubungan konsumen-pelaku usaha tidak terbukti dari sumber',
        });
        continue;
      }

      // GATE 2 — regime compatibility, derived from authority metadata.
      const regimeCheck=candidateRegimeCompatible(c,caseRegime,caseText);
      if (!regimeCheck.compatible) {
        const rej=((c as any).__regime_rejections ||= []);
        if (rej.length<24) rej.push({ issue:meta.id, reason:regimeCheck.reason });
        continue;
      }

      const titleHay=normalizeSearchToken(c.title);
      const tagsHay=normalizeSearchToken((c.domain_tags||[]).join(' '));
      const artHay=normalizeSearchToken(c.article_text_pool||'');
      const issueDomainAnchors=authorityAnchorsForContext(meta.domain||'').map(normalizeSearchToken).filter(x=>x.length>=4);
      const issueDomainHits=issueDomainAnchors.filter(a=>containsNormalizedTerm(`${titleHay} ${tagsHay} ${artHay}`,a)).length;

      const matched_terms:string[]=[];
      const specific_terms:string[]=[];
      const specific_title_or_tag:string[]=[];
      let exact_single_word_art_hits=0;
      let title_hits=0, tag_hits=0, art_hits=0;

      // Token-aware matching:
      // - single-word terms remain strict;
      // - multi-word terms fall back to meaningful tokens only after phrase miss;
      // - boundary-aware matching prevents substring traps.
      for (const t of terms) {
        const tLower=normalizeSearchToken(t).trim();
        if (tLower.length<4) continue;
        const specific=isIssueSpecificTerm(tLower);
        const singleWord=!tLower.includes(' ');

        if (containsNormalizedTerm(titleHay,tLower)) {
          title_hits++;
          matched_terms.push(tLower);
          if (specific) {
            specific_terms.push(tLower);
            specific_title_or_tag.push(tLower);
          }
          continue;
        }
        if (containsNormalizedTerm(tagsHay,tLower)) {
          tag_hits++;
          matched_terms.push(tLower);
          if (specific) {
            specific_terms.push(tLower);
            specific_title_or_tag.push(tLower);
          }
          continue;
        }
        if (containsNormalizedTerm(artHay,tLower)) {
          art_hits++;
          matched_terms.push(tLower);
          if (specific) {
            specific_terms.push(tLower);
            if (singleWord) exact_single_word_art_hits++;
          }
          continue;
        }

        if (singleWord) continue;
        const tokens=unique(
          tLower.split(/\s+/)
            .filter(w=>w.length>=5 && !ISSUE_GENERIC_TERMS.has(w))
        );

        for (const tok of tokens) {
          if (containsNormalizedTerm(titleHay,tok)) {
            title_hits++;
            matched_terms.push(tok);
            specific_terms.push(tok);
            specific_title_or_tag.push(tok);
          } else if (containsNormalizedTerm(tagsHay,tok)) {
            tag_hits++;
            matched_terms.push(tok);
            specific_terms.push(tok);
            specific_title_or_tag.push(tok);
          } else if (containsNormalizedTerm(artHay,tok)) {
            art_hits++;
            matched_terms.push(tok);
            specific_terms.push(tok);
          }
        }
      }

      const distinct=unique(matched_terms);
      const specificDistinct=unique(specific_terms);
      const specificTitleOrTag=unique(specific_title_or_tag);

      // GATE 3A — independent issue support.
      // Candidate-level explicit citation is NOT a blanket issue override:
      // every bound issue still needs at least one issue-specific semantic match.
      if (!specificDistinct.length) {
        const rej=((c as any).__support_rejections ||= []);
        if (rej.length<24) rej.push({ issue:meta.id, reason:'tidak ada kecocokan spesifik dengan isu' });
        continue;
      }

      // GATE 3B — material nexus (V6.7.2).
      // A broad multi-term issue may not bind from one incidental article-only word.
      // Preserve one-word article-only acceptance only when the ontology issue
      // itself contains exactly one specific query term.
      const issueSpecificQueryTerms=unique(
        terms.map(t=>normalizeSearchToken(t)).filter(t=>isIssueSpecificTerm(t))
      );
      const exactSingleWordArticleNexus =
        issueSpecificQueryTerms.length===1 &&
        exact_single_word_art_hits>0 &&
        c.domain_alignment!=='FOREIGN';

      if (
        specificTitleOrTag.length===0 &&
        specificDistinct.length<2 &&
        !exactSingleWordArticleNexus
      ) {
        const rej=((c as any).__material_rejections ||= []);
        if (rej.length<24) rej.push({
          issue:meta.id,
          reason:`keterkaitan material lemah: ${specificDistinct.length} istilah spesifik, title/tag=${specificTitleOrTag.length}, exact-single-article=${exact_single_word_art_hits}, issue-specific-query=${issueSpecificQueryTerms.length}`,
        });
        continue;
      }

      let binding_score =
        title_hits*6 +
        tag_hits*4 +
        art_hits*3 +
        (c.citation_hit?8:0) + // citation is supportive, never a blanket +25 override
        (c.material_confidence==='HIGH'?5:c.material_confidence==='MEDIUM'?2:0) +
        (c.domain_alignment==='PRIMARY'?8:
          c.domain_alignment==='SECONDARY'?4:
          c.domain_alignment==='FOREIGN'?-8:0) +
        Math.min(12,specificDistinct.length*3) +
        Math.min(8,specificTitleOrTag.length*4) +
        Math.min(6,issueDomainHits*2);

      if (c.regime_note) binding_score -= 12;
      if (c.material_confidence==='LOW') binding_score -= 3;
      if (binding_score < 6) continue;

      scored.push({
        source_label:c.source_label,
        source_kind:c.source_kind,
        binding_score,
        matched_terms:specificDistinct.slice(0,6),
        article_summary:c.article_summary,
        material_confidence:c.material_confidence,
        regime_note:c.regime_note,
        domain_alignment:c.domain_alignment,
        authority_identity:c.authority_identity,
        tempus_status:c.tempus_status,
        effective_status:c.effective_status,
        binding_reason:`issue=${meta.id}; matched=${specificDistinct.slice(0,4).join(', ')||'none'}; domain=${meta.domain||'unspecified'}; domain_hits=${issueDomainHits}; alignment=${c.domain_alignment}; tempus=${c.tempus_status}`,
      });
    }

    // Consolidate duplicate representations of the same instrument. When the
    // local corpus index and an official source resolve to the same structured
    // authority identity, prefer the official source; otherwise keep the
    // highest-scoring representation.
    const byIdentity=new Map<string,BoundAuthority>();
    for(const candidate of scored){
      const prev=byIdentity.get(candidate.authority_identity);
      if(!prev || (candidate.source_kind==='OFFICIAL' && prev.source_kind!=='OFFICIAL') || (candidate.source_kind===prev.source_kind && candidate.binding_score>prev.binding_score)){
        byIdentity.set(candidate.authority_identity,candidate);
      }
    }
    const deduped=[...byIdentity.values()].sort((a,b)=>b.binding_score-a.binding_score);
    const top=deduped.slice(0,3);

    if (!top.length) {
      return {
        ...issue,
        rule:'Belum ada norma spesifik yang aman untuk dinyatakan sebagai kaidah hukum. Kandidat yang ditemukan belum mempunyai keterkaitan material yang cukup spesifik dengan isu ini.',
        bound_authorities:[],
      };
    }

    const lines=top.map((t,i)=>{
      const rank=i===0?'Utama':i===1?'Pendukung':'Rujukan tambahan';
      const source=t.source_kind==='OFFICIAL'?'sumber resmi daring':'korpus internal';
      const confidence=t.material_confidence==='HIGH'
        ? 'tingkat keyakinan tinggi'
        : t.material_confidence==='MEDIUM'
          ? 'tingkat keyakinan sedang'
          : 'tingkat keyakinan rendah';
      const art=t.article_summary?` — pasal relevan: ${t.article_summary}`:'';
      const note=t.regime_note?` Catatan: ${t.regime_note}.`:'';
      return `${rank}: ${t.source_label}${art} (${source}, ${confidence}).${note}`;
    });

    return {
      ...issue,
      rule:`${lines.join(' ')} Pasal spesifik, status berlaku, waktu peristiwa, dan penerapan faktual tetap wajib diverifikasi sebelum dipakai.`,
      bound_authorities:top,
    };
  });
}

// Section III presentation filter (V6.7.2).
// Retrieval pools and audit data remain intact. Only applicable_law presentation
// is narrowed to authorities that actually bind to at least one issue.
function filterApplicableLawToBoundAuthorities(
  items: ApplicableLaw[],
  boundLabels: Set<string>,
): ApplicableLaw[] {
  if(!items.length) return items;
  // V6.8.3 — fail closed: when no authority survived issue binding, Section III
  // must not repopulate itself from the unbound retrieval pool.
  if(!boundLabels.size) return [];
  const filtered=items.filter(item=>{
    const identities=[
      normalizeSearchToken((item as any)?.regulation || ''),
      normalizeSearchToken((item as any)?.source || ''),
    ].filter(Boolean);
    return identities.some(id=>boundLabels.has(id));
  });
  // Fail closed on display reconciliation as well; diagnostics still retain
  // the full retrieval pool for audit without presenting it as applicable law.
  return filtered;
}

export interface CasePipelineGate {
  status: 'READY' | 'DEGRADED'; passed: boolean; score: number;
  checks: Array<{ key: string; passed: boolean; detail: string }>;
  blockers: string[];
}

export function evaluateCasePipelineGate(input: {
  sourceRole: string; reasoningStatus: string; regulatoryMode: RegulatoryMode;
  statementBuckets: any; actorMatrix: any[]; verifiedTimeline: any[]; legalIssues: any[];
  multiPathDiagnosis: any[]; blankSpotQuestions: string[]; adverseEvidence: any[];
  officialLawCandidates: any[]; applicableLaw: any[]; riskBreakdown: any[]; lawyerWorkflow?: any;
  domainClassificationDomains?: Array<{ label:string }>;
  domainClassificationConfidence?: string;
  domainClassificationAmbiguous?: boolean;
  domainClassificationMargin?: number;
  documentIngestion?: DocumentIngestionResult;
}): CasePipelineGate {
  const facts = Array.isArray(input.statementBuckets?.textual_facts) ? input.statementBuckets.textual_facts : [];
  const claims = Array.isArray(input.statementBuckets?.party_claims) ? input.statementBuckets.party_claims : [];
  const supporting = Array.isArray(input.statementBuckets?.supporting_evidence) ? input.statementBuckets.supporting_evidence : [];
  const norm = (x:any)=>safeString(x?.statement||x).toLowerCase();
  const factSet = new Set(facts.map(norm).filter(Boolean));
  const overlap = claims.map(norm).filter((x: string) => x && factSet.has(x)).length;
  const onlineApplicable = (input.applicableLaw || []).filter((x:any)=>/ONLINE_/i.test(String(x?.status||'')));
  const badOnline = onlineApplicable.filter((x:any)=>String(x?.status||'')!=='ONLINE_IDENTITY_VERIFIED_CANDIDATE');
  const officialVerified = (input.officialLawCandidates || []).filter((x:any)=>x?.status==='IDENTITY_VERIFIED' && !officialCandidateRejected(x) && (x?.identity_match==='EXACT' || x?.material_nexus_status==='VERIFIED'));
  const claimFirstRoles=['CASE_NARRATIVE_OR_QUESTION','DEFENSE_SUBMISSION_WITH_EXHIBITS','COMPLAINT_OR_PETITION','LITIGATION_SUBMISSION','LEGAL_CORRESPONDENCE'];
  const claimFirstSemantics=!claimFirstRoles.includes(input.sourceRole) || (claims.length>0 && claims.length>=facts.length);
  const issueSpecific = (input.legalIssues || []).filter((x:any)=>{
    const t = `${safeString(x?.issue)} ${safeString(x?.analysis)}`.toLowerCase();
    return t.length > 80 && !/apa kualifikasi hubungan hukum|posisi klien akan menguat|fakta dan bukti utama terkonfirmasi/.test(t);
  }).length;
  const adverseSpecific = (input.adverseEvidence || []).filter((x:any)=>Number(x?.page)>0 && safeString(x?.analysis).length>45).length;
  const lawWithProvenance = (input.applicableLaw || []).filter((x:any)=>safeString((x as any)?.source_url || x?.source).length>3 && safeString((x as any)?.tempus_status || x?.relevance).length>3).length;
  const checks = [
    { key:'reasoning_core_ready', passed:input.reasoningStatus==='READY', detail:`status=${input.reasoningStatus}` },
    { key:'source_role_classified', passed:Boolean(input.sourceRole && input.sourceRole!=='MIXED_CASE_MATERIAL'), detail:`source_role=${input.sourceRole}` },
    { key:'source_semantics_consistent', passed:claimFirstSemantics, detail:`role=${input.sourceRole}, facts=${facts.length}, claims=${claims.length}` },
    { key:'source_role_domain_coherence', passed:(()=>{
      const role=String(input.sourceRole||'');
      const domainText=(input.domainClassificationDomains||[]).map(d=>String(d?.label||'')).join(' ').toLowerCase();
      if(!domainText)return true;
      const civil=/waris|keluarga|perdata|perikatan|agraria/.test(domainText);
      const criminal=/pidana|tipikor|korupsi|acara pidana/.test(domainText);
      if(role==='INVESTIGATION_OR_BAP'&&civil&&!criminal)return false;
      return true;
    })(), detail:`role=${input.sourceRole}, primary=${input.domainClassificationDomains?.[0]?.label||'-'}` },
    { key:'domain_routing_confident', passed:(()=>{
      const highStakes=['DEFENSE_SUBMISSION_WITH_EXHIBITS','COMPLAINT_OR_PETITION','LITIGATION_SUBMISSION','INVESTIGATION_OR_BAP'].includes(input.sourceRole);
      if(!highStakes) return true;
      const conf=String(input.domainClassificationConfidence||'').toUpperCase();
      return conf!=='LOW' && input.domainClassificationAmbiguous!==true;
    })(), detail:`confidence=${input.domainClassificationConfidence||'-'}, ambiguous=${Boolean(input.domainClassificationAmbiguous)}, margin=${Number(input.domainClassificationMargin||0)}` },
    { key:'facts_distinct_from_claims', passed:overlap===0 && ((facts.length>0 || claims.length>0) || (input.sourceRole==='LEGAL_REFERENCE_MATERIAL' && supporting.length>0)), detail:`facts=${facts.length}, claims=${claims.length}, supporting=${supporting.length}, overlap=${overlap}, role=${input.sourceRole}` },
    { key:'adverse_evidence_analyzed', passed:adverseSpecific>0 || !['DEFENSE_SUBMISSION_WITH_EXHIBITS','COMPLAINT_OR_PETITION','LITIGATION_SUBMISSION'].includes(input.sourceRole), detail:`specific=${adverseSpecific}, total=${(input.adverseEvidence||[]).length}, role=${input.sourceRole}` },
    { key:'actor_matrix', passed:(input.actorMatrix||[]).length>=2, detail:`count=${(input.actorMatrix||[]).length}` },
    { key:'timeline', passed:(input.verifiedTimeline||[]).length>=1, detail:`count=${(input.verifiedTimeline||[]).length}` },
    { key:'irac_multi_issue', passed:(input.legalIssues||[]).length>=2 && issueSpecific>=2, detail:`count=${(input.legalIssues||[]).length}, specific=${issueSpecific}` },
    { key:'multi_path_diagnosis', passed:(input.multiPathDiagnosis||[]).length>=1, detail:`count=${(input.multiPathDiagnosis||[]).length}` },
    { key:'blank_spot_audit', passed:(input.blankSpotQuestions||[]).length>=5, detail:`count=${(input.blankSpotQuestions||[]).length}` },
    { key:'lawyer_workflow', passed:!['INVESTIGATION_OR_BAP','DEFENSE_SUBMISSION_WITH_EXHIBITS','COMPLAINT_OR_PETITION','LITIGATION_SUBMISSION'].includes(input.sourceRole) || ((input.lawyerWorkflow?.stages||[]).length>=8 && (input.lawyerWorkflow?.allegation_response_matrix||[]).length>=1), detail:`stages=${(input.lawyerWorkflow?.stages||[]).length}; matrix=${(input.lawyerWorkflow?.allegation_response_matrix||[]).length}` },
    { key:'official_identity_guard', passed:input.regulatoryMode==='offline' || (officialVerified.length>0 && badOnline.length===0), detail:`verified+nexus=${officialVerified.length}, bad_online=${badOnline.length}` },
    { key:'law_provenance_tempus', passed:input.regulatoryMode==='offline' || lawWithProvenance>0, detail:`law_with_provenance=${lawWithProvenance}` },
    { key:'source_quality_guard', passed:(()=>{
      const ingestion=input.documentIngestion;
      if(!ingestion || ingestion.mode!=='LOCAL_OCR') return true;
      const quality=ingestion.source_quality;
      if(!quality) return ingestion.manual_review_required!==true && (ingestion.failed_pages||[]).length===0;
      return quality.status==='GOOD' && quality.excluded_pages.length===0 && (ingestion.failed_pages||[]).length===0;
    })(), detail:(()=>{
      const ingestion=input.documentIngestion;
      if(!ingestion || ingestion.mode!=='LOCAL_OCR') return 'not_ocr';
      const quality=ingestion.source_quality;
      return `status=${quality?.status||'UNKNOWN'}, excluded_pages=${quality?.excluded_pages?.length||0}, excluded_spans=${quality?.excluded_spans||0}, repaired_spans=${quality?.repaired_spans||0}, low_confidence=${quality?.low_confidence_pages?.length||0}, failed=${ingestion.failed_pages?.length||0}`;
    })() },
    { key:'risk_score_auditable', passed:(input.riskBreakdown||[]).length>=2, detail:`factors=${(input.riskBreakdown||[]).length}` },
  ];
  const blockers = checks.filter(x => !x.passed).map(x => `${x.key}: ${x.detail}`);
  const score = Math.round(checks.filter(x => x.passed).length / checks.length * 100);
  return { status: blockers.length ? 'DEGRADED' : 'READY', passed: blockers.length === 0, score, checks, blockers };
}



export async function runCaseAnalysis(input: CaseAnalysisInput): Promise<CaseAnalysisRecord> {
  const tracer = new PipelineTracer();
  const started = Date.now();
  const title = safeString(input.title) || 'Analisis Perkara Hukum';
  const text = resolveCanonicalAnalysisText(input);
  const filename = safeString(input.filename);
  const inputType = input.input_type || (filename ? 'document' : 'narrative');
  const regulatoryMode = normalizeRegulatoryMode(input.regulatory_mode);
  tracer.begin('ingest', `input_type=${inputType}`);
  if (text.length < 40) {
    tracer.fail('ingest', 'insufficient_readable_text');
    throw new Error('Materi perkara tidak cukup terbaca untuk dilakukan analisis.');
  }

  const charCount = text.length;
  tracer.end('ingest', `chars=${charCount}`);

  // V6.7.3: resolve regime before final domain routing.
  const caseRegime=detectCaseRegimeContext(text);

  tracer.begin('domain_route');
  const domainContext=classifyDomain(text,caseRegime);
  const {posture,domain:primaryDomain}=domainContext;
  const sync=(domainContext as any).regime_sync;
  tracer.end(
    'domain_route',
    `confidence=${domainContext.confidence}; secondary=${domainContext.secondary.length}; regime_sync=${sync?.applied?`${sync.from}->${sync.to}`:'none'}`,
  );

  tracer.begin('issue_graph');
  const ontologyIssues=prioritizeIssuesForDomain(
    deriveOntologyIssues(text),
    posture as LegalDomainId,
  );
  const issueTerms=unique(ontologyIssues.flatMap(x=>x.query_terms||[]));
  const domainRankingContext=buildDomainRankingContext(
    posture as LegalDomainId,
    domainContext.secondary.map((s:any)=>s.posture as LegalDomainId),
  );
  const regResult = matchRegulations(text, primaryDomain, issueTerms, domainRankingContext, caseRegime);
  const matchedRegs = regResult.rows;
  const corpusRetrievalDiagnostics = regResult.diagnostics;
  tracer.end(
    'issue_graph',
    `issues=${ontologyIssues.length}; local_candidates=${matchedRegs.length}; strict=${corpusRetrievalDiagnostics.strict_count}; fallback=${corpusRetrievalDiagnostics.fallback_used}; forum=${caseRegime.forum}; regime=${caseRegime.regime}; criminal_signals=${caseRegime.signals.criminal_procedural.length}; civil_signals=${caseRegime.signals.civil_procedural.length + caseRegime.signals.civil_substantive.length}; admin_signals=${caseRegime.signals.administrative_procedural.length}`,
  );

  tracer.begin('page_split');
  const balanced = buildPageBalancedAnalysisText(text, 110000);
  tracer.end('page_split', `pages=${balanced.pages_total}; represented=${balanced.pages_represented}`);
  const coverageRatio = balanced.char_coverage;
  const pageCoverageRatio = balanced.page_coverage;
  tracer.begin('evidence_model');
  const rawDeterministicEvidence=buildEvidenceModel(text);
  const deterministicEvidence={
    ...rawDeterministicEvidence,
    issue_seeds:prioritizeIssuesForDomain(
      rawDeterministicEvidence.issue_seeds||[],
      posture as LegalDomainId,
    ),
  };
  tracer.end('evidence_model', `facts=${deterministicEvidence.textual_facts.length}; claims=${deterministicEvidence.party_claims.length}`);

  tracer.begin('role_classify');
  const sourceRole = deterministicEvidence.source_role;
  tracer.end('role_classify', `confidence=${Number(deterministicEvidence.source_role_confidence || 0).toFixed(2)}`);

  tracer.begin('fact_claim_split');
  tracer.end('fact_claim_split', `facts=${deterministicEvidence.textual_facts.length}; claims=${deterministicEvidence.party_claims.length}`);

  const evidenceLedger = extractEvidenceLedger(text);
  const sourceLawCitations = extractSourceLawCitations(text);
  const tempusYear = inferTempusYearFromCase(text);
  const localCorpusCandidates = localCorpusCandidatesFromMatches(matchedRegs, issueTerms, tempusYear);
  tracer.begin('query_build');
  const officialQueries = buildOfficialLawQueries({ title, domain: primaryDomain, text: balanced.text, explicitLawCitations: sourceLawCitations.map(x => x.regulation), issues: ontologyIssues });

  // V6.7.12 — canonical authority seed bridge.
  // Local corpus remains an INDEX, not authority. Only strong corpus matches
  // contribute exact identity strings; the official retriever must resolve
  // family/number/year against an official source before they can become
  // IDENTITY_VERIFIED candidates. No regulation number is hard-coded here.
  const canonicalAuthoritySeeds = unique((matchedRegs || [])
    .filter((m:any) => {
      const conf = safeString(m?.material_confidence || '').toUpperCase();
      if (conf) return conf === 'HIGH' || conf === 'MEDIUM';
      const phraseHits = Number(m?.issue_phrase_hits || 0);
      const issueHits = Number(m?.issue_hits || 0);
      const anchorHits = Number(m?.anchor_hits || 0);
      const relevance = Number(m?.relevance_score || 0);
      return phraseHits > 0 || issueHits >= 2 || (anchorHits >= 2 && relevance >= 0.60);
    })
    .map((m:any) => safeString(m?.regulation?.nomor))
    .filter((x:string) => /\b(?:uu|undang[- ]undang|pp|peraturan\s+pemerintah|perppu|perpres|peraturan\s+presiden|permen|peraturan\s+menteri)\b/i.test(x) && /\b(?:no\.?|nomor)\s*[0-9a-z./-]+\s+tahun\s+(?:19|20)\d{2}\b/i.test(x))
  ).slice(0, 6);
  tracer.end('query_build', `queries=${officialQueries.length}`);

  tracer.begin('law_discover', `mode=${regulatoryMode}`);
  const officialLawRetrieval = await discoverOfficialLaw({
    mode: regulatoryMode,
    queries: officialQueries,
    tempusYear,
    domain: primaryDomain,
    caseText: balanced.text,
    canonicalAuthorities: canonicalAuthoritySeeds,
    sourceStrategy: input.official_source_strategy || 'auto',
    manualAuthorities: input.manual_official_sources || [],
  });
  tracer.end('law_discover', `candidates=${officialLawRetrieval.candidates.length}`);

  tracer.begin('identity_gate');
  const usableOfficialCandidates = officialLawRetrieval.candidates.filter((c:any)=>!officialCandidateRejected(c));
  tracer.end('identity_gate', `usable=${usableOfficialCandidates.length}; rejected=${officialLawRetrieval.candidates.length - usableOfficialCandidates.length}`);

  const reasoningLawCandidates = regulatoryMode === 'offline'
    ? localCorpusCandidates
    : regulatoryMode === 'online'
      ? usableOfficialCandidates
      : [...usableOfficialCandidates, ...localCorpusCandidates];

  tracer.begin('local_corpus_route', `mode=${regulatoryMode}; local=${localCorpusCandidates.length}; online=${usableOfficialCandidates.length}`);
  tracer.end('local_corpus_route', `reasoning_candidates=${reasoningLawCandidates.length}`);

  // Deterministic reasoning now follows the selected regulatory source route:
  // Local=Regulatory Corpus; Hybrid=Corpus+official online; Online=official online.
  tracer.begin('forensic_reason');
  const reasoning = reasonForensically({
    title, primaryDomain,
    domainContext:(domainContext as any).legal_context,
    evidence:deterministicEvidence,
    lawCandidates: reasoningLawCandidates,
    tempusYear,
  });
  const reasoningStatus: 'READY' | 'DEGRADED' = reasoning.reasoning_status;
  tracer.end('forensic_reason', `status=${reasoningStatus}; issues=${reasoning.legal_issues.length}`);
  const reasoningModel = 'lexicore-deterministic-forensic-v2';
  const reasoningAttempts = [{ model: reasoningModel, status: 'SUCCESS' as const, detail: reasoning.reasoning_reasons.length ? `reasons=${reasoning.reasoning_reasons.join('; ')}` : 'deterministic', duration_ms: Date.now() - started }];

  const statement_buckets = reasoning.statement_buckets;
  const actor_matrix = reasoning.actor_matrix;
  const verified_timeline = reasoning.verified_timeline;
  const legal_gaps = reasoning.legal_gaps;
  const multi_path_diagnosis = reasoning.multi_path_diagnosis;
  const integration_matrix = reasoning.integration_matrix;
  const adverse_evidence = reasoning.adverse_evidence;
  const blank_spot_questions = reasoning.blank_spot_questions;
  const tactical_strategy = reasoning.tactical_strategy;
  const facts = reasoning.facts;
  const bindingPool:BindableCandidate[] = [
    ...matchedRegs.map((m:any)=>{
      const reg=m.regulation||{};
      const articles=(reg.articles||[]) as Array<{ pasal?:string; topic?:string; content?:string; keywords?:string[] }>;
      const articleSummary=(m.matched_articles||[]).map((a:any)=>safeString(a.pasal)).filter(Boolean).join(', ');
      const articleTextPool=articles.slice(0,20).map(a=>`${a.pasal||''} ${a.topic||''} ${a.content||''} ${(a.keywords||[]).join(' ')}`).join(' ');
      return {
        title:`${safeString(reg.nomor)} ${safeString(reg.tentang)}`,
        source_kind:'LOCAL' as const,
        source_label:safeString(reg.nomor||reg.tentang),
        article_summary:articleSummary,
        domain_tags:(reg.domain_tags||[]) as string[],
        article_text_pool:articleTextPool,
        material_confidence:(m.material_confidence||'LOW') as 'HIGH'|'MEDIUM'|'LOW',
        citation_hit:Boolean(m.citation_hit),
        regime_note:m.regime_note||null,
        domain_alignment:(m.domain_alignment||'NEUTRAL') as 'PRIMARY'|'SECONDARY'|'NEUTRAL'|'FOREIGN',
        instrument_type:safeString(reg.jenis)||undefined,
        number:safeString(reg.nomor)||undefined,
        year:Number(reg.tahun)||undefined,
        effective_status:safeString(reg.status)||'LOCAL_CORPUS_STATUS_UNKNOWN',
        tempus_status:(tempusYear && Number(reg.tahun) > tempusYear ? 'POTENTIALLY_INCOMPATIBLE' : tempusYear && Number(reg.tahun) ? 'POTENTIALLY_COMPATIBLE' : 'UNVERIFIED') as 'UNVERIFIED'|'POTENTIALLY_COMPATIBLE'|'POTENTIALLY_INCOMPATIBLE',
        authority_identity:authorityIdentityKey({source_kind:'LOCAL',instrument_type:safeString(reg.jenis),number:safeString(reg.nomor),year:Number(reg.tahun)||undefined,source_label:safeString(reg.nomor||reg.tentang)}),
      };
    }),
    ...usableOfficialCandidates.map((c:any)=>{
      const hay=normalizeSearchToken(`${c.title||''} ${c.excerpt||''} ${(c.domain_tags||[]).join(' ')}`);
      let primary=0, secondary=0, foreign=0;
      for (const a of domainRankingContext.primary_anchors) {
        if (a.length>=4 && hay.includes(a)) primary++;
      }
      for (const a of domainRankingContext.secondary_anchors) {
        if (a.length>=4 && hay.includes(a)) secondary++;
      }
      for (const a of domainRankingContext.foreign_anchors) {
        if (a.length>=4 && hay.includes(a)) foreign++;
      }

      const domain_alignment:'PRIMARY'|'SECONDARY'|'NEUTRAL'|'FOREIGN' =
        primary>0 ? 'PRIMARY' :
        secondary>0 ? 'SECONDARY' :
        foreign>0 ? 'FOREIGN' : 'NEUTRAL';

      return {
        title:safeString(c.title),
        source_kind:'OFFICIAL' as const,
        source_label:safeString(c.title),
        article_summary:'',
        domain_tags:Array.isArray(c.domain_tags)?c.domain_tags:[],
        article_text_pool:safeString(c.excerpt||''),
        material_confidence:(c.material_nexus_status==='VERIFIED'?'HIGH':'MEDIUM') as 'HIGH'|'MEDIUM',
        citation_hit:['EXACT_CITATION','USER_EXACT_CITATION'].includes(safeString(c.query_kind)),
        regime_note:null,
        domain_alignment,
        instrument_type:safeString(c.instrument_type)||undefined,
        number:safeString(c.number)||undefined,
        year:Number(c.year)||undefined,
        effective_status:safeString(c.effective_status)||undefined,
        tempus_status:(c.tempus_status||'UNVERIFIED') as 'UNVERIFIED'|'POTENTIALLY_COMPATIBLE'|'POTENTIALLY_INCOMPATIBLE',
        authority_identity:authorityIdentityKey({source_kind:'OFFICIAL',instrument_type:safeString(c.instrument_type),number:safeString(c.number),year:Number(c.year)||undefined,source_label:safeString(c.title)}),
      };
    }),
  ];
  const ontologyIssuesForBinding=ontologyIssues.map((o:any)=>({
    question:safeString(o.question||o.issue),
    issue:safeString(o.issue||o.question),
    id:safeString(o.id),
    query_terms:Array.isArray(o.query_terms)?o.query_terms:[],
    domain:safeString(o.domain),
  }));
  const legal_issues = bindIssuesToAuthorities(
    reasoning.legal_issues,
    ontologyIssuesForBinding,
    bindingPool,
    domainRankingContext,
    text,
    caseRegime.regime,
  );

  const boundAuthorityLabels=new Set<string>();
  for(const issue of legal_issues||[]){
    for(const b of ((issue as any)?.bound_authorities||[])){
      const label=normalizeSearchToken((b as any)?.source_label||'');
      if(label) boundAuthorityLabels.add(label);
    }
  }

  const arguments_for = reasoning.arguments_for;
  const arguments_against = reasoning.arguments_against;

  const sourceLawCandidates: ApplicableLaw[] = sourceLawCitations;
  const localLawCandidates: ApplicableLaw[] = matchedRegs.slice(0, 8).map((m:any) => {
    const conf = (m.material_confidence || 'LOW') as 'HIGH'|'MEDIUM'|'LOW';
    const confLabel = conf === 'HIGH'
      ? 'tingkat keyakinan tinggi'
      : conf === 'MEDIUM'
        ? 'tingkat keyakinan sedang'
        : 'tingkat keyakinan rendah';
    const alignLabel = m.domain_alignment === 'PRIMARY'
      ? 'domain utama'
      : m.domain_alignment === 'SECONDARY'
        ? 'domain pendukung'
        : m.domain_alignment === 'FOREIGN'
          ? 'di luar domain utama'
          : 'domain netral';
    const relevanceLines = [
      `Kandidat dari korpus internal dengan ${confLabel}, terkait dengan ${alignLabel}.`,
      m.citation_hit ? 'Instrumen ini dirujuk langsung dalam dokumen sumber.' : '',
      m.article_hits > 0 ? `${m.article_hits} pasal pada instrumen ini memuat istilah yang bersesuaian dengan isu.` : '',
      m.regime_note ? `Catatan kesesuaian rezim/forum: ${m.regime_note}.` : '',
      conf === 'LOW'
        ? 'Kandidat ini disertakan sebagai konteks tambahan; verifikasi ekstra wajib sebelum dipakai.'
        : 'Identitas instrumen, status berlaku, waktu peristiwa, pasal spesifik, dan keterkaitan dengan fakta perkara tetap wajib diverifikasi.',
    ].filter(Boolean);

    return {
      domain: safeString(m.regulation.tentang) || primaryDomain,
      source: safeString(m.regulation.nomor),
      status: conf === 'LOW' ? 'CANDIDATE_LOCAL_CORPUS_LOW_CONFIDENCE' : 'CANDIDATE_LOCAL_CORPUS',
      regulation: safeString(m.regulation.nomor || m.regulation.tentang),
      article: m.matched_articles.length
        ? m.matched_articles.map((a:any)=>safeString(a.pasal)).filter(Boolean).join(', ') || 'PERLU VERIFIKASI'
        : 'PERLU VERIFIKASI',
      relevance: relevanceLines.join(' '),
    };
  });

  const dynamicOnlineLawCandidates: ApplicableLaw[] = usableOfficialCandidates
    .filter((c:any) => c.status === 'IDENTITY_VERIFIED')
    .map((c:any) => ({
      domain: primaryDomain, source: c.source_domain || 'peraturan.bpk.go.id',
      status: 'ONLINE_IDENTITY_VERIFIED_CANDIDATE',
      regulation: safeString(c.title), article: 'PERLU VERIFIKASI',
      relevance: `Identitas instrumen terbaca dari sumber resmi. Kandidat ditemukan melalui penelusuran "${safeString(c.query)}". Status berlaku: ${safeString(c.effective_status||'belum teridentifikasi')}. Kesesuaian waktu berlaku: ${safeString(c.tempus_status)}. Pasal spesifik dan keterkaitannya dengan fakta perkara masih wajib diverifikasi.`,
      source_url: c.url, verification_status: c.status, tempus_status: c.tempus_status,
    }));

  let applicable_law: ApplicableLaw[] = [];
  const mergeLaw = (items: ApplicableLaw[]) => {
    const seen = new Set<string>();
    return items.filter(x => { const k = `${x.regulation}|${x.article}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
  };
  if (regulatoryMode === 'offline') {
    applicable_law = mergeLaw([...sourceLawCandidates, ...localLawCandidates]);
    if (!applicable_law.length) applicable_law = [{ domain: primaryDomain, source: 'Corpus lokal', status: 'LOCAL_NO_MATCH', regulation: 'Instrumen hukum spesifik belum teridentifikasi pada corpus lokal', article: 'PERLU VERIFIKASI', relevance: 'Mode Lokal aktif. Tidak ada pencarian online; tambahkan/tingkatkan corpus lokal atau lakukan verifikasi profesional.' }];
  } else if (regulatoryMode === 'online') {
    applicable_law = mergeLaw([...dynamicOnlineLawCandidates, ...sourceLawCandidates.map(x => ({...x, status:'SOURCE_CITED_REQUIRES_ONLINE_VERIFICATION'}))]);
    if (!dynamicOnlineLawCandidates.length && !sourceLawCandidates.length) applicable_law = [{ domain: primaryDomain, source: 'Sumber resmi online', status: 'ONLINE_SOURCE_UNAVAILABLE', regulation: 'Sumber resmi online belum berhasil dijangkau', article: 'PERLU VERIFIKASI', relevance: 'Mode Online aktif. Corpus lokal hanya dipakai sebagai indeks pencarian dan tidak digunakan sebagai otoritas dasar hukum ketika sumber resmi tidak berhasil dijangkau.' }];
  } else {
    applicable_law = mergeLaw([...dynamicOnlineLawCandidates, ...sourceLawCandidates, ...localLawCandidates]);
    if (!applicable_law.length) applicable_law = [{ domain: primaryDomain, source: 'Hybrid retrieval', status: 'NO_MATCH', regulation: 'Instrumen hukum spesifik belum teridentifikasi', article: 'PERLU VERIFIKASI', relevance: 'Mode Hybrid aktif, tetapi belum ada kandidat lokal maupun sumber resmi yang cukup kuat untuk ditampilkan sebagai dasar hukum.' }];
  }

  applicable_law=filterApplicableLawToBoundAuthorities(applicable_law,boundAuthorityLabels);

  tracer.begin('lawyer_workflow');
  const lawyer_workflow = buildLawyerWorkflow({
    title, text, sourceRole, domainContext, evidence: deterministicEvidence, legalIssues: legal_issues,
    legalGaps: legal_gaps, adverseEvidence: adverse_evidence, applicableLaw: applicable_law,
    verifiedTimeline: verified_timeline, actorMatrix: actor_matrix,
  });
  tracer.end('lawyer_workflow', `stages=${lawyer_workflow.stages.length}; matrix=${lawyer_workflow.allegation_response_matrix.length}`);

  tracer.begin('risk_score');
  const risk_matrix: CaseRiskItem[] = reasoning.risks.map((r, i) => ({
    clause: safeString(r.clause) || `Risiko ${i+1}`,
    level: (['HIGH','MEDIUM','LOW'].includes(String(r.level).toUpperCase()) ? String(r.level).toUpperCase() : 'MEDIUM') as CaseRiskItem['level'],
    finding: safeString(r.finding) || 'Risiko memerlukan verifikasi lebih lanjut.',
    mitigation: safeString(r.mitigation) || 'Verifikasi fakta, bukti, norma, dan strategi sebelum tindakan final.',
  }));
  const computedRisk = risk_matrix.length ? Math.round(risk_matrix.reduce((n, r) => n + LEVEL_SCORE[r.level], 0) / risk_matrix.length) : 55;
  const aiRisk = Number(reasoning.overall_risk_score);
  const highStakesRolesForStrategicOutput=['DEFENSE_SUBMISSION_WITH_EXHIBITS','COMPLAINT_OR_PETITION','LITIGATION_SUBMISSION','INVESTIGATION_OR_BAP'];
  const highStakesStrategic = highStakesRolesForStrategicOutput.includes(sourceRole);
  const factCountForCalibration = Array.isArray(statement_buckets?.textual_facts) ? statement_buckets.textual_facts.length : 0;
  const claimCountForCalibration = Array.isArray(statement_buckets?.party_claims) ? statement_buckets.party_claims.length : 0;
  const supportingCountForCalibration = Array.isArray(statement_buckets?.supporting_evidence) ? statement_buckets.supporting_evidence.length : 0;
  const claimOnlyEvidence = factCountForCalibration===0 && claimCountForCalibration>0 && supportingCountForCalibration===0;
  const noMaterialEvidence = factCountForCalibration===0 && claimCountForCalibration===0 && supportingCountForCalibration===0;
  const caseRoleWorkflowStage = (lawyer_workflow.stages||[]).find((x:any)=>x?.id==='case-role');
  const draftingWorkflowStage = (lawyer_workflow.stages||[]).find((x:any)=>x?.id==='drafting');
  const proceduralPostureUnconfirmed = highStakesStrategic && (
    caseRoleWorkflowStage?.status!=='READY' ||
    draftingWorkflowStage?.status!=='READY'
  );

  const sourceRoleFloor = ['DEFENSE_SUBMISSION_WITH_EXHIBITS','COMPLAINT_OR_PETITION','LITIGATION_SUBMISSION'].includes(sourceRole) ? 45 : sourceRole === 'INVESTIGATION_OR_BAP' ? 45 : sourceRole === 'MIXED_CASE_MATERIAL' ? 40 : 30;
  const evidenceUncertaintyFloor = claimOnlyEvidence ? (highStakesStrategic ? 65 : 55) : noMaterialEvidence ? (highStakesStrategic ? 60 : 45) : 0;
  const proceduralPostureFloor = proceduralPostureUnconfirmed ? 60 : 0;
  const domainAmbiguityFloor = domainContext.ambiguous ? 45 : 0;
  const sourceQualityStatus = input.document_ingestion?.source_quality?.status || 'GOOD';
  const sourceQualityExcludedCount = input.document_ingestion?.source_quality?.excluded_pages?.length || 0;
  const sourceQualityExcludedSpanCount = input.document_ingestion?.source_quality?.excluded_spans || 0;
  const sourceQualityRepairedSpanCount = input.document_ingestion?.source_quality?.repaired_spans || 0;
  const ingestionFloor = input.document_ingestion?.manual_review_required ? 50 : 0;
  const sourceQualityFloor = sourceQualityStatus==='INSUFFICIENT' ? 75 : sourceQualityExcludedCount>0 ? 65 : sourceQualityStatus==='REVIEW_REQUIRED' ? 55 : 0;
  const pageFailureFloor = (input.document_ingestion?.failed_pages?.length || 0) > 0 ? 60 : 0;
  const rawRisk = Number.isFinite(aiRisk) && aiRisk > 0 && aiRisk <= 100 ? Math.round(aiRisk) : computedRisk;
  const overall_risk_score = Math.max(rawRisk, computedRisk, sourceRoleFloor, evidenceUncertaintyFloor, proceduralPostureFloor, domainAmbiguityFloor, ingestionFloor, sourceQualityFloor, pageFailureFloor);
  const risk_score_breakdown = [
    { factor:'Substantive risk matrix', score:computedRisk, basis:`${risk_matrix.length} risiko terpetakan` },
    { factor:'Source-role uncertainty', score:sourceRoleFloor, basis:sourceRole },
    ...(evidenceUncertaintyFloor?[{ factor:'Evidence uncertainty', score:evidenceUncertaintyFloor, basis:`facts=${factCountForCalibration}; claims=${claimCountForCalibration}; supporting=${supportingCountForCalibration}; claim_only=${claimOnlyEvidence}` }]:[]),
    ...(proceduralPostureFloor?[{ factor:'Procedural-posture uncertainty', score:proceduralPostureFloor, basis:`stage=${lawyer_workflow.procedural_stage}; case_role=${caseRoleWorkflowStage?.status||'-'}; drafting=${draftingWorkflowStage?.status||'-'}` }]:[]),
    ...(domainAmbiguityFloor?[{ factor:'Domain-routing ambiguity', score:domainAmbiguityFloor, basis:`confidence=${domainContext.confidence}; margin=${domainContext.margin}` }]:[]),
    { factor:'Document ingestion', score:ingestionFloor, basis:input.document_ingestion?.manual_review_required?'manual review required':'readable' },
    ...(sourceQualityFloor?[{ factor:'Source quality', score:sourceQualityFloor, basis:`status=${sourceQualityStatus}; excluded_pages=${sourceQualityExcludedCount}; excluded_spans=${sourceQualityExcludedSpanCount}; repaired_spans=${sourceQualityRepairedSpanCount}; low_confidence_pages=${input.document_ingestion?.source_quality?.low_confidence_pages?.length||0}` }]:[]),
    ...(pageFailureFloor?[{ factor:'OCR page failure', score:pageFailureFloor, basis:`${input.document_ingestion?.failed_pages?.length||0} halaman gagal OCR` }]:[]),
  ];
  const risks = risk_matrix.map(r => r.finding);
  tracer.end('risk_score', `risks=${risk_matrix.length}; overall=${overall_risk_score}`);

  const summary = reasoning.summary;
  const recommendations = unique([...(reasoning.recommendations || []), ...(lawyer_workflow.next_actions || [])]).slice(0, 14);

  // UI contract: keep Working Paper Action Plan aligned with VII. Rencana Tindakan.
  // Exporters use `recommendations`; the Working Paper tab reads `case_working_paper.action_plan`.
  // Build one canonical view from the same recommendation list so UI/PDF/DOCX do not diverge.
  const action_plan = recommendations.map((action, i) => ({
    step: i + 1,
    priority: (`P${Math.min(3, Math.floor(i / 2) + 1)}`) as 'P1' | 'P2' | 'P3',
    time_window: 'Belum ditetapkan',
    action,
    objective: 'Menutup celah pembuktian, verifikasi norma, atau langkah prosedural yang teridentifikasi.',
    condition: 'Verifikasi bukti primer, otoritas hukum, tempus, dan posisi prosedural sebelum tindakan final.',
    why_it_matters: 'Diselaraskan dengan VII. Rencana Tindakan pada working paper/export.',
  }));
  const best_case = reasoning.best_case;
  const worst_case = reasoning.worst_case;
  const verification_note = reasoning.verification_note;

  const totalSegments = input.document_ingestion?.pages_total || balanced.pages_total || Math.max(1, Math.ceil(charCount / 24000));
  const analyzedSegments = input.document_ingestion?.pages_ocr || balanced.pages_represented || Math.max(1, Math.min(totalSegments, Math.ceil(balanced.text.length / 24000)));
  const pageCoverage = analyzedSegments / Math.max(1, totalSegments);
  const documentStatus = input.document_ingestion?.manual_review_required || pageCoverage < 0.999 ? 'PARTIAL_REVIEW_REQUIRED' : 'READABLE';
  const factsScoreRaw = Math.min(95, 45 + Math.min(40, facts.length * 5) + (charCount > 1000 ? 10 : 0));
  const factsScore = claimOnlyEvidence ? Math.min(factsScoreRaw, highStakesStrategic ? 45 : 50) : factsScoreRaw;
  const evidenceScoreRaw = inputType === 'narrative' ? 55 : (input.document_ingestion?.manual_review_required ? 50 : 72);
  const evidenceScore = claimOnlyEvidence
    ? Math.min(evidenceScoreRaw, highStakesStrategic ? 40 : 45)
    : supportingCountForCalibration>0
      ? Math.max(evidenceScoreRaw, 60)
      : evidenceScoreRaw;
  const reachableCountForScore = usableOfficialCandidates.filter((x:any)=>x.status!=='UNREACHABLE').length;
  const lawScoreRaw = regulatoryMode === 'online'
    ? Math.min(90, 35 + Math.min(45, reachableCountForScore * 10) + (usableOfficialCandidates.some((x:any)=>x.status==='IDENTITY_VERIFIED') ? 10 : 0))
    : regulatoryMode === 'offline'
      ? Math.min(85, 45 + Math.min(40, matchedRegs.length * 7))
      : Math.min(90, 45 + Math.min(30, matchedRegs.length * 6) + Math.min(10, reachableCountForScore * 3) + (usableOfficialCandidates.some((x:any)=>x.status==='IDENTITY_VERIFIED') ? 5 : 0));
  const workflowReadyStages = (lawyer_workflow.stages || []).filter((x:any)=>x.status==='READY').length;
  const procedureScoreRaw = Math.min(95, 45 + Math.min(20, legal_issues.length * 4) + Math.min(15, recommendations.length * 2) + Math.min(15, workflowReadyStages * 2));
  const procedureScorePostureAware = (caseRoleWorkflowStage?.status==='READY' && draftingWorkflowStage?.status==='READY')
    ? procedureScoreRaw
    : Math.min(procedureScoreRaw, highStakesStrategic ? 50 : 60);
  // Readiness-score calibration: a high-stakes submission whose legal domain has not
  // been confidently routed (same condition the pipeline_gate's `domain_routing_confident`
  // check already uses) must not report a comfortable law/strategy score just because
  // local-corpus/issue counts happen to be non-zero — those candidates are themselves
  // unreliable while the domain is still LOW-confidence or ambiguous.
  const highStakesRolesForReadiness=['DEFENSE_SUBMISSION_WITH_EXHIBITS','COMPLAINT_OR_PETITION','LITIGATION_SUBMISSION','INVESTIGATION_OR_BAP'];
  const domainRoutingUnconfirmed = highStakesRolesForReadiness.includes(sourceRole)
    && (String(domainContext.confidence).toUpperCase()==='LOW' || domainContext.ambiguous===true);
  const lawScore = domainRoutingUnconfirmed ? Math.min(lawScoreRaw, 50) : lawScoreRaw;
  const procedureScore = domainRoutingUnconfirmed ? Math.min(procedureScorePostureAware, 55) : procedureScorePostureAware;
  const readinessScoreRaw = Math.round((factsScore + evidenceScore + lawScore + procedureScore) / 4);
  const readinessCeilings = [
    ...(domainRoutingUnconfirmed ? [55] : []),
    ...(proceduralPostureUnconfirmed ? [55] : []),
    ...(highStakesStrategic && claimOnlyEvidence ? [55] : []),
    ...(sourceQualityStatus==='REVIEW_REQUIRED' ? [60] : []),
    ...(sourceQualityStatus==='INSUFFICIENT' || sourceQualityExcludedCount>0 ? [50] : []),
  ];
  const readinessCeiling = readinessCeilings.length ? Math.min(...readinessCeilings) : 100;
  const readinessScore = Math.min(readinessScoreRaw, readinessCeiling);
  const case_readiness = { metric:'CASE_PREPARATION_COMPLETENESS', label:'Case Readiness / Kelengkapan Persiapan', overall_score:readinessScore, confidence: readinessScore >= 80 ? 'HIGH' : readinessScore >= 60 ? 'MEDIUM' : 'LOW', dimensions:{ facts_completeness:{score:factsScore,label:'Fakta & Subjek Terpetakan'}, evidence_robustness:{score:evidenceScore,label:'Kekuatan/Ketersediaan Bukti'}, legal_basis_authority:{score:lawScore,label:'Otoritas Dasar Hukum'}, procedural_strategy:{score:procedureScore,label:'Kesiapan Strategi'} } };
  const case_working_paper = { format_version:'2.0', action_plan, working_paper_percentage:{ metric:'WORKING_PAPER_MATURITY', label:'Working Paper Readiness / Maturity', percentage:readinessScore, confidence:case_readiness.confidence, variables_increasing:[
    {variable:'Fakta material terpetakan',impact:Math.round((factsScore-50)/2),basis:`${facts.length} fakta material teridentifikasi`},
    {variable:'Dasar hukum kandidat',impact:Math.round((lawScore-50)/2),basis:regulatoryMode==='offline'?`${matchedRegs.length} instrumen kandidat dari corpus lokal`:`${usableOfficialCandidates.length} kandidat lolos status/tempus dan ditemukan online secara dinamis`}
  ], variables_decreasing:[
    {variable:'Verifikasi profesional belum final',impact:-8,basis:'Dokumen asli, norma, dan strategi masih wajib diverifikasi advokat'},
    ...(coverageRatio<.99?[{variable:'Karakter sumber dipadatkan',impact:-6,basis:`Seluruh ${balanced.pages_represented}/${balanced.pages_total} halaman tetap direpresentasikan; sekitar ${Math.round(coverageRatio*100)}% karakter masuk analisis`}]:[]),
    ...(['DEFENSE_SUBMISSION_WITH_EXHIBITS','COMPLAINT_OR_PETITION','LITIGATION_SUBMISSION'].includes(sourceRole)?[{variable:'Sumber bersifat pleading/submission satu pihak',impact:-10,basis:'Dalil pleading tidak boleh diperlakukan sebagai temuan independen tanpa uji silang'}]:[]),
    ...(claimOnlyEvidence?[{variable:'Basis materi masih claim-only',impact:highStakesStrategic?-18:-10,basis:`facts=${factCountForCalibration}; claims=${claimCountForCalibration}; supporting=${supportingCountForCalibration}; klaim belum cukup untuk kesiapan final`}]:[]),
    ...(proceduralPostureUnconfirmed?[{variable:'Posture prosedural belum siap untuk output final',impact:-18,basis:`stage=${lawyer_workflow.procedural_stage}; case_role=${caseRoleWorkflowStage?.status||'-'}; drafting=${draftingWorkflowStage?.status||'-'}; output eksternal/final ditahan`}]:[]),
    ...(domainRoutingUnconfirmed?[{variable:'Domain hukum belum solid ditentukan',impact:-20,basis:`confidence=${domainContext.confidence}; ambiguous=${domainContext.ambiguous}; dasar hukum dan strategi tidak dapat dianggap matang sebelum domain perkara jelas`}]:[])
  ] } };


  const reachableCount = usableOfficialCandidates.filter((x:any)=>x.status!=='UNREACHABLE').length;
  const identityCount = usableOfficialCandidates.filter((x:any)=>x.status==='IDENTITY_VERIFIED').length;
  const providerStatus = officialLawRetrieval.providers?.[0]?.status || '';
  const providerSearchReachable = !['UNREACHABLE','DISABLED_LOCAL_MODE'].includes(providerStatus);
  const officialStatus = regulatoryMode === 'offline'
    ? 'ONLINE_DISABLED_LOCAL_MODE'
    : identityCount ? 'ONLINE_SOURCE_IDENTITY_HINT_ONLY'
      : reachableCount ? 'ONLINE_SOURCE_REACHABLE_UNVERIFIED'
        : providerStatus === 'REACHABLE_NO_LINKS' ? 'ONLINE_SOURCE_REACHABLE_NO_LINKS'
          : providerStatus === 'REACHABLE_LINKS_REJECTED' ? 'ONLINE_SOURCE_CANDIDATES_REJECTED'
            : providerSearchReachable ? 'ONLINE_SOURCE_REACHABLE_NO_CANDIDATE'
              : 'ONLINE_SOURCE_UNAVAILABLE';
  const case_regulatory_snapshot = {
    mode: regulatoryMode, mode_label: regulatoryModeLabel(regulatoryMode),
    domains:[{id:posture.toLowerCase(),label:primaryDomain,confidence:domainContext.confidence,score:domainContext.score}, ...domainContext.secondary.map((d:any)=>({id:d.posture.toLowerCase(),label:d.domain,score:d.score,confidence:'SECONDARY'}))],
    queries:officialLawRetrieval.queries, local_seed_count:matchedRegs.length,
    local_corpus_diagnostics: corpusRetrievalDiagnostics,
    case_regime: {
      forum: caseRegime.forum,
      regime: caseRegime.regime,
      signals: {
        forum_explicit: caseRegime.signals.forum_explicit,
        criminal_procedural: caseRegime.signals.criminal_procedural,
        civil_procedural: caseRegime.signals.civil_procedural,
        administrative_procedural: caseRegime.signals.administrative_procedural,
        islamic_substantive: caseRegime.signals.islamic_substantive,
        civil_substantive: caseRegime.signals.civil_substantive,
        customary_substantive: caseRegime.signals.customary_substantive,
        personal_identity: caseRegime.signals.personal_identity,
      },
    },
    local_corpus_used_for_reasoning: regulatoryMode !== 'online',
    local_corpus_reasoning_candidates: localCorpusCandidates.map((c:any)=>({
      title:c.title,
      material_nexus_score:c.material_nexus_score,
      tempus_status:c.tempus_status,
      verification_reasons:c.verification_reasons,
    })),
    local_results: matchedRegs.slice(0,8).map((m:any)=>({
      regulation: safeString(m.regulation?.nomor || m.regulation?.tentang),
      title: safeString(m.regulation?.tentang || m.regulation?.nomor),
      status: safeString(m.regulation?.status || 'STATUS_CORPUS_TIDAK_DIISI'),
      confidence: m.material_confidence || 'LOW',
      relevance_score: Math.round(Number(m.relevance_score || 0) * 100),
      stage1_score: m.stage1_score || 0,
      material_score: m.material_score || 0,
      issue_hits: m.issue_hits || 0,
      issue_phrase_hits: m.issue_phrase_hits || 0,
      anchor_hits: m.anchor_hits || 0,
      article_hits: m.article_hits || 0,
      citation_hit: Boolean(m.citation_hit),
      domain_alignment: m.domain_alignment || 'NEUTRAL',
      primary_aligned: m.primary_aligned || 0,
      secondary_aligned: m.secondary_aligned || 0,
      foreign_aligned: m.foreign_aligned || 0,
      regime_note: m.regime_note || null,
      articles: (m.matched_articles || []).slice(0,5).map((a:any)=>({
        pasal: safeString(a.pasal),
        topic: safeString(a.topic),
      })),
    })),
    reasoning_source_route: regulatoryMode === 'offline'
      ? 'REGULATORY_CORPUS_ONLY'
      : regulatoryMode === 'online'
        ? 'OFFICIAL_ONLINE_ONLY'
        : 'REGULATORY_CORPUS_PLUS_OFFICIAL_ONLINE',
    issue_authority_binding: {
      issue_count: legal_issues.length,
      bound_issue_count: legal_issues.filter((x:any)=>Array.isArray(x.bound_authorities)&&x.bound_authorities.length>0).length,
      unbound_issue_count: legal_issues.filter((x:any)=>!Array.isArray(x.bound_authorities)||x.bound_authorities.length===0).length,
      bindings: legal_issues.map((x:any)=>({ issue:safeString(x.issue), authorities:x.bound_authorities||[] })),
      regime_rejections: bindingPool.flatMap((c:any)=>
        Array.isArray(c.__regime_rejections)?c.__regime_rejections:[]
      ).slice(0,80),
      independent_support_rejections: bindingPool.flatMap((c:any)=>
        Array.isArray(c.__support_rejections)?c.__support_rejections:[]
      ).slice(0,80),
      material_nexus_rejections: bindingPool.flatMap((c:any)=>
        Array.isArray(c.__material_rejections)?c.__material_rejections:[]
      ).slice(0,80),
      temporal_rejections: bindingPool.flatMap((c:any)=>
        (Array.isArray(c.__temporal_rejections)?c.__temporal_rejections:[]).map((r:any)=>({source:c.source_label,authority_identity:c.authority_identity,...r}))
      ).slice(0,80),
      gate_version: 'V6.9.0-group-a-correctness',
    },
    official_results: usableOfficialCandidates.slice(0,16),
    official_provider_status: providerStatus,
    official_diagnostics: officialLawRetrieval.diagnostics || null,
    official_notes: officialLawRetrieval.notes || [],
    official_source_strategy: officialLawRetrieval.source_strategy || 'auto',
    manual_authority_resolutions: officialLawRetrieval.manual_resolutions || [],
    professional_verification:'PENDING',
    retrieval_funnel:{
      discovered: regulatoryMode === 'offline' ? db.getRegulations().length : matchedRegs.length + officialLawRetrieval.candidates.length,
      rejected_status_or_tempus: officialLawRetrieval.candidates.length - usableOfficialCandidates.length,
      unique_discovered: regulatoryMode === 'offline' ? db.getRegulations().length : matchedRegs.length + officialLawRetrieval.candidates.length,
      candidate: regulatoryMode === 'offline' ? corpusRetrievalDiagnostics.stage1_size : applicable_law.length,
      materially_relevant: regulatoryMode === 'offline' ? matchedRegs.length : applicable_law.length,
      temporal_not_excluded: regulatoryMode === 'offline' ? localCorpusCandidates.length : usableOfficialCandidates.length,
      authoritative_source_located: regulatoryMode === 'offline' ? 0 : usableOfficialCandidates.length,
      fetch_attempted: officialLawRetrieval.diagnostics?.search_attempts ?? officialLawRetrieval.queries.length,
      fetch_reachable: officialLawRetrieval.diagnostics?.reachable_searches ?? reachableCount,
      search_links_found: officialLawRetrieval.diagnostics?.found_links ?? 0,
      search_links_selected: officialLawRetrieval.diagnostics?.selected_links ?? 0,
      candidate_policy_rejected: officialLawRetrieval.diagnostics?.candidate_rejections ?? 0,
      instrument_identity_verified: regulatoryMode === 'offline' ? 0 : identityCount,
      positive_law_verified: 0, tempus_verified: 0, verified_applicable: 0,
      provision_located: 0,
      provision_requested: (matchedRegs as any[]).reduce((n:number,m:any)=>n+(Array.isArray(m.matched_articles)?m.matched_articles.length:0),0),
      provision_verified: 0,
    },
  };

  tracer.begin('pipeline_gate');
  const pipeline_gate = evaluateCasePipelineGate({
    sourceRole, reasoningStatus, regulatoryMode, statementBuckets: statement_buckets,
    actorMatrix: actor_matrix, verifiedTimeline: verified_timeline, legalIssues: legal_issues,
    multiPathDiagnosis: multi_path_diagnosis, blankSpotQuestions: blank_spot_questions,
    adverseEvidence: adverse_evidence, officialLawCandidates: usableOfficialCandidates,
    applicableLaw: applicable_law, riskBreakdown: risk_score_breakdown, lawyerWorkflow: lawyer_workflow,
    domainClassificationDomains: domainContext.secondary.length
      ? [{ label: primaryDomain }, ...domainContext.secondary.map((d:any)=>({ label:d.domain }))]
      : [{ label: primaryDomain }],
    domainClassificationConfidence: domainContext.confidence,
    domainClassificationAmbiguous: domainContext.ambiguous,
    domainClassificationMargin: domainContext.margin,
    documentIngestion: input.document_ingestion,
  });
  tracer.end('pipeline_gate', `status=${pipeline_gate.status}; score=${pipeline_gate.score}`);

  // V6.10.0 Group B corrective — canonical readiness contract.
  // Pipeline readiness answers only whether mandatory processing gates passed.
  // Working-paper readiness measures maturity/completeness of the substantive work product.
  // The user-facing analysis readiness must never exceed either internal metric.
  const pipelineGateReadinessScore = Math.max(0, Math.min(100, Math.round(Number(pipeline_gate.score || 0))));
  const workingPaperReadinessScore = Math.max(0, Math.min(100, Math.round(Number(readinessScore || 0))));
  const analysisReadinessScore = Math.min(pipelineGateReadinessScore, workingPaperReadinessScore);
  const analysisReadinessStatus = pipeline_gate.status === 'READY' && analysisReadinessScore >= 80
    ? 'READY'
    : 'REVIEW_REQUIRED';
  const analysisReadinessConfidence = analysisReadinessScore >= 80 ? 'HIGH' : analysisReadinessScore >= 60 ? 'MEDIUM' : 'LOW';
  const pipeline_gate_readiness = {
    metric:'PIPELINE_GATE_READINESS',
    label:'Pipeline Gate Readiness',
    score:pipelineGateReadinessScore,
    status:pipeline_gate.status,
    internal:true,
  };
  const working_paper_readiness = {
    metric:'WORKING_PAPER_MATURITY',
    label:'Working Paper Readiness / Maturity',
    score:workingPaperReadinessScore,
    confidence:case_readiness.confidence,
    internal:true,
  };
  const analysis_readiness = {
    metric:'ANALYSIS_READINESS',
    label:'Analysis Readiness',
    overall_score:analysisReadinessScore,
    score:analysisReadinessScore,
    status:analysisReadinessStatus,
    confidence:analysisReadinessConfidence,
    rule:'MIN_PIPELINE_GATE_AND_WORKING_PAPER',
    components:{
      pipeline_gate_readiness:pipelineGateReadinessScore,
      working_paper_readiness:workingPaperReadinessScore,
    },
    dimensions:case_readiness.dimensions,
    disclaimer:'Status utama memakai nilai terendah antara kelayakan pipeline dan kematangan kertas kerja; bukan peluang menang/kalah.',
  };

  const legalAnalysisText = legal_issues.map((x:any)=>x.analysis).filter(Boolean).join('\n\n') || summary;
  const material_source_ledger = [
    ...(statement_buckets.textual_facts || []).map((v:any)=>({ statement:v.statement, display_classification:'CASE_FACT', evidence:v.evidence_tag, segment:v.page })),
    ...(statement_buckets.party_claims || []).map((v:any)=>({ statement:v.statement, display_classification:'PLEADING_ASSERTION', evidence:v.evidence_tag, segment:v.page })),
  ].slice(0, 100);

  tracer.begin('working_paper');
  const record: Omit<CaseAnalysisRecord,'id'|'created_at'> = {
    ...({ document_type: reasoning.document_type || primaryDomain } as any),
    title, input_type: inputType, filename, source_text: text, facts,
    client_id: input.client_id ? String(input.client_id).trim() || undefined : undefined,
    client_name: input.client_name ? String(input.client_name).trim() || undefined : undefined,
    incriminating_facts: [], mitigating_facts: [], legal_issues, applicable_law: applicable_law as any,
    summary, legal_analysis: legalAnalysisText, arguments_for, arguments_against,
    evidence_needed: [
      'Dokumen primer yang melahirkan hubungan hukum atau hak/kewajiban para pihak.',
      'Bukti pembayaran/transaksi/korespondensi atau dokumen pelaksanaan yang relevan.',
      'Kronologi bertanggal dan identitas/kapasitas hukum para pihak.',
      'Bukti pendukung atas kerugian, pelanggaran, atau pembelaan yang didalilkan.',
    ],
    evidentiary_gaps: legal_gaps.map(g => g.gap),
    risks, risk_matrix, overall_risk_score,
    ...({ risk_score_breakdown, source_role: sourceRole, domain_context: domainContext,
      evidence_ledger: evidenceLedger, source_law_citations: sourceLawCitations,
      evidence_model: deterministicEvidence, statement_buckets, actor_matrix, verified_timeline,
      legal_gaps, multi_path_diagnosis, integration_matrix, adverse_evidence,
      blank_spot_questions, tactical_strategy, official_law_retrieval: officialLawRetrieval,
      material_source_ledger,
      case_role_assessment: { orientation: lawyer_workflow.orientation, represented_side_hint: lawyer_workflow.represented_side_hint, confidence: lawyer_workflow.role_confidence, mandate_summary: lawyer_workflow.mandate_summary },
      lawyer_workflow, allegation_response_matrix: lawyer_workflow.allegation_response_matrix, authority_duty_matrix: lawyer_workflow.authority_duty_matrix, financial_collateral_audit: lawyer_workflow.financial_collateral_audit, document_integrity_audit: lawyer_workflow.document_integrity_audit, witness_strategy: lawyer_workflow.witness_strategy, drafting_plan: lawyer_workflow.drafting_plan,
      pipeline_gate, pipeline_gate_readiness, working_paper_readiness, analysis_readiness } as any),
    best_case, worst_case, verification_note, recommendations,
    case_posture: posture,
    domain_classification: { posture, primary_domain: primaryDomain, confidence: domainContext.confidence, ambiguous: domainContext.ambiguous, margin: domainContext.margin, domains: [{ id: posture.toLowerCase(), label: primaryDomain, confidence: domainContext.confidence, score: domainContext.score }, ...domainContext.secondary.map((d:any)=>({id:d.posture.toLowerCase(),label:d.domain,score:d.score,confidence:'SECONDARY'}))] },
    analysis_provenance: {
      mode: 'DETERMINISTIC_FORENSIC_ENGINE',
      provider: 'LexiCore Local Kernel',
      model: reasoningModel,
      status: reasoningStatus,
      attempts: reasoningAttempts,
      timestamp: new Date().toISOString(),
      source_coverage_ratio: coverageRatio,
      page_coverage_ratio: pageCoverageRatio,
      source_role: sourceRole,
    },
    case_readiness, case_working_paper, analysis_readiness, pipeline_gate_readiness, working_paper_readiness, regulatory_matches: matchedRegs.map((m:any)=>({ ...m, authority_level:'LOCAL_CORPUS_INDEX_ONLY', requires_official_verification:true })),
    regulatory_intelligence: { relationships:[], relationships_status:'NOT_IMPLEMENTED', timeline: matchedRegs.map((m:any)=>({date:safeString(m.regulation.effective_date || m.regulation.tahun),event:`${safeString(m.regulation.nomor)} - ${safeString(m.regulation.tentang)}`})).slice(0,8) },
    regulatory_corpus_status: {
      mode: regulatoryModeLabel(regulatoryMode),
      requested_mode: regulatoryMode,
      corpus_total: db.getRegulations().length,
      matches: matchedRegs.length,
      reasoning_candidates: localCorpusCandidates.length,
      strict_matches: corpusRetrievalDiagnostics.strict_count,
      fallback_used: corpusRetrievalDiagnostics.fallback_used,
      corpus_used_for_reasoning: regulatoryMode !== 'online',
      online_fetch_attempted: regulatoryMode!=='offline',
      reachable_sources: reachableCount,
      official_verification_required: regulatoryMode!=='offline',
      professional_verification:'PENDING'
    },
    document_reading: { status: documentStatus, segments_read: analyzedSegments, segments_total: totalSegments, characters: charCount, coverage_ratio: pageCoverage, char_coverage_ratio: coverageRatio, page_coverage_ratio: pageCoverage, failed_pages: input.document_ingestion?.failed_pages || [], source_quality: input.document_ingestion?.source_quality || null },
    official_verification: { status: officialStatus, mode: regulatoryMode, verified_sources: 0, reachable_sources: reachableCount, identity_hints: identityCount, details: regulatoryMode==='offline'?'Mode Lokal aktif: tidak ada fetch online. Corpus lokal adalah basis kandidat dan tetap memerlukan verifikasi profesional.':regulatoryMode==='online'?'Mode Online aktif: hanya sumber resmi yang berhasil dijangkau ditampilkan sebagai kandidat dasar hukum; corpus lokal hanya menjadi indeks pencarian.':'Mode Hybrid aktif: corpus lokal digunakan sebagai kandidat dan sumber resmi online dicek bila URL tersedia. Tidak ada instrumen/pasal yang dinyatakan VERIFIED_APPLICABLE secara otomatis.' },
    case_regulatory_snapshot,
    ...({ document_ingestion: input.document_ingestion || { mode:'TEXT', coverage_ratio:1, manual_review_required:false }, professional_verification:'PENDING' } as any),
  };

  tracer.end('working_paper', `working_paper=${workingPaperReadinessScore}; pipeline=${pipelineGateReadinessScore}; analysis=${analysisReadinessScore}; gate=${pipeline_gate.status}`);
  (record as any).pipeline_trace = tracer.summarize();
  return db.saveCaseAnalysis(record);
}

// ============================================================
// TEST-ONLY EXPORTS (V6.7.1)
// ------------------------------------------------------------
// No production side effect. Exposes only pure internals required by the
// regression audit.
// ============================================================
export const __test__ = {
  extractSourceLawCitations,
  bindIssuesToAuthorities,
  filterApplicableLawToBoundAuthorities,
  detectCaseRegimeContext,
  reconcileLegalContextWithRegime,
  prioritizeIssuesForDomain,
  buildDomainRankingContext,
  matchRegulations,
  hasConsumerRelationshipEvidence,
};
