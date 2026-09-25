import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
let ts; try{ts=require('typescript/lib/typescript.js')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js')}
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lexicore-v70228-'));
const src=fs.readFileSync(path.join(root,'server','exporters.ts'),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const compiled=path.join(temp,'exporters.cjs');fs.writeFileSync(compiled,js);
const {createPdfBuffer,createDocxBuffer}=require(compiled);
function pdfText(buf){return [...buf.toString('binary').matchAll(/\(([^\r\n]*?)\) Tj/g)].map(m=>m[1].replace(/\\([()\\])/g,'$1')).join(' ').replace(/\s+/g,' ')}
function docxText(buf){const r=buf.toString('utf8');const a=r.indexOf('<w:document'),b=r.indexOf('</w:document>');if(a<0||b<0)throw new Error('DOCX document.xml missing');return r.slice(a,b+13).replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/\s+/g,' ')}
function assert(c,m){if(!c)throw new Error(m)}
function has(t,s,m){assert(t.toLowerCase().includes(s.toLowerCase()),m||`missing: ${s}`)}
function no(t,rx,m){assert(!rx.test(t),m||`leak: ${rx}`)}
function section(t,start,end){const l=t.toLowerCase(),a=l.indexOf(start.toLowerCase());if(a<0)return '';const b=end?l.indexOf(end.toLowerCase(),a+start.length):-1;return t.slice(a,b>0?b:undefined)}
const analysis={
 title:'Case Analysis',source_role:'LITIGATION_SUBMISSION',export_meta:{id:'LC-V70228',generated_at_wib:'20-09-2026 06:00:00 WIB'},professional_verification:'PENDING',
 case_regulatory_snapshot:{domains:[{label:'Hukum Keluarga & Waris'},{label:'Hukum Agraria & Pertanahan'}]},
 lawyer_workflow:{version:'5.5',procedural_stage:'PLEADING',orientation:'CIVIL_PLAINTIFF',represented_side_hint:'Penggugat',role_confidence:'HIGH',mandate_summary:'Analisis diarahkan sebagai civil plaintiff pada tahap pleading dengan fokus pada isu dan authority yang terikat pada bukti serta drafting yang sesuai tahap perkara.',
 stages:[{label:'Evaluating Allegations & Counter-Arguments',status:'READY',objective:'Petakan setiap tuduhan/isu terhadap evidence support, counter-evidence, unsur, dan celah.',outputs:['Allegation-response matrix','Element-by-element defense/claim map','Adverse-evidence treatment']},{label:'Verifying Sources, Citations & Next Step',status:'PARTIAL',objective:'Jangan finalisasi sebelum norma dan citation terverifikasi.',outputs:['Professional verification queue','Critical unresolved questions','Next-action priorities']}],
 allegation_response_matrix:[],authority_duty_matrix:[],financial_collateral_audit:{amounts:[],collateral_terms:['agunan'],repayment_terms:[],discrepancy_terms:[],review_questions:['Pertanyaan review']},witness_strategy:{witness_targets:[],expert_domains:[]},
 drafting_plan:[{document:'Peta pembuktian / allegation-response matrix',purpose:'Membandingkan konstruksi lawan dan gap pembuktian.',priority:'P1',depends_on:['issues','adverse evidence','legal elements']},{document:'Catatan strategi',purpose:'Menetapkan teori perkara.',priority:'P1',depends_on:['fact matrix','procedural stage']},{document:'Draft tanggapan',purpose:'Dokumen tepat untuk posture/tahap prosedural.',priority:'P2',depends_on:['procedural posture','verified citations']}],document_integrity_audit:{document_markers:[],integrity_questions:[]},next_actions:['Bangun matriks aktor → tindakan → kewenangan → bukti → isu → unsur/norma.','Pisahkan dalil yang masih claim-only.','Verifikasi citation, status berlaku, tempus, dan bunyi pasal sebelum memasukkan rule ke pleading final.']},
 facts:['Fakta tentang objek sengketa.'],actor_matrix:[],verified_timeline:[{time:'2026',event:'Peristiwa perkara.',evidence_tag:'[FAKTA H1: "peristiwa"]'}],
 legal_issues:[
 {issue:'Apakah status harta bersama telah terbukti?',rule:'UU Perkawinan - Pasal 35-37 [CORPUS · HIGH · domain=PRIMARY · fn=SUBSTANTIVE · bind=3]',analysis:'Nexus substansi yang terdeteksi: perkawinan.',conclusion:'Kesimpulan taktis sementara: DIDUKUNG MATERI TEKSTUAL - dapat dipakai sebagai hipotesis kerja atas isu, tetap tunduk pada verifikasi dokumen asli dan norma.'},
 {issue:'Apakah dalil perbuatan melawan hukum telah terbukti?',rule:'Staatsblad 1847 No. 23 - Pasal 1365',analysis:'Analisis berdasarkan dalil pihak.',conclusion:'Kesimpulan taktis sementara: BERBASIS KLAIM - belum cukup untuk dinyatakan sebagai fakta hukum.'},
 {issue:'Apa status pendaftaran tanah?',rule:'PP No. 24 Tahun 1997',analysis:'Analisis berdasarkan dokumen.',conclusion:'Kesimpulan taktis sementara: CAMPURAN FAKTA/KLAIM - sebagian mempunyai dukungan tekstual, sebagian masih memerlukan pembuktian.'}
 ],
 applicable_law:[{regulation:'UU No. 1 Tahun 1974 jo UU No. 16 Tahun 2019',article:'Pasal 35-37',relevance:'Kandidat dari korpus internal dengan tingkat keyakinan tinggi, terkait dengan domain utama.'},{regulation:'PP No. 24 Tahun 1997',article:'Pasal 32',relevance:'Nexus substansi yang terdeteksi: tanah.'}],
 legal_gaps:[],multi_path_diagnosis:[{path:'Hukum Keluarga & Waris',strength:'MEDIUM',application:'Sinyal domain=17; isu material: harta bersama | waris.',counter_case:'Uji apakah unsur domain tidak terbukti.'}],
 risk_matrix:[{level:'LOW',clause:'Kualitas basis fakta',finding:'Fakta tekstual=8; klaim=62; .',mitigation:'Pasangkan proposisi material dengan dokumen primer.'},{level:'MEDIUM',clause:'Hukum positif & tempus',finding:'15 kandidat beridentitas dan tidak tertolak tempus tersedia; pasal/penerapan belum otomatis terverifikasi.',mitigation:'Verifikasi pasal, effective date, dan nexus faktual.'},{level:'MEDIUM',clause:'Kronologi',finding:'Peristiwa bertanggal terdeteksi=1.',mitigation:'Lengkapi tanggal tindakan material.'}],
 arguments_for:['Dokumen formal mendukung posisi.'],arguments_against:['Perlu counter-reading atas bukti lawan.'],best_case:'Bukti mengonfirmasi unsur.',worst_case:'Bukti tidak cukup.',
 recommendations:['Verifikasi authority final, status berlaku, tempus, pasal, dan material nexus.','Verifikasi citation sebelum memasukkan Kaidah Hukum ke pleading final.'],adverse_evidence:[{evidence_id:'ADV-1',page:1,adverse_point:'Bukti lawan.',analysis:'Uji autentisitas dan counter-reading sebelum dipakai.'}],blank_spot_questions:[],
 verification_note:'VERIFIKASI PROFESIONAL PENDING. Reasoning core bersifat deterministik dan evidence-grounded. Dokumen asli harus diverifikasi.'
};
const before=JSON.stringify(analysis);const pdf=createPdfBuffer(analysis),docx=createDocxBuffer(analysis);assert(before===JSON.stringify(analysis),'export mutated analysis');
const forbidden=[/\bauthority\b/i,/\bdrafting\b/i,/evidence support/i,/\bProfessional\b/i,/\bPENDING\b/i,/reasoning core/i,/evidence-grounded/i,/Sinyal domain\s*=\s*\d+/i,/\bkandidat\b/i,/counter-reading/i,/\bcitation\b/i,/pleading final/i,/allegation-response matrix/i,/\bfact matrix\b/i,/\bprocedural stage\b/i,/\bposture\b/i,/Pertanyaan review/i,/\btahap\s+tahap\b/i,/\bmasih\s+masih\b/i,/Fakta tekstual\s*=\s*\d+/i,/Peristiwa bertanggal terdeteksi\s*=\s*\d+/i,/\s\?\s+tindakan\s+\?/i];
const required=['Analisis Perkara','Keterkaitan isu','rujukan hukum','bukti pendukung','pembacaan tandingan','dasar hukum final','penyusunan dokumen hukum','Daftar verifikasi profesional','matriks fakta','tahap prosedural','Pertanyaan penelaahan','Pendapat Hukum / Kesimpulan'];
let checks=0;
for(const [fmt,text] of [['PDF',pdfText(pdf)],['DOCX',docxText(docx)]]){
 for(const rx of forbidden){no(text,rx,`${fmt}: ${rx}`);checks++}
 for(const token of required){has(text,token,`${fmt}: missing ${token}`);checks++}
 const c=section(text,'Pendapat Hukum / Kesimpulan','Rujukan Hukum Utama');
 has(c,'Berdasarkan dokumen yang tersedia',`${fmt}: conclusion lacks case synthesis`);checks++;
 has(c,'Dasar hukum utama yang telah teridentifikasi',`${fmt}: conclusion lacks legal-basis synthesis`);checks++;
 has(c,'Prioritas tindak lanjut',`${fmt}: conclusion lacks action synthesis`);checks++;
 has(c,'harta bersama',`${fmt}: conclusion lost issue substance`);checks++;
 no(c,/Kesimpulan taktis sementara|BERBASIS KLAIM|DIDUKUNG MATERI TEKSTUAL|CAMPURAN FAKTA\/KLAIM/i,`${fmt}: final conclusion still repeats machine labels`);checks++;
}
assert(pdf.length>5000,'PDF too small');checks++;assert(docx.length>5000,'DOCX too small');checks++;
console.log(`PASS ${checks}/${checks} V7.0.2.28 lawyer-facing language quality`);
fs.rmSync(temp,{recursive:true,force:true});
