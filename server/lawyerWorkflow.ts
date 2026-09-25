import { resolveProceduralPosture, type ProceduralStage } from './proceduralPosture';
export type LawyerOrientation =
  | 'CRIMINAL_DEFENSE'
  | 'CIVIL_PLAINTIFF'
  | 'CIVIL_DEFENSE'
  | 'ADMINISTRATIVE_RESPONSE'
  | 'GENERAL_COUNSEL_REVIEW';

export type { ProceduralStage } from './proceduralPosture';

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
  if(sourceRole==='DEFENSE_SUBMISSION_WITH_EXHIBITS')return {orientation:'CIVIL_DEFENSE',side:'Tergugat/Termohon atau pihak yang membantah klaim',confidence:'HIGH'};
  if(sourceRole==='COMPLAINT_OR_PETITION')return {orientation:'CIVIL_PLAINTIFF',side:'Penggugat/Pemohon atau pihak yang mengajukan klaim',confidence:'MEDIUM'};
  // Outside a litigation-role source, mere mention or definition of party labels
  // is not a representation signal. Prefer explicit counsel/self-identification;
  // if both sides are merely defined, remain neutral instead of picking the first branch.
  const counselDefense=/\b(?:kuasa\s+hukum|kami\s+selaku|bertindak\s+untuk\s+dan\s+atas\s+nama)\s+(?:para\s+)?tergugat\b/.test(t);
  const counselPlaintiff=/\b(?:kuasa\s+hukum|kami\s+selaku|bertindak\s+untuk\s+dan\s+atas\s+nama)\s+(?:para\s+)?penggugat\b/.test(t);
  if(counselDefense&&!counselPlaintiff) return {orientation:'CIVIL_DEFENSE',side:'Tergugat/Termohon atau pihak yang membantah klaim',confidence:'MEDIUM'};
  if(counselPlaintiff&&!counselDefense) return {orientation:'CIVIL_PLAINTIFF',side:'Penggugat/Pemohon atau pihak yang mengajukan klaim',confidence:'MEDIUM'};
  const definedDefense=/\bselanjutnya\s+disebut\s+(?:sebagai\s+)?tergugat\b/.test(t);
  const definedPlaintiff=/\bselanjutnya\s+disebut\s+(?:sebagai\s+)?penggugat\b/.test(t);
  if(definedDefense!==definedPlaintiff) return definedDefense
    ? {orientation:'CIVIL_DEFENSE',side:'Tergugat/Termohon yang teridentifikasi eksplisit; konfirmasi mandat representasi',confidence:'LOW'}
    : {orientation:'CIVIL_PLAINTIFF',side:'Penggugat/Pemohon yang teridentifikasi eksplisit; konfirmasi mandat representasi',confidence:'LOW'};
  if(/keputusan\s+tata\s+usaha|pejabat\s+tata\s+usaha|keberatan\s+administratif|banding\s+administratif/.test(t))return {orientation:'ADMINISTRATIVE_RESPONSE',side:'Pihak dalam sengketa/keberatan administratif',confidence:'MEDIUM'};
  return {orientation:'GENERAL_COUNSEL_REVIEW',side:'Pihak yang memerlukan analisis dan strategi hukum',confidence:'LOW'};
}

// ---------- Procedural stage ----------

// ---------- Procedural stage ----------

function detectProceduralStage(sourceRole:string,text:string,title=''):ProceduralStage{
  return resolveProceduralPosture({title,text,sourceRole}).stage;
}

function draftingStageStatus(stage: ProceduralStage, issueCount: number, proceduralAuthorityReady:boolean): LawyerWorkflowStage['status'] {
  if (issueCount <= 0) return 'BLOCKED';
  // Stage-sensitive filings must not be called READY merely because an issue
  // exists. They depend on at least one Section III authority that actually
  // survived issue binding and carries procedural nexus for this posture.
  if (['APPEAL','EXECUTION'].includes(stage) && !proceduralAuthorityReady) return 'PARTIAL';
  if (['PRE_LITIGATION','EVIDENCE_HEARING','PLEADING','APPEAL','EXECUTION'].includes(stage)) return 'READY';
  // INVESTIGATION / PROSECUTION may support internal preparation, but a final
  // pleading is procedurally premature. CONSULTATION likewise remains internal.
  return 'PARTIAL';
}

