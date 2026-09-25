import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import {spawn,execFileSync} from 'child_process';

const root=process.cwd();
const expectedContract='LEXICORE_CANONICAL_ANALYSIS_V8';
const entries=[
  {name:'root-canonical',entry:path.join(root,'dist','runtime','server.js'),cwd:root,nodePath:path.join(root,'.desktop-runtime','node_modules')},
  {name:'root-legacy',entry:path.join(root,'dist','server.cjs'),cwd:root,nodePath:path.join(root,'.desktop-runtime','node_modules')},
  {name:'desktop-canonical',entry:path.join(root,'.desktop-runtime','dist','runtime','server.js'),cwd:path.join(root,'.desktop-runtime')},
  {name:'desktop-legacy',entry:path.join(root,'.desktop-runtime','dist','server.cjs'),cwd:path.join(root,'.desktop-runtime')},
];
function check(cond,msg,detail=''){if(!cond)throw new Error(`FAIL: ${msg}${detail?` :: ${detail}`:''}`);console.log(`PASS: ${msg}${detail?` :: ${detail}`:''}`);}
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.unref();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const a=s.address();const p=typeof a==='object'&&a?a.port:0;s.close(e=>e?reject(e):resolve(p));});});}
const bap=`--- HALAMAN 1 ---
BERITA ACARA PEMERIKSAAN TERSANGKA. Pada hari ini Kamis tanggal Dua Puluh Satu bulan Mei tahun Dua Ribu Dua Puluh Enam (21-05-2026) pukul 12.30 WIB, saya Jaksa Penyidik.
Nama: RUMATA ROSININTA SIANNYA, S.H., M.H. Jabatan: Jaksa Penyidik Kejaksaan Negeri Blitar.
Berdasarkan Surat Perintah Penyidikan Nomor PRINT-O1/M.5.22/Fd.2/03/2026 tanggal 25 Maret 2026 dan Surat Penetapan Tersangka Nomor 06/M.5.22/Fd.2/05/2026 tanggal 20 Mei 2026 telah memeriksa seorang yang mengaku:
Nama lengkap: ELYA DWI ADMOKO, M.M. Ia diperiksa sebagai Tersangka dalam perkara dugaan Tindak Pidana Korupsi dalam Pemberian Fasilitas Kredit oleh Perumda BPR Kota Blitar kepada Debitur Dewi Mufarida Tahun 2022.
Menghubungi, berkomunikasi, dan menerima kunjungan perwakilan negaranya bagi Tersangka atau Terdakwa yang berkewarganegaraan asing.
--- HALAMAN 2 ---
Keterangan permohonan kredit juga ditandatangani oleh pemohon kredit. Bagian AO mengumpulkan dan memilah kelengkapan persyaratan calon debitur dan apabila lengkap diproses.
Sdr. Dewi Mufarida menerima fasilitas kredit. Debitur Dewi Mufarida Tahun 2022.
--- HALAMAN 3 ---
Surat Edaran tanggal 01 November 2015 masih berlaku. Pembagian wewenang tanggal 31 Maret 2017. Dewi Mufarida menandatangani perjanjian kredit pada tanggal 27 September 2022 dan kredit dicairkan pada tanggal 28 September 2022.
Mediasi perdata pernah disebut sebagai riwayat terpisah; perkara ini sekarang berada pada penyidikan Tipikor.`;

