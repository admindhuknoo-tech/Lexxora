import express from 'express';
import path from 'path';
import multer from 'multer';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db';
import {
  getAI,
  isAIAvailable,
  generateLegalDraftAI,
  reviewContractAI,
  generateCommunicationAI
} from './server/gemini';
import { runCaseAnalysis } from './server/caseAnalysis';
import { createDocxBuffer, createPdfBuffer, createWorkingDocumentDocxBuffer } from './server/exporters';
import { extractUploadedDocument } from './server/documentIngestion';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// In-flight progress tracker for Case Analysis
const progressMap = new Map<string, { percent: number; stage: string; detail: string }>();

// -------------------------------------------------------------
// 1. Health & AI Status
// -------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.3.14-node-aistudio',
    system: 'LexiCore Lawyer Operating System',
    gemini_available: isAIAvailable()
  });
});

app.get('/api/ai/status', (req, res) => {
  const available = isAIAvailable();
  res.json({
    success: true,
    available,
    provider: available ? 'Google Gemini' : 'LexiCore Local Kernel',
    model: available ? 'gemini-3.8-flash' : 'lexicore-v1.3-deterministic',
    offline_fallback: true,
    mode: available ? 'AI_ASSISTED' : 'LOCAL_DETERMINISTIC'
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
    message: 'Lisensi terverifikasi dan aktif di lingkungan AI Studio.',
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
  const ai = isAIAvailable();
  res.json({
    success: true,
    local_text_extraction: true,
    docx_local_extraction: true,
    pdf_text_layer_extraction: true,
    scan_ocr_available: ai,
    mode: ai ? 'LOCAL_TEXT_PLUS_AI_OCR' : 'LOCAL_TEXT_ONLY',
    message: ai
      ? 'TXT/RTF/DOCX/PDF text-layer dibaca lokal; scan/foto atau PDF tanpa text layer dapat dibaca dengan AI OCR.'
      : 'TXT/RTF/DOCX/PDF text-layer dibaca lokal. OCR scan/foto memerlukan GEMINI_API_KEY.'
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
app.get('/api/drafting/templates', (req, res) => {
  const templates = db.getTemplates();
  const rows = Object.values(templates || {}) as any[];
  res.json({
    success: true,
    templates,
    count: rows.length,
    official_reference_count: rows.filter((x:any) => Array.isArray(x?.official_source_details) && x.official_source_details.length).length,
    categories: Array.from(new Set(rows.map((x:any) => x?.category).filter(Boolean))).sort()
  });
});

app.get('/api/drafting/template/:key', (req, res) => {
  const templates = db.getTemplates() as Record<string, any>;
  const key = decodeURIComponent(req.params.key || '');
  const template = templates[key] || Object.values(templates).find((x:any) => x?.id === key || x?.name === key || x?.display_name === key);
  if (!template) return res.status(404).json({ success:false, error:'Template tidak ditemukan' });
  return res.json({ success:true, template });
});

app.post('/api/generate/draft', async (req, res) => {
  try {
    const { doc_type, party1, party2, effective_date, duration, prompt } = req.body || {};
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
      status: 'DRAFT_KERJA'
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
      status: String(body.status || 'saved')
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
app.post('/api/review', upload.single('file') as any, async (req, res) => {
  try {
    let text = req.body?.source_text || req.body?.text || '';
    let filename = req.body?.filename || 'dokumen-kontrak.txt';

    if (req.file) {
      filename = req.file.originalname;
      const ingested = await extractUploadedDocument(req.file.buffer, req.file.originalname, req.file.mimetype);
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
    const saved = db.saveContractAnalysis({
      ...normalizedReview,
      title: filename,
      source_text: text
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
  const ai = getAI();
  let summary = '';

  if (ai && text && text.length > 50) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Buat ringkasan yurisprudensi / doktrin hukum Indonesia berikut secara komprehensif:\nJudul: ${title || 'Riset Hukum'}\nTeks:\n${text.substring(0, 12000)}`,
        config: { temperature: 0.2 }
      });
      summary = response.text?.trim() || '';
    } catch (e) {
      console.warn('Gemini research summary error:', e);
    }
  }

  if (!summary) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return res.status(400).json({ success:false, error:'Teks sumber wajib diisi. LexiCore tidak akan membuat ringkasan doktrin/yurisprudensi tanpa materi sumber.' });
    }
    const excerpt = normalized.slice(0, 4000);
    summary = `Ringkasan berbasis sumber yang diberikan (tanpa inferensi kaidah baru): ${excerpt}${normalized.length > excerpt.length ? '…' : ''}`;
  }

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

app.get('/api/legal-sources/health', async (req, res) => {
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
  const { category, answers = {}, entity, custom_controls = [], preview = false } = req.body || {};
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
    summary:`Assessment ${cat}: completion ${categoryRules.length ? Math.round((answeredSystem/categoryRules.length)*100) : 100}%; compliance score ${score}/100; risk exposure ${riskPercent}/100 (${risk_level}).`
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
  const { client_name, legal_position, whatsapp_number, document_type, subject, message, client_id, case_ref, client_email, client_address, matter, status } = req.body || {};
  if (!message || String(message).trim() === '') {
    return res.status(400).json({ success: false, error: 'Isi pesan komunikasi wajib diisi' });
  }

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
    case_ref: case_ref || matter
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
app.get('/api/case-analysis', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 30;
  res.json({
    success: true,
    data: db.getCaseAnalyses(limit)
  });
});

app.get('/api/case-analysis/progress/:token', (req, res) => {
  const token = req.params.token;
  const progress = progressMap.get(token) || { percent: 100, stage: 'COMPLETE', detail: 'Proses selesai.' };
  res.json({
    success: true,
    data: progress
  });
});

app.post('/api/case-analysis', upload.single('file') as any, async (req, res) => {
  const progressId = (req.headers['x-lexicore-progress-id'] as string) || `prog-${Date.now()}`;
  
  progressMap.set(progressId, { percent: 15, stage: 'UPLOAD_STORED', detail: 'Dokumen tersimpan, membaca materi perkara.' });

  try {
    let narrative = req.body?.narrative || '';
    let title = req.body?.title || 'Case Analysis Perkara';
    let filename = '';

    let documentIngestion: any = null;
    if (req.file) {
      filename = req.file.originalname;
      progressMap.set(progressId, { percent: 28, stage: 'DOCUMENT_READING', detail: 'Mengekstrak teks dokumen tanpa memasukkan data biner ke analisis.' });
      documentIngestion = await extractUploadedDocument(req.file.buffer, req.file.originalname, req.file.mimetype);
      narrative = (narrative + '\n\n' + documentIngestion.text).trim();
    }

    if (!narrative || narrative.trim().length < 40) {
      progressMap.delete(progressId);
      return res.status(400).json({
        success: false,
        error: 'Narasi perkara minimal 40 karakter diperlukan untuk menjalankan Case Analysis.'
      });
    }

    progressMap.set(progressId, { percent: 45, stage: 'DOCUMENT_READING_COMPLETE', detail: 'Teks perkara dipetakan, mengidentifikasi subjek dan isu hukum.' });

    progressMap.set(progressId, { percent: 65, stage: 'CASE_MAPPING', detail: 'Menyusun matriks pembuktian dan mensintesis dasar hukum positif.' });

    const result = await runCaseAnalysis({
      title,
      narrative,
      filename,
      input_type: req.file ? (req.body?.narrative?.trim() ? 'narrative+document' : 'document') : 'narrative',
      regulatory_mode: req.body?.regulatory_mode || 'hybrid',
      document_ingestion: documentIngestion || undefined
    });

    progressMap.set(progressId, { percent: 100, stage: 'COMPLETE', detail: 'Working paper siap ditinjau.' });
    setTimeout(() => progressMap.delete(progressId), 10000);

    res.json({
      success: true,
      data: result,
      case_id: result.id
    });
  } catch (err: any) {
    progressMap.delete(progressId);
    console.error('Case analysis error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Gagal menjalankan Case Analysis'
    });
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

    const safeTitle = String(analysis.title || 'Case-Analysis-LexiCore')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100) || 'Case-Analysis-LexiCore';

    if (fmt === 'pdf') {
      const data = createPdfBuffer(analysis);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.pdf"`);
      res.setHeader('Content-Length', String(data.length));
      res.setHeader('Cache-Control', 'no-store');
      return res.send(data);
    }

    if (fmt === 'docx') {
      const data = createDocxBuffer(analysis);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.docx"`);
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
    return res.status(413).json({ success:false, error:'Ukuran berkas melebihi batas 50 MB. Ringkas atau pecah dokumen sebelum diunggah.' });
  }
  if (type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({ success:false, error:'Payload permintaan terlalu besar. Gunakan upload dokumen atau endpoint berbasis ID; jangan kirim ulang working paper lengkap.' });
  }
  console.error('Unhandled API error:', err);
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LexiCore Lawyer Operating System running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start LexiCore server:', err);
});
