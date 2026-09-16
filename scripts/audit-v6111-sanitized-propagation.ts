declare const process:any;
import fs from 'node:fs';
import path from 'node:path';
import { resolveCanonicalAnalysisText } from '../server/caseAnalysis';
import { buildEvidenceModel } from '../server/evidenceModel';

let pass=0, fail=0;
function check(name:string, ok:boolean, detail=''){
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok?pass++:fail++;
}

const raw='RAW OCR PAI fY PERADI KA TANT P A &ASSOCIATES aa MENGEGGT Gaia. III Melawan Ninik Sugiyanti. UD SER ERA D3 AS. DAN';
const sanitized='--- HALAMAN 1 ---\nJAWABAN TERGUGAT. Penggugat mengajukan gugatan. Tergugat membantah dalil Penggugat. Ninik Sugiyanti disebut sebagai Tergugat III.';
const canonical=resolveCanonicalAnalysisText({
  title:'propagation', narrative:raw, input_type:'narrative+document',
  supplemental_narrative:'Catatan pengguna: verifikasi jawaban Tergugat.',
  document_ingestion:{ text:sanitized, mode:'LOCAL_OCR', coverage_ratio:.87, manual_review_required:true,
    source_quality:{status:'REVIEW_REQUIRED',minimum_analysis_confidence:60,usable_pages:1,low_confidence_pages:[],excluded_pages:[],excluded_spans:3,repaired_spans:0} } as any,
});
check('1. raw OCR narrative is not semantic source', !/PAI fY PERADI|UD SER ERA|RAW OCR/.test(canonical), canonical);
check('2. sanitized document is canonical source', /JAWABAN TERGUGAT/.test(canonical) && /Ninik Sugiyanti/.test(canonical));
check('3. separately typed narrative is preserved', /Catatan pengguna: verifikasi jawaban Tergugat/.test(canonical));
const em=buildEvidenceModel(canonical);
check('4. raw OCR garbage cannot become actor', !em.actors.some(a=>/UD SER ERA|III Melawan/i.test(a.actor)), em.actors.map(a=>a.actor).join(','));
check('5. valid litigation actors survive', em.actors.some(a=>/Penggugat/i.test(a.actor)) && em.actors.some(a=>/Tergugat/i.test(a.actor)), em.actors.map(a=>a.actor).join(','));

const src=fs.readFileSync(path.join(process.cwd(),'server','caseAnalysis.ts'),'utf8');
check('6. one canonical text variable feeds pipeline', /const text = resolveCanonicalAnalysisText\(input\)/.test(src));
check('7. stored source_text uses canonical text', /source_text:\s*text/.test(src));
check('8. evidence model uses canonical text', /buildEvidenceModel\(text\)/.test(src));
check('9. evidence ledger uses canonical text', /extractEvidenceLedger\(text\)/.test(src));
check('10. tempus uses canonical text', /inferTempusYearFromCase\(text\)/.test(src));

console.log(`\n${pass}/${pass+fail} sanitized-propagation-v6111 checks PASS`);
if(fail) process.exit(1);
