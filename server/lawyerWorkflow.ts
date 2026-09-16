export type LawyerOrientation =
  | 'CRIMINAL_DEFENSE'
  | 'CIVIL_PLAINTIFF'
  | 'CIVIL_DEFENSE'
  | 'ADMINISTRATIVE_RESPONSE'
  | 'GENERAL_COUNSEL_REVIEW';

export type ProceduralStage =
  | 'PRE_LITIGATION'
  | 'INVESTIGATION'
  | 'PROSECUTION'
  | 'EVIDENCE_HEARING'
  | 'PLEADING'
  | 'APPEAL'
  | 'EXECUTION'
  | 'CONSULTATION';

export type WitnessCategory =
  | 'FACT_WITNESS'
  | 'EXPERT_WITNESS'
  | 'PROCEDURAL_ACTOR'
  | 'DOCUMENT_CUSTODIAN'
  | 'CHARACTER_WITNESS';

export interface LawyerWorkflowStage {
  id: string;
  label: string;
  objective: string;
  status: 'READY' | 'PARTIAL' | 'BLOCKED';
  evidence_basis: string[];
  outputs: string[];
}

export interface AllegationResponseRow {
  issue: string;
  allegation_or_risk: string;
  supporting_material: string[];
  counter_material: string[];
  unresolved: string[];
  verification: string;
}

export interface WitnessPlanItem {
  witness: string;
  roles: string[];
  category: WitnessCategory;
  objectives: string[];
  question_themes: string[];
  evidence_pages: number[];
  caution?: string;
}

export interface DraftingPlanItem {
  document: string;
  purpose: string;
  priority: 'P1' | 'P2' | 'P3';
  depends_on: string[];
  stage_guard?: string;
}

export interface LawyerWorkflowResult {
  version: '1.1';
  orientation: LawyerOrientation;
  procedural_stage: ProceduralStage;
  represented_side_hint: string;
  role_confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  mandate_summary: string;
  stages: LawyerWorkflowStage[];
  allegation_response_matrix: AllegationResponseRow[];
  authority_duty_matrix: Array<{
    actor: string;
    roles: string[];
    authority_question: string;
    operational_duty_question: string;
    verification: string;
  }>;
  financial_collateral_audit: {
    active: boolean;
    amounts: string[];
    collateral_terms: string[];
    repayment_terms: string[];
    discrepancy_terms: string[];
    review_questions: string[];
  };
  document_integrity_audit: {
    document_markers: string[];
    integrity_questions: string[];
  };
  witness_strategy: {
    witness_targets: WitnessPlanItem[];
    expert_domains: string[];
  };
  drafting_plan: DraftingPlanItem[];
  case_theory_candidates: string[];
  verification_queue: string[];
  next_actions: string[];
}

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const arr = (v: any) => (Array.isArray(v) ? v : []);

// ---------- Orientation ----------

