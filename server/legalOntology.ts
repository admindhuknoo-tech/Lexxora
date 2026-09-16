export type LegalDomainId =
  | 'KELUARGA_WARIS'
  | 'AGRARIA_PERTANAHAN'
  | 'PERDATA_KONTRAKTUAL'
  | 'PIDANA_MATERIIL_FORMIL'
  | 'KETENAGAKERJAAN_PHI'
  | 'KORPORASI_BISNIS'
  | 'PEMILU_ETIK_DKPP'
  | 'TUN_ADMINISTRASI'
  | 'PERDATA_UMUM';

export interface LegalIssueTemplate {
  id: string;
  question: string;
  basis: string;
  signals: RegExp[];
  minimum_page_hits?: number;
  query_terms?: string[];
  supersedes?: string[];
}

export interface LegalDomainProfile {
  id: LegalDomainId;
  label: string;
  weighted_signals: Array<{ pattern: RegExp; weight: number }>;
  negative_signals?: Array<{ pattern: RegExp; weight: number }>;
  issue_templates: LegalIssueTemplate[];
  authority_anchors: string[];
}

const profile = (
  id: LegalDomainId,
  label: string,
  weighted_signals: Array<[RegExp, number]>,
  issue_templates: LegalIssueTemplate[],
  authority_anchors: string[],
  negative_signals: Array<[RegExp, number]> = [],
): LegalDomainProfile => ({
  id, label,
  weighted_signals: weighted_signals.map(([pattern, weight]) => ({ pattern, weight })),
  negative_signals: negative_signals.map(([pattern, weight]) => ({ pattern, weight })),
  issue_templates, authority_anchors,
});

