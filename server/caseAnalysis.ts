import { db } from './db';
import { getAI } from './gemini';
import { CaseAnalysisRecord, CaseRiskItem, LegalRegulation } from './types';
import { normalizeLegalText, DocumentIngestionResult } from './documentIngestion';

export interface CaseAnalysisInput {
  title: string;
  narrative: string;
  filename?: string;
  input_type?: 'narrative' | 'document' | 'narrative+document';
  regulatory_mode?: 'offline' | 'hybrid' | 'online' | string;
  document_ingestion?: DocumentIngestionResult;
}

type ApplicableLaw = {
  domain: string;
  source: string;
  status: string;
  regulation: string;
  article: string;
  relevance: string;
};

const LEVEL_SCORE: Record<CaseRiskItem['level'], number> = { HIGH: 85, MEDIUM: 55, LOW: 25 };

function safeString(v: unknown): string { return normalizeLegalText(v); }
function safeArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(safeString).filter(x => x.length >= 3).slice(0, 50) : [];
}
function parseJsonObject(text: string): any {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); } catch {
    const first = clean.indexOf('{'), last = clean.lastIndexOf('}');
    if (first >= 0 && last > first) { try { return JSON.parse(clean.slice(first, last + 1)); } catch {} }
    return null;
  }
}
function unique<T>(items: T[]): T[] { return [...new Set(items)]; }

function classifyDomain(text: string) {
  const lower = text.toLowerCase();
  const rules = [
    { posture: 'AGRARIA_PERTANAHAN', domain: 'Hukum Agraria & Pertanahan', keys: ['tanah','sertifikat','shm','shgb','ajb','ppjb','bpn','agraria'] },
    { posture: 'PIDANA_MATERIIL_FORMIL', domain: 'Hukum Pidana & Acara Pidana', keys: ['pidana','tersangka','terdakwa','bap','penyidik','polisi','kejaksaan','penipuan','penggelapan','korupsi'] },
    { posture: 'KETENAGAKERJAAN_PHI', domain: 'Hukum Ketenagakerjaan & Hubungan Industrial', keys: ['phk','upah','pekerja','buruh','pesangon','ketenagakerjaan','perjanjian kerja'] },
    { posture: 'KORPORASI_BISNIS', domain: 'Hukum Perusahaan & Bisnis', keys: ['perseroan','direksi','komisaris','rups','saham','pemegang saham'] },
    { posture: 'KELUARGA_WARIS', domain: 'Hukum Keluarga & Waris', keys: ['waris','ahli waris','pewaris','perkawinan','cerai','talak','hak asuh'] },
    { posture: 'PERDATA_KONTRAKTUAL', domain: 'Hukum Perdata & Perikatan', keys: ['perjanjian','kontrak','jual beli','wanprestasi','utang','piutang','somasi','ganti rugi','perbuatan melawan hukum','pmh'] },
    { posture: 'TUN_ADMINISTRASI', domain: 'Hukum Administrasi Negara / TUN', keys: ['keputusan tata usaha','ptun','pejabat tata usaha','izin','administrasi negara'] },
  ];
  let best = { posture: 'PERDATA_UMUM', domain: 'Hukum Indonesia - Kualifikasi Belum Final', score: 0 };
  for (const r of rules) {
    const score = r.keys.reduce((n,k) => n + (lower.includes(k) ? 1 : 0), 0);
    if (score > best.score) best = { posture: r.posture, domain: r.domain, score };
  }
  return best;
}

function regulatoryScore(reg: LegalRegulation, text: string, domain: string): number {
  const lower = text.toLowerCase();
  const hay = `${reg.nomor} ${reg.tentang} ${(reg.domain_tags || []).join(' ')}`.toLowerCase();
  const terms = unique((`${domain} ${text.slice(0, 12000)}`.toLowerCase().match(/[a-zA-ZÀ-ÿ]{4,}/g) || []));
  let score = 0;
  for (const t of terms) if (hay.includes(t)) score += t.length >= 8 ? 2 : 1;
  const pairs: Array<[string[], string[]]> = [
    [['perjanjian','kontrak','wanprestasi','jual beli','utang','piutang','pmh'],['perdata','dagang','perikatan']],
    [['tanah','sertifikat','shm','bpn','ajb','ppjb'],['tanah','agraria','pendaftaran tanah']],
    [['pidana','tersangka','penipuan','penggelapan'],['pidana']],
    [['phk','upah','pekerja','buruh'],['ketenagakerjaan']],
    [['waris','ahli waris','perkawinan'],['perdata','perkawinan','waris']],
    [['data pribadi','privasi'],['data pribadi']],
  ];
  for (const [facts, laws] of pairs) if (facts.some(k => lower.includes(k)) && laws.some(k => hay.includes(k))) score += 12;
  return score;
}

