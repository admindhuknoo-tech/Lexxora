import { resolveProceduralPosture } from '../server/proceduralPosture';
import { deriveOntologyIssues } from '../server/legalOntology';
import { buildLawyerWorkflow } from '../server/lawyerWorkflow';
import { __test__ } from '../server/caseAnalysis';

let failed=0;
const check=(name:string,ok:boolean,detail='')=>{console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` :: ${detail}`:''}`);if(!ok)failed++;};
const stage=(text:string,sourceRole='',title='')=>resolveProceduralPosture({text,sourceRole,title}).stage;

// T1 — document identity must dominate body subject matter.
check('T1 repliek beats execution body',stage('REPLIEK PERKARA NOMOR 44/Pdt.G/2026/PN\nTergugat membahas eksekusi hak tanggungan, agunan dan jaminan.','LITIGATION_SUBMISSION')==='PLEADING');
check('T1 appeal beats execution body',stage('MEMORI BANDING\nPutusan sebelumnya membahas permohonan eksekusi dan sita eksekusi.','LITIGATION_SUBMISSION')==='APPEAL');
check('T1 execution beats pleading body',stage('PERMOHONAN EKSEKUSI\nDalam gugatan sebelumnya para pihak telah mengajukan replik dan duplik.','LITIGATION_SUBMISSION')==='EXECUTION');
check('T1 indictment beats civil body',stage('SURAT DAKWAAN\nPerkara juga menyinggung sengketa perdata dan gugatan.','LITIGATION_SUBMISSION')==='PROSECUTION');
check('T1 BAP beats quoted pleading',stage('BERITA ACARA PEMERIKSAAN\nSaksi menerangkan adanya gugatan dan eksepsi.','INVESTIGATION_OR_BAP')==='INVESTIGATION');
check('T1 praperadilan document identity',stage('PERMOHONAN PRAPERADILAN\nPemohon mempersoalkan penangkapan dan penyitaan.')==='INVESTIGATION');
check('T1 title parameter wins',stage('Body membahas gugatan dan eksekusi.','LITIGATION_SUBMISSION','Memori Banding')==='APPEAL');

// Heading search is not a brittle 12-line fixed window.
const noisy=Array.from({length:25},(_,i)=>`HEADER OCR ${i+1}`).join('\n')+'\nREPLIEK PERKARA NOMOR 44/Pdt.G/2026/PN\nBody menyebut eksekusi.';
check('T1 heading survives long OCR prefix',stage(noisy,'LITIGATION_SUBMISSION')==='PLEADING');

// T2 — specific current action, not generic "permohonan".
const longHeader=Array.from({length:30},(_,i)=>`metadata ${i}`).join('\n');
check('T2 specific execution action after long header',stage(`${longHeader}\nPemohon mengajukan permohonan eksekusi atas putusan berkekuatan hukum tetap.`)==='EXECUTION');
check('T2 specific appeal action after long header',stage(`${longHeader}\nPenggugat mengajukan permohonan banding ke Pengadilan Tinggi.`)==='APPEAL');
check('T2 specific exception action',stage('Kuasa hukum mengajukan eksepsi mengenai kompetensi relatif.')==='PLEADING');
check('T2 generic petition is not a posture',stage('Klien mempertimbangkan mengajukan permohonan setelah dokumen lengkap.')==='CONSULTATION');

// Historical/quoted procedural events must not hijack current posture.
check('history mediation does not beat pleading',stage('REPLIEK\nSebelumnya para pihak telah melakukan mediasi tetapi tidak berhasil.','LITIGATION_SUBMISSION')==='PLEADING');
check('history somasi does not beat pleading',stage('JAWABAN TERGUGAT\nPenggugat sebelumnya telah mengirimkan somasi.','LITIGATION_SUBMISSION')==='PLEADING');
check('history appeal does not beat repliek',stage('REPLIEK\nMenurut Tergugat, Penggugat telah mengajukan banding dalam perkara lain.','LITIGATION_SUBMISSION')==='PLEADING');
check('history investigation does not beat pledoi',stage('PLEDOI\nDalam penyidikan sebelumnya telah dilakukan penyitaan dan penahanan.','LITIGATION_SUBMISSION')==='PLEADING');

// Weak body nouns alone must not invent current posture.
check('body-only execution noun remains consultation',stage('Analisis ini membahas risiko eksekusi, agunan, dan jaminan sebagai salah satu kemungkinan.')==='CONSULTATION');
check('body-only mediation history remains consultation',stage('Kronologi menyebut mediasi pernah dilakukan pada tahun lalu.')==='CONSULTATION');

// Source-role structural fallback remains available where identity is absent.
check('generic litigation source-role fallback pleading',stage('Para pihak menyampaikan uraian pokok perkara.','LITIGATION_SUBMISSION')==='PLEADING');
check('investigation source-role fallback',stage('Pemeriksaan dilakukan terhadap pihak terkait.','INVESTIGATION_OR_BAP')==='INVESTIGATION');

// Issue generation/query terms must follow resolved posture, not a bare body noun.
const repliekIssue=deriveOntologyIssues('REPLIEK\nKompetensi relatif dan syarat formil dipersoalkan. Dalam uraian juga disebut risiko eksekusi hak tanggungan.').find(x=>x.id==='remedy-procedure');
check('ontology pleading remedy issue exists on real controversy',!!repliekIssue);
check('ontology pleading query excludes body-only execution',!!repliekIssue && !repliekIssue.query_terms.includes('eksekusi'),JSON.stringify(repliekIssue?.query_terms||[]));
check('ontology pleading query keeps pleading/formal terms',!!repliekIssue && repliekIssue.query_terms.includes('syarat formil'),JSON.stringify(repliekIssue?.query_terms||[]));
const execIssue=deriveOntologyIssues('PERMOHONAN EKSEKUSI\nPemohon memohon eksekusi dan aanmaning atas putusan.').find(x=>x.id==='remedy-procedure');
check('ontology execution query includes execution',!!execIssue && execIssue.query_terms.includes('eksekusi'),JSON.stringify(execIssue?.query_terms||[]));
const bareExecIssue=deriveOntologyIssues('REPLIEK\nDalil lawan hanya menyebut kata eksekusi dalam uraian agunan.').find(x=>x.id==='remedy-procedure');
check('ontology bare execution mention does not manufacture issue',!bareExecIssue);

// Lawyer workflow must use the same resolver.
const wf=buildLawyerWorkflow({title:'Case Analysis',text:'REPLIEK PERKARA NOMOR 44/Pdt.G/2026/PN\nBody membahas eksekusi hak tanggungan.',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[]},legalIssues:[{issue:'kompetensi'}],legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]});
check('workflow shares pleading posture',wf.procedural_stage==='PLEADING',wf.procedural_stage);

// Stage-specific drafting readiness must require stage-specific authority.
const appealGeneric=buildLawyerWorkflow({title:'Memori Banding',text:'MEMORI BANDING',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[]},legalIssues:[{issue:'banding'}],legalGaps:[],adverseEvidence:[],applicableLaw:[{regulation:'Pedoman Peradilan Umum',source:'resmi',article:'hukum acara',relevance:'peradilan umum'}],verifiedTimeline:[],actorMatrix:[]});
check('appeal generic procedure does not make drafting ready',appealGeneric.stages.find(x=>x.id==='drafting')?.status==='PARTIAL');
const appealSpecific=buildLawyerWorkflow({title:'Memori Banding',text:'MEMORI BANDING',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[]},legalIssues:[{issue:'banding'}],legalGaps:[],adverseEvidence:[],applicableLaw:[{regulation:'Pedoman Banding',source:'resmi',article:'tenggang banding',relevance:'hukum acara banding'}],verifiedTimeline:[],actorMatrix:[]});
check('appeal specific authority makes drafting ready',appealSpecific.stages.find(x=>x.id==='drafting')?.status==='READY');
const executionGeneric=buildLawyerWorkflow({title:'Permohonan Eksekusi',text:'PERMOHONAN EKSEKUSI',sourceRole:'LITIGATION_SUBMISSION',domainContext:{},evidence:{textual_facts:[],party_claims:[]},legalIssues:[{issue:'eksekusi'}],legalGaps:[],adverseEvidence:[],applicableLaw:[{regulation:'Pedoman Peradilan Umum',source:'resmi',article:'hukum acara',relevance:'peradilan umum'}],verifiedTimeline:[],actorMatrix:[]});
check('execution generic procedure does not make drafting ready',executionGeneric.stages.find(x=>x.id==='drafting')?.status==='PARTIAL');

// Procedural tempus must be stage-specific: a later year attached to another
// stage must not silently make an otherwise post-dated authority look compatible.
check('tempus appeal ignores execution-year contamination',__test__.inferProceduralTempusYearFromCase('Memori banding diajukan pada 2024. Dalam uraian disebut eksekusi perkara lain tahun 2026.','APPEAL')===2024,String(__test__.inferProceduralTempusYearFromCase('Memori banding diajukan pada 2024. Dalam uraian disebut eksekusi perkara lain tahun 2026.','APPEAL')));
check('tempus appeal prefers current over historical same-stage year',__test__.inferProceduralTempusYearFromCase('MEMORI BANDING diajukan pada 2024. Dalam perkara lain, sebelumnya banding diajukan pada 2026.','APPEAL')===2024,String(__test__.inferProceduralTempusYearFromCase('MEMORI BANDING diajukan pada 2024. Dalam perkara lain, sebelumnya banding diajukan pada 2026.','APPEAL')));

if(failed){console.error(`FAILED ${failed}`);process.exit(1);}console.log('ALL V7.0.2.26 POSTURE HIERARCHY TESTS PASSED');