export const LEGAL_DOMAIN_PROFILES: LegalDomainProfile[] = [
  profile('KELUARGA_WARIS','Hukum Keluarga & Waris',
    [[/\bwaris\b|ahli\s+waris|pewaris|boedel|harta\s+peninggalan/i,8],[/legitime\s+portie|legitieme\s+portie|bagian\s+mutlak/i,12],[/anak\s+kandung|anak\s+angkat|janda|duda|istri|suami|ibu\s+tiri|ayah\s+tiri/i,3],[/meninggal|kematian|wafat/i,5],[/hibah|wasiat|testamen/i,5],[/harta\s+bawaan|harta\s+bersama|gono[\s-]?gini/i,7]],
    [
      { id:'inheritance-entitlement', question:'Siapa subjek yang berkedudukan sebagai ahli waris, rezim waris apa yang berlaku, dan bagaimana bagian masing-masing termasuk bagian mutlak bila relevan?', basis:'Terdapat kematian/pewarisan, hubungan keluarga, atau pertanyaan mengenai bagian ahli waris.', signals:[/\bwaris\b|ahli\s+waris|pewaris|legitime\s+portie|bagian\s+mutlak|meninggal|wafat/i], query_terms:['waris','ahli waris','bagian mutlak','legitime portie'] },
      { id:'marital-property-estate', question:'Objek mana yang merupakan harta bawaan, harta bersama, atau boedel waris, dan kapan serta dari sumber apa objek tersebut diperoleh?', basis:'Status harta harus dipisahkan sebelum menentukan bagian waris atau hak pasangan.', signals:[/harta\s+bawaan|harta\s+bersama|gono[\s-]?gini|perkawinan|menikah|sebelum\s+menikah|selama\s+perkawinan/i], query_terms:['harta bawaan','harta bersama','boedel waris','perkawinan'] },
      { id:'estate-asset-protection', question:'Tindakan perlindungan apa yang diperlukan terhadap objek atau dokumen boedel, termasuk pencegahan pengalihan, pemblokiran bila relevan, dan pemulihan/penggantian dokumen?', basis:'Terdapat risiko penguasaan, pengalihan, kerusakan, kehilangan, atau pemusnahan dokumen/objek waris.', signals:[/menguasai|dikuasai|dialihkan|dijual|sertifikat|dokumen|dirusak|dirobek|hilang|dibakar|direndam/i], query_terms:['pewarisan','perlindungan boedel','sertifikat pengganti','dokumen rusak'] },
      { id:'civil-criminal-response', question:'Apakah tindakan penguasaan atau perusakan menimbulkan konsekuensi perdata, pidana, atau keduanya, dan unsur/bukti apa yang diperlukan untuk tiap jalur?', basis:'Terdapat tindakan terhadap barang/dokumen atau penguasaan yang berpotensi melanggar hak pihak lain.', signals:[/merusak|dirobek|menghancurkan|menghilangkan|menguasai|melawan\s+hukum|pidana|lapor/i], query_terms:['perbuatan melawan hukum','perusakan barang','penguasaan tanpa hak'] },
    ],
    ['waris','ahli waris','pewaris','legitime portie','bagian mutlak','harta bawaan','harta bersama','boedel','pewarisan'],
    [[/wakaf|hak\s+ulayat|ptsl/i,4]]),
  profile('AGRARIA_PERTANAHAN','Hukum Agraria & Pertanahan',
    [[/\btanah\b|pertanahan|agraria|bpn/i,3],[/sertifikat|\bshm\b|\bshgb\b|\bhgb\b/i,4],[/\bajb\b|\bppjb\b|hak\s+atas\s+tanah|pendaftaran\s+tanah/i,7],[/sengketa\s+batas|tumpang\s+tindih|pengukuran|surat\s+ukur/i,8]],
    [
      { id:'land-title', question:'Apa status hak atas tanah, riwayat perolehan, dan kekuatan dokumen pertanahan masing-masing pihak?', basis:'Terdapat objek tanah/hak atas tanah dan dokumen pertanahan.', signals:[/tanah|sertifikat|shm|hgb|ajb|ppjb|bpn/i], query_terms:['hak atas tanah','sertifikat','riwayat perolehan'] },
      { id:'land-sale-chain', question:'Bagaimana rantai penguasaan/perolehan objek tanah dari pemegang hak sampai transaksi yang dipersoalkan, apakah pihak yang mengalihkan mempunyai kewenangan, dan dokumen apa yang membuktikan setiap tahap?', basis:'Terdapat transaksi tanah yang melibatkan lebih dari satu pihak, PPJB/AJB, pemecahan sertifikat, atau peralihan berantai.', signals:[/jual\s+beli.*tanah|tanah.*jual\s+beli|\bppjb\b|\bajb\b|pemecahan\s+(?:shm|sertifikat)|menjual\s+kembali|dijual\s+kembali/i], query_terms:['peralihan hak karena jual beli','PPJB','AJB','kewenangan mengalihkan hak','hak atas tanah','pendaftaran tanah','sertifikat','pemecahan sertifikat'], supersedes:['land-title'] },
      { id:'land-registration', question:'Apakah pendaftaran, pemeliharaan data, peralihan, atau pembebanan hak telah dilakukan sesuai dasar dan kewenangan yang benar?', basis:'Terdapat tindakan administrasi/pendaftaran hak atas tanah.', signals:[/pendaftaran|peralihan|balik\s+nama|sertifikat|bpn|hak\s+tanggungan/i], query_terms:['pendaftaran tanah','peralihan hak','sertifikat','hak atas tanah','pemeliharaan data','balik nama'] },
    ],
    ['agraria','pertanahan','hak atas tanah','pendaftaran tanah','sertifikat','bpn'],
    [[/legitime\s+portie|bagian\s+mutlak|ahli\s+waris/i,3]]),
  profile('PERDATA_KONTRAKTUAL','Hukum Perdata & Perikatan',
    [[/wanprestasi|ingkar\s+janji/i,9],[/perjanjian|kontrak|perikatan|pengikatan\s+jual\s+beli|sewa|menyewa|penyewa|pemberi\s+sewa/i,6],[/somasi|jatuh\s+tempo|prestasi|ganti\s+rugi/i,6],[/jual\s+beli|utang|piutang|debitur|kreditur|gadai|menggadaikan|digadaikan/i,5],[/pembayaran\s+bertahap|uang\s+muka|\bdp\b|termin|tahap\s+(?:kedua|berikut)/i,7],[/pembatalan|pengakhiran|pengembalian\s+uang|kembali\s+uang|refund|restitusi/i,8],[/tidak\s+kunjung|menghindar|tidak\s+memenuhi/i,5],[/perbuatan\s+melawan\s+hukum|\bpmh\b/i,7]],
    [
      { id:'contract-obligation', question:'Apa hubungan kontraktual, prestasi para pihak, syarat pelaksanaan, dan bukti lahirnya kewajiban?', basis:'Terdapat hubungan perjanjian/perikatan.', signals:[/perjanjian|kontrak|jual\s+beli|utang|piutang|prestasi|sewa|menyewa|penyewa|gadai|menggadaikan|digadaikan/i], query_terms:['perjanjian','perikatan','prestasi'] },
      { id:'conditional-performance', question:'Apakah pembayaran atau prestasi berikutnya bergantung pada syarat/kejadian tertentu, apakah syarat itu terjadi, dan siapa yang menanggung akibat jika syarat tidak terpenuhi?', basis:'Terdapat termin, pembayaran bertahap, syarat pendahuluan, milestone, atau prestasi yang dikaitkan dengan kejadian tertentu.', signals:[/pembayaran\s+bertahap|\btermin\b|tahap\s+(?:kedua|berikut)|(?:akan\s+dibayar|pelunasan|prestasi)[^.;]{0,90}(?:setelah|apabila|jika)|(?:setelah|apabila|jika)[^.;]{0,90}(?:terbit|keluar|selesai)[^.;]{0,90}(?:dibayar|pelunasan|prestasi)|syarat\s+pendahuluan|milestone/i], query_terms:['syarat perjanjian','prestasi bersyarat','pembayaran bertahap'] },
      { id:'cancellation-restitution', question:'Apakah pembatalan/pengakhiran disepakati atau dibenarkan, dan apa akibat restitusi/pengembalian prestasi yang telah diterima masing-masing pihak?', basis:'Terdapat pembatalan/pengakhiran, pengembalian pembayaran, atau permintaan pemulihan prestasi.', signals:[/pembatalan|membatalkan|dibatalkan|pengakhiran|mengakhiri|kembali\s+uang|pengembalian\s+uang|refund|restitusi/i], query_terms:['pembatalan perjanjian','pengembalian prestasi','restitusi'] },
      { id:'default-remedies', question:'Apakah kewajiban telah dapat ditagih dan terjadi wanprestasi, termasuk syarat lalai/somasi, kausalitas, kerugian, dan remedy?', basis:'Terdapat indikasi prestasi tidak dipenuhi atau terlambat.', signals:[/wanprestasi|ingkar\s+janji|somasi|jatuh\s+tempo|tidak\s+memenuhi|tidak\s+kunjung|ganti\s+rugi|menghindar/i], query_terms:['wanprestasi','somasi','ganti rugi'] },
      { id:'competing-disposition', question:'Apakah objek atau hak yang sebelumnya dijanjikan/ditransaksikan kemudian dialihkan atau ditawarkan kepada pihak ketiga, dan apa akibatnya terhadap kewajiban serta perlindungan pihak yang lebih dahulu bertransaksi?', basis:'Terdapat indikasi pengalihan, penjualan ulang, atau transaksi dengan pihak ketiga atas objek yang sama.', signals:[/pihak\s+ketiga|menjual\s+kembali|dijual\s+kembali|akan\s+dijual|mengalihkan|dialihkan|objek\s+yang\s+sama/i], query_terms:['pengalihan kepada pihak ketiga','jual beli objek yang sama','perlindungan pihak bertransaksi'] },
      { id:'tort-alternative', question:'Apakah terdapat dasar perbuatan melawan hukum yang berdiri sendiri atau hanya duplikasi dari wanprestasi?', basis:'Terdapat tindakan di luar pelaksanaan kontrak yang berpotensi melanggar hak.', signals:[/perbuatan\s+melawan\s+hukum|\bpmh\b|melawan\s+hukum/i], query_terms:['perbuatan melawan hukum','ganti rugi'] },
    ],
    ['wanprestasi','perjanjian','perikatan','hukum perdata','kuhperdata','ganti rugi','ingkar janji','somasi']),
  profile('PIDANA_MATERIIL_FORMIL','Hukum Pidana & Acara Pidana',
    [[/pidana|tersangka|terdakwa|penyidik|penuntut|kejaksaan|laporan\s+polisi|polres/i,4],[/penangkapan|penahanan|ditangkap|ditahan|penggeledahan|penyitaan/i,7],[/penipuan|penggelapan|korupsi|suap|gratifikasi|menggadaikan\s+barang\s+milik|digadaikan\s+tanpa\s+izin/i,7]],
    [
      { id:'criminal-elements', question:'Unsur delik apa yang didalilkan dan fakta/bukti apa yang mendukung atau meniadakan tiap unsur?', basis:'Terdapat dugaan tindak pidana.', signals:[/pidana|penipuan|penggelapan|korupsi|suap|gratifikasi|menggadaikan\s+barang\s+milik|digadaikan\s+tanpa\s+izin/i], query_terms:['unsur tindak pidana','pembuktian pidana'] },
      { id:'criminal-procedure', question:'Apakah proses penyidikan, perolehan bukti, dan upaya paksa memenuhi dasar, prosedur, tempus, dan kewenangan?', basis:'Terdapat tindakan proses pidana atau upaya paksa.', signals:[/bap|penyidik|penangkapan|penahanan|ditangkap|ditahan|laporan\s+polisi|polres|penggeledahan|penyitaan/i], query_terms:['acara pidana','penyidikan','upaya paksa','alat bukti'] },
    ],
    ['pidana','kuhp','kuhap','acara pidana','tersangka','terdakwa','alat bukti']),
  profile('KETENAGAKERJAAN_PHI','Hukum Ketenagakerjaan & Hubungan Industrial',
    [[/phk|hubungan\s+kerja|ketenagakerjaan/i,8],[/upah|pesangon|pekerja|buruh|pengusaha/i,4]],
    [{ id:'employment-rights', question:'Apa status hubungan kerja, hak normatif, dasar perselisihan/PHK, serta prosedur penyelesaian yang berlaku?', basis:'Terdapat hubungan kerja atau perselisihan industrial.', signals:[/phk|hubungan\s+kerja|upah|pekerja|buruh|pesangon|pengusaha/i], query_terms:['hubungan industrial','PHK','upah','pesangon'] }],
    ['ketenagakerjaan','hubungan industrial','pekerja','buruh','phk','upah','pesangon']),
  profile('KORPORASI_BISNIS','Hukum Perusahaan & Bisnis',
    [[/perseroan|direksi|komisaris|rups|pemegang\s+saham/i,7],[/saham|korporasi|perusahaan/i,3]],
    [{ id:'corporate-authority', question:'Apa kewenangan organ, hubungan antar-pemegang kepentingan, dan akibat tindakan korporasi yang dipersoalkan?', basis:'Terdapat struktur atau tindakan korporasi.', signals:[/perseroan|direksi|komisaris|rups|saham|pemegang\s+saham/i], query_terms:['perseroan','direksi','komisaris','RUPS','pemegang saham'] }],
    ['perseroan','direksi','komisaris','rups','pemegang saham','saham']),
  profile('PEMILU_ETIK_DKPP','Hukum Pemilu & Etik Penyelenggara',
    [[/dkpp|kode\s+etik|penyelenggara\s+pemilu/i,9],[/anggota\s+kpu|kpu\s+kota|bawaslu|teradu|pengadu/i,4]],
    [
      { id:'election-ethics', question:'Apakah tindakan yang dipersoalkan memenuhi unsur pelanggaran kode etik/independensi penyelenggara pada tempus yang relevan?', basis:'Terdapat perkara etik penyelenggara pemilu.', signals:[/dkpp|kode\s+etik|penyelenggara\s+pemilu|anggota\s+kpu/i], query_terms:['DKPP','kode etik','penyelenggara pemilu'] },
      { id:'electronic-evidence', question:'Apakah bukti elektronik autentik, dapat diatribusikan, diperoleh secara sah, dan relevan terhadap dalil?', basis:'Terdapat bukti elektronik/screenshot/WhatsApp.', signals:[/whatsapp|screenshot|tangkapan\s+layar|bukti\s+elektronik/i], query_terms:['bukti elektronik','autentikasi'] },
    ],
    ['dkpp','kode etik','penyelenggara pemilu','komisi pemilihan umum','kpu']),
  profile('TUN_ADMINISTRASI','Hukum Administrasi Negara / TUN',
    [[/ptun|keputusan\s+tata\s+usaha|administrasi\s+negara/i,8],[/pejabat\s+tata\s+usaha|izin|keputusan\s+pejabat/i,4]],
    [{ id:'administrative-decision', question:'Apakah keputusan/tindakan pejabat memenuhi kewenangan, prosedur, substansi, tempus, dan upaya administratif yang berlaku?', basis:'Terdapat keputusan atau tindakan administrasi pemerintahan.', signals:[/ptun|keputusan\s+tata\s+usaha|administrasi\s+negara|izin/i], query_terms:['keputusan tata usaha negara','kewenangan','upaya administratif'] }],
    ['tata usaha negara','ptun','administrasi negara','keputusan tata usaha','izin']),
];