function orientationFrom(
  sourceRole:string,
  text:string,
):{orientation:LawyerOrientation;side:string;confidence:'HIGH'|'MEDIUM'|'LOW'}{
  const t=text.toLowerCase();
  const litigationRole=sourceRole==='LITIGATION_SUBMISSION'||sourceRole==='PLEADING_OR_SUBMISSION';
  const isRepliek=/\brepliek\b|\breplik\b/.test(t);
  const isDuplik=/\bduplik\b/.test(t);
  const jawabanTergugat=/jawaban\s+(?:para\s+)?tergugat|jawaban\s+tergugat/.test(t);
  if(litigationRole||isRepliek||isDuplik||jawabanTergugat){
    if(isRepliek)return {orientation:'CIVIL_PLAINTIFF',side:'Penggugat/Pemohon yang mengajukan replik/repliek',confidence:'HIGH'};
    if(isDuplik||jawabanTergugat)return {orientation:'CIVIL_DEFENSE',side:'Tergugat/Termohon yang mengajukan duplik/jawaban',confidence:'HIGH'};
    const hasPlaintiff=/\bpenggugat\b|\bpemohon\b/.test(t), hasDefendant=/\btergugat\b|\btermohon\b/.test(t);
    if(hasPlaintiff&&!hasDefendant)return {orientation:'CIVIL_PLAINTIFF',side:'Penggugat/Pemohon atau pihak yang mengajukan klaim',confidence:'MEDIUM'};
    if(hasDefendant&&!hasPlaintiff)return {orientation:'CIVIL_DEFENSE',side:'Tergugat/Termohon atau pihak yang membantah klaim',confidence:'MEDIUM'};
    return {orientation:'GENERAL_COUNSEL_REVIEW',side:'Pihak litigasi perdata — sisi representasi perlu dikonfirmasi',confidence:'LOW'};
  }
  if(sourceRole==='INVESTIGATION_OR_BAP'||/\btersangka\b|\bterdakwa\b|dakwaan|penuntut\s+umum|jaksa\s+penyidik/.test(t)){
    return {orientation:'CRIMINAL_DEFENSE',side:'Tersangka/Terdakwa atau pihak yang menghadapi proses pidana',confidence:'MEDIUM'};
  }

  // V6.7.4 — pre-litigation civil claimant orientation.
  // A contract/case narrative that explicitly identifies a client and records
  // a demand for cancellation, repayment, return, compensation, or intended
  // legal action is not merely an abstract general-counsel review.
  const clientMarker=/\bklien\b|\(\s*klien\s*\)/i.test(text);
  const prospectiveCivilClaim=/\bmeminta\s+kembali\b|\bpengembalian\s+(?:uang|pembayaran|dana)\b|\bpembatalan\b|\bsomasi\b|\bmenuntut\b|\bganti\s+rugi\b|\bakan\s+melakukan\s+upaya\s+hukum\b/i.test(text);
  const activeCriminal=/\btersangka\b|\bterdakwa\b|\bdakwaan\b|\bpenyidikan\b|\bpenuntut\s+umum\b/i.test(text);
  if(
    !activeCriminal &&
    clientMarker &&
    prospectiveCivilClaim &&
    (sourceRole==='CONTRACT_OR_AGREEMENT'||sourceRole==='CASE_NARRATIVE_OR_QUESTION'||sourceRole==='LEGAL_CORRESPONDENCE')
  ){
    return {
      orientation:'CIVIL_PLAINTIFF',
      side:'Klien sebagai calon penggugat/pihak yang menuntut pemulihan hak',
      confidence:'MEDIUM',
    };
  }
  if(sourceRole==='DEFENSE_SUBMISSION_WITH_EXHIBITS'||/\btergugat\b|jawaban\s+tergugat/.test(t))return {orientation:'CIVIL_DEFENSE',side:'Tergugat/Termohon atau pihak yang membantah klaim',confidence:'HIGH'};
  if(sourceRole==='COMPLAINT_OR_PETITION'||/\bpenggugat\b|\bpemohon\b|gugatan/.test(t))return {orientation:'CIVIL_PLAINTIFF',side:'Penggugat/Pemohon atau pihak yang mengajukan klaim',confidence:'MEDIUM'};
  if(/keputusan\s+tata\s+usaha|pejabat\s+tata\s+usaha|keberatan\s+administratif|banding\s+administratif/.test(t))return {orientation:'ADMINISTRATIVE_RESPONSE',side:'Pihak dalam sengketa/keberatan administratif',confidence:'MEDIUM'};
  return {orientation:'GENERAL_COUNSEL_REVIEW',side:'Pihak yang memerlukan analisis dan strategi hukum',confidence:'LOW'};
}

// ---------- Procedural stage ----------

// ---------- Procedural stage ----------

function detectProceduralStage(sourceRole:string,text:string):ProceduralStage{
  const t=text.toLowerCase();
  const pleadingShape=/(?:^|\n)\s*(?:repliek|replik|duplik|jawaban\s+(?:tergugat|penggugat)|kesimpulan\s+(?:para\s+)?pihak|eksepsi|pledoi|nota\s+pembelaan)\b/i.test(text)||/perkara\s+nomor\s+\d+\s*\/\s*pdt\./i.test(text);
  if(sourceRole==='LITIGATION_SUBMISSION'||sourceRole==='PLEADING_OR_SUBMISSION'||pleadingShape)return 'PLEADING';
  if(/\beksekusi\b|\bdieksekusi\b|\bpelelangan\b|\bsita\s+eksekusi\b|\baanmaning\b/.test(t))return 'EXECUTION';

  // V6.7.4 — APPEAL requires an actual appellate marker.
  // Generic "upaya hukum" and "verstek" are not appellate stages by themselves.
  if(
    /\bmemori\s+banding\b|\bkontra\s+memori\s+banding\b|\bpermohonan\s+banding\b|\bbanding\s+ke\s+pengadilan\s+tinggi\b|\bkasasi\b|\bmemori\s+kasasi\b|\bpeninjauan\s+kembali\b|\bpermohonan\s+pk\b|\bverzet\b/i.test(text)
  )return 'APPEAL';

  if(/\bsidang\s+pemeriksaan\s+saksi\b|\bagenda\s+sidang\b|\bpemeriksaan\s+saksi\b|\bpembuktian\s+di\s+persidangan\b/.test(t))return 'EVIDENCE_HEARING';
  if(/\bpenuntut\s+umum\b|\bjaksa\s+penuntut\b|\bdakwaan\b|\bsurat\s+dakwaan\b|\bprapenuntutan\b/.test(t))return 'PROSECUTION';
  const investigationSignals=/\bberita\s+acara\s+pemeriksaan\b|\bbap\b|\bpenyidikan\b|\bpenyidik\s+(?:memeriksa|menanyakan)\b|\btersangka\s+diperiksa\b|\bsaksi\s+diperiksa\b|\bpendampingan\s+pemeriksaan\b|\bpemeriksaan\s+tersangka\b/.test(t);
  if(investigationSignals||sourceRole==='INVESTIGATION_OR_BAP')return 'INVESTIGATION';
  if(
    /\bsomasi\b|\bmediasi\b|\bnegosiasi\b|\bnon-litigasi\b|\bakan\s+melakukan\s+upaya\s+hukum\b|\bmeminta\s+kembali\b|\bpengembalian\s+(?:uang|pembayaran|dana)\b|\bpembatalan\s+(?:jual\s+beli|perjanjian)\b/i.test(text)
  )return 'PRE_LITIGATION';
  return 'CONSULTATION';
}

