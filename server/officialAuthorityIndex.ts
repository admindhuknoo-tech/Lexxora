/**
 * LexiCore V7.0.2.8 — Official Authority Index
 *
 * Local-first catalog of judicial authorities whose metadata was captured from
 * official government sources. This is data, not case-specific reasoning logic.
 * Runtime search is deterministic and never upgrades an indexed item to
 * VERIFIED_OFFICIAL unless a live official page is actually verified elsewhere.
 */

export type IndexedAuthorityClass = 'JUDICIAL_PRODUCT' | 'DECISION';
export type IndexedJudicialProductType = 'SEMA' | 'PERMA' | 'RUMUSAN_KAMAR' | 'OTHER';

export interface OfficialAuthorityIndexEntry {
  id: string;
  authority_class: IndexedAuthorityClass;
  judicial_product_type?: IndexedJudicialProductType;
  instrument_type?: string;
  number?: string;
  year?: number;
  decision_number?: string;
  court?: string;
  title: string;
  subject?: string;
  keywords: string[];
  official_url: string;
  source_domain: string;
  effective_status?: string;
  indexed_at: string;
  provenance: 'OFFICIAL_CATALOG_SNAPSHOT' | 'OFFICIAL_CORPUS_REFERENCE';
}

const SNAPSHOT_DATE = '2026-09-18';

/**
 * General judicial catalog seed. The entries deliberately span civil,
 * criminal, consumer, banking, land, disability, constitutional and court-
 * administration topics. Party names and case-specific facts are never stored.
 */