/**
 * Cross-cutting legal issue templates. These are generic legal concepts that can apply
 * across domains (organizational status, instrument revision, electronic evidence,
 * document authenticity, agency, consumer, insurance, IP). No case-specific hardcoding.
 */
export const CROSS_CUTTING_ISSUES: LegalIssueTemplate[] = [
  { id:'capacity-authority', question:'Apakah setiap aktor mempunyai kapasitas, kewenangan, atau dasar representasi untuk melakukan tindakan yang dipersoalkan?', basis:'Kapasitas dan kewenangan subjek dapat menentukan sah/tidaknya tindakan dan siapa yang dapat dimintai pertanggungjawaban.', signals:[/kuasa|mewakili|wali|direktur|pengurus|pejabat|atas\s+nama|kewenangan|berwenang/i], query_terms:['kapasitas hukum','kewenangan','perwakilan'] },
  { id:'civil-criminal-boundary', question:'Jika fakta menunjukkan kerugian, penguasaan, penipuan, penggelapan, perusakan, atau pelanggaran kewajiban, apakah persoalan berada pada jalur perdata, pidana, atau keduanya, dan unsur apa yang membedakannya?', basis:'Terdapat tindakan yang dapat memiliki lebih dari satu kualifikasi hukum sehingga jalur tidak boleh dipilih hanya dari label pihak.', signals:[/ditipu|penipuan|penggelapan|merusak|menghilangkan|menguasai\s+tanpa|menggadaikan|digadaikan|mengalihkan\s+tanpa|melawan\s+hukum|wanprestasi|ingkar\s+janji/i], query_terms:['kualifikasi perdata pidana','unsur perbuatan','pembuktian'] },
  { id:'remedy-procedure', question:'Remedy dan langkah prosedural apa yang secara faktual dibutuhkan untuk melindungi posisi klien, dengan forum, tenggang, kewenangan, dan syarat formil yang masih harus diverifikasi?', basis:'Setiap analisis lawyer perlu memisahkan issue spotting dari pemilihan remedy dan prosedur yang benar.', signals:[/upaya\s+hukum|somasi|gugatan|permohonan|lapor|pembatalan|pengembalian|ganti\s+rugi|blokir|sita|banding|kasasi/i], query_terms:['remedy hukum','prosedur','tenggang','forum'] },
  { id:'formal-status', question:'Apakah status formal, jabatan, dan kepengurusan yang dipersoalkan sah menurut anggaran dasar/anggaran rumah tangga dan peraturan yang berlaku pada tempus tersebut?', basis:'Dokumen menyebut jabatan/status kepengurusan formal yang dapat mempengaruhi kewenangan dan tanggung jawab subjek.', signals:[/kepengurusan|pengurus|jabatan|wakil\s+ketua|ketua|sekretaris|bendahara|direktur|komisaris|status\s+formal/i], query_terms:['kepengurusan','jabatan','anggaran dasar','status formal'] },
  { id:'resignation-replacement', question:'Apakah pengunduran diri, pemberhentian, atau penggantian pejabat/pengurus memenuhi prosedur, kewenangan, dan tempus yang berlaku?', basis:'Dokumen menyebut pengunduran diri, pemberhentian, atau penggantian pejabat/pengurus.', signals:[/pengunduran\s+diri|mengundurkan\s+diri|diberhentikan|pemberhentian|penggantian|berhenti\s+dari\s+jabatan/i], query_terms:['pengunduran diri','pemberhentian','prosedur penggantian'] },
  { id:'instrument-revision', question:'Apakah perubahan, revisi, atau pencabutan instrumen formal (SK, surat, keputusan) memiliki dasar kewenangan, prosedur, dan tempus yang sah sehingga dapat mengikat pihak yang bersangkutan?', basis:'Terdapat revisi/perubahan instrumen formal yang dapat mempengaruhi hak dan status hukum para pihak.', signals:[/sk\s+(awal|revisi)|surat\s+keputusan\s+(awal|revisi)|mencantumkan\s+nama|tidak\s+mencantumkan\s+nama|surat\s+revisi|perubahan\s+sk|revisi\s+sk|pencabutan\s+sk/i], query_terms:['perubahan surat keputusan','keabsahan revisi','kewenangan'] },
  { id:'electronic-evidence', question:'Apakah bukti elektronik autentik, diperoleh secara sah, dapat diatribusikan kepada sumbernya, dan cukup relevan untuk membuktikan dalil?', basis:'Terdapat bukti elektronik seperti WhatsApp, screenshot, atau media sosial.', signals:[/whatsapp|tangkapan\s+layar|screenshot|bukti\s+elektronik|transmisi|akun\s+medsos|media\s+sosial|\bchat\b/i], query_terms:['bukti elektronik','autentikasi','ITE'] },
  { id:'document-authenticity', question:'Apakah keaslian, tanggal, dan integritas dokumen kunci dapat diverifikasi, dan apakah ada indikasi pemalsuan atau perubahan setelah dokumen dibuat?', basis:'Terdapat dokumen formal yang keaslian/tanggalnya menjadi krusial untuk pembuktian.', signals:[/\b(akta|sertifikat|kwitansi|tanda\s+terima|bukti\s+pembayaran|dokumen\s+asli|surat\s+pernyataan)\b/i], query_terms:['keaslian dokumen','pembuktian akta'] },
  { id:'power-of-attorney', question:'Apakah ruang lingkup, batas kewenangan, dan keabsahan formil surat kuasa sesuai dengan tindakan yang dilakukan penerima kuasa?', basis:'Terdapat pemberian kuasa yang ruang lingkupnya perlu diverifikasi.', signals:[/surat\s+kuasa|pemberi\s+kuasa|penerima\s+kuasa|memberikan\s+kuasa\s+kepada/i], query_terms:['surat kuasa','kewenangan'] },
  { id:'asset-disposition-authority', question:'Apakah pihak yang menguasai barang berwenang menyewakan kembali, menggadaikan, menjual, atau mengalihkan barang tersebut, dan bagaimana rantai penguasaan serta hak pihak ketiga harus dibuktikan?', basis:'Terdapat penguasaan atau pengalihan barang kepada pihak lain yang memerlukan pembuktian kewenangan, rantai transaksi, dan status pihak ketiga.', signals:[/menggadaikan|digadaikan|menyewakan\s+kembali|disewakan\s+kembali|menjual\s+kembali|dialihkan\s+kepada|barang\s+milik\s+orang\s+lain|penguasaan\s+barang/i], query_terms:['kewenangan mengalihkan barang','gadai','penguasaan barang','pihak ketiga'] },
  { id:'consumer-relationship', question:'Apakah terdapat pelanggaran hak konsumen, tanggung jawab pelaku usaha, dan mekanisme ganti rugi yang berlaku?', basis:'Terdapat hubungan konsumen dan pelaku usaha.', signals:[/konsumen|pelaku\s+usaha|perlindungan\s+konsumen|cacat\s+produk|klaim\s+garansi/i], query_terms:['perlindungan konsumen','cacat produk','ganti rugi'] },
  { id:'insurance-claim', question:'Apakah syarat polis, kejadian yang dipertanggungkan, dan proses klaim terpenuhi sehingga hak pembayaran dapat ditentukan?', basis:'Terdapat hubungan asuransi/polis/klaim pertanggungan.', signals:[/\basuransi\b|\bpolis\b|klaim\s+asuransi|\btertanggung\b|\bpenanggung\b|kejadian\s+yang\s+dipertanggungkan/i], query_terms:['asuransi','polis','klaim'] },
  { id:'ip-rights', question:'Apakah terdapat pelanggaran hak kekayaan intelektual dan apa akibat hukumnya?', basis:'Terdapat persoalan merek/paten/hak cipta/kekayaan intelektual.', signals:[/\bmerek\b|\bpaten\b|hak\s+cipta|kekayaan\s+intelektual|\bhki\b/i], query_terms:['hak kekayaan intelektual','merek','hak cipta'] },
];