function draftingStageStatus(stage: ProceduralStage, issueCount: number): LawyerWorkflowStage['status'] {
  if (issueCount <= 0) return 'BLOCKED';
  if (['PRE_LITIGATION','EVIDENCE_HEARING','PLEADING','APPEAL','EXECUTION'].includes(stage)) return 'READY';
  // INVESTIGATION / PROSECUTION may support internal preparation, but a final
  // pleading is procedurally premature. CONSULTATION likewise remains internal.
  return 'PARTIAL';
}

function stageDraftDocument(orientation: LawyerOrientation, stage: ProceduralStage): string {
  if (stage === 'PRE_LITIGATION') return orientation === 'CIVIL_DEFENSE'
    ? 'Draft tanggapan pra-litigasi / negosiasi'
    : 'Draft somasi / permintaan pemulihan / negosiasi';
  if (stage === 'INVESTIGATION') return 'Catatan pendampingan pemeriksaan / daftar keberatan prosedural';
  if (stage === 'PROSECUTION') return 'Catatan persiapan eksepsi / pembelaan sebelum pleading';
  if (stage === 'EVIDENCE_HEARING') return 'Catatan pembuktian & daftar pertanyaan saksi';
  if (stage === 'PLEADING') return orientation === 'CRIMINAL_DEFENSE'
    ? 'Draft eksepsi / pledoi sesuai tahap'
    : 'Draft gugatan / jawaban / replik / duplik sesuai posisi';
  if (stage === 'APPEAL') return 'Draft memori / kontra memori upaya hukum';
  if (stage === 'EXECUTION') return 'Draft permohonan / tanggapan eksekusi';
  return 'Catatan strategi internal / legal opinion draft';
}

function stageDraftGuard(stage: ProceduralStage): string {
  if (stage === 'PLEADING') return 'Layak disusun sebagai pleading pada tahap ini; tetap butuh verifikasi pasal, tempus, dan bukti primer.';
  if (stage === 'PRE_LITIGATION') return 'Batasi pada korespondensi/somasi/negosiasi pra-litigasi; jangan diperlakukan sebagai pleading yang telah diajukan.';
  if (stage === 'EVIDENCE_HEARING') return 'Fokus pada pembuktian dan pemeriksaan saksi; jangan mengubahnya menjadi pleading final tanpa kebutuhan prosedural.';
  if (stage === 'APPEAL') return 'Gunakan hanya untuk upaya hukum yang benar-benar teridentifikasi; verifikasi tenggang dan syarat formil.';
  if (stage === 'EXECUTION') return 'Gunakan hanya setelah dasar eksekutorial, pihak, objek, dan tahapan eksekusi terverifikasi.';
  if (stage === 'INVESTIGATION') return 'Hanya catatan pendampingan/internal; jangan menyusun pledoi atau eksepsi final pada tahap penyidikan.';
  if (stage === 'PROSECUTION') return 'Persiapan internal diperbolehkan, tetapi dokumen final harus mengikuti tahap pelimpahan/persidangan yang benar.';
  return 'Masih tahap konsultasi; gunakan sebagai analisis internal dan jangan menyatakan dokumen final siap diajukan.';
}

// ---------- Financial / collateral ----------

// ---------- Financial / collateral ----------

function moneyTerms(text: string) {
  return uniq(
    (
      text.match(
        /(?:Rp\.?\s?\d[\d.,]*(?:\s*(?:juta|miliar|ribu))?|\b\d+(?:[.,]\d+)?\s*(?:juta|miliar)\b)/gi,
      ) || []
    ).map(clean),
  ).slice(0, 24);
}
function matchedSnippets(text: string, re: RegExp, max = 12) {
  const out: string[] = [];
  const s = String(text || '');
  let m: RegExpExecArray | null;
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const rr = new RegExp(re.source, flags);
  while ((m = rr.exec(s)) && out.length < max) {
    const i = m.index;
    out.push(clean(s.slice(Math.max(0, i - 90), Math.min(s.length, i + 260))));
    if (rr.lastIndex === m.index) rr.lastIndex++;
  }
  return uniq(out);
}
function hasFinancialContent(text: string, collateral: string[], repayment: string[], discrepancy: string[]): boolean {
  if (moneyTerms(text).length > 0) return true;
  if (collateral.length > 0) return true;
  if (repayment.length > 0) return true;
  if (discrepancy.length > 0 && /\b(?:kredit|pinjaman|utang|piutang|agunan|jaminan)\b/i.test(text)) return true;
  return false;
}

