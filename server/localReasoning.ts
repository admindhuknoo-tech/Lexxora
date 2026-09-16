/**
 * LexiCore local deterministic reasoning utilities.
 * No external generative-AI service and no API key are required.
 */

const clean=(v:unknown)=>String(v??'').replace(/\s+/g,' ').trim();
const has=(text:string,re:RegExp)=>re.test(text.toLowerCase());

export function isLocalReasoningAvailable(): boolean { return true; }
export function getLocalReasoningStatus(){return {configured:true,source:'LOCAL_DETERMINISTIC',provider:'LexiCore Local Kernel',model:'lexicore-local-v2'};}

function verificationNote(){
  return '\n\nCATATAN VERIFIKASI PROFESIONAL: Dokumen ini adalah working draft. Fakta, identitas, kewenangan, forum, tenggang, bukti, dasar hukum, pasal, dan akibat hukum harus diverifikasi terhadap dokumen asli dan hukum positif sebelum digunakan.';
}

export async function generateLegalDraft(params:{doc_type:string;party1?:string;party2?:string;effective_date?:string;duration?:string;prompt?:string;profile?:any;template?:any}):Promise<string>{
  const docType=clean(params.doc_type)||'Dokumen Hukum';
  const p1=clean(params.party1)||'[Pihak/klien]';
  const p2=clean(params.party2)||'[Pihak terkait]';
  const date=clean(params.effective_date)||new Date().toISOString().slice(0,10);
  const duration=clean(params.duration)||'[Jangka waktu bila relevan]';
  const facts=clean(params.prompt)||'[Masukkan fakta, tujuan, bukti, dan instruksi khusus]';
  const structure=Array.isArray(params.template?.structure)?params.template.structure.map(clean).filter(Boolean):[];
  const upper=docType.toUpperCase();
  let body='';
  if(structure.length){
    body=structure.map((x:string,i:number)=>`${i+1}. ${x.toUpperCase()}\n[Isi hanya dari fakta/instruksi yang tersedia; tandai informasi yang belum tersedia.]`).join('\n\n');
  }else if(/SOMASI|TEGURAN|NOTICE/.test(upper)){
    body=`Kepada Yth.\n${p2}\n\nPerihal: ${docType}\n\nDengan hormat,\nKami bertindak untuk dan atas nama ${p1}. Berdasarkan informasi yang diberikan, pokok persoalan adalah:\n\n${facts}\n\nPERMINTAAN/TUNTUTAN\n[Nyatakan prestasi atau tindakan yang diminta, tenggang yang dikehendaki, dan akibat bila tidak dipenuhi. Pastikan seluruhnya telah diverifikasi.]\n\nBUKTI PENDUKUNG\n[Daftar dokumen/bukti yang mendukung posisi klien.]`;
  }else if(/GUGATAN|PERMOHONAN|PETITION/.test(upper)){
    body=`I. IDENTITAS DAN KEDUDUKAN PARA PIHAK\n${p1} / ${p2}\n\nII. KEWENANGAN, STANDING, DAN SYARAT FORMIL\n[Verifikasi forum, kompetensi, tenggang, legal standing, dan syarat prosedural.]\n\nIII. FAKTA MATERIAL / POSITA\n${facts}\n\nIV. ISU DAN DASAR HUKUM\n[Masukkan hanya norma dan pasal yang telah diverifikasi.]\n\nV. PEMBUKTIAN\n[Pasangkan setiap dalil dengan bukti.]\n\nVI. PETITUM / PERMOHONAN\n[Susun remedy yang konsisten dengan fakta, bukti, kewenangan, dan dasar hukum.]`;
  }else if(/JAWABAN|EKSEPSI|REPLIK|DUPLIK|PEMBELAAN|MEMORI|KESIMPULAN/.test(upper)){
    body=`I. POSISI DAN RUANG LINGKUP TANGGAPAN\n${facts}\n\nII. ISU FORMIL\n[Uji hanya keberatan yang relevan dan dapat dibuktikan.]\n\nIII. TANGGAPAN SUBSTANTIF\n[Pisahkan pengakuan, bantahan, fakta yang belum terbukti, dan counter-evidence.]\n\nIV. BUKTI DAN DASAR HUKUM\n[Pasangkan setiap posisi dengan bukti dan norma terverifikasi.]\n\nV. PERMOHONAN AKHIR\n[Susun secara konsisten dengan posisi dan pembuktian.]`;
  }else if(/LEGAL OPINION|LEGAL MEMORANDUM|PENDAPAT HUKUM/.test(upper)){
    body=`1. PERTANYAAN HUKUM\n[Rumuskan isu.]\n\n2. FAKTA MATERIAL\n${facts}\n\n3. ASUMSI DAN GAP\n[Pisahkan asumsi dari fakta.]\n\n4. HUKUM YANG TERVERIFIKASI\n[Masukkan sumber resmi, tempus, dan pasal.]\n\n5. ANALISIS\n[Subsumsi per isu.]\n\n6. COUNTER-ANALYSIS / RISIKO\n[Uji posisi lawan dan kelemahan bukti.]\n\n7. REKOMENDASI\n[Langkah prioritas dan bukti yang harus dilengkapi.]`;
  }else if(/KUASA/.test(upper)){
    body=`PEMBERI KUASA\n${p1}\n\nPENERIMA KUASA\n${p2}\n\nKHUSUS\nUntuk bertindak sehubungan dengan:\n${facts}\n\nRUANG LINGKUP DAN BATAS KEWENANGAN\n[Nyatakan tindakan yang diberikan secara spesifik; tindakan disposisi/substitusi hanya dicantumkan jika benar-benar dikehendaki dan sah.]`;
  }else{
    body=`PARA PIHAK\n1. ${p1}\n2. ${p2}\n\nLATAR BELAKANG / FAKTA DASAR\n${facts}\n\nOBJEK DAN RUANG LINGKUP\n[Definisikan objek dan deliverable.]\n\nHAK DAN KEWAJIBAN\n[Susun hanya dari kesepakatan/instruksi yang tersedia.]\n\nNILAI / PEMBAYARAN\n[Termin, bukti pembayaran, pajak bila relevan.]\n\nJANGKA WAKTU\n${duration}\n\nWANPRESTASI / PELANGGARAN DAN PEMULIHAN\n[Definisikan trigger, kesempatan perbaikan, serta remedy yang telah diverifikasi.]\n\nPENYELESAIAN SENGKETA\n[Pilih mekanisme/forum setelah verifikasi.]\n\nPENUTUP\n[Perubahan, pemberitahuan, tanda tangan, dan formalitas relevan.]`;
  }
  return `${docType.toUpperCase()}\n\nTanggal: ${date}\n\n${body}${verificationNote()}`;
}