export function splitPages(text:string): Array<{page:number;text:string}> {
  const re=/---\s*HALAMAN\s+(\d+)\s*---/gi;
  const ms=[...String(text||'').matchAll(re)];
  if(!ms.length)return[{page:1,text:String(text||'').replace(/\s+/g,' ').trim()}];
  return ms.map((m,i)=>({page:Number(m[1])||i+1,text:String(text).slice((m.index||0)+m[0].length,i+1<ms.length?(ms[i+1].index||text.length):text.length).replace(/\s+/g,' ').trim()}));
}

function regexTest(pattern: RegExp, text: string): boolean {
  return new RegExp(pattern.source, pattern.flags.replace(/g/g,'')).test(text);
}

function supportByPage(text:string, pattern:RegExp): {pages:number; head:boolean} {
  const ps=splitPages(text);
  let pages=0;
  for(const p of ps) if(regexTest(pattern,p.text)) pages++;
  const head=regexTest(pattern,ps.slice(0,Math.min(2,ps.length)).map(p=>p.text).join(' '));
  return {pages,head};
}

function signalContribution(pageHits:number, weight:number, head:boolean):number {
  if(!pageHits) return 0;
  const saturated=1 + Math.log2(Math.min(8,pageHits));
  return Math.round(weight * saturated + (head ? Math.min(3,weight*.25) : 0));
}

