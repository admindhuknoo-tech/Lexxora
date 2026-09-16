declare const process: any;
import fs from 'node:fs';
import path from 'node:path';
import { applyOcrSourceQualityGuard, applyOcrSpanQualityGuard } from '../server/documentIngestion';
import { buildEvidenceModel } from '../server/evidenceModel';

let pass=0, fail=0;
function check(name:string, ok:boolean, detail=''){
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok?pass++:fail++;
}

const raw = [
  '--- HALAMAN 1 ---\nAda SHM atas nama Agus dan Budi. Dokumen ini dibaca jelas.',
  '--- HALAMAN 2 ---\nJaksa Madya CamScanner ??? ### teks rusak yang tidak boleh membentuk aktor.',
  '--- HALAMAN 3 ---\nTergugat membantah dalil Penggugat dan menyatakan pembayaran telah dilakukan.'
].join('\n\n');
const guarded = applyOcrSourceQualityGuard(raw, [
  {page:1,confidence:92,status:'OK'},
  {page:2,confidence:48,status:'OK'},
  {page:3,confidence:84,status:'OK'},
]);

check('1. low OCR page makes source review-required', guarded.status==='REVIEW_REQUIRED', `status=${guarded.status}`);
check('2. page below threshold is excluded', guarded.excluded_pages.length===1 && guarded.excluded_pages[0]===2, `excluded=${guarded.excluded_pages.join(',')}`);
check('3. good pages remain usable', guarded.usable_pages===2, `usable=${guarded.usable_pages}`);
check('4. excluded OCR text is absent from analysis text', !/Jaksa Madya|CamScanner/.test(guarded.text));
const em=buildEvidenceModel(guarded.text);
check('5. low-quality page cannot create actor', !em.actors.some(a=>/Jaksa Madya/i.test(a.actor)), `actors=${em.actors.map(a=>a.actor).join(',')}`);
check('6. trusted-page actor survives guard', em.actors.some(a=>/Agus/i.test(a.actor)), `actors=${em.actors.map(a=>a.actor).join(',')}`);

const caseSource=fs.readFileSync(path.join(process.cwd(),'server','caseAnalysis.ts'),'utf8');
check('7. pipeline has source-quality gate', /key:'source_quality_guard'/.test(caseSource));
check('8. source-quality uncertainty enters risk calibration', /factor:'Source quality'/.test(caseSource));
check('9. source-quality uncertainty caps readiness', /sourceQualityStatus==='REVIEW_REQUIRED'/.test(caseSource) && /sourceQualityExcludedCount>0/.test(caseSource));



// Span-level guard: page confidence can be healthy while isolated OCR fragments are broken.
const spanFixture = [
  '--- HALAMAN 1 ---',
  'Andik Widyantoro, S.H., Husain Hafaz Nahumarury, S.H., dan Fais M Hamid, S.H. Advokat pada Kantor Hukum A & ASSOCIATES.',
  'PAI fY PERADI KA TANT P A &ASSOCIATES aa MENGEGGT Gaia & IA W 4 Alamat :',
  'III Melawan Ninik Sugiyanti',
  'UD SER ERA D3 AS. DAN',
  'Bahwa para Tergugat menolak dalil Penggugat dan tetap mengajukan jawaban.'
].join('\n');
const spanGuard = applyOcrSpanQualityGuard(spanFixture);
check('10. broken OCR span is removed inside otherwise usable page', !/PAI fY PERADI|UD SER ERA D3 AS/i.test(spanGuard.text), `excluded=${spanGuard.excluded_spans}`);
check('11. healthy legal text on same page survives span guard', /Andik Widyantoro/i.test(spanGuard.text) && /Tergugat menolak dalil Penggugat/i.test(spanGuard.text));
check('12. narrow Roman-number structural merge is repaired', /Ninik Sugiyanti/.test(spanGuard.text) && !/III Melawan Ninik Sugiyanti/.test(spanGuard.text), `repaired=${spanGuard.repaired_spans}`);
const spanModel = buildEvidenceModel(spanGuard.text);
check('13. OCR garbage cannot become actor/entity', !spanModel.actors.some(a=>/UD SER ERA|III Melawan/i.test(a.actor)), `actors=${spanModel.actors.map(a=>a.actor).join(',')}`);
check('14. repaired named person remains available to evidence pipeline', spanModel.actors.some(a=>/Ninik Sugiyanti/i.test(a.actor)) || /Ninik Sugiyanti/.test(spanGuard.text));


// Mixed-content line from the real OCR runtime: damaged letterhead/contact prefix
// concatenated with a valid legal sentence. The sanitizer must salvage the legal tail.
const mixedRuntimeLine = 'PAI fY PERADI KA TANT P A &ASSOCIATES aa MENGEGGT Gaia brranaradd Kab Malang Provinsi Jawa Timur MANGA MPA EDAN Phone 082228007899 Email :afigladius07@gmail.com Jawaban Pertama Tergugat I, II, DAN III atas Gugatan Penggugat tertanggal 26 Februari 2026.';
const mixedGuard = applyOcrSpanQualityGuard(mixedRuntimeLine);
check('15. mixed OCR line removes damaged prefix', !/PAI fY PERADI|MENGEGGT Gaia|MANGA MPA EDAN|082228007899/i.test(mixedGuard.text), mixedGuard.text);
check('16. mixed OCR line preserves valid legal tail', /Jawaban Pertama Tergugat I, II, DAN III atas Gugatan Penggugat/i.test(mixedGuard.text), mixedGuard.text);
check('17. mixed OCR salvage is recorded as repair', mixedGuard.repaired_spans>=1, `repaired=${mixedGuard.repaired_spans}`);

// Root-cause regression from the real runtime: the broken letterhead/contact area
// is wrapped across multiple OCR lines. Line-only filtering used to remove just
// the first line, leaving the remaining fragments to be rejoined downstream.
const wrappedRuntimeBlock = [
  'PAI fY PERADI KA TANT P A &ASSOCIATES aa',
  'MENGEGGT Gaia & IA W 4 Alamat :',
  'Jl Sumedang No 389 Kel Cempokomulyo Kec Kepanjen brranaradd Kab Malang Provinsi Jawa Timur MANGA MPA EDAN Phone 082228007899 Email :afigladius07@gmail.com',
  'Jawaban Pertama Tergugat I, II, DAN III atas Gugatan Penggugat tertanggal 26 Februari 2026.'
].join('\n');
const wrappedGuard = applyOcrSpanQualityGuard(wrappedRuntimeBlock);
check('18. wrapped OCR header is removed as one logical block', !/PAI fY PERADI|MENGEGGT Gaia|MANGA MPA EDAN|082228007899/i.test(wrappedGuard.text), wrappedGuard.text);
check('19. wrapped OCR block preserves the legal tail', /Jawaban Pertama Tergugat I, II, DAN III atas Gugatan Penggugat/i.test(wrappedGuard.text), wrappedGuard.text);
check('20. wrapped OCR cleanup is auditable', wrappedGuard.excluded_spans>=1 && wrappedGuard.repaired_spans>=1, `excluded=${wrappedGuard.excluded_spans}; repaired=${wrappedGuard.repaired_spans}`);

console.log(`\n${pass}/${pass+fail} source-quality-v611 checks PASS`);
if(fail) process.exit(1);
