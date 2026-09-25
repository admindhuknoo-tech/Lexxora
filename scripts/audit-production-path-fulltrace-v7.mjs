import fs from 'fs';
import path from 'path';
import net from 'net';
import { spawn } from 'child_process';

const root=process.cwd();
const entry=path.join(root,'dist','runtime','server.js');
if(!fs.existsSync(entry)) throw new Error('dist/runtime/server.js missing; run npm run build:runtime first');
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.unref();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const a=s.address();const p=typeof a==='object'&&a?a.port:0;s.close(e=>e?reject(e):resolve(p));});});}
function check(cond,msg,detail=''){if(!cond)throw new Error(`FAIL: ${msg}${detail?` :: ${detail}`:''}`);console.log(`PASS: ${msg}${detail?` :: ${detail}`:''}`);}
const port=await freePort(); const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,[entry],{cwd:root,env:{...process.env,PORT:String(port),NODE_ENV:'production',ALLOWED_ORIGINS:base},stdio:['ignore','pipe','pipe']});
let out='',err=''; child.stdout.on('data',d=>out+=String(d)); child.stderr.on('data',d=>err+=String(d));
async function waitLive(){for(let i=0;i<120;i++){if(child.exitCode!==null)break;try{const r=await fetch(`${base}/api/live`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,125));}throw new Error(`server failed\n${out}\n${err}`)}
async function analyze(title,narrative){
  const form=new FormData(); form.set('title',title); form.set('narrative',narrative); form.set('input_type','narrative'); form.set('regulatory_mode','offline');
  const create=await fetch(`${base}/api/case-analysis`,{method:'POST',body:form});
  check(create.ok,`${title}: POST /api/case-analysis HTTP ${create.status}`);
  const cj=await create.json(); const result=cj?.data||cj?.analysis||null;
  check(Boolean(result?.id),`${title}: analysis completed through production API`);
  check(String(result?.analysis_provenance?.contract_version||'')==='LEXICORE_CANONICAL_ANALYSIS_V8',`${title}: canonical contract stamped`);
  return result;
}
function boundTitles(result){return (result.legal_issues||[]).flatMap(i=>(i.bound_authorities||[]).map(a=>String(a.source_label||a.title||a.regulation||'')));}
async function exportBinary(result,fmt,label){
  const r=await fetch(`${base}/api/case-analysis/export/${fmt}/${result.id}`);
  check(r.ok,`${label}: ${fmt.toUpperCase()} export HTTP ${r.status}`);
  check(r.headers.get('x-lexicore-analysis-contract')==='LEXICORE_CANONICAL_ANALYSIS_V8',`${label}: ${fmt.toUpperCase()} carries canonical contract header`);
  const bytes=Buffer.from(await r.arrayBuffer());
  if(fmt==='pdf') check(bytes.subarray(0,4).toString()==='%PDF',`${label}: PDF bytes valid`);
  else check(bytes.subarray(0,2).toString()==='PK',`${label}: DOCX zip bytes valid`);
  return bytes;
}
try{
  await waitLive();
  const bap=`--- HALAMAN 1 ---
BERITA ACARA PEMERIKSAAN TERSANGKA. Pada hari ini Kamis tanggal Dua Puluh Satu bulan Mei tahun Dua Ribu Dua Puluh Enam (21-05-2026) pukul 12.30 WIB, saya Jaksa Penyidik.
Berdasarkan Surat Perintah Penyidikan Nomor PRINT-O1/M.5.22/Fd.2/03/2026 tanggal 25 Maret 2026 dan Surat Penetapan Tersangka Nomor 06/M.5.22/Fd.2/05/2026 tanggal 20 Mei 2026 telah memeriksa seorang yang mengaku:
Nama lengkap: ELYA DWI ADMOKO, M.M. Ia diperiksa sebagai Tersangka dalam perkara dugaan Tindak Pidana Korupsi dalam Pemberian Fasilitas Kredit oleh Perumda BPR Kota Blitar kepada Debitur Dewi Mufarida Tahun 2022.
Menghubungi, berkomunikasi, dan menerima kunjungan perwakilan negaranya bagi Tersangka atau Terdakwa yang berkewarganegaraan asing.
--- HALAMAN 2 ---
Keterangan permohonan kredit juga ditandatangani oleh Pemohon kredit. Bagian AO mengumpulkan dan memilah persyaratan calon debitur dan apabila lengkap diproses.
Sdr. Dewi Mufarida menerima fasilitas kredit. Debitur Dewi Mufarida Tahun 2022.
--- HALAMAN 3 ---
Surat Edaran tanggal 01 November 2015 masih berlaku. Pembagian wewenang tanggal 31 Maret 2017. Dewi Mufarida menandatangani perjanjian kredit pada tanggal 27 September 2022 dan kredit dicairkan pada tanggal 28 September 2022.
Mediasi perdata pernah disebut sebagai riwayat terpisah; perkara ini sekarang berada pada penyidikan Tipikor.`;
  const criminal=await analyze('BAP fulltrace invariant',bap);
  const actors=(criminal.actor_matrix||[]).map(x=>String(x.actor));
  check(!actors.some(a=>/^(Terdakwa|Pemohon)$/i.test(a)),'BAP: generic advisory/SOP roles absent',actors.join(' | '));
  check(actors.filter(a=>/^Dewi Mufarida$/i.test(a)).length===1 && !actors.some(a=>/^Sdr\.?\s+Dewi/i.test(a)),'BAP: honorific alias canonicalized once',actors.join(' | '));
  const times=(criminal.verified_timeline||[]).map(x=>String(x.time));
  check(['25 Maret 2026','20 Mei 2026','21-05-2026'].every(x=>times.includes(x)),'BAP: all procedural dates retained',times.join(' | '));
  check(times.slice(0,3).every(x=>['25 Maret 2026','20 Mei 2026','21-05-2026'].includes(x)),'BAP: procedural dates prioritized',times.join(' | '));
  const bt=boundTitles(criminal);
  check(!bt.some(t=>/PERMA\s*(?:No\.?|Nomor)?\s*1\s*Tahun\s*2016|Prosedur Mediasi|Kasasi/i.test(t)),'BAP: mediation/appellate authority blocked at investigation stage',bt.join(' | '));
  const paths=criminal.multi_path_diagnosis||[];
  const primary=String(criminal?.domain_classification?.primary_domain||'');
  check(paths.filter(p=>String(p.path)!==primary).every(p=>String(p.strength)!=='HIGH'),'BAP: secondary routes do not present HIGH parity with primary',JSON.stringify(paths));
  await exportBinary(criminal,'pdf','fulltrace-bap-v7');
  await exportBinary(criminal,'docx','fulltrace-bap-v7');

  const civil=`--- HALAMAN 1 ---
GUGATAN PERDATA Nomor 45/Pdt.G/2026/PN Mlg. Penggugat mengajukan replik terhadap jawaban Para Tergugat.
Ibu Kasiyah membagi harta waris kepada anak-anaknya Suliah, Kasdi, Riwayat dan Kajat/Kajatyono.
Tanah dan rumah kemudian disertipikatkan atas nama Kajat tanpa persetujuan ahli waris Suliah. Sertipikat Nomor 05392 dipersoalkan dan dimohonkan pemblokiran agar objek boedel tidak dialihkan.
--- HALAMAN 2 ---
Kasiyah adalah pewaris. Ibu Suliah adalah ahli waris. Penggugat meminta perlindungan boedel dan koreksi data pendaftaran tanah. Tidak terdapat hubungan konsumen dengan Otoritas Jasa Keuangan dan perkara ini bukan gugatan OJK.`;
  const pleading=await analyze('Civil inheritance fulltrace invariant',civil);
  const civilActors=(pleading.actor_matrix||[]).map(x=>String(x.actor));
  check(civilActors.filter(a=>/^Kasiyah$/i.test(a)).length===1&&!civilActors.some(a=>/^Ibu Kasiyah$/i.test(a)),'Civil: honorific alias collapses to Kasiyah',civilActors.join(' | '));
  check(!civilActors.some(a=>/^(Penggugat|Tergugat|Pemohon|Pemberi Kuasa)$/i.test(a)),'Civil: generic litigation roles absent',civilActors.join(' | '));
  check(!boundTitles(pleading).some(t=>/Otoritas Jasa Keuangan|Pelindungan Konsumen/i.test(t)),'Civil: OJK authority blocked without consumer nexus',boundTitles(pleading).join(' | '));
  await exportBinary(pleading,'pdf','fulltrace-civil-v7');

  const roleOnly=await analyze('Role-only fallback invariant',`--- HALAMAN 1 ---\nTergugat menjual tanah sengketa pada tanggal 1 Januari 2024.`);
  check((roleOnly.actor_matrix||[]).some(x=>/^Tergugat$/i.test(String(x.actor))),'Role-only: directly acting party role retained');
} finally { if(child.exitCode===null)child.kill(); }