export function inferLegalContext(text: string) {
  const scores = LEGAL_DOMAIN_PROFILES.map(p => {
    let positive=0, negative=0;
    const signals:string[]=[];
    for(const s of p.weighted_signals){
      const support=supportByPage(text,s.pattern);
      const contribution=signalContribution(support.pages,s.weight,support.head);
      if(contribution){positive+=contribution;signals.push(`+${s.pattern.source}:p${support.pages}:${contribution}`)}
    }
    for(const s of p.negative_signals||[]){
      const support=supportByPage(text,s.pattern);
      const contribution=signalContribution(support.pages,s.weight,support.head);
      if(contribution){negative+=contribution;signals.push(`-${s.pattern.source}:p${support.pages}:${contribution}`)}
    }
    return {id:p.id,label:p.label,score:Math.max(0,positive-negative),positive,negative,signals,profile:p};
  }).sort((a,b)=>b.score-a.score);

  const top=scores[0]; const runner=scores[1];
  const margin=(top?.score||0)-(runner?.score||0);
  const confidence=!top||top.score===0 ? 'LOW' : top.score>=14 && margin>=5 ? 'HIGH' : top.score>=8 && margin>=2 ? 'MEDIUM' : 'LOW';
  const ambiguous=confidence==='LOW' || (!!runner && runner.score>0 && margin<2);
  const primary=top && top.score>0 ? top
    : { id:'PERDATA_UMUM' as LegalDomainId, label:'Hukum Indonesia - Kualifikasi Belum Final', score:0, positive:0, negative:0, signals:[], profile:undefined };
  const secondary=scores.filter(x=>x.score>=6 && x.id!==primary.id && x.score>=Math.max(8,primary.score*.30)).slice(0,3);
  return {primary,secondary,scores,confidence,ambiguous,margin};
}