async function runOne(spec){
  check(fs.existsSync(spec.entry),`${spec.name}: entry exists`);
  const port=await freePort(); const base=`http://127.0.0.1:${port}`;
  const profile=path.join(os.tmpdir(),`lexicore-profile-${process.pid}-${spec.name}.json`);
  const env={...process.env,PORT:String(port),NODE_ENV:'production',ALLOWED_ORIGINS:base,LEXICORE_PROFILE_PATH:profile};
  if(spec.nodePath) env.NODE_PATH=spec.nodePath;
  const child=spawn(process.execPath,[spec.entry],{cwd:spec.cwd,env,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',d=>stdout+=String(d));child.stderr.on('data',d=>stderr+=String(d));
  try{
    let live=false;for(let i=0;i<140;i++){if(child.exitCode!==null)break;try{const r=await fetch(`${base}/api/live`);if(r.ok){live=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
    if(!live)throw new Error(`${spec.name}: server failed\nstdout=${stdout.slice(-4000)}\nstderr=${stderr.slice(-4000)}`);
    const form=new FormData();form.set('title',`Exact Runtime ${spec.name}`);form.set('narrative',bap);form.set('input_type','narrative');form.set('regulatory_mode','offline');
    const create=await fetch(`${base}/api/case-analysis`,{method:'POST',body:form});
    check(create.ok,`${spec.name}: analysis HTTP ${create.status}`);
    const body=await create.json(); const a=body?.data||body?.analysis;
    check(a?.analysis_provenance?.contract_version===expectedContract,`${spec.name}: current canonical contract`);
    const actors=(a.actor_matrix||[]).map(x=>String(x.actor));
    check(!actors.some(x=>/^(?:Terdakwa|Pemohon|Tersangka|Debitur)$/i.test(x)),`${spec.name}: generic role leakage blocked`,actors.join(' | '));
    check(actors.filter(x=>/^Dewi Mufarida$/i.test(x)).length===1&&!actors.some(x=>/^Sdr\.?\s+Dewi/i.test(x)),`${spec.name}: Dewi alias canonicalized`,actors.join(' | '));
    const times=(a.verified_timeline||[]).map(x=>String(x.time));
    const proc=['25 Maret 2026','20 Mei 2026','21-05-2026'];
    check(proc.every(x=>times.includes(x)),`${spec.name}: procedural dates retained`,times.join(' | '));
    check(times.slice(0,3).every(x=>proc.includes(x)),`${spec.name}: procedural dates prioritized`,times.join(' | '));
    const bound=(a.legal_issues||[]).flatMap(i=>(i.bound_authorities||[]).map(x=>String(x.source_label||'')));
    check(!bound.some(x=>/PERMA\s*(?:No\.?|Nomor)?\s*1\s*Tahun\s*2016|Prosedur Mediasi/i.test(x)),`${spec.name}: mediation authority blocked at investigation`,bound.join(' | '));
    check(bound.some(x=>/UU No\. 20 Tahun 2025 \/ KUHAP|KUHAP/i.test(x)),`${spec.name}: procedural authority uses process tempus, not 2022 transaction tempus`,bound.join(' | '));
    const primary=String(a?.domain_classification?.primary_domain||'');
    const paths=a.multi_path_diagnosis||[];
    check(paths.filter(p=>String(p.path)!==primary).every(p=>String(p.strength)!=='HIGH'),`${spec.name}: secondary domains cannot equal HIGH primary`,JSON.stringify(paths));

    const doc=await fetch(`${base}/api/case-analysis/export/docx/${a.id}`);
    check(doc.ok,`${spec.name}: DOCX export HTTP ${doc.status}`);
    check(doc.headers.get('x-lexicore-analysis-contract')===expectedContract,`${spec.name}: DOCX contract header`);
    const bytes=Buffer.from(await doc.arrayBuffer());check(bytes.subarray(0,2).toString()==='PK',`${spec.name}: DOCX bytes valid`);
    const temp=path.join(os.tmpdir(),`lexicore-${process.pid}-${spec.name}.docx`);fs.writeFileSync(temp,bytes);
    const xml=execFileSync('unzip',['-p',temp,'word/document.xml'],{encoding:'utf8'});fs.rmSync(temp,{force:true});
    check(!/>Terdakwa<|>Pemohon<|>Sdr\.? Dewi Mufarida</i.test(xml),`${spec.name}: rendered DOCX actor table has no stale role/alias rows`);
    check(proc.every(x=>xml.includes(x)),`${spec.name}: rendered DOCX contains procedural dates`);
    const idxs=proc.map(x=>xml.indexOf(x)).filter(x=>x>=0);
    const oldIdx=xml.indexOf('01 November');
    check(idxs.length===3 && (oldIdx<0 || Math.max(...idxs)<oldIdx),`${spec.name}: rendered DOCX procedural chronology precedes historical dates`);
    check(!/PERMA No\. 1 Tahun 2016/i.test(xml),`${spec.name}: rendered DOCX has no mediation authority leakage`);
  } finally {if(child.exitCode===null)child.kill();try{fs.rmSync(profile,{force:true});}catch{}}
}

for(const e of entries) await runOne(e);
console.log(`PASS: exact runtime entry-point matrix ${entries.length}/${entries.length}`);
