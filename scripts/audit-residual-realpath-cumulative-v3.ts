declare const process: any;
import { buildEvidenceModel } from '../server/evidenceModel';
import { inferLegalContext, deriveOntologyIssues } from '../server/legalOntology';
import { reasonForensically } from '../server/forensicReasoner';

let pass=0, fail=0;
function check(name:string, ok:boolean, detail=''){
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok?pass++:fail++;
}
function countExact(list:any[], name:string){return list.filter(x=>String(x.actor).toLowerCase()===name.toLowerCase()).length;}

const bap=`--- HALAMAN 1 ---
BERITA ACARA PEMERIKSAAN TERSANGKA
Pada hari ini Kamis tanggal Dua Puluh Satu bulan Mei tahun Dua Ribu Dua Puluh Enam (21-05-2026) pukul 12.30 WIB bertempat di Lembaga Pemasyarakatan, saya Jaksa Penyidik:
Nama: RUMATA ROSININTA SIANNYA, S.H., M.H.
NIP: 19830414 200603 2 001
Pangkat: Jaksa Madya Jabatan: Jaksa Penyidik Kejaksaan Negeri Blitar.
Berdasarkan Surat Perintah Penyidikan Kepala Kejaksaan Negeri Blitar Nomor PRINT-01/M.5.22/Fd.2/03/2026 tanggal 25 Maret 2026 dan Surat Penetapan Tersangka Nomor 06/M.5.22/Fd.2/05/2026 tanggal 20 Mei 2026 telah memeriksa seorang yang dihadapan saya mengaku:
Nama lengkap: ELYA DWI ADMOKO, M.M.
Ia diperiksa sebagai Tersangka dalam perkara dugaan Tindak Pidana Korupsi dalam Pemberian Fasilitas Kredit oleh Perumda BPR Kota Blitar kepada Debitur Dewi Mufarida Tahun 2022 atas nama tersangka Drs. ELYA DWI ADMOKO, M.M.
--- HALAMAN 2 ---
Mengusahakan dan mengajukan Saksi dan/atau orang yang memiliki keahlian khusus. Memilih, menghubungi, dan mendapat pendampingan Advokat dalam setiap pemeriksaan.
--- HALAMAN 3 ---
Pemasaran dilakukan dengan wawancara dan tanpa melakukan survey lokasi karena Kabag Kredit/Pemasaran menyatakan Debitur Dewi Mufarida layak menerima fasilitas kredit.
--- HALAMAN 4 ---
Dewi Mufarifa menerima fasilitas kredit. Kredit tersebut dicairkan pada 12 September 2022.
Pada kolom Direktur Utama tertulis opini kepatuhan.
--- HALAMAN 5 ---
BPR Artha Praja Kota Blitar yang sekarang bernama Perumda BPR Kota Blitar. Perumda BPR Kota BItar memiliki Dewan Komisaris. Direksi wajib memastikan kepatuhan dan persetujuan kredit.
--- HALAMAN 6 ---
Perumda BPR Kota Blitar Artha Praja pada Tahun 2022 memberikan fasilitas kredit. Kredit usaha rakyat dapat diberikan kepada pengusaha usaha mikro kecil dan menengah. Kredit Karyawan diberikan kepada Pegawai Tetap Perumda BPR Kota Blitar.
--- HALAMAN 7 ---
Pekerja perusahaan dapat menjadi calon debitur. Pegawai bank memproses administrasi kredit. Pengusaha kecil adalah segmen pembiayaan. Tidak ada pembahasan hubungan kerja di antara para pihak.`;

