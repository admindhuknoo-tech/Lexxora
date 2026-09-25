import { deriveOntologyIssues } from '../server/legalOntology';

function ids(text:string): string[] {
  return deriveOntologyIssues(text).map((x:any)=>String(x.id));
}

const tests:Array<{name:string;text:string;must?:string[];mustNot?:string[]}> = [
  {
    name:'BAP kredit - incidental insurance/consumer/brand words do not create foreign issues',
    text:`BERITA ACARA PEMERIKSAAN TERSANGKA. Jaksa Penyidik memeriksa tersangka dalam dugaan tindak pidana korupsi pemberian fasilitas kredit. Usia debitur disesuaikan dengan cover asuransi. Kredit dapat digunakan untuk beli kendaraan. Direktur menjelaskan merek kendaraan hanya sebagai objek pembelian. Pemeriksaan membahas kewenangan pemutus kredit, survei, verifikasi, agunan, analisis 5C dan penyimpangan proses kredit.`,
    must:['criminal-elements','criminal-procedure'],
    mustNot:['insurance-claim','consumer-relationship','ip-rights','conditional-performance'],
  },
  {
    name:'real insurance claim remains detectable',
    text:`Pemegang polis mengajukan klaim asuransi setelah risiko pertanggungan terjadi. Penanggung menolak klaim dengan alasan pengecualian polis dan tertanggung mempersoalkan penolakan tersebut.`,
    must:['insurance-claim'],
  },
  {
    name:'real trademark dispute remains detectable',
    text:`Penggugat menyatakan tergugat menggunakan merek terdaftar yang sama pada barang sejenis tanpa izin sehingga menimbulkan pelanggaran merek dan meminta penghentian penggunaan merek tersebut.`,
    must:['ip-rights'],
  },
  {
    name:'real consumer dispute remains detectable',
    text:`Konsumen membeli barang dari pelaku usaha. Barang cacat dan pelaku usaha menolak pengembalian uang serta kewajiban perlindungan konsumen dipersoalkan.`,
    must:['consumer-relationship'],
  },
  {
    name:'real conditional contractual performance remains detectable',
    text:`Para pihak sepakat pembayaran termin kedua baru jatuh tempo setelah berita acara serah terima ditandatangani. Pihak pembeli menolak membayar karena syarat pendahuluan tersebut belum terpenuhi.`,
    must:['conditional-performance'],
  },
];

let pass=0;
for(const t of tests){
  const got=ids(t.text);
  const missing=(t.must||[]).filter(x=>!got.includes(x));
  const unexpected=(t.mustNot||[]).filter(x=>got.includes(x));
  const ok=!missing.length&&!unexpected.length;
  console.log(`${ok?'PASS':'FAIL'} | ${t.name} | ids=${got.join(',')} missing=${missing.join(',')} unexpected=${unexpected.join(',')}`);
  if(ok) pass++;
}
console.log(`\n${pass}/${tests.length} V7.0.2.32 issue-materiality checks PASS`);
process.exit(pass===tests.length?0:1);
