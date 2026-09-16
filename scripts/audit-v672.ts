declare const process:any;
import { buildEvidenceModel } from '../server/evidenceModel';
import { __test__ } from '../server/caseAnalysis';
const { bindIssuesToAuthorities, filterApplicableLawToBoundAuthorities }=__test__;

let pass=0,fail=0;
function check(name:string,ok:boolean,detail=''){
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok?pass++:fail++;
}

{
  const source=`--- HALAMAN 1 ---
Eksepsi tentang Error in Persona Bahwa, yang menjadi permasalahan pokok dari perkara ini adalah karena barang jaminan berupa Hondea Jazz tahun 2020 warna Merah Nomor Polisi AG 1922 CH yang dijaminkan dan telah difiduciakan tersebut tidak ditemukan.`;
  const dates=buildEvidenceModel(source).timeline.map((x:any)=>String(x.date));
  check('1.1 model year 2020 rejected',!dates.includes('2020'),`timeline=${dates.join(' | ')||'(kosong)'}`);
  check('1.2 plate component 1922 rejected',!dates.includes('1922'),`timeline=${dates.join(' | ')||'(kosong)'}`);
}

{
  const source=`--- HALAMAN 1 ---
Replik diajukan pada persidangan tanggal 04 Juni 2026.
Penggugat mendalilkan bahwa pembagian waris telah selesai dilakukan pada tahun 2015.`;
  const dates=buildEvidenceModel(source).timeline.map((x:any)=>String(x.date));
  check('2.1 valid full procedural date survives',dates.some(x=>/04 Juni 2026/.test(x)),`timeline=${dates.join(' | ')||'(kosong)'}`);
  check('2.2 valid year-only claimed event survives',dates.includes('2015'),`timeline=${dates.join(' | ')||'(kosong)'}`);
}

function candidate(overrides:Partial<any>={}):any{
  return {title:'',source_kind:'LOCAL',source_label:'',article_summary:'',domain_tags:[],
    article_text_pool:'',material_confidence:'HIGH',citation_hit:false,regime_note:null,
    domain_alignment:'PRIMARY',...overrides};
}
const ctx={primary_id:'PIDANA_MATERIIL_FORMIL' as any,primary_anchors:['tindak pidana','pidana khusus'],
  secondary_anchors:['korupsi'],foreign_anchors:['konsumen','perbankan']};

{
  const pool=[
    candidate({title:'Undang-Undang Nomor 1 Tahun 2023 tentang Kitab Undang-Undang Hukum Pidana',
      source_label:'UU 1/2023 KUHP',domain_tags:['pidana','delik'],
      article_text_pool:'jabatan penyalahgunaan wewenang pegawai negeri'}),
    candidate({title:'Undang-Undang Nomor 40 Tahun 2007 tentang Perseroan Terbatas',
      source_label:'UU 40/2007 Perseroan',domain_tags:['perseroan','direksi','kepengurusan','rups'],
      article_text_pool:'kepengurusan jabatan direksi anggaran dasar rups'}),
  ];
  const issues=[{issue:'Apakah status formal, jabatan, dan kepengurusan sah menurut anggaran dasar?',rule:'',analysis:'',conclusion:'',evidence_tags:[]}];
  const ontology=[{issue:issues[0].issue,id:'formal-status',query_terms:['kepengurusan','jabatan','anggaran dasar','status formal'],domain:'KORPORASI_BISNIS'}];
  const labels=(bindIssuesToAuthorities(issues,ontology,pool,ctx,'Direktur Utama didakwa karena jabatan.','CRIMINAL')[0]?.bound_authorities||[]).map((x:any)=>String(x.source_label||''));
  check('3.1 formal-status rejects KUHP one-word article leak',!labels.some((x:string)=>/KUHP/i.test(x)),`bound=${labels.join(' | ')||'(kosong)'}`);
  check('3.2 formal-status binds corporate authority',labels.some((x:string)=>/Perseroan/i.test(x)),`bound=${labels.join(' | ')||'(kosong)'}`);
}

{
  const pool=[
    candidate({title:'Undang-undang tentang Pemberantasan Tindak Pidana Korupsi',source_label:'UU Tipikor',
      domain_tags:['tindak pidana korupsi','korupsi'],article_text_pool:'penyalahgunaan wewenang kerugian negara'}),
    candidate({title:'Undang-Undang tentang Advokat',source_label:'UU Advokat',
      domain_tags:['advokat'],article_text_pool:'kode etik advokat'}),
  ];
  const issues=[{issue:'Unsur delik apa yang didalilkan?',rule:'',analysis:'',conclusion:'',evidence_tags:[]}];
  const ontology=[{issue:issues[0].issue,id:'criminal-elements',query_terms:['unsur tindak pidana','pembuktian pidana'],domain:'PIDANA_MATERIIL_FORMIL'}];
  const labels=(bindIssuesToAuthorities(issues,ontology,pool,ctx,'Terdakwa didakwa tindak pidana korupsi.','CRIMINAL')[0]?.bound_authorities||[]).map((x:any)=>String(x.source_label||''));
  check('4.1 criminal-elements still binds Tipikor',labels.some((x:string)=>/Tipikor/i.test(x)),`bound=${labels.join(' | ')||'(kosong)'}`);
  check('4.2 criminal-elements rejects Advokat',!labels.some((x:string)=>/Advokat/i.test(x)),`bound=${labels.join(' | ')||'(kosong)'}`);
}

{
  const laws:any[]=[
    {regulation:'UU Tipikor',source:'Corpus lokal',article:'Pasal 2'},
    {regulation:'UU Advokat',source:'Corpus lokal',article:'Pasal 1'},
    {regulation:'UU Ketenagakerjaan',source:'Corpus lokal',article:'Pasal 151'},
  ];
  const regs=filterApplicableLawToBoundAuthorities(laws,new Set<string>(['uu tipikor'])).map((x:any)=>String(x.regulation));
  check('5.1 Section III keeps bound authority',regs.includes('UU Tipikor'),`laws=${regs.join(' | ')}`);
  check('5.2 Section III hides unbound candidates',!regs.includes('UU Advokat')&&!regs.includes('UU Ketenagakerjaan'),`laws=${regs.join(' | ')}`);
}

console.log(`\n${pass}/${pass+fail} v672 checks PASS`);
if(fail)process.exit(1);