// ---------- Witness classification ----------

function classifyWitness(actor: string, roles: string[]): { category: WitnessCategory; caution?: string } {
  const hay = `${actor} ${roles.join(' ')}`.toLowerCase();
  if (/penyidik|jaksa|penuntut\s+umum|hakim|panitera|polisi|penyidik\s+pegawai\s+negeri\s+sipil/.test(hay)) {
    return {
      category: 'PROCEDURAL_ACTOR',
      caution:
        'Aktor ini merupakan pejabat/prosedural. Kesaksiannya terbatas pada perbuatan yang dilakukan sendiri dalam kapasitas jabatan; tidak menggantikan pembuktian materiil dan tidak boleh dianggap pihak netral sepenuhnya.',
    };
  }
  if (/\bahli\b|expert|konsultan\s+teknis|auditor\s+eksternal|appraiser/.test(hay)) {
    return { category: 'EXPERT_WITNESS' };
  }
  if (/notaris|ppat|pejabat\s+pembuat\s+akta|pegawai\s+kua|dinas\s+pertanahan/.test(hay)) {
    return {
      category: 'DOCUMENT_CUSTODIAN',
      caution:
        'Saksi penyimpan/penerbit dokumen. Fokus pada keaslian, prosedur penerbitan, dan keberadaan arsip. Tidak menarik kesimpulan substantif atas sengketa.',
    };
  }
  return { category: 'FACT_WITNESS' };
}

function buildWitnessTargets(actorMatrix: any[], orientation: LawyerOrientation): WitnessPlanItem[] {
  return arr(actorMatrix)
    .slice(0, 12)
    .map((a: any) => {
      const roles = arr(a?.roles).map(clean).filter(Boolean);
      const witnessName = clean(a?.actor) || 'Aktor belum bernama';
      const { category, caution } = classifyWitness(witnessName, roles);

      const q: string[] = [];
      q.push('Kapasitas, jabatan, dan dasar pengetahuan langsung saksi atas peristiwa material.');
      q.push('Tindakan apa yang dilakukan sendiri oleh saksi dan tindakan apa yang hanya diketahui dari pihak lain.');

      if (/direktur|pimpinan|manajer|kepala|kredit|account officer|legal|penyidik|saksi/i.test(`${witnessName} ${roles.join(' ')}`)) {
        q.push('Pembagian kewenangan, SOP, alur persetujuan, serta siapa yang wajib melakukan verifikasi teknis.');
      }
      if (orientation === 'CRIMINAL_DEFENSE') {
        q.push('Fakta yang mendukung atau meniadakan unsur kesengajaan, keuntungan pribadi, perintah menyimpang, atau pengetahuan terdakwa.');
      }
      if (category === 'PROCEDURAL_ACTOR') {
        q.push('Batas kewenangan formal, prosedur yang wajib diikuti, dan letak penyimpangan (jika ada) dalam proses pemeriksaan.');
      }
      if (category === 'DOCUMENT_CUSTODIAN') {
        q.push('Prosedur penerbitan, penyimpanan, dan verifikasi keaslian dokumen yang berada dalam kewenangan saksi.');
      }

      const item: WitnessPlanItem = {
        witness: witnessName,
        roles,
        category,
        objectives: ['Uji pengetahuan langsung', 'Uji pembagian kewenangan', 'Konfirmasi/counter terhadap proposisi material'],
        question_themes: uniq(q),
        evidence_pages: arr(a?.pages)
          .map((x: any) => Number(x))
          .filter((x: number) => x > 0)
          .slice(0, 12),
      };
      if (caution) item.caution = caution;
      return item;
    });
}

// ---------- Case theory candidates ----------