export async function reviewContract(text:string,filename:string){
  const lower=String(text||'').toLowerCase();
  const wordCount=String(text||'').split(/\s+/).filter(Boolean).length;
  const catalogue=[
    {name:'Identitas para pihak',re:/para pihak|pihak pertama|pihak kedua|identitas/,material:true},
    {name:'Objek / ruang lingkup',re:/objek|ruang lingkup|scope|pekerjaan|layanan/,material:true},
    {name:'Nilai / pembayaran',re:/pembayaran|harga|nilai|fee|biaya|termin/,material:true},
    {name:'Jangka waktu / efektif',re:/jangka waktu|berlaku sejak|tanggal efektif|masa berlaku/,material:true},
    {name:'Pelaksanaan / standar kinerja',re:/kewajiban|deliverable|target|standar|pelaksanaan/,material:false},
    {name:'Pelanggaran / default',re:/wanprestasi|default|pelanggaran|cidera janji/,material:false},
    {name:'Pengakhiran',re:/pengakhiran|pemutusan|terminasi|berakhir/,material:false},
    {name:'Keadaan memaksa',re:/force majeure|keadaan memaksa/,material:false},
    {name:'Kerahasiaan / data',re:/kerahasiaan|rahasia|confidential|data pribadi/,material:false},
    {name:'Penyelesaian sengketa / forum',re:/sengketa|arbitrase|mediasi|pengadilan|forum/,material:true},
    {name:'Perubahan / amendment',re:/perubahan|amendment|addendum/,material:false},
  ];
  const protective_clauses=catalogue.map(c=>({name:c.name,status:c.re.test(lower)?'PRESENT':'MISSING',recommendation:c.re.test(lower)?'Periksa kejelasan, konsistensi, dan enforceability klausul terhadap keseluruhan kontrak.':'Pertimbangkan apakah klausul ini material untuk transaksi; jangan menambahkan secara mekanis tanpa kebutuhan bisnis/hukum.'}));
  const missingMaterial=catalogue.filter(c=>c.material&&!c.re.test(lower));
  const risks:Array<{clause:string;risk:string;severity:'HIGH'|'MEDIUM'|'LOW';mitigation:string}>=missingMaterial.map(c=>({clause:c.name,risk:'Elemen material tidak terdeteksi dari teks; dapat menimbulkan ketidakpastian hak/kewajiban atau pelaksanaan.',severity:'HIGH',mitigation:'Konfirmasi kebutuhan klausul, fakta komersial, dan dasar hukum; susun redaksi setelah verifikasi.'}));
  const weakSignals:Array<{clause:string;risk:string;severity:'MEDIUM';mitigation:string}>=[];
  if(/sepihak|sole discretion|mutlak/.test(lower)) weakSignals.push({clause:'Diskresi/ketentuan sepihak',risk:'Terdapat bahasa yang memberi kewenangan sepihak; keseimbangan, batas, trigger, dan prosedur perlu diuji.',severity:'MEDIUM',mitigation:'Identifikasi pihak yang diuntungkan, trigger, notice, kesempatan perbaikan, dan remedy.'});
  if(/ganti rugi|indemn/.test(lower)&&!/batas|maksimal|cap|limit/.test(lower)) weakSignals.push({clause:'Tanggung jawab/ganti rugi',risk:'Terdapat kewajiban ganti rugi tetapi batas/ruang lingkupnya tidak jelas dari pencarian tekstual.',severity:'MEDIUM',mitigation:'Uji jenis kerugian, kausalitas, pengecualian, batas, dan prosedur klaim terhadap tujuan transaksi.'});
  risks.push(...weakSignals);
  const risk_score=risks.some(r=>r.severity==='HIGH')?'HIGH':risks.length?'MEDIUM':'LOW';
  return {filename,word_count:wordCount,risk_score,summary:`Review deterministik menemukan ${risks.length} area perhatian dan ${protective_clauses.filter(x=>x.status==='MISSING').length} kategori klausul yang tidak terdeteksi. Hasil adalah issue spotting, bukan kesimpulan enforceability.`,risks,protective_clauses};
}