function hasStageProceduralAuthority(stage:ProceduralStage,laws:any[]):boolean{
  if(!['APPEAL','EXECUTION'].includes(stage)) return true;
  const hay=laws.map((x:any)=>`${clean(x?.regulation)} ${clean(x?.source)} ${clean(x?.article)} ${clean(x?.relevance)}`).join(' ').toLowerCase();
  // A generic mention of "hukum acara/peradilan" is not enough to make a
  // stage-specific filing READY.  The surviving Section III authority must
  // carry stage-specific nexus.
  if(stage==='APPEAL') return /banding|kasasi|peninjauan kembali|\bpk\b|verzet|tenggang\s+upaya\s+hukum/.test(hay);
  if(stage==='EXECUTION') return /eksekusi|aanmaning|sita\s+eksekusi|pelelangan|dasar\s+eksekutorial/.test(hay);
  return true;
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

interface FinancialSignalProfile {
  active: boolean;
  amounts: string[];
  collateral: string[];
  repayment: string[];
  discrepancies: string[];
  payment_flow: string[];
  valuation: string[];
  account_records: string[];
  personal_gain: string[];
  credit_relationship: string[];
  review_questions: string[];
  outputs: string[];
  detected_labels: string[];
}

function sentenceLikeSegments(text:string):string[]{
  return String(text||'')
    .replace(/---\s*HALAMAN\s+\d+\s*---/gi,' . ')
    .split(/(?<=[.!?;])\s+|\n+/)
    .map(clean)
    .filter(x=>x.length>=8);
}

function positiveFinancialText(text:string):string{
  const finance=/kredit|pinjaman|utang|piutang|debitur|kreditur|angsuran|pelunasan|agunan|jaminan|fidusia|hak\s+tanggungan|dijaminkan|diagunkan|bpkb|rekening|transfer|pembayaran|pencairan|taksasi|appraisal|bank|bpr|transaksi\s+keuangan/i;
  return sentenceLikeSegments(text)
    .filter(seg=>{
      if(!finance.test(seg)) return true;
      // Scope absence only to the clause it governs. A list such as
      // "tidak ada tanah, sertifikat, bank, kredit atau agunan" must not
      // activate finance, while a contrast such as "tidak ada tanah, tetapi
      // kredit bank tetap ada" must preserve the asserted credit clause.
      const asserted=seg
        .replace(/\btidak\s+ada\b[^.;]*?(?=\b(?:namun|tetapi|sedangkan|melainkan)\b|[.;]|$)/gi,' ')
        .replace(/\btanpa\s+(?:data\s+|bukti\s+|hubungan\s+)?(?:kredit|pinjaman|agunan|jaminan|transfer|transaksi(?:\s+keuangan)?|bank|pembiayaan)\b/gi,' ')
        .replace(/\s+/g,' ')
        .trim();
      return finance.test(asserted);
    })
    .join(' . ');
}

function contextualFinancialDiscrepancies(text:string):string[]{
  const discrepancy=/tidak\s+sesuai|tidak\s+diulang|tidak\s+dilakukan|tanpa\s+(?:survei|survey|verifikasi)|pengurangan\s+provisi|menyimpang|selisih|berbeda|belum\s+lengkap|tidak\s+lengkap|pemalsuan|palsu|anomali|temuan|data\s+tidak\s+benar/i;
  const finance=/kredit|pinjaman|utang|piutang|debitur|kreditur|angsuran|pelunasan|agunan|jaminan|fidusia|hak\s+tanggungan|dijaminkan|diagunkan|bpkb|rekening|transfer|pembayaran|pencairan|taksasi|appraisal|bank|bpr/i;
  const financeProcedure=/survei|survey|dokumen\s+administrasi|kelengkapan|analisa\s+kredit|analisis\s+kredit|\b5c\b|sop|verifikasi|lembar\s+fiat|approval|persetujuan|provisi|plafond|repayment\s+capacity|kepatuhan/i;
  // Called only after a strong financial core has been established. Operational
  // deviations may therefore be material even when the sentence itself omits
  // the word "kredit" (e.g. "survei tidak diulang" / "dokumen belum lengkap").
  return uniq(sentenceLikeSegments(text).filter(x=>discrepancy.test(x)&&(finance.test(x)||financeProcedure.test(x)))).slice(0,12);
}

function buildFinancialSignalProfile(text:string):FinancialSignalProfile{
  const positiveText=positiveFinancialText(text);
  const collateral=matchedSnippets(positiveText,/agunan|jaminan|dijaminkan|diagunkan|fidusia|hak\s+tanggungan|bpkb|collateral|nilai\s+taksasi|sertifikat[^.;]{0,100}(?:agunan|jaminan|hak\s+tanggungan)|(?:agunan|jaminan)[^.;]{0,100}sertifikat/gi,10);
  const creditRelationship=matchedSnippets(positiveText,/\b(?:kredit|pinjaman|fasilitas\s+kredit|perjanjian\s+kredit|pembiayaan)\b/gi,10);
  const accountRecords=matchedSnippets(positiveText,/ledger|buku\s+besar|jurnal\s+akuntansi|rekening\s+koran|mutasi\s+rekening|general\s+ledger/gi,8);
  const strongFinanceCore=collateral.length>0||creditRelationship.length>0||accountRecords.length>0||/transaksi\s+keuangan|aliran\s+dana|rekening\s+bank/i.test(positiveText);
  const repayment=strongFinanceCore?matchedSnippets(positiveText,/angsuran|pelunasan|lunas|jatuh\s+tempo|repayment|kemampuan\s+bayar|kredit\s+macet/gi,10):[];
  const paymentFlow=strongFinanceCore?matchedSnippets(positiveText,/transfer|pencairan|pembayaran|bukti\s+bayar|bukti\s+pembayaran|rekening\s+koran|mutasi\s+rekening|aliran\s+dana/gi,10):[];
  const valuation=strongFinanceCore?matchedSnippets(positiveText,/nilai\s+taksasi|taksasi|appraisal|penilaian\s+agunan|nilai\s+jaminan/gi,8):[];
  const personalGain=strongFinanceCore?matchedSnippets(positiveText,/keuntungan\s+pribadi|personal\s+gain|kickback|fee\s+pribadi|komisi[^.;]{0,60}(?:pribadi|diterima)|aliran\s+dana[^.;]{0,80}(?:kepada|ke)\s+(?:pengambil\s+keputusan|pejabat|direktur|pengurus)/gi,8):[];
  const discrepancies=strongFinanceCore?contextualFinancialDiscrepancies(positiveText):[];
  const active=strongFinanceCore;
  const amounts=active?moneyTerms(positiveText):[];
  const review_questions:string[]=[];
  const outputs:string[]=[];
  const labels:string[]=[];

  if(creditRelationship.length){
    labels.push('hubungan kredit/pinjaman');
    outputs.push('Pemetaan hubungan kredit/pinjaman');
    review_questions.push('Apa dasar hubungan kredit/pinjaman, siapa para pihaknya, dan dokumen apa yang membuktikan pencairan serta kewajiban pembayaran?');
  }
  if(collateral.length){
    labels.push('agunan/jaminan');
    outputs.push('Audit kewenangan dan pengikatan agunan');
    review_questions.push('Apakah objek yang disebut sebagai agunan/jaminan benar dapat dijaminkan oleh pihak tersebut, dan dokumen apa yang membuktikan kewenangan serta pengikatannya?');
  }
  if(repayment.length){
    labels.push('angsuran/pelunasan');
    outputs.push('Rekonsiliasi kewajiban dan pembayaran kembali');
    review_questions.push('Apa kewajiban yang telah jatuh tempo, pembayaran apa yang benar-benar telah dilakukan, dan bukti primer apa yang merekonsiliasikannya?');
  }
  if(paymentFlow.length){
    labels.push('pembayaran/aliran dana');
    outputs.push('Rekonsiliasi pembayaran/aliran dana');
    review_questions.push('Apakah pembayaran atau transfer yang disebut dapat ditelusuri ke bukti transaksi dan pihak penerima yang benar?');
  }
  if(valuation.length){
    labels.push('taksasi/appraisal');
    outputs.push('Verifikasi nilai taksasi/appraisal');
    review_questions.push('Apakah nilai taksasi/appraisal berasal dari penilaian yang sah dan relevan pada tanggal material perkara?');
  }
  if(accountRecords.length){
    labels.push('catatan rekening/ledger');
    outputs.push('Rekonsiliasi catatan rekening/ledger');
    review_questions.push('Apakah catatan rekening/ledger yang disebut konsisten dengan transaksi dan saldo yang dipersoalkan?');
  }
  if(personalGain.length){
    labels.push('manfaat pribadi');
    outputs.push('Penelusuran manfaat pribadi');
    review_questions.push('Apakah ada bukti langsung aliran manfaat pribadi kepada pengambil keputusan atau pihak terkait, dan bagaimana atribusinya?');
  }
  if(discrepancies.length){
    labels.push('ketidaksesuaian finansial/agunan');
    outputs.push('Uji ketidaksesuaian finansial/agunan');
    review_questions.push('Ketidaksesuaian mana yang benar-benar berkaitan dengan hubungan keuangan/agunan, dan bukti primer apa yang mengonfirmasi atau membantahnya?');
  }
  if(amounts.length){
    outputs.push('Daftar nominal yang terkait konteks finansial');
    review_questions.push('Nominal mana yang merupakan pokok kewajiban, pembayaran, nilai agunan, atau kerugian; dan jangan mencampurkannya dengan biaya perkara atau nominal lain yang tidak terkait?');
  }

  return {
    active, amounts, collateral, repayment, discrepancies, payment_flow:paymentFlow,
    valuation, account_records:accountRecords, personal_gain:personalGain,
    credit_relationship:creditRelationship, review_questions:uniq(review_questions),
    outputs:uniq(outputs), detected_labels:uniq(labels),
  };
}

function actorRoleText(a:any):string {
  return `${clean(a?.actor)} ${arr(a?.roles).map(clean).join(' ')}`.toLowerCase();
}

function isExplicitWitnessCandidate(a:any):boolean {
  const hay=actorRoleText(a);
  if (/\bsaksi\b|saksi\s+fakta|saksi\s+ahli|expert|ahli\s+(?:forensik|pidana|perdata|pertanahan|kedokteran|akuntansi|digital)/i.test(hay)) return true;
  if (/notaris|ppat|pejabat\s+pembuat\s+akta|pegawai\s+kua|petugas\s+bpn|kantor\s+pertanahan|penyidik|polisi|jaksa|panitera/i.test(hay)) return true;
  return false;
}

function isOperationalFactWitnessCandidate(a:any):boolean {
  const hay=actorRoleText(a);
  // Material operational roles can be fact witnesses even when the source does
  // not literally label them "saksi". Keep this narrow: require a concrete
  // process/verification role, not merely corporate seniority or party status.
  return /kabag|kepala\s+bagian|tim\s+kredit|account\s+officer|analis(?:is)?\s+kredit|surveyor|petugas\s+survei|staf\s+kredit|legal|compliance|kepatuhan|spi|audit(?:or)?\s+internal|pemasaran/i.test(hay);
}

function isPartyCounselOrRepresentativeOnly(a:any):boolean {
  const hay=actorRoleText(a);
  const excluded=/\b(?:penggugat|tergugat|pemohon|termohon|penggugat\s+rekonvensi|tergugat\s+rekonvensi|pemberi\s+kuasa|penerima\s+kuasa|kuasa\s+hukum|advokat|pengacara|klien|janda|duda|suami|istri|ahli\s+waris)\b/i.test(hay);
  return excluded && !isExplicitWitnessCandidate(a);
}

function hasFormalAuthorityRole(a:any):boolean {
  const hay=actorRoleText(a);
  return /direktur|komisaris|pengurus|ketua|sekretaris|bendahara|pejabat|notaris|ppat|pemberi\s+kuasa|penerima\s+kuasa|kuasa\s+hukum|advokat|wali|kurator|likuidator|penyidik|jaksa|bpn|kantor\s+pertanahan/i.test(hay);
}


function authorityQuestionsForActor(a:any):{authority_question:string;operational_duty_question:string;verification:string}{
  const hay=actorRoleText(a);
  if(/pemberi\s+kuasa|penerima\s+kuasa|kuasa\s+hukum|advokat|pengacara/.test(hay)){
    return {
      authority_question:'Apa dasar dan ruang lingkup kuasa/representasi aktor ini, tindakan apa yang secara formil dicakup, dan adakah tindakan yang melampaui mandat?',
      operational_duty_question:'Tindakan prosedural apa yang boleh dilakukan berdasarkan kuasa yang ada, dan dokumen apa yang harus ditandatangani atau dikonfirmasi oleh pemberi kuasa sendiri?',
      verification:'Cocokkan dengan surat kuasa, identitas pihak, tanggal, lingkup tindakan, tanda tangan, dan ketentuan formil yang relevan.',
    };
  }
  if(/notaris|ppat|bpn|kantor\s+pertanahan|pejabat/.test(hay)){
    return {
      authority_question:'Apa kewenangan jabatan aktor ini terhadap tindakan/dokumen yang dipersoalkan dan apa batas kewenangan tersebut pada tempus perkara?',
      operational_duty_question:'Prosedur penerbitan, pemeriksaan, pencatatan, atau verifikasi apa yang wajib dilakukan oleh aktor ini sendiri atau unit terkait?',
      verification:'Cocokkan dengan dasar kewenangan jabatan, arsip/dokumen penerbitan, prosedur resmi, dan catatan tindakan yang benar-benar dilakukan.',
    };
  }
  return {
    authority_question:'Apa sumber kewenangan formal aktor ini, batas kewenangannya, dan keputusan apa yang memang menjadi tanggung jawabnya?',
    operational_duty_question:'Tindakan teknis apa yang wajib dilakukan sendiri, dapat didelegasikan, atau harus diverifikasi oleh unit/aktor lain?',
    verification:'Cocokkan dengan instrumen kewenangan, pembagian tugas, dokumen persetujuan, dan bukti tindakan aktual.',
  };
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
    // High-precision witness policy: an actor is not a witness merely because
    // they appear in the actor matrix. Parties, counsel, representatives and
    // family-status labels are excluded unless the source explicitly identifies
    // a witness/expert/custodian/procedural role.
    .filter((a:any)=>(isExplicitWitnessCandidate(a) || isOperationalFactWitnessCandidate(a)) && !isPartyCounselOrRepresentativeOnly(a))
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
    CIVIL_PLAINTIFF: 'Hipotesis: konstruksi gugatan harus mengikuti hubungan hukum dan isu material yang benar-benar terdeteksi, lalu menghubungkan tindakan, hak yang dilanggar, bukti, akibat, dan remedy tanpa memaksakan wanprestasi atau PMH bila basisnya tidak ada.',
    CIVIL_DEFENSE: 'Hipotesis: konstruksi pembelaan harus menargetkan unsur gugatan yang benar-benar didalilkan dan didukung bukti; jangan mengasumsikan wanprestasi, PMH, atau kerugian bila tidak muncul dari materi perkara.',
    ADMINISTRATIVE_RESPONSE: 'Hipotesis: konstruksi respons terkuat adalah mempersoalkan kewenangan, prosedur, atau tempus keputusan administratif.',
    GENERAL_COUNSEL_REVIEW: 'Hipotesis: konstruksi utama belum final; perlu pemetaan hubungan hukum dan kualifikasi sebelum memilih satu jalur.',
  };
  out.push(orientationTheory[orientation]);

  if (proceduralStage === 'INVESTIGATION') {
    out.push('Hipotesis: pendampingan pemeriksaan lebih tepat daripada penyusunan pledoi pada tahap ini.');
  } else if (proceduralStage === 'PLEADING') {
    if (orientation === 'CRIMINAL_DEFENSE') out.push('Hipotesis: strategi pleading pidana harus mengikuti tahap dan dakwaan yang nyata; uji cacat formil dan unsur materiil tanpa mendahului agenda persidangan.');
    else if (orientation === 'CIVIL_PLAINTIFF') out.push('Hipotesis: gugatan/replik harus mempertahankan teori perkara yang konsisten dengan fakta, bukti, petitum, dan norma yang benar-benar terverifikasi.');
    else if (orientation === 'CIVIL_DEFENSE') out.push('Hipotesis: jawaban/duplik harus menanggapi dalil lawan per unsur, dengan bukti tandingan dan keberatan formil hanya jika memang ada basisnya.');
    else out.push('Hipotesis: dokumen pleading harus mengikuti posisi pihak dan isu material yang benar-benar terdeteksi.');
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
  const proceduralStage = detectProceduralStage(input.sourceRole, text, input.title);
  const facts = arr(input.evidence?.textual_facts);
  const claims = arr(input.evidence?.party_claims);
  const adverse = arr(input.adverseEvidence);
  const issues = arr(input.legalIssues);
  const gaps = arr(input.legalGaps);
  const timeline = arr(input.verifiedTimeline);
  const actors = arr(input.actorMatrix);
  const laws = arr(input.applicableLaw);
  const proceduralAuthorityReady = hasStageProceduralAuthority(proceduralStage, laws);

  const financialProfile = buildFinancialSignalProfile(text);
  const collateral = financialProfile.collateral;
  const repayment = financialProfile.repayment;
  const discrepancy = financialProfile.discrepancies;
  const docs = uniq(
    (
      text.match(
        /(?:surat\s+(?:keputusan|edaran|perintah|penetapan|dakwaan)|berita\s+acara\s+pemeriksaan|BAP|akta|perjanjian\s+kredit|lembar\s+fiat|laporan\s+SPI|sertifikat|BPKB|dokumen\s+analisa)/gi,
      ) || []
    ).map(clean),
  ).slice(0, 24);

  const financialActive = financialProfile.active;

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

  const representationDisputed=/surat\s+kuasa[^.;]{0,120}(?:tidak\s+sah|cacat|dipersoalkan|dibantah)|melampaui\s+(?:batas\s+)?kuasa|tanpa\s+kuasa|penerima\s+kuasa[^.;]{0,100}tidak\s+berwenang/i.test(text);
  const authorityActors=actors.filter((a:any)=>{
    if(!hasFormalAuthorityRole(a)) return false;
    const hay=actorRoleText(a);
    const representative=/pemberi\s+kuasa|penerima\s+kuasa|kuasa\s+hukum|advokat|pengacara/.test(hay);
    return !representative || representationDisputed;
  }).slice(0,12);
  const authority_duty_matrix = authorityActors.map((a: any) => ({
    actor: clean(a?.actor) || 'Aktor belum bernama',
    roles: arr(a?.roles).map(clean).filter(Boolean),
    ...authorityQuestionsForActor(a),
  }));
  const authorityRoleText=authorityActors.map(actorRoleText).join(' ');
  const managerialAuthority=/direktur|komisaris|pengurus|ketua|sekretaris|bendahara|manajer|kepala/.test(authorityRoleText);
  const representationAuthority=/pemberi\s+kuasa|penerima\s+kuasa|kuasa\s+hukum|advokat|pengacara/.test(authorityRoleText);

  const expert_domains: string[] = [];
  const trueCreditContext=/kredit|pinjaman|debitur|kreditur|fasilitas\s+kredit|perjanjian\s+kredit|pembiayaan|angsuran|pelunasan/i.test(text);
  if (trueCreditContext) expert_domains.push('Perbankan / hubungan kredit');
  if (/korupsi|tipikor|tersangka|terdakwa|mens\s+rea/i.test(text)) expert_domains.push('Hukum pidana / tindak pidana korupsi');
  if (/akuntansi|kerugian\s+(?:negara|keuangan)|audit\s+keuangan|laporan\s+keuangan/i.test(text))
    expert_domains.push('Akuntansi forensik / kerugian keuangan');
  if (/fidusia|hak\s+tanggungan|agunan|jaminan/i.test(text)) expert_domains.push('Jaminan kebendaan');

  // ---- Stages ----
  const witnessTargets=buildWitnessTargets(actors, orientation);
  const draftingStatus = draftingStageStatus(proceduralStage, issues.length, proceduralAuthorityReady);
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
      objective: representationAuthority && !managerialAuthority
        ? 'Uji hanya ruang lingkup kuasa/representasi dan kewenangan prosedural yang benar-benar terdeteksi.'
        : managerialAuthority
          ? 'Uji kewenangan formal, pembagian tugas, delegasi, dan approval chain yang benar-benar relevan dengan aktor manajerial/organisasi.'
          : 'Uji dasar kewenangan formal aktor yang memang mempunyai fungsi jabatan atau representasi.',
      status: authorityActors.length ? 'READY' : 'PARTIAL',
      evidence_basis: [`authority_actors=${authorityActors.length}`, `all_actors=${actors.length}`],
      outputs: authorityActors.length
        ? ['Authority-duty matrix', ...(managerialAuthority?['Delegation/approval verification']:[]), ...(representationAuthority?['Scope-of-authority verification']:[])]
        : ['Authority-duty module intentionally limited — no formal-authority actor detected.'],
    },
    {
      id: 'financial-collateral',
      label: 'Evaluating Financial & Collateral Data',
      objective: financialActive
        ? `Uji hanya unsur keuangan/agunan yang terdeteksi: ${financialProfile.detected_labels.join(', ') || 'hubungan finansial'}.`
        : 'Jangan menjalankan audit finansial/agunan tanpa hubungan keuangan yang nyata dalam sumber.',
      status: financialActive ? 'READY' : 'PARTIAL',
      evidence_basis: financialActive
        ? [`amounts=${financialProfile.amounts.length}`, `collateral=${collateral.length}`, `repayment=${repayment.length}`, `payment_flow=${financialProfile.payment_flow.length}`, `valuation=${financialProfile.valuation.length}`, `discrepancies=${discrepancy.length}`]
        : ['no-financial-content-detected'],
      outputs: financialActive
        ? financialProfile.outputs
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
      status: witnessTargets.length || expert_domains.length ? 'READY' : 'PARTIAL',
      evidence_basis: [`witness_targets=${witnessTargets.length}`, `all_actors=${actors.length}`, `expert_domains=${expert_domains.length}`],
      outputs: witnessTargets.length || expert_domains.length
        ? [...(witnessTargets.length?['Witness map with category & caution','Question themes']:[]), ...(expert_domains.length?['Expert recommendation']:[])]
        : ['Witness/expert plan intentionally deferred — no explicit witness or expert need detected.'],
    },
    {
      id: 'drafting',
      label: 'Drafting Legal Response',
      objective: 'Turunkan hasil analisis menjadi dokumen litigasi/pendampingan yang sesuai tahap perkara.',
      status: draftingStatus,
      evidence_basis: [`law_candidates=${laws.length}`, `issues=${issues.length}`, `procedural_stage=${proceduralStage}`, `procedural_drafting_status=${draftingStatus}`, `procedural_authority=${proceduralAuthorityReady?'READY':'UNRESOLVED'}`],
      outputs: ['Chronology memo', 'Evidence map', 'Legal response/objection/defense outline', ...(witnessTargets.length?['Witness question set']:[])],
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
    ...(witnessTargets.length || expert_domains.length ? [{
      document: 'Daftar pertanyaan saksi & rencana ahli',
      purpose: witnessTargets.length
        ? 'Menguji pengetahuan langsung, dokumen, dan unsur material melalui saksi yang memang teridentifikasi.'
        : 'Menetapkan kebutuhan ahli hanya pada bidang yang mempunyai basis faktual dalam sumber.',
      priority: 'P2' as const,
      depends_on: witnessTargets.length ? ['witness map', 'authority-duty matrix'] : ['expert need', 'verified issues'],
      stage_guard: 'Sesuaikan dengan tahap pemeriksaan saksi/ahli; jangan membuat daftar saksi dari aktor yang hanya berstatus pihak atau kuasa.',
    }] : []),
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
    ...(managerialAuthority ? ['Uji hanya approval chain, delegasi, SOP/SK, dan pembagian tugas yang mempunyai aktor manajerial/organisasi serta tindakan material yang nyata.'] : []),
    ...(representationAuthority && !managerialAuthority ? ['Verifikasi ruang lingkup kuasa/representasi hanya sejauh menjadi material terhadap tindakan prosedural atau kewenangan pihak.'] : []),
    ...(financialActive ? financialProfile.review_questions.slice(0,4) : []),
    ...(witnessTargets.length ? ['Siapkan pertanyaan hanya untuk saksi/pejabat penyimpan dokumen yang benar-benar teridentifikasi dan kaitkan setiap pertanyaan dengan proposisi yang hendak dibuktikan.'] : []),
    ...(expert_domains.length ? [`Uji kebutuhan ahli hanya untuk bidang yang terdeteksi: ${uniq(expert_domains).join(', ')}.`] : []),
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
      .toLowerCase()} pada tahap ${proceduralStage.replace(/_/g, ' ').toLowerCase()} dengan fokus pada posisi klien, matriks fakta-bukti, isu dan authority yang terikat pada bukti,${authorityActors.length?' kewenangan formal,':''}${financialActive?' unsur finansial/agunan yang benar-benar terdeteksi,':''}${witnessTargets.length?' saksi yang teridentifikasi,':''} serta drafting yang sesuai tahap perkara.`,
    stages,
    allegation_response_matrix,
    authority_duty_matrix,
    financial_collateral_audit: {
      active: financialActive,
      amounts: financialProfile.amounts,
      collateral_terms: collateral,
      repayment_terms: repayment,
      discrepancy_terms: discrepancy,
      review_questions: financialActive ? financialProfile.review_questions : [],
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
      witness_targets: witnessTargets,
      expert_domains: uniq(expert_domains),
    },
    drafting_plan,
    case_theory_candidates,
    verification_queue,
    next_actions,
  };
}