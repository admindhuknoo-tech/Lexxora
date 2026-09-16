declare const process:any;
import { buildEvidenceModel } from '../server/evidenceModel';
import { reasonForensically } from '../server/forensicReasoner';
import { inferLegalContext } from '../server/legalOntology';

let pass=0, fail=0;
function check(name:string, ok:boolean, detail=''){console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`); ok?pass++:fail++;}

const text=`REPLIEK. Perkara Nomor 44/Pdt.G/2026/PN.Kpn. Kepada Yth. Majelis Hakim Pengadilan Negeri Kepanjen. Penggugat menyampaikan repliek atas jawaban Para Tergugat. Para Tergugat mendalilkan bahwa objek sengketa adalah milik bersama dan menolak dalil Penggugat. Penggugat membantah dalil Para Tergugat tersebut. Pada 20 Mei 2026 para pihak hadir di persidangan.`;
const evidence=buildEvidenceModel(text);
const ctx=inferLegalContext(text);
const reasoning=reasonForensically({title:'Audit Repliek',primaryDomain:ctx.primary.label,domainContext:ctx,evidence,lawCandidates:[]});
const specific=reasoning.adverse_evidence.filter(x=>Number(x.page)>0 && String(x.analysis||'').length>45).length;
check('1 litigation role', evidence.source_role==='LITIGATION_SUBMISSION', evidence.source_role);
check('2 adverse producer non-empty', evidence.adverse_evidence.length>0, `count=${evidence.adverse_evidence.length}`);
check('3 forensic adverse treatment non-empty', reasoning.adverse_evidence.length>0, `count=${reasoning.adverse_evidence.length}`);
check('4 pipeline-gate specificity condition satisfied', specific>0, `specific=${specific}`);
console.log(`\n${pass}/${pass+fail} adverse-pipeline-v682 checks PASS`);
if(fail)process.exit(1);