const em=buildEvidenceModel(bap);
const actors=em.actors;
const names=actors.map(a=>String(a.actor));
check('A1 ELYA DWI ADMOKO exactly one canonical actor',countExact(actors,'ELYA DWI ADMOKO')===1, names.join(' | '));
check('A2 Dewi Mufarida exactly one canonical actor',countExact(actors,'Dewi Mufarida')===1, names.join(' | '));
const dewi=actors.find(a=>String(a.actor).toLowerCase()==='dewi mufarida');
check('A3 Dewi OCR alias absorbed',Boolean(dewi?.aliases?.some(x=>/Dewi Mufarifa/i.test(x))),JSON.stringify(dewi?.aliases||[]));
const orgs=actors.filter(a=>a.entity_type==='ORGANIZATION');
check('A4 Perumda canonical entity exactly one',orgs.filter(a=>/^Perumda BPR Kota Blitar$/i.test(String(a.actor))).length===1,orgs.map(a=>`${a.actor} [${(a.aliases||[]).join(',')}]`).join(' | '));
check('A5 OCR/overcapture organization variants absorbed',orgs.length===1 && (orgs[0].aliases||[]).some(x=>/BItar/i.test(x)) && (orgs[0].aliases||[]).some(x=>/Artha Praja/i.test(x)),JSON.stringify(orgs));
for(const bad of ['Dewi Mufarida Tahun','Debitur Dewi','Madya Jabatan','Penyidik Kejaksaan Negeri Blitar','Pegawai Tetap','Buku Pedoman Kebijakan','Pangkat']){
  check(`A6 false actor rejected: ${bad}`,!names.some(n=>n.toLowerCase()===bad.toLowerCase()),names.join(' | '));
}

const ctx=inferLegalContext(bap);
const reasoning=reasonForensically({title:'BAP residual regression',primaryDomain:ctx.primary.label,domainContext:ctx,evidence:em,lawCandidates:[]});
const matrixNames=reasoning.actor_matrix.map(a=>String(a.actor));
for(const generic of ['Debitur','Tersangka','Jaksa','Penyidik','Saksi','Advokat','Direktur','Komisaris','Pengusaha']){
  check(`A7 generic/non-material role not exported when not canonical: ${generic}`,!matrixNames.some(n=>n.toLowerCase()===generic.toLowerCase()),matrixNames.join(' | '));
}
check('A8 material concrete actors remain in actor_matrix',matrixNames.some(n=>/ELYA DWI ADMOKO/i.test(n))&&matrixNames.some(n=>/Dewi Mufarida/i.test(n))&&matrixNames.some(n=>/Perumda BPR Kota Blitar/i.test(n)),matrixNames.join(' | '));

const dates=em.timeline.map(x=>`${x.date}:${x.type}`);
check('T1 numeric BAP examination date captured as procedural',dates.includes('21-05-2026:PROCEDURAL_EVENT'),dates.join(' | '));
check('T2 sprindik date captured as procedural',dates.includes('25 Maret 2026:PROCEDURAL_EVENT'),dates.join(' | '));
check('T3 suspect determination date captured as procedural',dates.includes('20 Mei 2026:PROCEDURAL_EVENT'),dates.join(' | '));
check('T4 instrument-number fragments are not dates',!em.timeline.some(x=>/^2\/(?:03|05)\/2026$/.test(x.date)),dates.join(' | '));
check('T5 BAP procedural events are prioritized before substantive event',em.timeline.slice(0,3).every(x=>x.type==='PROCEDURAL_EVENT') && em.timeline.some(x=>x.date==='12 September 2022'&&x.type==='CLAIMED_EVENT'),dates.join(' | '));
check('T6 procedural dates are ordered chronologically inside priority class',em.timeline.slice(0,3).map(x=>x.date).join('|')==='25 Maret 2026|20 Mei 2026|21-05-2026',dates.join(' | '));

const domainNoise=`--- HALAMAN 1 ---
BERITA ACARA PEMERIKSAAN TERSANGKA. Penyidik memeriksa dugaan tindak pidana korupsi.
--- HALAMAN 2 ---
Kredit usaha rakyat diberikan kepada pengusaha usaha mikro kecil dan menengah.
--- HALAMAN 3 ---
Kredit Karyawan diberikan kepada Pegawai Tetap perusahaan.
--- HALAMAN 4 ---
Pekerja perusahaan menjadi calon debitur dan pegawai bank memproses administrasi kredit.
--- HALAMAN 5 ---
Pengusaha kecil dan pekerja mandiri merupakan segmen pembiayaan.`;
const noiseCtx=inferLegalContext(domainNoise);
const empScore=noiseCtx.scores.find(x=>x.id==='KETENAGAKERJAAN_PHI');
check('D1 employment lexical score can exist without material nexus',Number(empScore?.score||0)>=6 && empScore?.material_nexus===false,JSON.stringify({score:empScore?.score,nexus:empScore?.material_nexus}));
check('D2 non-material employment domain not admitted as secondary',!noiseCtx.secondary.some(x=>x.id==='KETENAGAKERJAAN_PHI'),noiseCtx.secondary.map(x=>x.id).join(','));
const noiseEm=buildEvidenceModel(domainNoise);
const noiseReason=reasonForensically({title:'domain noise',primaryDomain:noiseCtx.primary.label,domainContext:noiseCtx,evidence:noiseEm,lawCandidates:[]});
check('D3 multi-path cannot resurrect rejected raw employment score',!noiseReason.multi_path_diagnosis.some(x=>/Ketenagakerjaan|Hubungan Industrial/i.test(x.path)),noiseReason.multi_path_diagnosis.map(x=>x.path).join(' | '));
check('D4 employment issue not emitted from credit-role vocabulary alone',!deriveOntologyIssues(domainNoise).some(x=>x.id==='employment-rights'),deriveOntologyIssues(domainNoise).map(x=>x.id).join(','));

