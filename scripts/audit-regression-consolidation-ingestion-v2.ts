import assert from 'node:assert/strict';
import { extractUploadedDocument } from '../server/documentIngestion';

function escapePdfText(s:string){ return s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)'); }
function buildTextPdf(pageCount:number, blankPages:number[]):Buffer {
  const objects = new Map<number,string>();
  const kids:number[]=[];
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for(let i=1;i<=pageCount;i++){
    const pageObj=4+(i-1)*2, contentObj=pageObj+1; kids.push(pageObj);
    const text = blankPages.includes(i) ? '' : (`HALAMAN ${i} DOKUMEN UJI. Bahwa halaman ini berisi fakta hukum, perjanjian, pihak, kewajiban, bukti dan kronologi yang cukup untuk ekstraksi text layer. `.repeat(6));
    const stream = text ? `BT /F1 10 Tf 40 780 Td (${escapePdfText(text)}) Tj ET` : '';
    objects.set(pageObj, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`);
    objects.set(contentObj, `<< /Length ${Buffer.byteLength(stream,'ascii')} >>\nstream\n${stream}\nendstream`);
  }
  objects.set(2, `<< /Type /Pages /Count ${pageCount} /Kids [${kids.map(n=>`${n} 0 R`).join(' ')}] >>`);
  const maxObj=Math.max(...objects.keys());
  const chunks:string[]=['%PDF-1.4\n']; const offsets:number[]=[0];
  let len=Buffer.byteLength(chunks[0],'ascii');
  for(let n=1;n<=maxObj;n++){
    const obj=objects.get(n) ?? '<< >>'; offsets[n]=len;
    const chunk=`${n} 0 obj\n${obj}\nendobj\n`; chunks.push(chunk); len+=Buffer.byteLength(chunk,'ascii');
  }
  const xref=len; let x=`xref\n0 ${maxObj+1}\n0000000000 65535 f \n`;
  for(let n=1;n<=maxObj;n++) x += `${String(offsets[n]).padStart(10,'0')} 00000 n \n`;
  x += `trailer\n<< /Size ${maxObj+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  chunks.push(x); return Buffer.from(chunks.join(''),'ascii');
}

async function main(){
  const pdf=buildTextPdf(20,[7]);
  const result=await extractUploadedDocument(pdf,'text-layer-20p-blank7.pdf','application/pdf');
  assert.equal(result.mode,'PDF_LOCAL_TEXT');
  assert.equal(result.pages_total,20);
  assert.deepEqual(result.failed_pages,[7]);
  assert.deepEqual(result.source_quality?.excluded_pages,[7]);
  assert.equal(result.source_quality?.page_coverage,0.95);
  assert.match(result.text,/HALAMAN 8 DOKUMEN UJI/);
  assert.doesNotMatch(result.text,/HALAMAN 7 DOKUMEN UJI/);
  console.log('PASS | text-layer 20p blank page excludes page 7 only and preserves page 8');
  console.log('SUMMARY 1/1 production-path text-layer ingestion checks PASS');
}
main().catch(err=>{ console.error('FAIL | production-path text-layer ingestion',err); process.exit(1); });