export const OFFICIAL_AUTHORITY_INDEX: readonly OfficialAuthorityIndexEntry[] = [
  {
    id:'sema-4-2016',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'SEMA',instrument_type:'Surat Edaran Mahkamah Agung',number:'4',year:2016,
    title:'SEMA Nomor 4 Tahun 2016 tentang Pemberlakuan Rumusan Hasil Rapat Pleno Kamar Mahkamah Agung Tahun 2016 Sebagai Pedoman Pelaksanaan Tugas Bagi Pengadilan',
    subject:'Rumusan hasil rapat pleno kamar Mahkamah Agung tahun 2016',
    keywords:['rumusan kamar','perdata','pidana','agama','tata usaha negara','militer','pembeli beritikad baik','jual beli tanah','sertifikat','pertanahan','bpn','peralihan hak'],
    official_url:'https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-4-tahun-2016/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'sema-1-2017',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'SEMA',instrument_type:'Surat Edaran Mahkamah Agung',number:'1',year:2017,
    title:'SEMA Nomor 1 Tahun 2017 tentang Pemberlakuan Rumusan Hasil Rapat Pleno Kamar Mahkamah Agung Tahun 2017 Sebagai Pedoman Pelaksanaan Tugas Bagi Pengadilan',subject:'Rumusan pleno kamar 2017',
    keywords:['rumusan kamar','perdata','pidana','agama','tata usaha negara','militer','yurisprudensi'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-1-tahun-2017/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'sema-3-2018',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'SEMA',instrument_type:'Surat Edaran Mahkamah Agung',number:'3',year:2018,
    title:'SEMA Nomor 3 Tahun 2018 tentang Pemberlakuan Rumusan Hasil Rapat Pleno Kamar Mahkamah Agung Tahun 2018 Sebagai Pedoman Pelaksanaan Tugas Bagi Pengadilan',subject:'Rumusan pleno kamar 2018',
    keywords:['rumusan kamar','perdata','pidana','agama','tata usaha negara','militer','yurisprudensi'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-3-tahun-2018/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'sema-2-2019',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'SEMA',instrument_type:'Surat Edaran Mahkamah Agung',number:'2',year:2019,
    title:'SEMA Nomor 2 Tahun 2019 tentang Pemberlakuan Rumusan Hasil Rapat Pleno Kamar Mahkamah Agung Tahun 2019 Sebagai Pedoman Pelaksanaan Tugas Bagi Pengadilan',subject:'Rumusan pleno kamar 2019',
    keywords:['rumusan kamar','perdata','pidana','agama','tata usaha negara','militer','nafkah anak','perpajakan'],official_url:'https://jdih.mahkamahagung.go.id/index.php/legal-product/sema-nomor-2-tahun-2019/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'sema-10-2020',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'SEMA',instrument_type:'Surat Edaran Mahkamah Agung',number:'10',year:2020,
    title:'SEMA Nomor 10 Tahun 2020 tentang Pemberlakuan Rumusan Hasil Rapat Pleno Kamar Mahkamah Agung Tahun 2020 Sebagai Pedoman Pelaksanaan Tugas Bagi Pengadilan',subject:'Rumusan pleno kamar 2020',
    keywords:['rumusan kamar','perdata','pidana','agama','tata usaha negara','militer','perpajakan','pidana denda pajak'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-10-tahun-2020/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'sema-5-2021',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'SEMA',instrument_type:'Surat Edaran Mahkamah Agung',number:'5',year:2021,
    title:'SEMA Nomor 5 Tahun 2021 tentang Pemberlakuan Rumusan Hasil Rapat Pleno Kamar Mahkamah Agung Tahun 2021 Sebagai Pedoman Pelaksanaan Tugas Bagi Pengadilan',subject:'Rumusan pleno kamar 2021',
    keywords:['rumusan kamar','perdata','pidana','agama','tata usaha negara','militer','kesetaraan gender','pertanggungjawaban atasan'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-5-tahun-2021/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'sema-1-2022',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'SEMA',instrument_type:'Surat Edaran Mahkamah Agung',number:'1',year:2022,
    title:'SEMA Nomor 1 Tahun 2022 tentang Pemberlakuan Rumusan Hasil Rapat Pleno Kamar Mahkamah Agung Tahun 2022 Sebagai Pedoman Pelaksanaan Tugas Bagi Pengadilan',subject:'Rumusan pleno kamar 2022',
    keywords:['rumusan kamar','perdata','pidana','agama','tata usaha negara','militer'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-1-tahun-2022/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'sema-3-2023',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'SEMA',instrument_type:'Surat Edaran Mahkamah Agung',number:'3',year:2023,
    title:'SEMA Nomor 3 Tahun 2023 tentang Pemberlakuan Rumusan Hasil Rapat Pleno Kamar Mahkamah Agung Tahun 2023 Sebagai Pedoman Pelaksanaan Tugas Bagi Pengadilan',subject:'Rumusan pleno kamar 2023',
    keywords:['rumusan kamar','perdata','pidana','agama','tata usaha negara','militer','tindakan pemerintahan','sengketa pajak'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-3-tahun-2023/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'sema-2-2024',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'SEMA',instrument_type:'Surat Edaran Mahkamah Agung',number:'2',year:2024,
    title:'SEMA Nomor 2 Tahun 2024 tentang Pemberlakuan Hasil Rumusan Rapat Pleno Kamar Mahkamah Agung Tahun 2024 Sebagai Pedoman Pelaksanaan Tugas Bagi Pengadilan',subject:'Rumusan pleno kamar 2024',
    keywords:['rumusan kamar','perdata','pidana','agama','tata usaha negara','militer'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-2-tahun-2024/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'sema-1-2025',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'SEMA',instrument_type:'Surat Edaran Mahkamah Agung',number:'1',year:2025,
    title:'SEMA Nomor 1 Tahun 2025 tentang Pemberlakuan Hasil Rumusan Rapat Pleno Kamar Mahkamah Agung Tahun 2025 Sebagai Pedoman Pelaksanaan Tugas Bagi Pengadilan',subject:'Rumusan pleno kamar 2025',
    keywords:['rumusan kamar','perdata','pidana','agama','tata usaha negara','militer'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-1-tahun-2025/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'sema-1-2026',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'SEMA',instrument_type:'Surat Edaran Mahkamah Agung',number:'1',year:2026,
    title:'SEMA Nomor 1 Tahun 2026 tentang Pedoman Implementasi KUHP 2023 dan KUHAP 2025',subject:'Implementasi KUHP dan KUHAP',keywords:['pidana','kuhp','kuhap','hukum acara pidana','pemidanaan'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-1-tahun-2026/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'sema-2-2026',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'SEMA',instrument_type:'Surat Edaran Mahkamah Agung',number:'2',year:2026,
    title:'SEMA Nomor 2 Tahun 2026 tentang Pedoman Pengajuan Kasasi Berdasarkan Pasal 298 dan Pasal 300 Undang-Undang Nomor 20 Tahun 2025 tentang Kitab Undang-Undang Hukum Acara Pidana',subject:'Kasasi KUHAP 2025',keywords:['pidana','kuhap','kasasi','hukum acara pidana'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/sema-nomor-2-tahun-2026/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'perma-2-2024',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'PERMA',instrument_type:'Peraturan Mahkamah Agung',number:'2',year:2024,
    title:'PERMA Nomor 2 Tahun 2024 tentang Perubahan Kedua Atas PERMA Nomor 3 Tahun 2016 tentang Tata Cara Pengajuan Keberatan dan Penitipan Ganti Kerugian ke Pengadilan Negeri Dalam Pengadaan Tanah Bagi Pembangunan untuk Kepentingan Umum',subject:'Pengadaan tanah dan ganti kerugian',keywords:['pertanahan','pengadaan tanah','ganti kerugian','keberatan','pengadilan negeri'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/perma-nomor-2-tahun-2024/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'perma-1-2024',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'PERMA',instrument_type:'Peraturan Mahkamah Agung',number:'1',year:2024,
    title:'PERMA Nomor 1 Tahun 2024 tentang Pedoman Mengadili Perkara Pidana Berdasarkan Keadilan Restoratif',subject:'Keadilan restoratif',keywords:['pidana','keadilan restoratif','restorative justice','pemidanaan'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/perma-nomor-1-tahun-2024/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'perma-4-2025',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'PERMA',instrument_type:'Peraturan Mahkamah Agung',number:'4',year:2025,
    title:'PERMA Nomor 4 Tahun 2025 tentang Tata Cara Mengadili Gugatan yang Diajukan oleh Otoritas Jasa Keuangan Sebagai Upaya Pelindungan Konsumen',subject:'Pelindungan konsumen dan gugatan OJK',keywords:['konsumen','otoritas jasa keuangan','ojk','gugatan','jasa keuangan'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/perma-nomor-4-tahun-2025/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'perma-3-2025',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'PERMA',instrument_type:'Peraturan Mahkamah Agung',number:'3',year:2025,
    title:'PERMA Nomor 3 Tahun 2025 tentang Pedoman Penanganan Perkara Tindak Pidana di Bidang Perpajakan',subject:'Pidana perpajakan',keywords:['pidana','perpajakan','pajak','pemidanaan'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/perma-nomor-3-tahun-2025/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'perma-2-2025',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'PERMA',instrument_type:'Peraturan Mahkamah Agung',number:'2',year:2025,
    title:'PERMA Nomor 2 Tahun 2025 tentang Pedoman Mengadili Perkara Bagi Penyandang Disabilitas Berhadapan Dengan Hukum di Pengadilan',subject:'Penyandang disabilitas berhadapan dengan hukum',keywords:['disabilitas','akses keadilan','pengadilan','pidana','perdata'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/perma-nomor-2-tahun-2025/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'perma-1-2026',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'PERMA',instrument_type:'Peraturan Mahkamah Agung',number:'1',year:2026,
    title:'PERMA Nomor 1 Tahun 2026 tentang Pedoman Penyelesaian Sengketa Bank dalam Likuidasi dan Pasca Likuidasi di Pengadilan Niaga',subject:'Sengketa bank dalam likuidasi',keywords:['bank','likuidasi','pengadilan niaga','sengketa','perdata','kepailitan'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/perma-nomor-1-tahun-2026/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'perma-2-2026',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'PERMA',instrument_type:'Peraturan Mahkamah Agung',number:'2',year:2026,
    title:'PERMA Nomor 2 Tahun 2026 tentang Pedoman Pemidanaan Tindak Pidana Terorisme Tertentu',subject:'Pemidanaan tindak pidana terorisme',keywords:['pidana','terorisme','pemidanaan'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/perma-nomor-2-tahun-2026/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'perma-3-2026',authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'PERMA',instrument_type:'Peraturan Mahkamah Agung',number:'3',year:2026,
    title:'PERMA Nomor 3 Tahun 2026 tentang Putusan Pemaafan Hakim',subject:'Putusan pemaafan hakim',keywords:['pidana','putusan pemaafan','pemidanaan','hakim'],official_url:'https://jdih.mahkamahagung.go.id/legal-product/perma-nomor-3-tahun-2026/detail',source_domain:'jdih.mahkamahagung.go.id',effective_status:'Berlaku',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CATALOG_SNAPSHOT'
  },
  {
    id:'mk-21-puu-xii-2014',authority_class:'DECISION',decision_number:'21/PUU-XII/2014',court:'Mahkamah Konstitusi',year:2015,
    title:'Putusan Mahkamah Konstitusi Nomor 21/PUU-XII/2014',subject:'Pengujian KUHAP mengenai praperadilan dan upaya paksa',keywords:['pidana','kuhap','praperadilan','tersangka','penetapan tersangka','penyitaan','penggeledahan','bukti permulaan'],official_url:'https://www.mkri.id/perkara/persidangan/putusan?jenis=PUU&page=1&perPage=50&search=21%2FPUU-XII%2F2014',source_domain:'www.mkri.id',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CORPUS_REFERENCE'
  },
  {
    id:'mk-130-puu-xiii-2015',authority_class:'DECISION',decision_number:'130/PUU-XIII/2015',court:'Mahkamah Konstitusi',year:2017,
    title:'Putusan Mahkamah Konstitusi Nomor 130/PUU-XIII/2015',subject:'Pengujian KUHAP mengenai pemberitahuan dimulainya penyidikan',keywords:['pidana','kuhap','penyidikan','spdp','terlapor','korban','penuntut umum'],official_url:'https://jdih.mkri.id/produk-hukum/putusan?frase=130%2FPUU-XIII%2F2015&jenis=PUU&page=1&search=130%2FPUU-XIII%2F2015&tahun=',source_domain:'jdih.mkri.id',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CORPUS_REFERENCE'
  },
  {
    id:'mk-25-puu-xiv-2016',authority_class:'DECISION',decision_number:'25/PUU-XIV/2016',court:'Mahkamah Konstitusi',year:2017,
    title:'Putusan Mahkamah Konstitusi Nomor 25/PUU-XIV/2016',subject:'Pengujian UU Tipikor mengenai unsur kerugian keuangan negara',keywords:['tipikor','korupsi','kerugian negara','actual loss','penyalahgunaan wewenang'],official_url:'https://jdih.mkri.id/produk-hukum/putusan?frase=25%2FPUU-XIV%2F2016&jenis=PUU&page=1&search=25%2FPUU-XIV%2F2016&tahun=',source_domain:'jdih.mkri.id',indexed_at:SNAPSHOT_DATE,provenance:'OFFICIAL_CORPUS_REFERENCE'
  }
] as const;

const STOP = new Set(['yang','dan','atau','dengan','dalam','dari','untuk','pada','atas','oleh','tentang','hukum','perkara','mahkamah','agung','putusan','sema','perma','nomor','tahun','indonesia']);
const norm=(s:string)=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const tok=(s:string)=>[...new Set((norm(s).match(/[a-z0-9]{3,}/g)||[]).filter(x=>!STOP.has(x)))];

export interface OfficialAuthorityIndexHit { entry:OfficialAuthorityIndexEntry; score:number; query:string; matched_terms:string[]; }

export function searchOfficialAuthorityIndex(input:{queries:string[];domain?:string;caseText?:string;limit?:number;authorityClass?:IndexedAuthorityClass}):OfficialAuthorityIndexHit[]{
  const queries=(input.queries||[]).filter(Boolean);
  const domainTokens=tok(input.domain||'');
  const caseTokens=new Set(tok(input.caseText||'').slice(0,80));
  const hits:OfficialAuthorityIndexHit[]=[];
  for(const entry of OFFICIAL_AUTHORITY_INDEX){
    if(input.authorityClass && entry.authority_class!==input.authorityClass) continue;
    const hayTokens=new Set(tok(`${entry.title} ${entry.subject||''} ${(entry.keywords||[]).join(' ')}`));
    let bestScore=0,bestQuery='',bestTerms:string[]=[];
    for(const query of queries){
      const qTokens=tok(query);
      const matched=qTokens.filter(t=>hayTokens.has(t));
      let score=matched.reduce((n,t)=>n+(t.length>=8?3:2),0);
      const nq=norm(query);
      if(entry.number && entry.year && (nq.includes(`${entry.number} ${entry.year}`)||nq.includes(`nomor ${entry.number} tahun ${entry.year}`))) score+=40;
      if(entry.judicial_product_type && nq.includes(entry.judicial_product_type.toLowerCase())) score+=3;
      score+=domainTokens.filter(t=>hayTokens.has(t)).length*2;
      score+=[...caseTokens].filter(t=>hayTokens.has(t)).slice(0,5).length;
      if(/rumusan kamar|pleno kamar/.test(norm(`${entry.title} ${entry.subject||''}`))) score+=1;
      if(score>bestScore){bestScore=score;bestQuery=query;bestTerms=matched;}
    }
    if(bestScore>=4) hits.push({entry,score:bestScore,query:bestQuery,matched_terms:bestTerms});
  }
  return hits.sort((a,b)=>b.score-a.score || (b.entry.year||0)-(a.entry.year||0)).slice(0,Math.max(1,Math.min(20,input.limit||8)));
}

export function officialAuthorityIndexStats(){
  return {
    total:OFFICIAL_AUTHORITY_INDEX.length,
    judicial_products:OFFICIAL_AUTHORITY_INDEX.filter(x=>x.authority_class==='JUDICIAL_PRODUCT').length,
    decisions:OFFICIAL_AUTHORITY_INDEX.filter(x=>x.authority_class==='DECISION').length,
    source_domains:[...new Set(OFFICIAL_AUTHORITY_INDEX.map(x=>x.source_domain))].sort(),
    snapshot_date:SNAPSHOT_DATE,
  };
}
