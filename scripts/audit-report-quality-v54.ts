import { runCaseAnalysis } from '../server/caseAnalysis';
import { analysisToText, createPdfBuffer } from '../server/exporters';

let pass=0, total=0;
function check(name:string, ok:boolean, detail=''){
  total++; if(ok){pass++; console.log(`PASS ${name}${detail?` :: ${detail}`:''}`);} else console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`);
}

const mixed=`Perihal: Penggelapan kendaraan. Seorang penyewa menggunakan kendaraan milik pemilik berdasarkan kesepakatan sewa bulanan. Pemilik kemudian menerima informasi bahwa kendaraan telah digadaikan kepada pihak lain dan selanjutnya berpindah penguasaan lagi. Kendaraan disebut sedang dipakai oleh sebuah perusahaan berdasarkan kontrak sewa yang belum berakhir. Pemilik melapor kepada polisi dan penyewa ditangkap serta ditahan.`;

async function main(){
const result=await runCaseAnalysis({title:'Audit perkara campuran',narrative:mixed,input_type:'narrative',regulatory_mode:'offline'});
const md=analysisToText(result);
const issueText=(result.legal_issues||[]).map((x:any)=>x.issue).join(' | ');
const laws=(result.applicable_law||[]).map((x:any)=>String(x.regulation||x.source||''));

check('strict I-V report contract',[
  '## I. KONTEKS PERKARA / MASALAH','## II. ISU UTAMA DAN ANALISIS','## III. DASAR RUJUKAN & CELAH DATA','## IV. MATRIKS RISIKO & TINDAKAN LANJUT','## V. VERIFIKASI PROFESIONAL'
].every(x=>md.includes(x)));
check('reasoning READY displayed as AMAN',md.includes('| Status Reasoning Core | AMAN -'));
check('no duplicated issue heading',!/###\s+1\./.test(md));
check('issue block aligned',md.includes('- **Isu 1:**')&&md.includes('- **Aturan / Rule:**')&&md.includes('- **Basis & Dukungan:**')&&md.includes('- **Kesimpulan Taktis:**'));
const firstIssue=String((result.legal_issues||[])[0]?.issue||'');
const pdfLatin=createPdfBuffer(result).toString('latin1');
check('PDF issue question emitted once',!!firstIssue && pdfLatin.split(firstIssue).length-1===1,`occurrences=${firstIssue?pdfLatin.split(firstIssue).length-1:0}`);
check('secondary domain disclosed',/secondary=/.test(String(result.summary||'')),String(result.summary||'').slice(0,180));
check('weak Perihal header remains case narrative',String((result as any).source_role||'')==='CASE_NARRATIVE_OR_QUESTION',String((result as any).source_role||''));
check('material claims retained',Array.isArray((result as any).statement_buckets?.party_claims)&&((result as any).statement_buckets.party_claims.length>=3),`claims=${(result as any).statement_buckets?.party_claims?.length||0}`);
check('asset disposition issue retained',Array.isArray(result.legal_issues)&&result.legal_issues.some((x:any)=>String(x.issue||'').toLowerCase().includes('menggadaikan')||String(x.issue||'').toLowerCase().includes('mengalihkan barang')),issueText);
check('no insurance false-positive',!/asuransi|polis|tertanggung|penanggung/i.test(issueText),issueText);
check('no consumer-law false-positive',!laws.some(x=>/8\s*Tahun\s*1999|perlindungan\s+konsumen/i.test(x)),laws.join(' | '));
check('local corpus still returns issue-linked candidates',laws.length>0,laws.join(' | '));
check('action items concise',Array.isArray(result.recommendations)&&result.recommendations.slice(0,6).every((x:any)=>String(x).length<=155),String(result.recommendations));
check('horizontal section separators',md.split('\n---\n').length>=5);

console.log(`\n${pass}/${total} report-quality checks PASS`);
if(pass!==total) process.exitCode=1;
}

main().catch(e=>{console.error(e);process.exitCode=1});
