declare const process:any;
import { __test__ } from '../server/caseAnalysis';
const {detectCaseRegimeContext,reconcileLegalContextWithRegime,prioritizeIssuesForDomain}=__test__;

let pass=0,fail=0;
function check(name:string,ok:boolean,detail=''){
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok?pass++:fail++;
}

{
  const text=`
  Duduk Perkara Sekira tahun 2023 terjadi kesepakatan Jual Beli antara Agnes dan Irma.
  Agnes membeli sebidang tanah seluas 150 m2 dengan legalitas SHM.
  Tanah dijual kembali berdasarkan girik karena SHM belum dipecah.
  Berdasarkan Surat Notaris Pengikatan Jual Beli dilakukan pembayaran bertahap
  DP 110 juta dan tahap kedua saat keluar AJB, lunas ketika terima SHM.
  AJB tidak kunjung dibuat. Para pihak melakukan pembatalan Jual Beli dan
  meminta pengembalian uang yang telah dibayarkan.
  `;
  const r=detectCaseRegimeContext(text);
  check('B1 land-sale narrative resolves CIVIL',r.regime==='CIVIL',`regime=${r.regime}`);
  check('B2 civil substantive signals >=3',r.signals.civil_substantive.length>=3,`signals=${r.signals.civil_substantive.join(',')}`);
  check('B3 civil signal includes sale/PPJB-AJB',r.signals.civil_substantive.some((x:string)=>x==='jual-beli')&&r.signals.civil_substantive.some((x:string)=>x==='ppjb-ajb'),`signals=${r.signals.civil_substantive.join(',')}`);
  check('B4 land-sale narrative has no criminal signal',r.signals.criminal_procedural.length===0,`criminal=${r.signals.criminal_procedural.join(',')||'(none)'}`);
}

{
  const text=`
  BERITA ACARA PEMERIKSAAN TERSANGKA.
  Jaksa Penyidik memeriksa Tersangka dalam perkara dugaan Tindak Pidana Korupsi.
  Berdasarkan Surat Perintah Penyidikan dan Surat Penetapan Tersangka.
  Pemberian fasilitas kredit kepada debitur berdasarkan perjanjian kredit,
  pembayaran angsuran, agunan, debitur, kreditur, dan perikatan.
  Pasal 603 KUHP dan dakwaan tindak pidana korupsi.
  `;
  const r=detectCaseRegimeContext(text);
  check('A1 BAP mixed vocabulary remains CRIMINAL',r.regime==='CRIMINAL',`regime=${r.regime}`);
  check('A2 BAP has strong criminal signals',r.signals.criminal_procedural.length>=4,`criminal=${r.signals.criminal_procedural.length}; civil=${r.signals.civil_procedural.length+r.signals.civil_substantive.length}`);
}

{
  const perdata:any={id:'PERDATA_KONTRAKTUAL',label:'Hukum Perdata & Perikatan',score:60,positive:60,negative:0,signals:[],profile:{}};
  const pidana:any={id:'PIDANA_MATERIIL_FORMIL',label:'Hukum Pidana & Acara Pidana',score:47,positive:47,negative:0,signals:[],profile:{}};
  const korp:any={id:'KORPORASI_BISNIS',label:'Hukum Perusahaan & Bisnis',score:30,positive:30,negative:0,signals:[],profile:{}};
  const raw:any={primary:perdata,secondary:[pidana,korp],scores:[perdata,pidana,korp],confidence:'HIGH',ambiguous:false,margin:13};
  const regime:any={forum:'UMUM',regime:'CRIMINAL',signals:{
    forum_explicit:['pengadilan_tipikor'],
    criminal_procedural:['tersangka','penyidikan','tipikor','kuhp','dakwaan'],
    civil_procedural:['perjanjian'],administrative_procedural:[],
    islamic_substantive:[],civil_substantive:[],customary_substantive:[],personal_identity:[],
  }};
  const out=reconcileLegalContextWithRegime(raw,regime);
  check('A3 CRIMINAL sync promotes PIDANA primary',out.primary.id==='PIDANA_MATERIIL_FORMIL',`primary=${out.primary.id}`);
  check('A4 prior PERDATA primary retained secondary',out.secondary.some((x:any)=>x.id==='PERDATA_KONTRAKTUAL'),`secondary=${out.secondary.map((x:any)=>x.id).join(',')}`);
  check('A5 sync telemetry records transition',out.regime_sync?.applied===true&&out.regime_sync?.from==='PERDATA_KONTRAKTUAL'&&out.regime_sync?.to==='PIDANA_MATERIIL_FORMIL',`sync=${JSON.stringify(out.regime_sync)}`);
}

{
  const agraria:any={id:'AGRARIA_PERTANAHAN',label:'Hukum Agraria & Pertanahan',score:30,positive:30,negative:0,signals:[],profile:{}};
  const perdata:any={id:'PERDATA_KONTRAKTUAL',label:'Hukum Perdata & Perikatan',score:25,positive:25,negative:0,signals:[],profile:{}};
  const raw:any={primary:agraria,secondary:[perdata],scores:[agraria,perdata],confidence:'HIGH',ambiguous:false,margin:5};
  const regime:any={forum:'UNSPECIFIED',regime:'CIVIL',signals:{
    forum_explicit:[],criminal_procedural:[],civil_procedural:['perjanjian'],
    administrative_procedural:[],islamic_substantive:[],
    civil_substantive:['jual-beli','ppjb-ajb','land-title-transfer'],customary_substantive:[],personal_identity:[],
  }};
  const out=reconcileLegalContextWithRegime(raw,regime);
  check('A6 compatible AGRARIA remains primary under CIVIL',out.primary.id==='AGRARIA_PERTANAHAN'&&out.regime_sync?.applied===false,`primary=${out.primary.id}; sync=${JSON.stringify(out.regime_sync)}`);
}

{
  const issues:any[]=[
    {id:'contract',domain:'PERDATA_KONTRAKTUAL'},
    {id:'criminal-elements',domain:'PIDANA_MATERIIL_FORMIL'},
    {id:'corporate',domain:'KORPORASI_BISNIS'},
    {id:'criminal-procedure',domain:'PIDANA_MATERIIL_FORMIL'},
  ];
  const out=prioritizeIssuesForDomain(issues,'PIDANA_MATERIIL_FORMIL');
  check('A7 synchronized domain issues move first',out[0].domain==='PIDANA_MATERIIL_FORMIL'&&out[1].domain==='PIDANA_MATERIIL_FORMIL',`order=${out.map((x:any)=>x.id).join('>')}`);
  check('A8 secondary-path issues preserved',out.length===4&&out.some((x:any)=>x.id==='contract')&&out.some((x:any)=>x.id==='corporate'),`order=${out.map((x:any)=>x.id).join('>')}`);
}

console.log(`\n${pass}/${pass+fail} v673 checks PASS`);
if(fail)process.exit(1);