function matchRegulations(text: string, domain: string) {
  return db.getRegulations()
    .map(regulation => ({ regulation, score: regulatoryScore(regulation, text, domain) }))
    .filter(x => x.score > 0)
    .sort((a,b) => b.score - a.score)
    .slice(0, 8)
    .map(x => ({
      regulation: x.regulation,
      relevance_score: Math.min(0.98, 0.45 + x.score / 40),
      matched_articles: (x.regulation.articles || []).slice(0, 3)
    }));
}

async function onlineSourceChecks(matches: any[], mode: string) {
  if (mode === 'offline') return [];
  const top = matches.slice(0, 4);
  return Promise.all(top.map(async m => {
    const url = String(m.regulation?.official_url || '');
    if (!/^https?:\/\//i.test(url)) return { url, reachable: false, identity_hint: false, status: 'NO_OFFICIAL_URL' };
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 5500);
    try {
      const r = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'LexiCore-Legal-Verification/1.0' } });
      const body = (await r.text()).slice(0, 250000).toLowerCase();
      const number = String(m.regulation?.nomor || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const tokens = number.split(/\s+/).filter((x:string) => /\d/.test(x) || x.length > 3).slice(0, 6);
      const identityHint = r.ok && tokens.filter((t:string) => body.includes(t)).length >= Math.min(2, tokens.length);
      return { url, reachable: r.ok, http_status: r.status, identity_hint: identityHint, status: identityHint ? 'SOURCE_IDENTITY_HINT' : (r.ok ? 'SOURCE_REACHABLE' : 'SOURCE_UNREACHABLE') };
    } catch { return { url, reachable: false, identity_hint: false, status: 'SOURCE_UNREACHABLE' }; }
    finally { clearTimeout(timer); }
  }));
}

function fallbackFacts(text: string): string[] {
  const items = text.split(/(?:\n+|(?<=[.!?])\s+)/).map(safeString).filter(s => s.length >= 25 && s.length <= 1200);
  return items.slice(0, 12).length ? items.slice(0, 12) : ['Fakta material belum cukup untuk membentuk konstruksi hukum definitif.'];
}

function buildFallbackRisks(params: { facts: string[]; laws: ApplicableLaw[]; inputType: string; ingestion?: DocumentIngestionResult }): CaseRiskItem[] {
  const out: CaseRiskItem[] = [];
  out.push({
    clause: 'Kelengkapan dan kualitas fakta/bukti',
    level: params.facts.length >= 5 ? 'MEDIUM' : 'HIGH',
    finding: params.facts.length >= 5 ? 'Fakta awal telah terpetakan, tetapi setiap fakta material masih perlu dipadankan dengan bukti primer.' : 'Fakta material yang tersedia masih terbatas sehingga konstruksi hukum rentan berubah setelah dokumen primer diperiksa.',
    mitigation: 'Susun kronologi bertanggal dan matriks fakta-bukti; tandai fakta yang baru berupa keterangan sepihak.'
  });
  out.push({
    clause: 'Verifikasi hukum positif dan tempus',
    level: params.laws.some(x => x.article !== 'PERLU VERIFIKASI') ? 'MEDIUM' : 'HIGH',
    finding: params.laws.length ? 'Instrumen kandidat telah ditemukan, tetapi keberlakuan, pasal, dan nexus perkara wajib diverifikasi sebelum dipakai sebagai dasar final.' : 'Belum ada instrumen hukum spesifik yang cukup aman untuk dinyatakan berlaku pada perkara ini.',
    mitigation: 'Verifikasi instrumen, perubahan terakhir, tanggal berlaku, pasal spesifik, dan keterkaitannya dengan fakta perkara pada sumber resmi.'
  });
  if (params.inputType !== 'narrative') {
    const partial = params.ingestion?.manual_review_required || (params.ingestion?.coverage_ratio ?? 1) < 0.9;
    out.push({
      clause: 'Integritas pembacaan dokumen',
      level: partial ? 'HIGH' : 'LOW',
      finding: partial ? 'Sebagian dokumen memerlukan pemeriksaan manual karena hasil pembacaan/OCR tidak sepenuhnya pasti.' : 'Teks dokumen berhasil diekstrak tanpa indikasi kontaminasi data biner.',
      mitigation: partial ? 'Bandingkan hasil ekstraksi dengan dokumen asli sebelum mengandalkan kutipan, tanggal, nominal, atau nama pihak.' : 'Tetap lakukan spot-check terhadap bagian material dokumen asli.'
    });
  }
  return out;
}

