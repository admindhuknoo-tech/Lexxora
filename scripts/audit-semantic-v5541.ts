declare const process:any;
import { buildEvidenceModel } from '../server/evidenceModel';
import { evaluateOfficialCandidatePolicy } from '../server/officialLawRetriever';
let pass=0,fail=0;
function check(name:string,ok:boolean,detail=''){console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);ok?pass++:fail++;}
const repliek=`--- HALAMAN 1 ---
REPLIEK
Kepada Yth Majelis Hakim Pengadilan Negeri Kepanjen
Perkara Nomor 44/Pdt.G/2026/PN.Kpn
Malang, 04 Juni 2026
Sentot Yusuf Patrikha, SH, MH., Laki-laki, Lahir di Malang 21 Januari 1956, Kristen, WNI
Sebagai Penerima Kuasa sesuai Surat Kuasa Khusus tanggal 10 Februari 2026
Ninik Sugiyanti, SE., MPd, Perempuan, lahir di Malang, tanggal 25 Juli 1970
Sebagai Penggugat/Pemberi Kuasa.
Terhadap Para Tergugat 1. Yeyen Rahmawati Binti Kajat (Kajatyono)
Bersama ini mohon diperkenankan untuk mengajukan Replik atas gugatan kami
terhadap jawaban Para Tergugat yang diajukan pada persidangan Tertanggal 20 Mei 2026.
--- HALAMAN 2 ---
Penggugat mendalilkan bahwa pembagian waris dari Ibu Kasiyah kepada empat orang anaknya
tersebut telah selesai dilakukan pada tahun 2015.
Ibu Suliah adalah setengah dari yang disertipikatkan Kajat.`;
const factPattern=repliek.toLowerCase();
{
 const em=buildEvidenceModel(repliek),t=em.timeline||[],m=em.timeline_metadata||[];
 check('timeline has procedural 20 Mei',t.some(x=>/20 Mei 2026/.test(x.date)&&x.type==='PROCEDURAL_EVENT'),JSON.stringify(t));
 check('2015 pembagian = CLAIMED_EVENT',t.some(x=>x.date==='2015'&&x.type==='CLAIMED_EVENT'),JSON.stringify(t));
 check('04 Juni header = DOCUMENT_DATE',m.some(x=>/04 Juni 2026/.test(x.date)&&x.type==='DOCUMENT_DATE'),JSON.stringify(m));
 check('DOBs = IDENTITY_DATE',m.some(x=>/21 Januari 1956/.test(x.date)&&x.type==='IDENTITY_DATE')&&m.some(x=>/25 Juli 1970/.test(x.date)&&x.type==='IDENTITY_DATE'),JSON.stringify(m));
 check('Surat Kuasa = DOCUMENT_DATE',m.some(x=>/10 Februari 2026/.test(x.date)&&x.type==='DOCUMENT_DATE'),JSON.stringify(m));
 check('timeline only procedural/claimed',t.every(x=>x.type==='PROCEDURAL_EVENT'||x.type==='CLAIMED_EVENT'),JSON.stringify(t));
}
{
 const law=`--- HALAMAN 1 ---\nPeraturan Menteri Agraria dan Tata Ruang Kepala Badan Pertanahan Nasional\nNomor 17 Tahun 2021 tentang Tata Cara Penetapan Tanah Musnah.`;
 const em=buildEvidenceModel(law),all=[...(em.timeline||[]),...(em.timeline_metadata||[])];
 check('legal citation year 2021 excluded',!all.some(x=>x.date==='2021'),JSON.stringify(all));
}
{
 const q='waris ahli waris bagian mutlak legitime portie',d='Hukum Keluarga & Waris';
 const specs=[
 ['wakaf','Peraturan Menteri Agraria dan Tata Ruang Nomor 2 Tahun 2017 Tata Cara Pendaftaran Tanah Wakaf'],
 ['ulayat','Peraturan Menteri Agraria dan Tata Ruang Nomor 14 Tahun 2024 Pendaftaran Tanah Hak Ulayat Masyarakat Hukum Adat'],
 ['tax','Peraturan Menteri Agraria dan Tata Ruang Nomor 15 Tahun 2017 Pendaftaran Peralihan Hak Atas Tanah Dalam Rangka Pengampunan Pajak'],
 ['musnah','Peraturan Menteri Agraria dan Tata Ruang Nomor 17 Tahun 2021 tentang Tata Cara Penetapan Tanah Musnah'],
 ] as const;
 for(const [name,title] of specs){const r=evaluateOfficialCandidatePolicy(q,d,title,'Peraturan Menteri',factPattern,title);check(`${name} specialist rejected`,!r.accepted&&(r.reasons||[]).some(x=>/subtopic guard/i.test(x)),JSON.stringify(r));}
 const generalTitle='Peraturan Pemerintah Nomor 24 Tahun 1997 tentang Pendaftaran Tanah';
 const generalFull=`${generalTitle}. Abstrak menyebut wakaf dan hak ulayat secara insidental.`;
 const g=evaluateOfficialCandidatePolicy('waris ahli waris sertifikat',d,generalTitle,'Peraturan Pemerintah',factPattern,generalFull);
 check('general title not rejected by incidental subtopic',!(g.reasons||[]).some(x=>/subtopic guard/i.test(x)),JSON.stringify(g));
 const legacy=evaluateOfficialCandidatePolicy(q,d,specs[0][1],'Peraturan Menteri');
 check('legacy 4-arg call still works',legacy.kind==='TOPICAL',JSON.stringify(legacy));
}
{
 const heading=`--- HALAMAN 1 ---\nMEMORI BANDING\nMalang, 04 Juni 2026\nKepada Yth Pengadilan Tinggi Jawa Timur`;
 const em=buildEvidenceModel(heading);
 check('heading-only banding stays metadata',!(em.timeline||[]).some(x=>/04 Juni 2026/.test(x.date))&&(em.timeline_metadata||[]).some(x=>/04 Juni 2026/.test(x.date)&&x.type==='DOCUMENT_DATE'),JSON.stringify(em));
 const action=`--- HALAMAN 1 ---\nPada tanggal 12 Mei 2026, Penggugat mengajukan banding ke Pengadilan Tinggi.\nSomasi diajukan pada tanggal 10 Maret 2024.`;
 const em2=buildEvidenceModel(action),t=em2.timeline||[];
 check('explicit stage actions are procedural',t.some(x=>/12 Mei 2026/.test(x.date)&&x.type==='PROCEDURAL_EVENT')&&t.some(x=>/10 Maret 2024/.test(x.date)&&x.type==='PROCEDURAL_EVENT'),JSON.stringify(t));
}
console.log(`\n${pass}/${pass+fail} semantic-v5541 checks PASS`); if(fail)process.exit(1);
