declare const process:any;
import { __test__ } from '../server/caseAnalysis';
const { extractSourceLawCitations, bindIssuesToAuthorities }=__test__;

let pass=0,fail=0;
function check(name:string,ok:boolean,detail=''){
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok?pass++:fail++;
}
function candidate(overrides:Partial<any>={}):any{
  return {
    title:'',source_kind:'LOCAL',source_label:'',article_summary:'',
    domain_tags:[],article_text_pool:'',material_confidence:'HIGH',
    citation_hit:false,regime_note:null,domain_alignment:'PRIMARY',...overrides,
  };
}

const criminalPool=[
  candidate({
    title:'Undang-undang tentang Pemberantasan Tindak Pidana Korupsi',
    source_label:'UU Tipikor',
    domain_tags:['tindak pidana korupsi','korupsi','pidana khusus'],
    article_text_pool:'penyalahgunaan wewenang kerugian negara suap',
  }),
  candidate({
    title:'Undang-Undang tentang Advokat',
    source_label:'UU Advokat',
    domain_tags:['advokat','profesi hukum'],
    article_text_pool:'hak imunitas advokat kode etik organisasi advokat',
  }),
];
const criminalCtx={
  primary_id:'PIDANA_MATERIIL_FORMIL' as any,
  primary_anchors:['tindak pidana','pidana khusus','pembuktian pidana'],
  secondary_anchors:['korupsi','kerugian negara'],
  foreign_anchors:['konsumen','perbankan','asuransi'],
};
const criminalText='Terdakwa didakwa melakukan tindak pidana korupsi. Jaksa Penuntut Umum membacakan dakwaan. Pengadilan Tipikor memeriksa perkara PID.SUS.TPK.';

{
  const issues=[{issue:'Unsur delik apa yang didalilkan?',rule:'',analysis:'',conclusion:'',evidence_tags:[]}];
  const ontology=[{issue:'Unsur delik apa yang didalilkan?',id:'criminal-elements',query_terms:['unsur tindak pidana','pembuktian pidana'],domain:'PIDANA_MATERIIL_FORMIL'}];
  const result=bindIssuesToAuthorities(issues,ontology,criminalPool,criminalCtx,criminalText,'CRIMINAL');
  const labels=(result[0]?.bound_authorities||[]).map((x:any)=>String(x.source_label||''));
  check('1.1 token fallback binds Tipikor',labels.some((x:string)=>/Tipikor/i.test(x)),`bound=${labels.join(' | ')||'(kosong)'}`);
  check('1.2 unrelated Advokat does not bind',!labels.some((x:string)=>/Advokat/i.test(x)),`bound=${labels.join(' | ')||'(kosong)'}`);
}

{
  const citations=extractSourceLawCitations('Berdasarkan UU Nomor 31 Tahun 2099. Selain itu UU Nomor 1 Tahun 2023 juga disebut.');
  const regs=citations.map((x:any)=>String(x.regulation||''));
  check('2.1 OCR/future year 2099 rejected',!regs.some((x:string)=>/2099/.test(x)),`citations=${regs.join(' | ')||'(kosong)'}`);
  check('2.2 valid year 2023 retained',regs.some((x:string)=>/2023/.test(x)),`citations=${regs.join(' | ')||'(kosong)'}`);
}

{
  const pool=[
    candidate({
      title:'Kitab Undang-Undang Hukum Perdata',source_label:'KUHPerdata',
      domain_tags:['perikatan','perjanjian'],article_text_pool:'wanprestasi prestasi somasi ganti rugi',
    }),
    candidate({
      title:'Undang-Undang Pemberantasan Tindak Pidana Korupsi',source_label:'UU Tipikor',
      domain_tags:['pidana khusus','korupsi'],article_text_pool:'unsur tindak pidana korupsi',
      domain_alignment:'FOREIGN',
    }),
  ];
  const issues=[{issue:'Apakah kewajiban telah dapat ditagih dan terjadi wanprestasi?',rule:'',analysis:'',conclusion:'',evidence_tags:[]}];
  const ontology=[{issue:'Apakah kewajiban telah dapat ditagih dan terjadi wanprestasi?',id:'default-remedies',query_terms:['wanprestasi','somasi'],domain:'PERDATA_KONTRAKTUAL'}];
  const ctx={primary_id:'PERDATA_KONTRAKTUAL' as any,primary_anchors:['perjanjian','perikatan','wanprestasi'],secondary_anchors:[],foreign_anchors:['pidana khusus','korupsi']};
  const result=bindIssuesToAuthorities(issues,ontology,pool,ctx,'Penggugat mendalilkan wanprestasi. Somasi telah dikirim.','CIVIL');
  const labels=(result[0]?.bound_authorities||[]).map((x:any)=>String(x.source_label||''));
  check('3.1 single-word wanprestasi binds civil authority',labels.some((x:string)=>/KUHPerdata/i.test(x)),`bound=${labels.join(' | ')||'(kosong)'}`);
  check('3.2 single-word strictness does not open Tipikor',!labels.some((x:string)=>/Tipikor/i.test(x)),`bound=${labels.join(' | ')||'(kosong)'}`);
}

{
  // Corrected substring fixture: "somasiX" contains the characters but not
  // the normalized token "somasi".
  const pool=[
    candidate({
      title:'Instrumen Substring Trap',source_label:'Substring Trap',
      domain_tags:['perikatan'],article_text_pool:'somasiX koordinasi dokumentasi',
    }),
    candidate({
      title:'Kitab Undang-Undang Hukum Perdata',source_label:'KUHPerdata',
      domain_tags:['perikatan'],article_text_pool:'somasi wanprestasi ganti rugi',
    }),
  ];
  const issues=[{issue:'Somasi dan wanprestasi',rule:'',analysis:'',conclusion:'',evidence_tags:[]}];
  const ontology=[{issue:'Somasi dan wanprestasi',id:'test-somasi',query_terms:['somasi'],domain:'PERDATA_KONTRAKTUAL'}];
  const ctx={primary_id:'PERDATA_KONTRAKTUAL' as any,primary_anchors:['perikatan'],secondary_anchors:[],foreign_anchors:[]};
  const result=bindIssuesToAuthorities(issues,ontology,pool,ctx,'Somasi telah dikirim.','CIVIL');
  const labels=(result[0]?.bound_authorities||[]).map((x:any)=>String(x.source_label||''));
  check('4.1 exact somasi in article binds KUHPerdata',labels.some((x:string)=>/KUHPerdata/i.test(x)),`bound=${labels.join(' | ')||'(kosong)'}`);
  check('4.2 somasi does not substring-match somasiX',!labels.some((x:string)=>/Substring Trap/i.test(x)),`bound=${labels.join(' | ')||'(kosong)'}`);
}

console.log(`\n${pass}/${pass+fail} issue-binding-v671 checks PASS`);
if(fail)process.exit(1);
