import { GoogleGenAI } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

export function getAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export function isAIAvailable(): boolean {
  return getAI() !== null;
}

// 1. Generate Legal Draft
export async function generateLegalDraftAI(params: {
  doc_type: string;
  party1?: string;
  party2?: string;
  effective_date?: string;
  duration?: string;
  prompt?: string;
  profile?: any;
  template?: any;
}): Promise<string> {
  const ai = getAI();
  const p1 = params.party1 || 'Pihak Pertama';
  const p2 = params.party2 || 'Pihak Kedua';
  const docType = params.doc_type || 'Perjanjian Kerja Sama';
  const duration = params.duration || '1 (satu) tahun';
  const effDate = params.effective_date || new Date().toISOString().split('T')[0];
  const prompt = params.prompt || '';
  const firm = params.profile?.display_name || 'Kantor Advokat LexiCore';
  const template = params.template || {};
  const templateFamily = String(template.family || 'LEGAL_LETTER');
  const templateCategory = String(template.category || 'Legal Drafting');
  const templateStructure = Array.isArray(template.structure) ? template.structure : [];
  const requiredElements = Array.isArray(template.required_elements) ? template.required_elements : [];
  const officialSources = Array.isArray(template.official_source_details) ? template.official_source_details : [];

  if (!ai) {
    return generateDeterministicDraft(params);
  }

  try {
    const sourceText = officialSources.length
      ? officialSources.map((x: any, i: number) => `${i + 1}. ${x.title} — ${x.issuer} [${x.kind}]\n   ${x.url}`).join('\n')
      : 'Tidak ada contoh format resmi publik yang ditautkan; gunakan hanya struktur hukum/prosedural yang relevan dan beri tanda verifikasi.';
    const structureText = templateStructure.length ? templateStructure.map((x: string, i: number) => `${i + 1}. ${x}`).join('\n') : 'Gunakan struktur profesional yang sesuai jenis dokumen.';
    const requiredText = requiredElements.length ? requiredElements.map((x: string) => `- ${x}`).join('\n') : '- Tidak ada field khusus tambahan.';
    const systemPrompt = `Anda adalah Senior Legal Drafter Indonesia (LexiCore Legal Operating System) untuk advokat/litigator.

ATURAN UTAMA:
- Susun dokumen sesuai JENIS DOKUMEN dan KELUARGA TEMPLATE, bukan memaksakan struktur kontrak pada semua dokumen.
- Gunakan bahasa hukum Indonesia formal, presisi, litigasi-ready, dan dapat diaudit.
- Bedakan fakta pengguna, placeholder yang belum tersedia, dan norma hukum. Jangan mengarang fakta, nomor perkara, tanggal, pejabat, pasal, atau status hukum.
- Jika sumber berstatus OFFICIAL_FORMAT_REFERENCE, adopsi struktur/field resminya tanpa mengklaim teks ini salinan resmi.
- Jika sumber hanya OFFICIAL_PROCEDURAL_REFERENCE atau OFFICIAL_LEGAL_REQUIREMENT, gunakan sebagai checklist; jangan menyebut draf sebagai format resmi.
- Hukum positif, tempus, kompetensi, tenggang, syarat formil, dan kewenangan kuasa wajib ditandai untuk verifikasi bila belum pasti.
- Untuk surat kuasa, pastikan pokok perkara/tujuan kuasa spesifik dan para pihak jelas.
- Untuk gugatan/permohonan/jawaban/upaya hukum, jaga konsistensi forum, posita-alasan, bukti, dan petitum.
- Untuk kontrak/perjanjian, baru terapkan komparisi, objek, hak-kewajiban, pembayaran, jangka waktu, default, force majeure, sengketa, dan penutup sesuai relevansi.
- Akhiri dengan CATATAN VERIFIKASI PROFESIONAL.

METADATA INTERNAL (JANGAN CETAK DALAM DOKUMEN):
Klasifikasi template: ${templateCategory}
Keluarga template: ${templateFamily}
- Klasifikasi, domain, section/subsection, source_grade, family, dan provenance adalah metadata internal LexiCore.
- JANGAN tampilkan metadata tersebut pada judul, kop, subjudul, badan dokumen, atau penutup.
- Judul dokumen yang dicetak hanya nama jenis dokumen: ${docType}.

STRUKTUR YANG DIHARAPKAN:
${structureText}

ELEMEN WAJIB/CHECKLIST:
${requiredText}

SUMBER RESMI YANG DIINJEKSIKAN SEBAGAI REFERENSI STRUKTUR/PROSEDUR:
${sourceText}`;

    const userPrompt = `Susun draf dokumen hukum:
Jenis Dokumen: ${docType}
Pihak 1: ${p1}
Pihak 2: ${p2}
Tanggal Efektif: ${effDate}
Jangka Waktu: ${duration}
Klausul & Catatan Khusus: ${prompt}
Disusun atas instruksi: ${firm}
Catatan internal sistem: gunakan metadata template untuk memilih struktur, tetapi JANGAN tuliskan klasifikasi atau keluarga template pada output dokumen.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2
      }
    });

    const text = response.text;
    if (text && text.trim().length > 100) {
      return stripInternalClassificationFromDraft(text.trim(), docType, templateCategory);
    }
  } catch (err) {
    console.warn('Gemini drafting error, falling back to deterministic draft:', err);
  }

  return generateDeterministicDraft(params);
}


function stripInternalClassificationFromDraft(content: string, docType: string, category: string): string {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  if (!lines.length) return String(content || '').trim();

  const wanted = String(docType || '').trim();
  const first = lines[0].trim();
  const firstUpper = first.toUpperCase();
  const wantedUpper = wanted.toUpperCase();
  const categoryUpper = String(category || '').replace(/\s*\/\s*/g, ' | ').toUpperCase();

  // Template keys may contain DOMAIN | SECTION | DISPLAY NAME. Those are navigation metadata,
  // never part of the legal instrument itself. Keep only the actual document title.
  if (first.includes('|') && wantedUpper && firstUpper.includes(wantedUpper)) {
    lines[0] = wanted.toUpperCase();
  } else if (categoryUpper && (firstUpper === categoryUpper || firstUpper.startsWith(categoryUpper + ' |'))) {
    lines.shift();
    while (lines.length && !lines[0].trim()) lines.shift();
    if (!lines.length || lines[0].trim().toUpperCase() !== wantedUpper) lines.unshift(wanted.toUpperCase());
  }

  return lines.join('\n').trim();
}

function generateDeterministicDraft(params: any): string {
  const p1 = params.party1 || 'Pihak Pertama';
  const p2 = params.party2 || 'Pihak Kedua';
  const rawType = params.doc_type || 'Perjanjian Kerja Sama';
  const docType = rawType.toUpperCase();
  const date = params.effective_date || new Date().toLocaleDateString('id-ID');
  const duration = params.duration || 'sesuai kebutuhan perkara';
  const facts = params.prompt || '[Uraikan fakta, bukti, tujuan hukum, dan instruksi khusus]';
  const note = '\n\nCATATAN KERJA LEXICORE: Draf ini merupakan working draft. Identitas para pihak, kompetensi, tenggang, dasar hukum, bukti, posita/petitum atau klausul material wajib diverifikasi advokat terhadap dokumen asli dan hukum positif sebelum digunakan.';
  const template = params.template || {};
  const structure = Array.isArray(template.structure) ? template.structure : [];
  const family = String(template.family || '');
  const sourceGrade = String(template.source_grade || '');
  const sourceNote = sourceGrade ? `\n\nPROVENANCE TEMPLATE: ${sourceGrade}. Struktur diadaptasi dari referensi resmi yang tercatat di LexiCore; verifikasi versi dan persyaratan terbaru sebelum digunakan.` : '';

  if (/SOMASI|TEGURAN/.test(docType)) return `${docType}\n\nTanggal: ${date}\n\nKepada Yth.\n${p2}\n\nPerihal: SOMASI / PERINGATAN HUKUM\n\nDengan hormat,\nKami bertindak untuk dan atas nama ${p1}. Berdasarkan dokumen dan keterangan yang tersedia, pokok persoalan adalah sebagai berikut:\n\n${facts}\n\nSehubungan dengan hal tersebut, kami meminta Saudara untuk memenuhi kewajiban hukum dan/atau memulihkan hak klien kami dalam tenggang yang patut sejak somasi ini diterima. Apabila tidak dipenuhi, klien kami berhak menempuh upaya hukum yang relevan sesuai hasil verifikasi unsur dan bukti.\n\nDemikian somasi ini disampaikan untuk dipatuhi.\n\nHormat kami,\nKuasa Hukum ${p1}${sourceNote}${note}`;
  if (/GUGATAN|PERMOHONAN/.test(docType)) return `${docType}\n\nKepada Yth. Ketua Pengadilan yang Berwenang\n\n${p1}, selanjutnya disebut sebagai PENGGUGAT/PEMOHON, dengan ini mengajukan ${rawType.toLowerCase()} terhadap ${p2}.\n\nI. KEWENANGAN DAN KEDUDUKAN HUKUM\n[Uraikan kompetensi absolut/relatif, legal standing, tenggang, dan syarat prosedural.]\n\nII. POSITA / FUNDAMENTUM PETENDI\n${facts}\n\nIII. DASAR HUKUM\n[Cantumkan hanya norma yang telah diverifikasi dan relevan terhadap setiap dalil.]\n\nIV. PETITUM\n[Susun petitum yang konsisten dengan posita, bukti, kewenangan forum, dan jenis perkara.]${sourceNote}${note}`;
  if (/JAWABAN|EKSEPSI|REPLIK|DUPLIK|PLED|PEMBELAAN|MEMORI|KONTRA MEMORI|KESIMPULAN/.test(docType)) return `${docType}\n\nUntuk: ${p1}\nTerhadap: ${p2}\nTanggal: ${date}\n\nI. PENDAHULUAN\n${facts}\n\nII. ISU FORMIL\n[Uji kewenangan, kedudukan hukum, tenggang, error in persona, obscuur libel, prematur, atau keberatan formil lain bila relevan.]\n\nIII. TANGGAPAN POKOK PERKARA\n[Tanggapi dalil lawan isu demi isu; pisahkan pengakuan, bantahan, dan fakta yang belum terbukti.]\n\nIV. PEMBUKTIAN DAN DASAR HUKUM\n[Pasangkan setiap dalil dengan bukti serta norma yang telah diverifikasi.]\n\nV. PERMOHONAN / PETITUM\n[Susun permohonan akhir secara konsisten dengan posisi hukum dan pembuktian.]${sourceNote}${note}`;
  if (/LEGAL OPINION|LEGAL MEMORANDUM|PENDAPAT HUKUM/.test(docType)) return `${docType}\n\nKlien/Matter: ${p1}\nObjek/Pihak terkait: ${p2}\nTanggal: ${date}\n\n1. ISSUE\n[Rumuskan pertanyaan hukum utama.]\n\n2. SHORT ANSWER\n[Berikan jawaban singkat dengan tingkat kepastian yang proporsional.]\n\n3. MATERIAL FACTS\n${facts}\n\n4. APPLICABLE LAW\n[Cantumkan hukum positif yang telah diverifikasi beserta relevansinya.]\n\n5. ANALYSIS\n[Subsumsi fakta ke norma; bedakan fakta, asumsi, dan kesimpulan.]\n\n6. COUNTER-ANALYSIS / RISKS\n[Uji posisi lawan, celah pembuktian, risiko prosedural dan mitigasi.]\n\n7. RECOMMENDATION\n[Susun langkah prioritas dan dokumen/bukti yang harus dilengkapi.]${sourceNote}${note}`;
  if (/KUASA/.test(docType)) return `${docType}\n\nPada tanggal ${date}, ${p1} selaku PEMBERI KUASA memberikan kuasa kepada ${p2} selaku PENERIMA KUASA.\n\nKHUSUS\nUntuk mewakili dan bertindak untuk kepentingan PEMBERI KUASA sehubungan dengan:\n${facts}\n\nPENERIMA KUASA berwenang melakukan tindakan prosedural yang secara tegas diperlukan dalam ruang lingkup kuasa ini, sepanjang tidak melampaui hukum dan kewenangan yang diberikan. Hak substitusi, perdamaian, pencabutan perkara, penerimaan uang, atau tindakan disposisi lain harus dinyatakan secara tegas bila memang dikehendaki.\n\nPEMBERI KUASA                         PENERIMA KUASA\n\n__________________                    __________________${sourceNote}${note}`;

  if (structure.length && !/PERJANJIAN|AGREEMENT|MOU|NDA|KERJASAMA|KERJA SAMA|SEWA|UTANG|JASA HUKUM|LISENSI/.test(docType)) {
    const body = structure.map((item: string, i: number) => `${i + 1}. ${String(item).toUpperCase()}\n[Isi berdasarkan fakta/dokumen yang tersedia dan instruksi pengguna.]`).join('\n\n');
    return `${docType}\n\nTanggal: ${date}\n\nPihak/Pemohon/Pengirim: ${p1}\nPihak Lawan/Tujuan: ${p2}\n\nINSTRUKSI / FAKTA DASAR\n${facts}\n\n${body}${sourceNote}${note}`;
  }

  return `${docType}\n\nTanggal Efektif: ${date}\nJangka Waktu: ${duration}\n\nPARA PIHAK\n1. ${p1}, selanjutnya disebut PIHAK PERTAMA.\n2. ${p2}, selanjutnya disebut PIHAK KEDUA.\n\nLATAR BELAKANG / PREMIS\n${facts}\n\nPASAL 1 — OBJEK DAN RUANG LINGKUP\n[Definisikan objek, deliverable, standar kinerja, dan batas ruang lingkup.]\n\nPASAL 2 — HAK DAN KEWAJIBAN\n[Susun kewajiban timbal balik secara terukur dan dapat dibuktikan.]\n\nPASAL 3 — NILAI / PEMBAYARAN\n[Nilai, termin, pajak, bukti pembayaran, konsekuensi keterlambatan.]\n\nPASAL 4 — JANGKA WAKTU DAN PENGAKHIRAN\nBerlaku untuk ${duration}; syarat pengakhiran harus dirumuskan secara proporsional dan konsisten dengan hukum yang berlaku.\n\nPASAL 5 — WANPRESTASI DAN PEMULIHAN\n[Definisikan event of default, cure period, ganti rugi, dan hak pemulihan.]\n\nPASAL 6 — FORCE MAJEURE\n[Definisi, notifikasi, mitigasi, dan akibat force majeure.]\n\nPASAL 7 — KERAHASIAAN / DATA / HKI\n[Sesuaikan dengan jenis transaksi.]\n\nPASAL 8 — HUKUM DAN PENYELESAIAN SENGKETA\n[Forum, tahapan negosiasi/mediasi/arbitrase/pengadilan harus dipilih secara sadar dan diverifikasi.]\n\nPASAL 9 — PENUTUP\n[Severability, perubahan, pemberitahuan, counterparts, meterai bila relevan.]\n\nPIHAK PERTAMA                         PIHAK KEDUA\n\n__________________                    __________________${sourceNote}${note}`;
}

// 2. Review Contract
export async function reviewContractAI(text: string, filename: string) {
  const ai = getAI();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (ai && text.trim().length > 50) {
    try {
      const systemPrompt = `Anda adalah auditor kontrak hukum senior Indonesia. Lakukan evaluasi mendalam terhadap klausul-klausul perjanjian.
Output harus berupa JSON dengan struktur persis:
{
  "risk_score": "LOW" | "MEDIUM" | "HIGH",
  "summary": "Ringkasan analisis risiko kontrak...",
  "risks": [
    {
      "clause": "Klausul / Bagian Terkait",
      "risk": "Deskripsi risiko hukum bagi pihak yang menandatangani",
      "severity": "LOW" | "MEDIUM" | "HIGH",
      "mitigation": "Rekomendasi redaksional atau mitigasi hukum"
    }
  ],
  "protective_clauses": [
    {
      "name": "Nama Klausul (misal: Pembatasan Tanggung Jawab / Limitation of Liability)",
      "status": "PRESENT" | "MISSING" | "WEAK",
      "recommendation": "Saran perbaikan klausul"
    }
  ]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Evaluasi kontrak hukum berikut:\nNama file: ${filename}\nIsi:\n${text.substring(0, 15000)}`,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.risk_score && Array.isArray(parsed.risks)) {
        return {
          filename,
          word_count: wordCount,
          risk_score: parsed.risk_score,
          summary: parsed.summary || 'Analisis klausul kontrak berhasil dilakukan.',
          risks: parsed.risks,
          protective_clauses: parsed.protective_clauses || []
        };
      }
    } catch (e) {
      console.warn('Gemini contract review failed, using deterministic review:', e);
    }
  }

  // Deterministic Contract Review
  const risks: any[] = [];
  const lower = text.toLowerCase();

  let riskScore: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

  if (!lower.includes('force majeure') && !lower.includes('keadaan memaksa')) {
    risks.push({
      clause: 'Ketentuan Keadaan Memaksa (Force Majeure)',
      risk: 'Tidak ditemukan klausul mitigasi force majeure, berpotensi memicu gugatan wanprestasi mutlak saat terjadi bencana atau disrupsi regulasi.',
      severity: 'HIGH',
      mitigation: 'Wajib mencantumkan definisi komprehensif force majeure dan prosedur notifikasi tertulis dalam 3x24 jam.'
    });
    riskScore = 'HIGH';
  }

  if (!lower.includes('arbitrase') && !lower.includes('pengadilan negeri') && !lower.includes('domisili')) {
    risks.push({
      clause: 'Klausul Pilihan Forum (Jurisdiction & Dispute Resolution)',
      risk: 'Forum penyelesaian sengketa tidak ditentukan secara spesifik, menimbulkan ketidakpastian kompetensi relatif pengadilan (Pasal 118 HIR).',
      severity: 'HIGH',
      mitigation: 'Tetapkan pilihan forum tegas: Pengadilan Negeri domisili tergugat atau Badan Arbitrase Nasional Indonesia (BANI).'
    });
    riskScore = 'HIGH';
  }

  if (lower.includes('ganti rugi') && !lower.includes('maksimal') && !lower.includes('dibatasi')) {
    risks.push({
      clause: 'Tanggung Jawab dan Ganti Rugi',
      risk: 'Klausul ganti rugi bersifat terbuka tanpa batas maksimum (liability cap) dan tidak mengecualikan kerugian tidak langsung (consequential damages).',
      severity: 'MEDIUM',
      mitigation: 'Batasi nilai ganti rugi maksimal sebesar nilai nominal kontrak atau pembayaran yang telah diterima 3 bulan terakhir.'
    });
    if (riskScore !== 'HIGH') riskScore = 'MEDIUM';
  }

  if (risks.length === 0) {
    risks.push({
      clause: 'Terminasi Sepihak',
      risk: 'Perlu pengesampingan tegas Pasal 1266 dan 1267 KUHPerdata agar pengakhiran perjanjian tidak mensyaratkan putusan pengadilan.',
      severity: 'LOW',
      mitigation: 'Tambahkan klausul penegasan pengesampingan ketentuan Pasal 1266 & 1267 KUHPerdata untuk efektivitas terminasi tertulis.'
    });
  }

  const protective_clauses = [
    { name: 'Penyelesaian Sengketa (Dispute Resolution)', status: lower.includes('sengketa') ? 'PRESENT' : 'MISSING', recommendation: 'Pastikan klausul mediasi pra-litigasi tercantum jelas.' },
    { name: 'Kerahasiaan Data & Informasi (NDA)', status: lower.includes('rahasia') ? 'PRESENT' : 'WEAK', recommendation: 'Perpanjang masa kerahasiaan minimal 2 tahun setelah perjanjian berakhir.' },
    { name: 'Pengesampingan Pasal 1266 KUHPerdata', status: lower.includes('1266') ? 'PRESENT' : 'MISSING', recommendation: 'Wajib ditambahkan agar pemutusan kontrak dapat dilakukan tanpa penetapan hakim.' }
  ];

  return {
    filename,
    word_count: wordCount,
    risk_score: riskScore,
    summary: `Audit kepatuhan klausul telah diselesaikan. Teridentifikasi ${risks.length} poin perhatian yuridis dengan tingkat risiko keseluruhan ${riskScore}.`,
    risks,
    protective_clauses
  };
}

// 3. Client Communication AI
export async function generateCommunicationAI(params: {
  client_name: string;
  legal_position?: string;
  document_type: string;
  key_points: string;
  firm_name?: string;
}): Promise<string> {
  const ai = getAI();
  const cName = params.client_name || 'Klien';
  const pos = params.legal_position || 'Klien';
  const docType = params.document_type || 'Surat Pengantar & Pendapat Hukum';
  const points = params.key_points || '';
  const firm = params.firm_name || 'Kantor Advokat LexiCore';

  if (ai) {
    try {
      const prompt = `Anda adalah advokat profesional Indonesia dari "${firm}".
Susun draf komunikasi hukum resmi kepada klien dengan rincian:
Nama Klien: ${cName}
Kedudukan Hukum: ${pos}
Bentuk Dokumen: ${docType}
Pokok Perkara / Poin-Poin yang Disampaikan:
${points}

Petunjuk:
- Gaya bahasa sopan, jelas, lugas, menenangkan namun berbasis kepastian hukum dan risiko objektif.
- Susun secara terstruktur dengan salam pembuka, rujukan perkara, analisis singkat, langkah tindak lanjut yang diperlukan dari pihak klien, dan salam penutup advokat.`;

      const res = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { temperature: 0.2 }
      });
      if (res.text && res.text.trim().length > 50) {
        return res.text.trim();
      }
    } catch (e) {
      console.warn('Gemini client communication failed, using fallback:', e);
    }
  }

  return `Kepada Yth.
Bapak/Ibu ${cName}
Di Tempat

Perihal: ${docType} — Perkembangan Penanganan Perkara & Saran Tindak Lanjut

Dengan hormat,

Sehubungan dengan penanganan perkara hukum di mana Bapak/Ibu berkedudukan sebagai ${pos}, perkenankan kami dari ${firm} menyampaikan ringkasan perkembangan serta rekomendasi langkah strategis sebagai berikut:

1. Perkembangan Terkini:
${points || 'Tim kuasa hukum telah melakukan telaah dokumen awal dan verifikasi terhadap fakta-fakta hukum yang relevan.'}

2. Analisis Posisi Hukum & Mitigasi Risiko:
Berdasarkan ketentuan hukum positif Indonesia yang berlaku, posisi hukum Bapak/Ibu memiliki dasar pembelaan yang dapat dipertahankan. Namun demikian, kami menyarankan agar tidak dilakukan pernyataan terbuka maupun penandatanganan dokumen apapun dengan pihak lawan tanpa pendampingan kuasa hukum.

3. Rekomendasi Tindak Lanjut:
- Kami memerlukan kelengkapan bukti dokumen asli dan kronologi bertanggal secara lengkap.
- Mengirimkan surat pemberitahuan/somasi resmi kepada pihak lawan guna mencatatkan itikad baik dan batas tenggang penyelesaian.

Demikian kami sampaikan. Apabila terdapat hal yang memerlukan konfirmasi lebih lanjut, mohon agar dapat menghubungi tim kami.

Hormat kami,
${firm}`;
}