export function deriveOntologyIssues(text: string): Array<{issue:string;basis:string;pages:number[];domain:LegalDomainId;id:string;query_terms:string[]}> {
  const context=inferLegalContext(text);
  const active=[context.primary,...context.secondary].filter(x=>x.profile);
  const pages=splitPages(text);
  const out:Array<{issue:string;basis:string;pages:number[];domain:LegalDomainId;id:string;query_terms:string[]}>=[];

  for(const d of active){
    for(const template of d.profile!.issue_templates){
      const matchedPages=pages.filter(p=>template.signals.some(r=>regexTest(r,p.text))).map(p=>p.page);
      if(matchedPages.length >= (template.minimum_page_hits||1)) out.push({issue:template.question,basis:template.basis,pages:matchedPages.slice(0,12),domain:d.id,id:template.id,query_terms:template.query_terms||[]});
    }
  }

  // Cross-cutting issues (apply regardless of primary domain)
  for(const template of CROSS_CUTTING_ISSUES){
    const matchedPages=pages.filter(p=>template.signals.some(r=>regexTest(r,p.text))).map(p=>p.page);
    if(matchedPages.length>0){
      out.push({issue:template.question,basis:template.basis,pages:matchedPages.slice(0,12),domain:(context.primary.id||'PERDATA_UMUM') as LegalDomainId,id:template.id,query_terms:template.query_terms||[]});
    }
  }

  // Remove generic issues superseded by a more specific issue in the same domain.
  const superseded=new Set<string>();
  for(const d of active){
    const matchedIds=new Set(out.filter(x=>x.domain===d.id).map(x=>x.id));
    for(const t of d.profile!.issue_templates){
      if(matchedIds.has(t.id)) for(const id of t.supersedes||[]) superseded.add(`${d.id}:${id}`);
    }
  }
  const seen=new Set<string>();
  let filtered=out.filter(x=>{const k=`${x.domain}:${x.id}`;if(superseded.has(k)||seen.has(k))return false;seen.add(k);return true});

  // Open-world fallback: when no ontology template fires, do not force a domain-specific answer.
  // Build a neutral issue from material source language and let retrieval/verification determine the law.
  if(!filtered.length){
    const terms=openWorldTerms(text);
    filtered=[{
      issue:'Apa hubungan hukum, tindakan material, kapasitas para aktor, bukti, kerugian/akibat, dan remedy yang dapat diuji dari materi perkara ini?',
      basis:terms.length?`Konsep material yang terdeteksi: ${terms.join(', ')}.`:'Materi belum cocok dengan ontology domain yang tersedia; analisis dimulai dari fakta dan bukti tanpa memaksakan kualifikasi.',
      pages:pages.slice(0,8).map(p=>p.page),
      domain:(context.primary.id||'PERDATA_UMUM') as LegalDomainId,
      id:'open-world-factual-issue',
      query_terms:terms,
    }];
  }
  return filtered.slice(0,24);
}