export async function generateClientCommunication(params:{client_name:string;legal_position?:string;document_type:string;key_points:string;firm_name?:string}){
  const client=clean(params.client_name)||'Klien';
  const position=clean(params.legal_position)||'pihak yang didampingi';
  const docType=clean(params.document_type)||'Pemberitahuan Perkembangan Perkara';
  const points=clean(params.key_points)||'[Belum ada poin material yang dimasukkan]';
  const firm=clean(params.firm_name)||'LexiCore';
  return `Kepada Yth.\nBapak/Ibu ${client}\n\nPerihal: ${docType}\n\nDengan hormat,\n\nSehubungan dengan pendampingan hukum Bapak/Ibu sebagai ${position}, berikut ringkasan berdasarkan informasi yang tersedia:\n\n${points}\n\nHAL YANG MASIH PERLU DIVERIFIKASI\n- fakta dan kronologi material;\n- dokumen/bukti primer;\n- dasar hukum dan tempus;\n- forum, tenggang, dan tindakan yang akan dipilih.\n\nTINDAK LANJUT\n[Isi langkah yang telah disetujui lawyer setelah verifikasi.]\n\nHormat kami,\n${firm}${verificationNote()}`;
}

export function summarizeSourceDeterministically(text:string,maxChars=4000):string{
  const normalized=clean(text);
  if(!normalized)return '';
  const sentences=normalized.split(/(?<=[.!?;:])\s+/).filter(x=>x.length>25);
  const scored=sentences.map((s,i)=>{
    let score=Math.max(0,8-i*.15);
    if(/\b(?:19|20)\d{2}\b|pasal|putusan|perjanjian|fakta|pertimbangan|kesimpulan|menetapkan|mengadili/i.test(s))score+=2;
    return {s,score,i};
  }).sort((a,b)=>b.score-a.score).slice(0,Math.min(12,sentences.length)).sort((a,b)=>a.i-b.i).map(x=>x.s);
  const out=scored.join(' ');
  return out.slice(0,maxChars)+(out.length>maxChars?'…':'');
}

// Compatibility names used by existing API routes.
export const generateLegalDraftAI=generateLegalDraft;
export const reviewContractAI=reviewContract;
export const generateCommunicationAI=generateClientCommunication;