function buildCaseTheoryCandidates(
  orientation: LawyerOrientation,
  proceduralStage: ProceduralStage,
  issues: any[],
  gaps: any[],
  adverse: any[],
): string[] {
  const out: string[] = [];
  const orientationTheory: Record<LawyerOrientation, string> = {
    CRIMINAL_DEFENSE: 'Hipotesis: konstruksi pembelaan terkuat adalah menyerang unsur subjektif/intent atau menempatkan tindakan sebagai pelaksanaan kewenangan jabatan yang sah.',
    CIVIL_PLAINTIFF: 'Hipotesis: konstruksi gugatan terkuat adalah membuktikan hubungan kontraktual/PMH dan kausalitas langsung terhadap kerugian yang dapat dinilai.',
    CIVIL_DEFENSE: 'Hipotesis: konstruksi pembelaan terkuat adalah mematahkan salah satu unsur gugatan (hubungan hukum, wanprestasi, kerugian, atau kausalitas).',
    ADMINISTRATIVE_RESPONSE: 'Hipotesis: konstruksi respons terkuat adalah mempersoalkan kewenangan, prosedur, atau tempus keputusan administratif.',
    GENERAL_COUNSEL_REVIEW: 'Hipotesis: konstruksi utama belum final; perlu pemetaan hubungan hukum dan kualifikasi sebelum memilih satu jalur.',
  };
  out.push(orientationTheory[orientation]);

  if (proceduralStage === 'INVESTIGATION') {
    out.push('Hipotesis: pendampingan pemeriksaan lebih tepat daripada penyusunan pledoi pada tahap ini.');
  } else if (proceduralStage === 'PLEADING') {
    out.push('Hipotesis: strategi pembelaan/pledoi diarahkan pada cacat formil dan/atau peniadaan unsur materiil.');
  } else if (proceduralStage === 'PRE_LITIGATION') {
    out.push('Hipotesis: upaya non-litigasi (somasi/mediasi) dapat mengubah posisi negosiasi sebelum perkara diajukan.');
  }

  for (const i of issues.slice(0, 4)) {
    const issueText = clean(i?.issue || i?.question || '');
    if (issueText.length >= 20) {
      out.push(`Hipotesis: ${issueText.slice(0, 220)}`);
    }
  }

  if (gaps.length) {
    out.push('Hipotesis: sebagian besar kelemahan posisi bersumber dari celah pembuktian, bukan pada norma itu sendiri.');
  }
  if (adverse.length) {
    out.push('Hipotesis: terdapat kemungkinan pihak lawan mengangkat counter-case dari bukti yang saat ini belum ditangani secara eksplisit.');
  }

  return uniq(out).slice(0, 8);
}

// ---------- Verification queue ----------

function buildVerificationQueue(
  issues: any[],
  laws: any[],
  adverse: any[],
  gaps: any[],
  documentMarkers: string[],
): string[] {
  const out: string[] = [];

  out.push('Verifikasi status berlaku, tempus, dan bunyi pasal pada sumber resmi (JDIH) sebelum mengutip norma sebagai rule final.');
  if (laws.length === 0) out.push('Belum ada instrumen beridentitas yang lolos gate; identifikasi norma yang benar-benar berlaku pada tempus perkara.');
  if (documentMarkers.length) out.push('Bandingkan setiap dokumen kunci dengan salinan asli untuk mengonfirmasi tanggal, nomor, dan penandatangan.');
  if (adverse.length) out.push('Uji setiap counter-evidence terhadap autentisitas, atribusi, kronologi, dan relevansi sebelum menetapkan treatment pembuktian.');
  if (gaps.length) out.push('Tutup setiap celah hukum yang teridentifikasi dengan bukti primer atau klarifikasi dari klien.');
  if (issues.length) out.push('Pastikan setiap isu hukum memiliki pemetaan eksplisit: unsur → bukti pendukung → counter-evidence → kesimpulan.');

  return uniq(out).slice(0, 8);
}

// ---------- Main ----------