const trueEmployment=`--- HALAMAN 1 ---
Pekerja Andi mempunyai hubungan kerja dengan PT Maju Jaya. Perusahaan melakukan PHK terhadap Andi.
--- HALAMAN 2 ---
Upah dua bulan belum dibayar dan pekerja menuntut pesangon melalui perselisihan hubungan industrial.`;
const empCtx=inferLegalContext(trueEmployment);
check('D5 true employment controversy still resolves employment domain',empCtx.primary.id==='KETENAGAKERJAAN_PHI'||empCtx.secondary.some(x=>x.id==='KETENAGAKERJAAN_PHI'),JSON.stringify({primary:empCtx.primary.id,secondary:empCtx.secondary.map(x=>x.id)}));
check('D6 true employment issue remains',deriveOntologyIssues(trueEmployment).some(x=>x.id==='employment-rights'),deriveOntologyIssues(trueEmployment).map(x=>x.id).join(','));

const authorityOnly=`--- HALAMAN 1 ---
Direktur Utama memberikan persetujuan kredit berdasarkan pembagian kewenangan. Komisaris mengawasi kebijakan perkreditan. Pertanyaan hanya mengenai approval chain dan kewenangan tindakan kredit.`;
const authorityIssues=deriveOntologyIssues(authorityOnly).map(x=>x.id);
check('D7 generic authority discussion does not become formal-status dispute',!authorityIssues.includes('formal-status'),authorityIssues.join(','));

const distinctOrgs=buildEvidenceModel(`--- HALAMAN 1 ---\nPT Maju Jaya menandatangani kontrak.\n--- HALAMAN 2 ---\nPT Maju Jaya Sentosa menandatangani kontrak lain.`).actors.filter(a=>a.entity_type==='ORGANIZATION');
check('X1 distinct organizations are not prefix-merged without alias evidence',distinctOrgs.length===2,distinctOrgs.map(x=>x.actor).join(' | '));
const distinctPeople=buildEvidenceModel(`--- HALAMAN 1 ---\nSdr. Dewi Mufarida menyerahkan dokumen.\n--- HALAMAN 2 ---\nSdr. Dewi Mutiara menyerahkan dokumen lain.`).actors.filter(a=>a.entity_type==='PERSON');
check('X2 distinct people are not fuzzy-merged',distinctPeople.some(x=>/Dewi Mufarida/i.test(x.actor))&&distinctPeople.some(x=>/Dewi Mutiara/i.test(x.actor)),distinctPeople.map(x=>x.actor).join(' | '));

const roleOnly=`--- HALAMAN 1 ---\nTergugat menjual tanah sengketa kepada pihak ketiga pada 12 Maret 2021.`;
const roleEm=buildEvidenceModel(roleOnly); const roleCtx=inferLegalContext(roleOnly); const roleReason=reasonForensically({title:'role-only',primaryDomain:roleCtx.primary.label,domainContext:roleCtx,evidence:roleEm,lawCandidates:[]});
check('X3 material role-only actor remains when no named identity exists',roleReason.actor_matrix.some(x=>String(x.actor).toLowerCase()==='tergugat'),roleReason.actor_matrix.map(x=>x.actor).join(' | '));

console.log(`\n${pass}/${pass+fail} residual-realpath-cumulative-v3 checks PASS`);
if(fail)process.exit(1);
