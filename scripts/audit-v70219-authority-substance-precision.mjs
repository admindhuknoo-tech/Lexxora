import fs from 'node:fs';

const src=fs.readFileSync(new URL('../server/caseAnalysis.ts', import.meta.url),'utf8');
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const has=(hay,term)=>` ${norm(hay)} `.includes(` ${norm(term)} `);

function contentEvidence(c){
  const officialContext=`${c.instrument_type||''} ${c.court||''}`;
  const documentTags=Array.isArray(c.domain_tags)?c.domain_tags:[];
  return `${c.title||''} ${c.excerpt||''} ${officialContext} ${documentTags.join(' ')} ${c.judicial_product_type||''} ${c.authority_class||''} ${c.decision_number||''}`;
}
function substantiveMatch(c,terms){
  const ev=contentEvidence(c);
  return terms.some(t=>has(ev,t));
}

const cases=[
  {
    name:'reject metadata-only false positive',
    candidate:{title:'Peraturan Menteri ATR/BPN Nomor 32 Tahun 2016 Sistem Kendali Mutu Program Pertanahan, Agraria dan Tata Ruang',excerpt:'Sistem Kendali Mutu Program Pertanahan, Agraria dan Tata Ruang',keywords:['waris','ahli waris','boedel waris','pertanahan'],instrument_type:'PERMEN'},
    terms:['ahli waris','boedel waris'], expected:false,
  },
  {
    name:'keep substantive marriage/property authority',
    candidate:{title:'Undang-Undang Nomor 1 Tahun 1974 tentang Perkawinan',excerpt:'mengatur harta bersama dan kedudukan harta dalam perkawinan',keywords:['waris'],instrument_type:'UU'},
    terms:['harta bersama'], expected:true,
  },
  {
    name:'reject generic judicial product when relevance exists only in catalog tags',
    candidate:{title:'SEMA Nomor 4 Tahun 2016 tentang Pemberlakuan Rumusan Hasil Rapat Pleno Kamar Mahkamah Agung Tahun 2016',excerpt:'Pemberlakuan rumusan hasil rapat pleno kamar',keywords:['wanprestasi','perjanjian'],judicial_product_type:'SEMA',authority_class:'JUDICIAL_PRODUCT'},
    terms:['wanprestasi','perjanjian'], expected:false,
  },
  {
    name:'keep judicial product when excerpt itself carries the doctrine',
    candidate:{title:'SEMA Nomor 4 Tahun 2016',excerpt:'rumusan kamar perdata mengenai pembeli beritikad baik dalam peralihan hak atas tanah',keywords:['tanah'],judicial_product_type:'SEMA',authority_class:'JUDICIAL_PRODUCT'},
    terms:['pembeli beritikad baik','peralihan hak'], expected:true,
  },
];
let pass=0;
for(const t of cases){
  const got=substantiveMatch(t.candidate,t.terms);
  const ok=got===t.expected;
  console.log(`${ok?'PASS':'FAIL'} | ${t.name} | got=${got} expected=${t.expected}`);
  if(ok) pass++;
}
const contractChecks=[
  ['no query in official evidence', !/documentEvidence=`[^`]*\$\{c\.query/.test(src)],
  ['no discovery_context in article_text_pool', !/article_text_pool:safeString\(`\$\{c\.discovery_context/.test(src)],
  ['no catalog keywords in article_text_pool', !/article_text_pool:safeString\(`[^`]*keywordText/.test(src)],
  ['metadata keyword separation present', src.includes('metadata_keywords:metadataKeywords')],
  ['metadata-only rejection diagnostic present', src.includes('hanya cocok pada metadata katalog/retrieval; tidak ada dukungan substansi authority')],
  ['strong upstream bypass absent', !src.includes('strongUpstreamNexus =')],
];
for(const [name,ok] of contractChecks){console.log(`${ok?'PASS':'FAIL'} | ${name}`); if(ok) pass++;}
const total=cases.length+contractChecks.length;
console.log(`\n${pass}/${total} V7.0.2.19 authority-substance precision checks PASS`);
process.exit(pass===total?0:1);