export function buildLawyerWorkflow(input: {
  title: string;
  text: string;
  sourceRole: string;
  domainContext: any;
  evidence: any;
  legalIssues: any[];
  legalGaps: any[];
  adverseEvidence: any[];
  applicableLaw: any[];
  verifiedTimeline: any[];
  actorMatrix: any[];
}): LawyerWorkflowResult {
  const text = String(input.text || '');
  const { orientation, side, confidence } = orientationFrom(input.sourceRole, text);
  const proceduralStage = detectProceduralStage(input.sourceRole, text);
  const facts = arr(input.evidence?.textual_facts);
  const claims = arr(input.evidence?.party_claims);
  const adverse = arr(input.adverseEvidence);
  const issues = arr(input.legalIssues);
  const gaps = arr(input.legalGaps);
  const timeline = arr(input.verifiedTimeline);
  const actors = arr(input.actorMatrix);
  const laws = arr(input.applicableLaw);

  const collateral = matchedSnippets(text, /agunan|jaminan|fidusia|bpkb|sertifikat|collateral|nilai\s+taksasi/gi, 10);
  const repayment = matchedSnippets(text, /angsuran|pelunasan|lunas|jatuh\s+tempo|repayment|kemampuan\s+bayar|kredit\s+macet/gi, 10);
  const discrepancy = matchedSnippets(
    text,
    /tidak\s+sesuai|menyimpang|selisih|berbeda|tanpa\s+survei|belum\s+lengkap|tidak\s+lengkap|pemalsuan|palsu|anomali|temuan/gi,
    12,
  );
  const docs = uniq(
    (
      text.match(
        /(?:surat\s+(?:keputusan|edaran|perintah|penetapan|dakwaan)|berita\s+acara\s+pemeriksaan|BAP|akta|perjanjian\s+kredit|lembar\s+fiat|laporan\s+SPI|sertifikat|BPKB|dokumen\s+analisa)/gi,
      ) || []
    ).map(clean),
  ).slice(0, 24);

  const financialActive = hasFinancialContent(text, collateral, repayment, discrepancy);

  const allegation_response_matrix: AllegationResponseRow[] = issues.slice(0, 12).map((x: any) => {
    const issue = clean(x?.issue) || 'Isu belum bernama';
    const support: string[] = [];
    const counter: string[] = [];
    const unresolved: string[] = [];
    const basis = clean(x?.analysis);
    if (basis) support.push(basis);
    for (const a of adverse.slice(0, 3)) if (clean(a?.analysis || a?.statement)) counter.push(clean(a?.analysis || a?.statement));
    const relGaps = gaps
      .filter((g: any) =>
        clean(g?.gap)
          .toLowerCase()
          .split(/\s+/)
          .some((w: string) => w.length > 6 && issue.toLowerCase().includes(w)),
      )
      .slice(0, 3);
    unresolved.push(...relGaps.map((g: any) => clean(g?.gap)).filter(Boolean));
    if (!unresolved.length) unresolved.push('Uji silang fakta, provenance bukti, unsur hukum, dan counter-evidence sebelum posisi final.');
    return {
      issue,
      allegation_or_risk: issue,
      supporting_material: uniq(support).slice(0, 4),
      counter_material: uniq(counter).slice(0, 4),
      unresolved: uniq(unresolved),
      verification: 'PENDING_PROFESSIONAL_VERIFICATION',
    };
  });

  const authority_duty_matrix = actors.slice(0, 12).map((a: any) => ({
    actor: clean(a?.actor) || 'Aktor belum bernama',
    roles: arr(a?.roles).map(clean).filter(Boolean),
    authority_question:
      'Apa sumber kewenangan formal aktor ini, batas kewenangannya, dan keputusan apa yang memang menjadi tanggung jawabnya?',
    operational_duty_question:
      'Tindakan teknis apa yang wajib dilakukan sendiri, dapat didelegasikan, atau harus diverifikasi oleh unit/aktor lain?',
    verification: 'Cocokkan dengan SOP, SK kewenangan, uraian jabatan, dokumen persetujuan, dan keterangan saksi.',
  }));

  const expert_domains: string[] = [];
  if (/kredit|bank|bpr|agunan|fidusia|loan|ldr|5c/i.test(text)) expert_domains.push('Perbankan / manajemen risiko kredit');
  if (/korupsi|tipikor|pidana|tersangka|terdakwa|mens\s+rea/i.test(text)) expert_domains.push('Hukum pidana / tindak pidana korupsi');
  if (/akuntansi|kerugian\s+(?:negara|keuangan)|audit|laporan\s+keuangan/i.test(text))
    expert_domains.push('Akuntansi forensik / kerugian keuangan');
  if (/fidusia|agunan|jaminan/i.test(text)) expert_domains.push('Jaminan kebendaan / fidusia');

  // ---- Stages ----
  const draftingStatus = draftingStageStatus(proceduralStage, issues.length);
  const stages: LawyerWorkflowStage[] = [
    {
      id: 'case-role',
      label: 'Assessing Case Role',
      objective: 'Tetapkan posisi klien, tahap perkara, lawan proses, dan tujuan representasi.',
      status: confidence === 'LOW' ? 'PARTIAL' : 'READY',
      evidence_basis: [`source_role=${input.sourceRole}`, `orientation=${orientation}`, `procedural_stage=${proceduralStage}`, `represented_side=${side}`],
      outputs: ['Case role assessment', 'Mandate boundary', 'Immediate defense/claim objectives'],
    },
    {
      id: 'scope-source',
      label: 'Memeriksa Cakupan & Sumber Data',
      objective: 'Inventarisasi sumber, coverage, provenance, serta bagian yang belum tersedia.',
      status: facts.length + claims.length > 0 ? 'READY' : 'PARTIAL',
      evidence_basis: [`facts=${facts.length}`, `claims=${claims.length}`, `timeline=${timeline.length}`],
      outputs: ['Source inventory', 'Coverage gaps', 'Verification queue'],
    },
    {
      id: 'fact-matrix',
      label: 'Organizing Legal Facts & Chronology',
      objective: 'Pisahkan fakta tekstual, klaim pihak, counter-evidence, aktor, dan rangkaian waktu.',
      status: timeline.length || facts.length || claims.length ? 'READY' : 'PARTIAL',
      evidence_basis: [`actors=${actors.length}`, `timeline=${timeline.length}`],
      outputs: ['Fact table', 'Actor-action-evidence matrix', 'Chronology'],
    },
    {
      id: 'allegation-matrix',
      label: 'Evaluating Allegations & Counter-Arguments',
      objective: 'Petakan setiap tuduhan/isu terhadap evidence support, counter-evidence, unsur, dan celah.',
      status: issues.length ? 'READY' : 'BLOCKED',
      evidence_basis: [`issues=${issues.length}`, `adverse=${adverse.length}`, `gaps=${gaps.length}`],
      outputs: ['Allegation-response matrix', 'Element-by-element defense/claim map', 'Adverse-evidence treatment'],
    },
    {
      id: 'authority-duty',
      label: 'Examining Authority & Operational Duties',
      objective: 'Bedakan keputusan manajerial, kewajiban teknis, delegasi, approval chain, dan tanggung jawab personal.',
      status: actors.length >= 2 ? 'READY' : 'PARTIAL',
      evidence_basis: [`actors=${actors.length}`],
      outputs: ['Authority-duty matrix', 'Approval-chain questions', 'Delegation verification'],
    },
    {
      id: 'financial-collateral',
      label: 'Evaluating Financial & Collateral Data',
      objective: 'Uji nominal, aliran dana, repayment, agunan, taksasi, discrepancy, dan kemungkinan personal gain.',
      status: financialActive ? 'READY' : 'PARTIAL',
      evidence_basis: financialActive
        ? [`amounts=${moneyTerms(text).length}`, `collateral=${collateral.length}`, `repayment=${repayment.length}`, `discrepancies=${discrepancy.length}`]
        : ['no-financial-content-detected'],
      outputs: financialActive
        ? ['Financial figure list', 'Collateral/security audit', 'Repayment/discrepancy audit', 'Personal-gain inquiry']
        : ['Financial audit intentionally inactive — no financial/collateral content in source.'],
    },
    {
      id: 'document-integrity',
      label: 'Reviewing Document Integrity & Procedure',
      objective: 'Periksa keaslian, tanggal, signature/approval, konsistensi antar dokumen, dan procedural compliance.',
      status: docs.length ? 'READY' : 'PARTIAL',
      evidence_basis: [`document_markers=${docs.length}`],
      outputs: ['Document integrity checklist', 'Procedure exceptions', 'Citation/source verification'],
    },
    {
      id: 'witness-strategy',
      label: 'Planning Witness & Expert Strategy',
      objective: 'Tentukan saksi fakta, saksi meringankan/pendukung, ahli, tujuan pemeriksaan, dan tema pertanyaan.',
      status: actors.length ? 'READY' : 'PARTIAL',
      evidence_basis: [`witness_targets=${Math.min(12, actors.length)}`, `expert_domains=${expert_domains.length}`],
      outputs: ['Witness map with category & caution', 'Question themes', 'Expert recommendation'],
    },
    {
      id: 'drafting',
      label: 'Drafting Legal Response',
      objective: 'Turunkan hasil analisis menjadi dokumen litigasi/pendampingan yang sesuai tahap perkara.',
      status: draftingStatus,
      evidence_basis: [`law_candidates=${laws.length}`, `issues=${issues.length}`, `procedural_stage=${proceduralStage}`, `procedural_drafting_status=${draftingStatus}`],
      outputs: ['Chronology memo', 'Evidence map', 'Legal response/objection/defense outline', 'Witness question set'],
    },
    {
      id: 'verification',
      label: 'Verifying Sources, Citations & Next Step',
      objective: 'Jangan finalisasi sebelum norma, pasal, tempus, dokumen primer, dan fakta kritis lolos verifikasi.',
      status: laws.length ? 'PARTIAL' : 'BLOCKED',
      evidence_basis: [`law_candidates=${laws.length}`, `pending_verifications=${issues.length + gaps.length}`],
      outputs: ['Professional verification queue', 'Critical unresolved questions', 'Next-action priorities'],
    },
  ];

  // ---- Drafting plan with stage guards ----
  const drafting_plan: DraftingPlanItem[] = [
    {
      document: 'Matriks kronologi fakta hukum',
      purpose: 'Menghubungkan peristiwa, aktor, dokumen, dan relevansi litigasi.',
      priority: 'P1',
      depends_on: ['timeline', 'source verification'],
      stage_guard: 'Valid untuk semua tahap perkara.',
    },
    {
      document: 'Peta pembuktian / allegation-response matrix',
      purpose: 'Membandingkan konstruksi lawan dengan counter-evidence dan gap pembuktian.',
      priority: 'P1',
      depends_on: ['issues', 'adverse evidence', 'legal elements'],
      stage_guard: 'Valid untuk semua tahap perkara.',
    },
    {
      document:
        orientation === 'CRIMINAL_DEFENSE'
          ? 'Catatan pendampingan pemeriksaan (BAP)'
          : 'Catatan strategi posisi hukum',
      purpose:
        orientation === 'CRIMINAL_DEFENSE'
          ? 'Mendampingi klien selama pemeriksaan penyidik; catat pertanyaan, jawaban, dan pelanggaran prosedur.'
          : 'Menetapkan teori perkara, argumen utama, risiko, dan jalur alternatif.',
      priority: 'P1',
      depends_on: ['fact matrix', 'procedural stage'],
      stage_guard: orientation === 'CRIMINAL_DEFENSE'
        ? 'Jangan otomatis menyusun pledoi/eksepsi selama perkara masih pada tahap pendampingan pemeriksaan; tunggu tahap yang secara prosedural mendukung.'
        : `Catatan strategi bersifat internal. ${stageDraftGuard(proceduralStage)}`,
    },
    {
      document: 'Daftar pertanyaan saksi & rencana ahli',
      purpose: 'Menguji pembagian kewenangan, pengetahuan langsung, dokumen, dan unsur material.',
      priority: 'P2',
      depends_on: ['witness map', 'authority-duty matrix'],
      stage_guard: 'Sesuaikan dengan tahap pemeriksaan saksi di persidangan; jangan membocorkan strategi ke pihak lawan.',
    },
    {
      document: stageDraftDocument(orientation, proceduralStage),
      purpose: 'Mengubah hasil analisis menjadi dokumen yang tepat untuk posture/tahap prosedural yang terdeteksi.',
      priority: 'P2',
      depends_on: ['procedural posture', 'verified citations'],
      stage_guard: stageDraftGuard(proceduralStage),
    },
  ];

  const case_theory_candidates = buildCaseTheoryCandidates(orientation, proceduralStage, issues, gaps, adverse);
  const verification_queue = buildVerificationQueue(issues, laws, adverse, gaps, docs);

  const next_actions = uniq([
    'Kunci posisi klien, tahap perkara, dan target hasil sebelum memilih dokumen atau remedy.',
    'Bangun satu matriks aktor → tindakan → kewenangan → bukti → isu → unsur/norma.',
    'Pisahkan setiap tuduhan dari fakta yang benar-benar terverifikasi; tandai semua dalil yang masih claim-only.',
    'Uji approval chain dan pembagian tugas teknis vs keputusan manajerial menggunakan SOP/SK/uraian jabatan.',
    financialActive
      ? 'Rekonsiliasi seluruh nominal, aliran dana, repayment, agunan, nilai taksasi, serta kemungkinan keuntungan pribadi.'
      : 'Tidak ada unsur finansial yang perlu diaudit pada sumber ini; jangan memaksakan analisis kredit/agunan.',
    'Siapkan saksi fakta, saksi pendukung/a de charge bila relevan, ahli, dan pertanyaan berbasis tujuan pembuktian.',
    'Verifikasi citation, status berlaku, tempus, dan bunyi pasal sebelum memasukkan rule ke pleading final.',
  ]);

  return {
    version: '1.1',
    orientation,
    procedural_stage: proceduralStage,
    represented_side_hint: side,
    role_confidence: confidence,
    mandate_summary: `Analisis diarahkan sebagai ${orientation
      .replace(/_/g, ' ')
      .toLowerCase()} pada tahap ${proceduralStage.replace(/_/g, ' ').toLowerCase()} dengan fokus pada posisi klien, matriks fakta-bukti, allegation/counter-case, kewenangan, pembuktian, saksi, dan drafting yang sesuai tahap perkara.`,
    stages,
    allegation_response_matrix,
    authority_duty_matrix,
    financial_collateral_audit: {
      active: financialActive,
      amounts: moneyTerms(text),
      collateral_terms: collateral,
      repayment_terms: repayment,
      discrepancy_terms: discrepancy,
      review_questions: financialActive
        ? [
            'Apakah seluruh angka pada BAP/dokumen konsisten dengan perjanjian, ledger, appraisal, dan bukti pembayaran?',
            'Apakah agunan benar ada, sah, terikat, dapat dieksekusi, dan nilainya relevan pada tempus yang diperiksa?',
            'Apakah terdapat aliran manfaat langsung/tidak langsung kepada pengambil keputusan atau pihak terkait?',
            'Apakah kerugian yang didalilkan actual, potential, recoverable, atau masih bergantung pada eksekusi/remedy lain?',
          ]
        : [],
    },
    document_integrity_audit: {
      document_markers: docs,
      integrity_questions: [
        'Apakah dokumen primer tersedia dalam versi asli/terverifikasi?',
        'Apakah tanggal, nomor, penandatangan, paraf, lampiran, dan urutan approval konsisten?',
        'Apakah ada perubahan, kekosongan, salah input, backdating, atau inkonsistensi antar salinan?',
        'Apakah suatu tanda tangan membuktikan persetujuan substantif atau hanya acknowledgment/manajerial?',
      ],
    },
    witness_strategy: {
      witness_targets: buildWitnessTargets(actors, orientation),
      expert_domains: uniq(expert_domains),
    },
    drafting_plan,
    case_theory_candidates,
    verification_queue,
    next_actions,
  };
}