function riskScore(matrix: CaseRiskItem[]): number {
  if (!matrix.length) return 50;
  return Math.max(10, Math.min(95, Math.round(matrix.reduce((n,r) => n + LEVEL_SCORE[r.level], 0) / matrix.length)));
}

export async function runCaseAnalysis(input: CaseAnalysisInput): Promise<CaseAnalysisRecord> {
  const title = safeString(input.title) || 'Analisis Perkara Hukum';
  const text = safeString(input.narrative);
  const filename = safeString(input.filename);
  const inputType = input.input_type || (filename ? 'document' : 'narrative');
  const regulatoryMode = String(input.regulatory_mode || 'hybrid').toLowerCase();
  if (text.length < 40) throw new Error('Materi perkara tidak cukup terbaca untuk dilakukan analisis.');

  const charCount = text.length;
  const { posture, domain: primaryDomain } = classifyDomain(text);
  const matchedRegs = matchRegulations(text, primaryDomain);
  const onlineChecks = await onlineSourceChecks(matchedRegs, regulatoryMode);

  const maxPromptChars = 110000;
  const analysisText = text.length <= maxPromptChars ? text : `${text.slice(0, 52000)}\n\n[...BAGIAN TENGAH DIPADATKAN UNTUK BATAS KONTEKS...]\n\n${text.slice(-52000)}`;
  const coverageRatio = Math.min(1, analysisText.length / Math.max(1, text.length));

  const ai = getAI();
  let aiSummary: any = null;
  if (ai && analysisText.length > 80) {
    try {
      const prompt = `Anda adalah LexiCore, mesin analisis hukum untuk praktisi hukum Indonesia dengan standar firma hukum dan litigasi senior.\n\nTugas: lakukan analisis kasus berbasis fakta, bukti, hukum positif, kontra-argumen, risiko, dan langkah tindak lanjut.\n\nATURAN WAJIB:\n- Jangan mengarang fakta, dokumen, nomor pasal, putusan, status verifikasi, atau hasil pencarian online.\n- Bedakan fakta sumber dengan inferensi/analisis.\n- Jika dasar hukum/pasal belum pasti, tulis PERLU VERIFIKASI dan jelaskan apa yang harus diverifikasi.\n- Uji kemungkinan konstruksi lawan, cacat bukti, tempus, yurisdiksi, kewenangan pihak, dan alternatif forum.\n- Risiko harus berupa HIGH/MEDIUM/LOW, temuan konkret, dan mitigasi.\n- overall_risk_score 0-100; semakin tinggi semakin berisiko.\n- verification_note wajib menyatakan verifikasi profesional advokat masih PENDING.\n- Jangan memaksakan perkara tanah, wanprestasi, pidana, atau bidang tertentu jika fakta tidak mendukung.\n\nJUDUL: ${title}\nDOMAIN AWAL (hanya hipotesis mesin): ${primaryDomain}\nCOVERAGE TEKS UNTUK MODEL: ${Math.round(coverageRatio*100)}%\n\nMATERI:\n\"\"\"\n${analysisText}\n\"\"\"\n\nKembalikan JSON valid tanpa markdown:\n{\n  \"document_type\": \"Jenis perkara/dokumen\",\n  \"summary\": \"Ringkasan substantif\",\n  \"facts\": [\"Fakta material\"],\n  \"legal_issues\": [{\"issue\":\"Isu\",\"rule\":\"Rule atau PERLU VERIFIKASI\",\"analysis\":\"Application\",\"conclusion\":\"Kesimpulan sementara\"}],\n  \"applicable_law\": [{\"regulation\":\"Peraturan\",\"article\":\"Pasal atau PERLU VERIFIKASI\",\"relevance\":\"Nexus ke perkara\"}],\n  \"arguments_for\": [\"Argumen menguatkan\"],\n  \"arguments_against\": [\"Argumen lawan/kelemahan\"],\n  \"risks\": [{\"clause\":\"Aspek risiko\",\"level\":\"HIGH\",\"finding\":\"Temuan\",\"mitigation\":\"Mitigasi\"}],\n  \"overall_risk_score\": 50,\n  \"recommendations\": [\"Tindakan spesifik\"],\n  \"best_case\": \"Skenario terbaik realistis\",\n  \"worst_case\": \"Skenario terburuk realistis\",\n  \"verification_note\": \"Verifikasi profesional oleh advokat masih PENDING.\"\n}`;
      const res = await ai.models.generateContent({ model: 'gemini-3.8-flash', contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.1 } });
      aiSummary = parseJsonObject(res.text || '');
    } catch (e) { console.warn('Gemini Case Analysis synthesis failed; using deterministic fallback:', e); }
  }

  const facts = safeArray(aiSummary?.facts).length ? safeArray(aiSummary?.facts) : fallbackFacts(text);
  const legal_issues = Array.isArray(aiSummary?.legal_issues) && aiSummary.legal_issues.length
    ? aiSummary.legal_issues.slice(0, 20).map((x:any) => ({ issue: safeString(x?.issue) || 'Isu hukum perlu dirumuskan.', rule: safeString(x?.rule) || undefined, analysis: safeString(x?.analysis) || 'Analisis memerlukan verifikasi fakta dan hukum.', conclusion: safeString(x?.conclusion) || undefined }))
    : [{ issue: 'Apa kualifikasi hubungan hukum, hak/kewajiban para pihak, dan akibat hukum yang dapat ditarik dari fakta yang tersedia?', rule: 'Hukum positif yang relevan harus diverifikasi sesuai bidang, tempus, dan yurisdiksi.', analysis: 'Kualifikasi final belum aman ditentukan tanpa memadankan fakta material dengan dokumen primer dan norma yang berlaku.', conclusion: 'Konstruksi hukum masih bersifat sementara dan memerlukan verifikasi profesional.' }];

  let applicable_law: ApplicableLaw[] = [];
  if (Array.isArray(aiSummary?.applicable_law) && aiSummary.applicable_law.length) {
    applicable_law = aiSummary.applicable_law.slice(0, 15).map((law:any) => {
      const regulation = safeString(law?.regulation || law?.source || law?.domain) || 'Peraturan perlu diverifikasi';
      const article = safeString(law?.article) || 'PERLU VERIFIKASI';
      const relevance = safeString(law?.relevance || law?.status) || 'Relevansi materiil dan tempus harus diverifikasi.';
      return { domain: regulation, source: article === 'PERLU VERIFIKASI' ? regulation : `${regulation} — ${article}`, status: article === 'PERLU VERIFIKASI' ? 'PERLU_VERIFIKASI' : 'CANDIDATE', regulation, article, relevance };
    });
  } else if (matchedRegs.length) {
    applicable_law = matchedRegs.slice(0,6).map((m:any) => ({
      domain: safeString(m.regulation.tentang) || primaryDomain,
      source: safeString(m.regulation.nomor),
      status: 'CANDIDATE_LOCAL_CORPUS',
      regulation: safeString(m.regulation.nomor || m.regulation.tentang),
      article: m.matched_articles.length ? m.matched_articles.map((a:any)=>safeString(a.pasal)).filter(Boolean).join(', ') || 'PERLU VERIFIKASI' : 'PERLU VERIFIKASI',
      relevance: 'Kandidat dari corpus lokal berdasarkan kemiripan domain/fakta. Keberlakuan, pasal spesifik, dan nexus perkara wajib diverifikasi pada sumber resmi.'
    }));
  } else {
    applicable_law = [{ domain: primaryDomain, source: 'Belum teridentifikasi', status: 'PERLU_VERIFIKASI', regulation: 'Instrumen hukum spesifik belum teridentifikasi', article: 'PERLU VERIFIKASI', relevance: 'Materi perkara belum cukup untuk memilih instrumen hukum secara aman tanpa verifikasi tambahan.' }];
  }

  const arguments_for = safeArray(aiSummary?.arguments_for).length ? safeArray(aiSummary?.arguments_for) : ['Posisi klien akan menguat apabila setiap fakta material dapat dibuktikan dengan dokumen primer, saksi, atau bukti elektronik yang sah dan konsisten.'];
  const arguments_against = safeArray(aiSummary?.arguments_against).length ? safeArray(aiSummary?.arguments_against) : ['Pihak lawan dapat menyerang akurasi kronologi, kualitas bukti, kapasitas/kewenangan pihak, hubungan kausal, tempus, yurisdiksi, atau penerapan norma; seluruhnya perlu diuji sebelum strategi final.'];
  const evidence_needed = ['Dokumen primer yang melahirkan hubungan hukum atau hak/kewajiban para pihak.', 'Bukti pembayaran/transaksi/korespondensi atau dokumen pelaksanaan yang relevan.', 'Kronologi bertanggal dan identitas/kapasitas hukum para pihak.', 'Bukti pendukung atas kerugian, pelanggaran, atau pembelaan yang didalilkan.'];

  const aiRisks = Array.isArray(aiSummary?.risks) ? aiSummary.risks : [];
  let risk_matrix: CaseRiskItem[] = aiRisks.filter((r:any)=>r && typeof r === 'object').slice(0,20).map((r:any, i:number) => ({
    clause: safeString(r.clause) || `Risiko ${i+1}`,
    level: (['HIGH','MEDIUM','LOW'].includes(String(r.level||'').toUpperCase()) ? String(r.level).toUpperCase() : 'MEDIUM') as CaseRiskItem['level'],
    finding: safeString(r.finding) || 'Risiko memerlukan verifikasi lebih lanjut.',
    mitigation: safeString(r.mitigation) || 'Verifikasi fakta, bukti, norma, dan strategi sebelum tindakan final.'
  })).filter(r=>r.finding.length > 3);
  if (!risk_matrix.length) risk_matrix = buildFallbackRisks({ facts, laws: applicable_law, inputType, ingestion: input.document_ingestion });
  const computedRisk = riskScore(risk_matrix);
  const aiRisk = Number(aiSummary?.overall_risk_score);
  const overall_risk_score = Number.isFinite(aiRisk) && aiRisk > 0 && aiRisk <= 100 ? Math.round(aiRisk) : computedRisk;
  const risks = risk_matrix.map(r => r.finding);

  const summary = safeString(aiSummary?.summary) || `Analisis awal perkara "${title}" memetakan fakta material, isu hukum, dasar hukum kandidat, posisi argumentasi, risiko pembuktian, dan langkah tindak lanjut berdasarkan materi yang tersedia.`;
  const recommendations = safeArray(aiSummary?.recommendations).length ? safeArray(aiSummary?.recommendations) : ['Verifikasi seluruh dokumen primer dan kronologi bertanggal.', 'Petakan setiap dalil terhadap bukti yang mendukung maupun melemahkannya.', 'Verifikasi hukum positif, tempus, yurisdiksi, dan kewenangan pihak sebelum menentukan upaya hukum.', 'Tetapkan langkah pengamanan atau penyelesaian yang proporsional setelah risiko pembuktian diuji.'];
  const best_case = safeString(aiSummary?.best_case) || 'Fakta dan bukti utama terkonfirmasi, posisi hukum dapat dirumuskan secara konsisten, dan kepentingan klien dipulihkan melalui penyelesaian atau upaya hukum yang efektif.';
  const worst_case = safeString(aiSummary?.worst_case) || 'Bukti material tidak lengkap atau dipatahkan, dasar hukum/prosedural tidak mendukung konstruksi awal, dan sengketa berkembang menjadi proses yang lebih panjang dengan pemulihan terbatas.';
  const verification_note = safeString(aiSummary?.verification_note) || 'Verifikasi profesional masih PENDING. Hasil ini wajib diperiksa oleh advokat terhadap dokumen asli, kronologi, hukum positif, tempus, yurisdiksi, dan strategi perkara sebelum digunakan.';

  const totalSegments = Math.max(1, Math.ceil(charCount / 24000));
  const analyzedSegments = Math.max(1, Math.min(totalSegments, Math.ceil(analysisText.length / 24000)));
  const documentStatus = input.document_ingestion?.manual_review_required || coverageRatio < 0.99 ? 'PARTIAL_REVIEW_REQUIRED' : 'READABLE';
  const factsScore = Math.min(95, 45 + Math.min(40, facts.length * 5) + (charCount > 1000 ? 10 : 0));
  const evidenceScore = inputType === 'narrative' ? 55 : (input.document_ingestion?.manual_review_required ? 50 : 72);
  const lawScore = Math.min(90, 45 + Math.min(35, matchedRegs.length * 7) + (onlineChecks.some((x:any)=>x.identity_hint) ? 10 : 0));
  const procedureScore = Math.min(90, 50 + Math.min(20, legal_issues.length * 5) + Math.min(20, recommendations.length * 4));
  const readinessScore = Math.round((factsScore + evidenceScore + lawScore + procedureScore) / 4);
  const case_readiness = { metric:'CASE_PREPARATION_COMPLETENESS', label:'Case Readiness / Kelengkapan Persiapan', overall_score:readinessScore, confidence: readinessScore >= 80 ? 'HIGH' : readinessScore >= 60 ? 'MEDIUM' : 'LOW', dimensions:{ facts_completeness:{score:factsScore,label:'Fakta & Subjek Terpetakan'}, evidence_robustness:{score:evidenceScore,label:'Kekuatan/Ketersediaan Bukti'}, legal_basis_authority:{score:lawScore,label:'Otoritas Dasar Hukum'}, procedural_strategy:{score:procedureScore,label:'Kesiapan Strategi'} } };
  const case_working_paper = { format_version:'1.1', working_paper_percentage:{ metric:'CASE_ANALYSIS_READINESS', label:'Case Readiness / Analysis Completeness', percentage:readinessScore, confidence:case_readiness.confidence, variables_increasing:[ {variable:'Fakta material terpetakan',impact:Math.round((factsScore-50)/2),basis:`${facts.length} fakta material teridentifikasi`}, {variable:'Dasar hukum kandidat',impact:Math.round((lawScore-50)/2),basis:`${matchedRegs.length} instrumen kandidat dari corpus lokal`} ], variables_decreasing:[ {variable:'Verifikasi profesional belum final',impact:-8,basis:'Dokumen asli, norma, dan strategi masih wajib diverifikasi advokat'}, ...(coverageRatio<.99?[{variable:'Coverage analisis model parsial',impact:-12,basis:`Model menerima sekitar ${Math.round(coverageRatio*100)}% teks sumber karena batas konteks`}]:[]) ] } };

  const officialResults = matchedRegs.slice(0,4).map((m:any, i:number) => {
    const chk: any = onlineChecks[i] || {};
    return { title:`${m.regulation.nomor} tentang ${m.regulation.tentang}`, source_name:m.regulation.jdih_source || 'Sumber resmi terkait', url:m.regulation.official_url || '', query:primaryDomain, online_check:chk, positive_law_verification:{ final_status: chk.identity_hint ? 'SOURCE_IDENTITY_HINT_ONLY' : (chk.reachable ? 'SOURCE_REACHABLE_UNVERIFIED' : 'UNVERIFIED'), case_nexus_status:'PROFESSIONAL_REVIEW_REQUIRED', provision_verification:{requested_count:m.matched_articles.length,verified_count:0,verified:[]}, provision_text_location:{located_count:0,requested_count:m.matched_articles.length} } };
  });
  const reachableCount = onlineChecks.filter((x:any)=>x.reachable).length;
  const identityCount = onlineChecks.filter((x:any)=>x.identity_hint).length;
  const case_regulatory_snapshot = { domains:[{id:posture.toLowerCase(),label:primaryDomain,confidence:0.72}], queries:legal_issues.slice(0,3).map((x:any)=>safeString(x.issue)), local_seed_count:matchedRegs.length, official_results:officialResults, retrieval_funnel:{ discovered:matchedRegs.length, unique_discovered:matchedRegs.length, candidate:matchedRegs.length, materially_relevant:matchedRegs.length, temporal_not_excluded:0, authoritative_source_located:onlineChecks.length, fetch_attempted:onlineChecks.length, fetch_reachable:reachableCount, instrument_identity_verified:identityCount, positive_law_verified:0, tempus_verified:0, verified_applicable:0, provision_located:0, provision_requested:matchedRegs.reduce((n:any,m:any)=>n+m.matched_articles.length,0), provision_verified:0 } };

  const legalAnalysisText = legal_issues.map((x:any)=>x.analysis).filter(Boolean).join('\n\n') || summary;
  const record: Omit<CaseAnalysisRecord,'id'|'created_at'> = {
    ...({ document_type:safeString(aiSummary?.document_type) || primaryDomain } as any),
    title, input_type:inputType, filename, source_text:text, facts,
    incriminating_facts:[], mitigating_facts:[], legal_issues, applicable_law: applicable_law as any,
    summary, legal_analysis:legalAnalysisText, arguments_for, arguments_against, evidence_needed,
    evidentiary_gaps:['Dokumen asli dan integritas salinan perlu dikonfirmasi.', 'Fakta yang belum memiliki bukti pendukung harus dipisahkan dari fakta terverifikasi.'],
    risks, risk_matrix, overall_risk_score, best_case, worst_case, verification_note, recommendations,
    case_posture:posture,
    domain_classification:{posture,primary_domain:primaryDomain,domains:[{id:posture.toLowerCase(),label:primaryDomain,confidence:0.72}]},
    analysis_provenance:{mode:ai?'AI_ASSISTED_LEGAL_ENGINE':'LOCAL_DETERMINISTIC_LEGAL_ENGINE',provider:ai?'Google Gemini':'LexiCore Local Kernel',model:ai?'gemini-3.8-flash':'lexicore-v1.3-deterministic',timestamp:new Date().toISOString(),source_coverage_ratio:coverageRatio},
    case_readiness, case_working_paper, regulatory_matches:matchedRegs,
    regulatory_intelligence:{relationships:[],timeline:matchedRegs.map((m:any)=>({date:safeString(m.regulation.effective_date || m.regulation.tahun),event:`${safeString(m.regulation.nomor)} - ${safeString(m.regulation.tentang)}`})).slice(0,8)},
    regulatory_corpus_status:{mode:regulatoryMode==='offline'?'LOCAL_CURATED_CORPUS':'LOCAL_PLUS_ONLINE_REACHABILITY_CHECK',matches:matchedRegs.length,official_verification_required:true,professional_verification:'PENDING'},
    document_reading:{status:documentStatus,segments_read:analyzedSegments,segments_total:totalSegments,characters:charCount,coverage_ratio:coverageRatio},
    official_verification:{status:identityCount?'ONLINE_SOURCE_IDENTITY_HINT_ONLY':reachableCount?'ONLINE_SOURCE_REACHABLE_UNVERIFIED':'LOCAL_CORPUS_ONLY',verified_sources:0,reachable_sources:reachableCount,identity_hints:identityCount,details:'Tidak ada instrumen/pasal yang dinyatakan VERIFIED_APPLICABLE secara otomatis. Verifikasi profesional terhadap sumber resmi tetap wajib.'},
    case_regulatory_snapshot,
    ...({ document_ingestion: input.document_ingestion || {mode:'TEXT',coverage_ratio:1,manual_review_required:false}, professional_verification:'PENDING' } as any)
  };

  return db.saveCaseAnalysis(record);
}
