import { buildEvidenceModel } from '../server/evidenceModel';
import { inferLegalContext } from '../server/legalOntology';
import { reasonForensically } from '../server/forensicReasoner';

let pass=0, fail=0;
function check(name:string, cond:boolean, detail:any=''){
  if(cond){ pass++; console.log(`PASS | ${name} | ${typeof detail==='string'?detail:JSON.stringify(detail)}`); }
  else { fail++; console.error(`FAIL | ${name} | ${typeof detail==='string'?detail:JSON.stringify(detail)}`); }
}

const bap=`--- HALAMAN 1 ---
BERITA ACARA PEMERIKSAAN TERSANGKA. Pada hari ini Kamis tanggal Dua Puluh Satu bulan Mei tahun Dua Ribu Dua Puluh Enam (21-05-2026) pukul 12.30 WIB, saya Jaksa Penyidik.
Berdasarkan Surat Perintah Penyidikan Nomor PRINT-01/M.5.22/Fd.2/03/2026 tanggal 25 Maret 2026 dan Surat Penetapan Tersangka Nomor 06/M.5.22/Fd.2/05/2026 tanggal 20 Mei 2026 telah memeriksa seorang yang mengaku:
Nama lengkap: ELYA DWI ADMOKO, M.M. Ia diperiksa sebagai Tersangka dalam perkara dugaan Tindak Pidana Korupsi.
Menghubungi, berkomunikasi, dan menerima kunjungan perwakilan negaranya bagi Tersangka atau Terdakwa yang berkewarganegaraan asing.
--- HALAMAN 2 ---
Keterangan permohonan kredit juga ditandatangani oleh Pemohon kredit. Bagian AO mengumpulkan dan memilah persyaratan calon debitur dan apabila lengkap diproses.
Sdr. Dewi Mufarida menerima fasilitas kredit dari Perumda BPR Kota Blitar. Debitur Dewi Mufarida Tahun 2022.
--- HALAMAN 3 ---
Surat Edaran tanggal 01 November 2015 masih berlaku. Pembagian wewenang tanggal 31 Maret 2017. Dewi Mufarida menandatangani perjanjian kredit pada tanggal 27 September 2022 dan kredit dicairkan pada tanggal 28 September 2022.
Mediasi perdata pernah disebut sebagai riwayat terpisah, tetapi pemeriksaan ini berada pada tahap penyidikan.`;

const evidence=buildEvidenceModel(bap);
const ctx=inferLegalContext(bap);
const reasoning=reasonForensically({title:'fulltrace-bap',primaryDomain:ctx.primary.label,domainContext:ctx as any,evidence,lawCandidates:[] as any,tempusYear:2022});
const names=reasoning.actor_matrix.map(x=>x.actor);
const times=reasoning.verified_timeline.map(x=>x.time);

check('actor: generic Terdakwa advisory suppressed', !names.some(x=>/^Terdakwa$/i.test(x)), names);
check('actor: generic Pemohon SOP suppressed', !names.some(x=>/^Pemohon$/i.test(x)), names);
check('actor: Dewi honorific canonicalized once', names.filter(x=>/^Dewi Mufarida$/i.test(x)).length===1 && !names.some(x=>/^Sdr\.?\s+Dewi/i.test(x)), names);
const elya=reasoning.actor_matrix.find(x=>/ELYA DWI ADMOKO/i.test(x.actor));
check('actor: named BAP subject retains Tersangka role', Boolean(elya)&&/Tersangka/i.test(elya!.proven_status), elya||{});
check('timeline: all investigation dates retained', ['25 Maret 2026','20 Mei 2026','21-05-2026'].every(x=>times.includes(x)), times);
check('timeline: procedural dates lead chronology', times.slice(0,3).every(x=>['25 Maret 2026','20 Mei 2026','21-05-2026'].includes(x)), times);
check('timeline: substantive credit dates remain after procedure', times.indexOf('27 September 2022')>=3 && times.indexOf('28 September 2022')>=3, times);
check('domain: criminal remains primary', ctx.primary.id==='PIDANA_MATERIIL_FORMIL', {primary:ctx.primary.id,secondary:ctx.secondary.map(x=>x.id)});
check('multipath: secondary routes never equal HIGH primary confidence', reasoning.multi_path_diagnosis.filter(x=>x.path!==ctx.primary.label).every(x=>x.strength!=='HIGH'), reasoning.multi_path_diagnosis);

const roleOnly=buildEvidenceModel(`--- HALAMAN 1 ---\nTergugat menjual tanah sengketa pada tanggal 1 Januari 2024.`);
const roleCtx=inferLegalContext(`--- HALAMAN 1 ---\nTergugat menjual tanah sengketa pada tanggal 1 Januari 2024.`);
const roleReason=reasonForensically({title:'role-fallback',primaryDomain:roleCtx.primary.label,domainContext:roleCtx as any,evidence:roleOnly,lawCandidates:[] as any,tempusYear:2024});
check('actor negative-control: material role-only fallback remains', roleReason.actor_matrix.some(x=>/^Tergugat$/i.test(x.actor)), roleReason.actor_matrix.map(x=>x.actor));

const distinct=`--- HALAMAN 1 ---\nSdr. Agus Santoso menyerahkan dokumen. Sdr. Agung Santoso menyerahkan dokumen lain. PT Maju Jaya Sentosa menandatangani perjanjian. PT Maju Jaya Sejahtera menandatangani perjanjian lain.`;
const de=buildEvidenceModel(distinct);
const persons=de.actors.filter(x=>x.entity_type==='PERSON').map(x=>x.actor);
const orgs=de.actors.filter(x=>x.entity_type==='ORGANIZATION').map(x=>x.actor);
check('actor negative-control: distinct people stay distinct', persons.includes('Agus Santoso')&&persons.includes('Agung Santoso'), persons);
check('actor negative-control: distinct organizations stay distinct', orgs.some(x=>/PT Maju Jaya Sentosa/i.test(x))&&orgs.some(x=>/PT Maju Jaya Sejahtera/i.test(x)), orgs);

console.log(`SUMMARY ${pass}/${pass+fail} fulltrace source invariants PASS`);
if(fail) process.exitCode=1;
