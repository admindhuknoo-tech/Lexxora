import fs from 'fs';
import path from 'path';
import net from 'net';
import { spawn } from 'child_process';

const root=process.cwd();
const entry=path.join(root,'dist','runtime','server.js');
if(!fs.existsSync(entry)) throw new Error('dist/runtime/server.js missing; run npm run build:runtime first');
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.unref();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const a=s.address();const p=typeof a==='object'&&a?a.port:0;s.close(e=>e?reject(e):resolve(p));});});}
function check(cond,msg){if(!cond)throw new Error(`FAIL: ${msg}`);console.log(`PASS: ${msg}`);}
const port=await freePort(); const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,[entry],{cwd:root,env:{...process.env,PORT:String(port),NODE_ENV:'production',ALLOWED_ORIGINS:base},stdio:['ignore','pipe','pipe']});
let out='',err=''; child.stdout.on('data',d=>out+=String(d)); child.stderr.on('data',d=>err+=String(d));
async function waitLive(){for(let i=0;i<80;i++){if(child.exitCode!==null)break;try{const r=await fetch(`${base}/api/live`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,125));}throw new Error(`server failed\n${out}\n${err}`)}
async function analyze(title,narrative){
  const form=new FormData(); form.set('title',title); form.set('narrative',narrative); form.set('input_type','narrative'); form.set('regulatory_mode','offline');
  const create=await fetch(`${base}/api/case-analysis`,{method:'POST',body:form});
  check(create.ok,`${title}: POST /api/case-analysis HTTP ${create.status}`);
  const cj=await create.json(); const result=cj?.data||cj?.analysis||null;
  check(Boolean(result?.id),`${title}: analysis completed through production API`);
  check(String(result?.analysis_provenance?.contract_version||'')==='LEXICORE_CANONICAL_ANALYSIS_V8',`${title}: canonical contract stamped`);
  return result;
}
function boundTitles(result){return (result.legal_issues||[]).flatMap(i=>(i.bound_authorities||[]).map(a=>String(a.title||a.regulation||'')));}
async function exportPdf(result,label){
  const pdf=await fetch(`${base}/api/case-analysis/export/pdf/${result.id}`);
  check(pdf.ok,`${label}: PDF export HTTP ${pdf.status}`);
  check(pdf.headers.get('x-lexicore-analysis-contract')==='LEXICORE_CANONICAL_ANALYSIS_V8',`${label}: PDF carries canonical contract header`);
  const bytes=Buffer.from(await pdf.arrayBuffer()); check(bytes.subarray(0,4).toString()==='%PDF',`${label}: exporter returned PDF bytes`);
  const target=path.join(root,'TEST_LOGS',`${label}.pdf`); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,bytes); return target;
}
try{
  await waitLive();
  const bap=`--- HALAMAN 1 ---\nBERITA ACARA PEMERIKSAAN TERSANGKA Pada hari ini Kamis (21-05-2026) pukul 12.30 WIB, saya Jaksa Penyidik.\nNama: RUMATA ROSININTA SIANNYA, S.H., M.H.\nPangkat: Jaksa Madya\nJabatan: Jaksa Penyidik Kejaksaan Negeri Blitar.\nBerdasarkan Surat Perintah Penyidikan Nomor PRINT-O1/M.5.22/Fd.2/03/2026 tanggal 25 Maret 2026 dan Surat\nPenetapan Tersangka Nomor 06/M.5.22/Fd.2/05/2026 tanggal 20 Mei 2026 telah memeriksa seorang yang mengaku:\nNama lengkap: ELYA DWI ADMOKO, M.M.\n65 tahun /13 Mei 1961 Jenis kelamin: Laki-laki.\nIa diperiksa sebagai Tersangka dalam perkara dugaan Tindak Pidana Korupsi dalam Pemberian Fasilitas Kredit oleh Perumda BPR Kota Blitar kepada Debitur Dewi Mufarida Tahun 2022.\n--- HALAMAN 2 ---\nReni dan Kabag Kredit/Pemasaran (Sdr. Dewi Mufarida). Bahwa saya diangkat sebagai Direktur Utama PD. Kantor Advokat memberi pendampingan. Dewan Pengawas menetapkan kebijakan. Perusahaan Umum membuka kantor kas. Walikota menetapkan kebijakan. Tim AO dan Admin Legal. Staff memberikan analisa. Direksi menerima informasi. Kabag Pemasaran memberikan pertimbangan.`;
  const criminal=await analyze('BAP production invariant',bap);
  const actors=(criminal.actor_matrix||[]).map(x=>String(x.actor));
  const bad=['Kabag Kredit','Utama PD','Kantor Advokat','Dewan Pengawas','Perusahaan Umum','Walikota','Tim','Staff','Direksi','Kabag Pemasaran','Sdr Dewi Mufarida'];
  check(bad.every(x=>!actors.some(a=>a.toLowerCase()===x.toLowerCase())),`BAP: role/unit noise absent (${actors.join(' | ')})`);
  check(actors.filter(a=>/Dewi Mufarida/i.test(a)).length===1,'BAP: Dewi Mufarida canonicalized exactly once');
  const elya=(criminal.actor_matrix||[]).find(x=>/ELYA DWI ADMOKO/i.test(String(x.actor)));
  check(Boolean(elya)&&/Tersangka/i.test(String(elya.proven_status||'')),'BAP: subject role bound to ELYA DWI ADMOKO');
  const times=(criminal.verified_timeline||[]).map(x=>String(x.time));
  check(['25 Maret 2026','20 Mei 2026','21-05-2026'].every(x=>times.includes(x)),`BAP: procedural timeline retained (${times.join(' | ')})`);
  check(!times.includes('13 Mei 1961'),'BAP: DOB excluded from material timeline');
  check(!boundTitles(criminal).some(t=>/PERMA\s*(?:No\.?|Nomor)?\s*1\s*Tahun\s*2016|kasasi/i.test(t)),'BAP: mediation/appellate authority cannot bind at investigation stage');
  check(String(criminal?.domain_classification?.primary_domain||'').includes('Pidana'),'BAP: criminal domain remains primary');
  await exportPdf(criminal,'production-path-bap-v6');

  const civil=`--- HALAMAN 1 ---\nGUGATAN PERDATA Nomor 45/Pdt.G/2026/PN Mlg. Penggugat mengajukan replik terhadap jawaban Para Tergugat.\nIbu Kasiyah membagi harta waris kepada anak-anaknya Suliah, Kasdi, Riwayat dan Kajat/Kajatyono.\nTanah dan rumah kemudian disertipikatkan atas nama Kajat tanpa persetujuan ahli waris Suliah. Sertipikat Nomor 05392 dipersoalkan dan dimohonkan pemblokiran agar objek boedel tidak dialihkan.\n--- HALAMAN 2 ---\nKasiyah adalah pewaris. Ibu Suliah adalah ahli waris. Penggugat meminta perlindungan boedel dan koreksi data pendaftaran tanah. Tidak terdapat hubungan konsumen dengan Otoritas Jasa Keuangan dan perkara ini bukan gugatan OJK.`;
  const pleading=await analyze('Civil inheritance production invariant',civil);
  const civilActors=(pleading.actor_matrix||[]).map(x=>String(x.actor));
  check(civilActors.filter(a=>/^Kasiyah$/i.test(a)).length===1 && !civilActors.some(a=>/^Ibu Kasiyah$/i.test(a)),'Civil: honorific alias collapses to Kasiyah');
  check(!civilActors.some(a=>/^(Penggugat|Tergugat|Pemohon|Pemberi Kuasa)$/i.test(a)),'Civil: generic litigation roles absent from actor matrix');
  check(!boundTitles(pleading).some(t=>/Otoritas Jasa Keuangan|Pelindungan Konsumen/i.test(t)),'Civil: OJK consumer authority blocked without consumer nexus');
  check(String(pleading?.lawyer_workflow?.procedural_stage||pleading?.case_posture||'').toUpperCase().includes('PLEAD'),'Civil: pleading posture retained');
  await exportPdf(pleading,'production-path-civil-v6');

  // Cross-case negative control: distinct people and organizations must not be fuzzy-merged.
  const distinct=`--- HALAMAN 1 ---\nAgus Santoso menandatangani perjanjian. Agung Santoso membayar kewajiban. PT Maju Jaya Sentosa membeli aset dari PT Maju Jaya Sejahtera.`;
  const negative=await analyze('Canonical negative control',distinct);
  const nactors=(negative.actor_matrix||[]).map(x=>String(x.actor));
  check(nactors.some(a=>/Agus Santoso/i.test(a))&&nactors.some(a=>/Agung Santoso/i.test(a)),'Negative control: distinct people remain distinct');
  check(nactors.some(a=>/PT Maju Jaya Sentosa/i.test(a))&&nactors.some(a=>/PT Maju Jaya Sejahtera/i.test(a)),'Negative control: distinct organizations remain distinct');
} finally { if(child.exitCode===null)child.kill(); }
