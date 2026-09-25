declare const process:any;
import { buildEvidenceModel } from '../server/evidenceModel';
import { reasonForensically } from '../server/forensicReasoner';
import { inferLegalContext } from '../server/legalOntology';

let pass=0,fail=0; const check=(name:string,ok:boolean,detail='')=>{console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`); ok?pass++:fail++;};
const bap=`--- HALAMAN 1 ---
BERITA ACARA PEMERIKSAAN TERSANGKA
Pada hari ini Kamis (21-05-2026) pukul 12.30 WIB, saya Jaksa Penyidik.
Berdasarkan Surat Perintah
Penyidikan Kepala Kejaksaan Negeri Blitar Nomor
PRINT-01/M.5.22/Fd.2/03/2026 tanggal 25 Maret 2026 dan Surat
Penetapan
Tersangka Nomor 06/M.5.22/Fd.2/05/2026 tanggal 20 Mei 2026 telah memeriksa seorang.
Nama lengkap: ELYA DWI ADMOKO, M.M.
Ia diperiksa sebagai Tersangka.
--- HALAMAN 2 ---
PT Maju Jaya Sentosa menandatangani perjanjian pada 12 September 2022.`;
const em=buildEvidenceModel(bap), tl=em.timeline.map(x=>`${x.date}:${x.type}`), names=em.actors.map(x=>x.actor);
check('timeline:sprindik',tl.includes('25 Maret 2026:PROCEDURAL_EVENT'),tl.join(' | '));
check('timeline:penetapan',tl.includes('20 Mei 2026:PROCEDURAL_EVENT'),tl.join(' | '));
check('timeline:bap-exam',tl.includes('21-05-2026:PROCEDURAL_EVENT'),tl.join(' | '));
check('timeline:procedural-priority',em.timeline.slice(0,3).every(x=>x.type==='PROCEDURAL_EVENT'),tl.join(' | '));
check('actor:organization-tail-not-person',!names.includes('Jaya Sentosa'),names.join(' | '));
check('actor:organization-retained',names.some(x=>/^PT Maju Jaya Sentosa$/i.test(x)),names.join(' | '));
const dob=buildEvidenceModel(`--- HALAMAN 1 ---\nNama: Budi Santoso. Tanggal lahir 13 Mei 1961. Penyidik memeriksa Budi Santoso pada 20 Mei 2026.`);
check('timeline:dob-identity',dob.timeline_metadata.some(x=>x.date==='13 Mei 1961'&&x.type==='IDENTITY_DATE'));
check('timeline:same-line-procedural',dob.timeline.some(x=>x.date==='20 Mei 2026'&&x.type==='PROCEDURAL_EVENT'),JSON.stringify(dob.timeline));
const ctx=inferLegalContext(bap); const reasoning=reasonForensically({title:'Invariant BAP',primaryDomain:ctx.primary.label,domainContext:ctx,evidence:em,lawCandidates:[]});
check('actor-matrix:no-generic-role',reasoning.actor_matrix.every(x=>x.entity_type!=='ROLE'),reasoning.actor_matrix.map(x=>x.actor).join(' | '));
console.log(`SUMMARY ${pass}/${pass+fail} PASS`); if(fail)process.exit(1);