function openWorldTerms(text:string):string[]{
  const stop=new Set(['yang','dan','atau','dengan','dalam','dari','untuk','pada','atas','oleh','terhadap','tentang','perkara','hukum','indonesia','adalah','sebagai','telah','akan','tidak','dapat','karena','serta','para','pihak','nomor','tahun','tersebut','kemudian','setelah','sebelum','bahwa']);
  const freq=new Map<string,number>();
  for(const t of String(text||'').toLowerCase().match(/[a-zà-ÿ]{5,}/g)||[]){if(stop.has(t))continue;freq.set(t,(freq.get(t)||0)+1)}
  return [...freq.entries()].sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length).slice(0,8).map(([t])=>t);
}

const LONG_QUERY_TOKEN_THRESHOLD = 6;
const MAX_SUBQUERIES_PER_ISSUE = 3;
const MAX_OFFICIAL_QUERIES = 20;

function queryTokenCount(value: string): number {
  return String(value || '').toLowerCase().split(/\s+/).filter(t => t.length >= 3).length;
}

function boundedDecompose(joinedQuery: string): string[] {
  const tokens = String(joinedQuery || '').toLowerCase().split(/\s+/).filter(t => t.length >= 3);
  if (tokens.length <= LONG_QUERY_TOKEN_THRESHOLD) return [joinedQuery];

  const windows: string[] = [];
  windows.push(tokens.slice(0, 4).join(' '));
  if (tokens.length >= 8) {
    const mid = Math.floor(tokens.length / 2);
    windows.push(tokens.slice(Math.max(0, mid - 2), mid + 2).join(' '));
  }
  windows.push(tokens.slice(-4).join(' '));

  return [...new Set(windows)]
    .filter(q => {
      const t = q.split(/\s+/).filter(x => x.length >= 3);
      return t.length >= 2 && q.length >= 8;
    })
    .slice(0, MAX_SUBQUERIES_PER_ISSUE);
}

/**
 * Preserve ontology phrases while keeping each provider query lexically bounded.
 * query_terms are semantic units (e.g. "peralihan hak karena jual beli", "PPJB", "AJB");
 * splitting only by raw token windows can destroy those units. We therefore pack whole
 * phrase units up to the token budget, and use boundedDecompose only for an individual
 * unit that is itself too long.
 */
function phraseAwareDecompose(terms: string[]): string[] {
  const units = [...new Set((terms || []).map(x => String(x || '').trim()).filter(Boolean))];
  if (!units.length) return [];

  const joined = units.join(' ');
  if (queryTokenCount(joined) <= LONG_QUERY_TOKEN_THRESHOLD) return [joined];

  const out: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  const flush = () => {
    const q = current.join(' ').trim();
    if (q.length >= 6) out.push(q);
    current = [];
    currentTokens = 0;
  };

  for (const unit of units) {
    const n = queryTokenCount(unit);
    if (!n) continue;

    if (n > LONG_QUERY_TOKEN_THRESHOLD) {
      flush();
      out.push(...boundedDecompose(unit));
      if (out.length >= MAX_SUBQUERIES_PER_ISSUE) break;
      continue;
    }

    if (current.length && currentTokens + n > LONG_QUERY_TOKEN_THRESHOLD) flush();
    current.push(unit);
    currentTokens += n;

    if (out.length >= MAX_SUBQUERIES_PER_ISSUE) break;
  }
  if (out.length < MAX_SUBQUERIES_PER_ISSUE) flush();

  return [...new Set(out)]
    .filter(q => q.length >= 6 && queryTokenCount(q) >= 2)
    .slice(0, MAX_SUBQUERIES_PER_ISSUE);
}

type OfficialQueryPlan = {
  domain: LegalDomainId;
  issueId: string;
  queries: string[];
};

// V6.7.10: translate issue language into provider-friendly authority language.
// This is deliberately generic: it uses ontology query_terms + domain authority_anchors,
// never regulation numbers or case-specific shortcuts. Acronym-only transaction labels
// (e.g. PPJB/AJB/SHM) remain useful for issue spotting, but they are weak discovery terms
// at BPK and therefore do not lead the authority-oriented query.
const AUTHORITY_QUERY_TOKEN_BUDGET = 6;
const AUTHORITY_CONNECTOR_TOKENS = new Set([
  'yang','dan','atau','dengan','dalam','dari','untuk','pada','oleh','terhadap','tentang','karena',
]);

function compactAuthorityUnit(value: string): string {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => !AUTHORITY_CONNECTOR_TOKENS.has(t.toLowerCase()))
    .join(' ');
}

function acronymOnlyAuthorityUnit(value: string): boolean {
  const v = String(value || '').trim();
  return /^[A-Z0-9.-]{2,6}$/.test(v);
}

function authorityOrientedQuery(
  issue: { query_terms?: string[] },
  profile?: LegalDomainProfile,
): string {
  const issueUnits = (issue.query_terms || [])
    .filter(x => !acronymOnlyAuthorityUnit(x))
    .map(compactAuthorityUnit)
    .filter(Boolean);
  const profileUnits = (profile?.authority_anchors || [])
    .filter(x => !acronymOnlyAuthorityUnit(x))
    .map(compactAuthorityUnit)
    .filter(Boolean);

  const units = [...new Set([...issueUnits, ...profileUnits])];
  const picked: string[] = [];
  let tokenCount = 0;

  // Preserve issue order, but skip a unit that would overflow instead of ending early.
  // This lets a concrete later authority phrase (e.g. "pendaftaran tanah") replace a
  // provider-noisy shorthand while keeping the query within the six-token budget.
  for (const unit of units) {
    const n = queryTokenCount(unit);
    if (!n || n > AUTHORITY_QUERY_TOKEN_BUDGET) continue;
    if (tokenCount + n > AUTHORITY_QUERY_TOKEN_BUDGET) continue;
    picked.push(unit);
    tokenCount += n;
    if (tokenCount >= AUTHORITY_QUERY_TOKEN_BUDGET) break;
  }

  return picked.join(' ').trim();
}

/**
 * Schedule query plans fairly across active domains and issues without increasing
 * the network budget. Search still executes only the first 8 queries downstream.
 * Ordering is wave-based: first query of issue 1 for each domain, then issue 2 for
 * each domain, before later windows. This prevents a query-rich primary domain from
 * starving a relevant secondary domain such as Agraria/Pertanahan.
 */
function scheduleQueryPlans(
  plans: OfficialQueryPlan[],
  domainOrder: LegalDomainId[],
): string[] {
  const buckets = new Map<LegalDomainId, OfficialQueryPlan[]>();
  for (const plan of plans) {
    const list = buckets.get(plan.domain) || [];
    list.push(plan);
    buckets.set(plan.domain, list);
  }

  const orderedDomains = [
    ...domainOrder.filter((d, i, a) => a.indexOf(d) === i && buckets.has(d)),
    ...[...buckets.keys()].filter(d => !domainOrder.includes(d)),
  ];
  const maxIssues = Math.max(0, ...orderedDomains.map(d => (buckets.get(d) || []).length));
  const out: string[] = [];

  for (let windowIndex = 0; windowIndex < MAX_SUBQUERIES_PER_ISSUE; windowIndex++) {
    for (let issueIndex = 0; issueIndex < maxIssues; issueIndex++) {
      for (const domain of orderedDomains) {
        const plan = (buckets.get(domain) || [])[issueIndex];
        const query = plan?.queries?.[windowIndex];
        if (query && !out.includes(query)) out.push(query);
        if (out.length >= MAX_OFFICIAL_QUERIES) return out;
      }
    }
  }
  return out;
}

export function officialQueriesForContext(text: string): string[] {
  const context = inferLegalContext(text);
  const issues = deriveOntologyIssues(text);
  const profileById = new Map(LEGAL_DOMAIN_PROFILES.map(p => [p.id, p]));

  const plans: OfficialQueryPlan[] = [];
  for (const issue of issues) {
    const profile = profileById.get(issue.domain);
    const semanticUnits = [
      ...(issue.query_terms || []),
      ...(profile?.authority_anchors || []).slice(0, 3),
    ];
    const authorityQuery = authorityOrientedQuery(issue, profile);
    const decomposed = phraseAwareDecompose(semanticUnits);
    const queries = [...new Set([authorityQuery, ...decomposed].filter(Boolean))]
      .filter(q => q.length >= 6 && queryTokenCount(q) >= 2)
      .slice(0, MAX_SUBQUERIES_PER_ISSUE);
    if (queries.length) plans.push({ domain: issue.domain, issueId: issue.id, queries });
  }

  const domainOrder = [
    context.primary.id as LegalDomainId,
    ...context.secondary.map(x => x.id as LegalDomainId),
  ];
  const scheduled = scheduleQueryPlans(plans, domainOrder);

  if (!scheduled.length && context.primary.profile) {
    scheduled.push(context.primary.profile.authority_anchors.slice(0, 6).join(' '));
  }

  return [...new Set(scheduled)].slice(0, MAX_OFFICIAL_QUERIES);
}

export function authorityAnchorsForContext(domainOrQuery: string, text = ''): string[] {
  const context=inferLegalContext(`${domainOrQuery} ${text}`);
  const active=[context.primary,...context.secondary].filter(x=>x.profile);
  return [...new Set(active.flatMap(x=>x.profile!.authority_anchors))].slice(0,24);
}