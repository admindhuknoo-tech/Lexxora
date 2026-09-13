import { Buffer } from 'node:buffer';

const NAVY = '1B365D';
const GOLD = 'EAAA00';
const LIGHT = 'F3F5F7';
const MID = 'D8DEE8';
const DARK = '1A1A1A';
const RED = 'B42318';

function clean(value: unknown): string {
  const text = String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\uFFFD+/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) return '';
  const sample = text.slice(0, 8000);
  const suspicious = (sample.match(/[?]{4,}|[^\x09\x0A\x20-\x7E\u00A0-\u024F]/g) || []).length;
  if (sample.length > 80 && suspicious / sample.length > 0.08) return '[DATA SUMBER TIDAK VALID / TERDETEKSI BINARY - lakukan analisis ulang dari dokumen yang dapat dibaca]';
  return text;
}
function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function verificationStatus(analysis: any): string {
  const note = clean(analysis?.verification_note);
  return /pending|menunggu|belum|perlu verifikasi/i.test(note) ? 'MENUNGGU VERIFIKASI' : 'VERIFIKASI PROFESIONAL DIPERLUKAN';
}
function methodLabel(analysis: any): string {
  return clean(analysis?.analysis_method || analysis?.method || 'Structured Legal Analysis / IRAC');
}
function readingStatus(analysis: any): string {
  if (analysis?.reading_status) return clean(analysis.reading_status);
  const d = analysis?.document_reading || {};
  const read = Number(d.segments_read || 0), total = Number(d.segments_total || 0);
  const status = clean(d.status || '');
  if (total > 0) return `${status || 'Pembacaan'} - ${read}/${total} bagian${d.coverage_ratio && Number(d.coverage_ratio) < .999 ? ` (${Math.round(Number(d.coverage_ratio)*100)}% coverage)` : ''}`;
  return 'Status pembacaan belum tersedia';
}
function titleOf(analysis: any): string { return clean(analysis?.title) || 'Analisis Dokumen Hukum'; }

export function analysisToText(analysis: any): string {
  const out: string[] = [titleOf(analysis), 'LEXICORE - Industrial Executive & Audit Report', ''];
  const section = (t: string, b?: unknown) => { const s = clean(b); if (s) out.push(t.toUpperCase(), s, ''); };
  const list = (t: string, a?: unknown[]) => { if (!Array.isArray(a) || !a.length) return; out.push(t.toUpperCase()); a.forEach((x,i)=>out.push(`${i+1}. ${clean(x)}`)); out.push(''); };
  section('I. Konteks Perkara', analysis.summary); list('Fakta Material', analysis.facts);
  if (Array.isArray(analysis.legal_issues)) { out.push('II. ISU HUKUM'); analysis.legal_issues.forEach((x:any,i:number)=>{out.push(`${i+1}. ${clean(x.issue)}`); if(x.rule)out.push(`Rule: ${clean(x.rule)}`); if(x.analysis)out.push(`Analisis: ${clean(x.analysis)}`); if(x.conclusion)out.push(`Kesimpulan: ${clean(x.conclusion)}`);}); out.push(''); }
  if (Array.isArray(analysis.applicable_law)) { out.push('III. DASAR HUKUM'); analysis.applicable_law.forEach((x:any,i:number)=>out.push(`${i+1}. ${clean(x.regulation||x.source||x.domain)} ${clean(x.article)} - ${clean(x.relevance||x.status)}`)); out.push(''); }
  if (Array.isArray(analysis.risk_matrix)) { out.push(`IV. MATRIKS RISIKO - ${Math.round(Number(analysis.overall_risk_score||0))}/100`); analysis.risk_matrix.forEach((x:any,i:number)=>out.push(`${i+1}. [${clean(x.level)}] ${clean(x.clause)} | ${clean(x.finding)} | Mitigasi: ${clean(x.mitigation)}`)); out.push(''); }
  list('V. Argumen yang Menguatkan', analysis.arguments_for); list('Argumen Lawan / Kelemahan', analysis.arguments_against);
  section('VI. Skenario Terbaik', analysis.best_case); section('Skenario Terburuk', analysis.worst_case);
  list('VII. Rencana Tindakan', analysis.recommendations); section('VIII. Catatan Verifikasi Profesional', analysis.verification_note);
  return out.join('\n').replace(/\n{3,}/g,'\n\n').trim()+'\n';
}

// ---------------- PDF: Industrial Executive & Audit Report ----------------

type PdfPage = { ops: string[]; pageNo: number };
function pdfEsc(s: string): string { return clean(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[^\x20-\x7E]/g,'?'); }
function hexRgb(hex: string): [number,number,number] { return [parseInt(hex.slice(0,2),16)/255, parseInt(hex.slice(2,4),16)/255, parseInt(hex.slice(4,6),16)/255]; }
function fill(hex: string) { const [r,g,b]=hexRgb(hex); return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`; }
function stroke(hex: string) { const [r,g,b]=hexRgb(hex); return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`; }
function wrapText(text: string, maxChars: number): string[] {
  const words=clean(text).split(/\s+/).filter(Boolean); const out:string[]=[]; let line='';
  for(const w of words){const n=line?`${line} ${w}`:w;if(n.length>maxChars&&line){out.push(line);line=w;}else line=n;} if(line)out.push(line); return out.length?out:[''];
}

export function createPdfBuffer(analysis: any): Buffer {
  const W=595,H=842, left=48,right=48, contentW=W-left-right, top=94,bottom=55;
  const pages: PdfPage[]=[]; let p:PdfPage; let y=H-top;
  const fontRefs={sans:'F1',sansBold:'F2',serif:'F3',serifBold:'F4'} as const;
  const newPage=()=>{p={ops:[],pageNo:pages.length+1};pages.push(p);y=H-top;}; newPage();
  const text=(x:number,yy:number,s:string,size=10,font:keyof typeof fontRefs='serif',color=DARK)=>p.ops.push(`BT /${fontRefs[font]} ${size} Tf ${fill(color)} ${x} ${yy} Td (${pdfEsc(s)}) Tj ET`);
  const rect=(x:number,yy:number,w:number,h:number,fc?:string,sc?:string)=>{let op='q ';if(fc)op+=fill(fc)+' ';if(sc)op+=stroke(sc)+' ';op+=`${x} ${yy} ${w} ${h} re ${fc?'f':''}${sc?' S':''} Q`;p.ops.push(op);};
  const line=(x1:number,y1:number,x2:number,y2:number,c=MID,w=.6)=>p.ops.push(`q ${stroke(c)} ${w} w ${x1} ${y1} m ${x2} ${y2} l S Q`);
  const ensure=(need:number)=>{if(y-need<bottom){newPage();}};
  const para=(s:unknown,opts:{size?:number,bold?:boolean,indent?:number,after?:number,color?:string}={})=>{const val=clean(s);if(!val)return;const size=opts.size||10.7;const indent=opts.indent||0;const lines=wrapText(val,Math.max(35,Math.floor((contentW-indent)/(size*.52))));ensure(lines.length*16+8);lines.forEach((ln,i)=>{text(left+indent,y,ln,size,opts.bold?'serifBold':'serif',opts.color||DARK);y-=16;});y-=opts.after??5;};
  const heading=(roman:string,title:string)=>{ensure(34); y-=4; text(left,y,`${roman}. ${title.toUpperCase()}`,12,'sansBold',DARK); y-=8; line(left,y,left+contentW,y,GOLD,1.6); y-=18;};
  const bullet=(s:unknown,metric?:string)=>{const prefix=metric?`- ${metric} | `:'- ';const lines=wrapText(prefix+clean(s),86);ensure(lines.length*15+3);lines.forEach((ln,i)=>{text(left+(i?14:0),y,ln,10.4,'serif');y-=15;});y-=2;};
  const table=(headers:string[],rows:string[][],widths:number[])=>{
    const colX=[left];for(let i=0;i<widths.length;i++)colX.push(colX[i]+widths[i]);
    const rowHeight=(cells:string[],head=false)=>Math.max(head?24:30,...cells.map((c,i)=>wrapText(c,Math.max(10,Math.floor(widths[i]/5.5))).length*(head?11:12)+10));
    const paintRow=(cells:string[],head=false)=>{const rh=rowHeight(cells,head);for(let i=0;i<cells.length;i++){rect(colX[i],y-rh,widths[i],rh,head?NAVY:(i%2===0?'FFFFFF':'F8F9FB'),MID);const ls=wrapText(cells[i],Math.max(10,Math.floor(widths[i]/5.5)));let ty=y-(head?16:15);ls.forEach(ln=>{text(colX[i]+5,ty,ln,head?8.3:8.7,head?'sansBold':'sans',head?'FFFFFF':DARK);ty-=11;});}y-=rh;};
    const headerH=rowHeight(headers,true); if(y-headerH<bottom)newPage(); paintRow(headers,true);
    for(const r of rows){const rh=rowHeight(r,false);if(y-rh<bottom){newPage();paintRow(headers,true);}paintRow(r,false);}
    y-=12;
  };
  const drawHeaderFooter=(pg:PdfPage)=>{
    const prev=p;p=pg;
    rect(0,H-42,W,42,NAVY);rect(left,H-35,25,25,GOLD);text(left+6,H-28,'LC',11,'sansBold',NAVY);text(left+82,H-27,'LEXICORE',10.5,'sansBold','FFFFFF');
    text(W-right-115,H-27,clean(analysis?.user_name||'Pengguna LexiCore'),8.5,'sans','FFFFFF');
    line(left,35,W-right,35,MID,.7);text(left,22,'Kertas Kerja Rahasia | Menunggu Verifikasi Profesional',7.5,'sans','666666');text(W-right-55,22,`Halaman ${pg.pageNo}`,7.5,'sans','666666');p=prev;
  };

  // Page 1 title and audit metadata
  text(left,y,titleOf(analysis),19,'serifBold',NAVY); y-=24;
  text(left,y,'Industrial Executive & Audit Report',10,'sansBold','666666'); y-=22;
  table(['METADATA','STATUS'],[
    ['Metode Analisis',methodLabel(analysis)],
    ['Status Pembacaan',readingStatus(analysis)],
    ['Verifikasi Profesional',verificationStatus(analysis)],
    ['Skor Risiko',`${Math.round(Number(analysis.overall_risk_score||0))}/100`],
  ],[155,contentW-155]);

  heading('I','Konteks Perkara'); para(analysis.summary);
  if(Array.isArray(analysis.facts)&&analysis.facts.length){para('Fakta Material',{bold:true,size:10.5});analysis.facts.forEach((x:unknown)=>bullet(x));}

  heading('II','Isu Hukum dan Analisis');
  (analysis.legal_issues||[]).forEach((x:any,i:number)=>{para(`${i+1}. ${clean(x.issue)}`,{bold:true,size:10.5});if(x.rule)para(`Rule: ${clean(x.rule)}`,{indent:10});if(x.analysis)para(clean(x.analysis),{indent:10});if(x.conclusion)para(`Kesimpulan: ${clean(x.conclusion)}`,{indent:10,bold:true});});

  heading('III','Dasar Hukum yang Relevan');
  if(Array.isArray(analysis.applicable_law)&&analysis.applicable_law.length)table(['PERATURAN','PASAL','RELEVANSI'],analysis.applicable_law.map((x:any)=>[clean(x.regulation||x.source||x.domain),clean(x.article||'-'),clean(x.relevance||x.status||'-')]),[145,75,contentW-220]);

  heading('IV','Matriks Risiko Audit');
  if(Array.isArray(analysis.risk_matrix)&&analysis.risk_matrix.length)table(['LEVEL / ASPEK','TEMUAN','MITIGASI'],analysis.risk_matrix.map((x:any)=>[`${clean(x.level)}\n${clean(x.clause)}`,clean(x.finding),clean(x.mitigation)]),[120,190,contentW-310]);

  heading('V','Posisi Argumentasi'); para('Argumen yang Menguatkan',{bold:true,size:10.5});(analysis.arguments_for||[]).forEach((x:unknown)=>bullet(x)); para('Argumen Lawan / Kelemahan',{bold:true,size:10.5});(analysis.arguments_against||[]).forEach((x:unknown)=>bullet(x));
  heading('VI','Skenario Litigasi'); para('Skenario Terbaik',{bold:true,size:10.5});para(analysis.best_case);para('Skenario Terburuk',{bold:true,size:10.5});para(analysis.worst_case);
  heading('VII','Rencana Tindakan');
  if(Array.isArray(analysis.recommendations)&&analysis.recommendations.length)table(['NO.','WAKTU / PRIORITAS','TINDAKAN','STATUS'],analysis.recommendations.map((x:unknown,i:number)=>[String(i+1),`Belum ditetapkan / P${Math.min(3,Math.floor(i/2)+1)}`,clean(x),'TINDAK LANJUT']),[32,105,contentW-232,95]);
  heading('VIII','Verifikasi Profesional'); para(analysis.verification_note||'Menunggu verifikasi profesional oleh advokat.',{bold:true,color:RED});
  pages.forEach(drawHeaderFooter);

  const objects:string[]=[]; const add=(b:string)=>{objects.push(b);return objects.length;}; const catalog=add(''); const pagesId=add('');
  const f1=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'); const f2=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'); const f3=add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>'); const f4=add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>');
  const pageIds:number[]=[];
  pages.forEach(pg=>{const s=pg.ops.join('\n');const cid=add(`<< /Length ${Buffer.byteLength(s,'ascii')} >>\nstream\n${s}\nendstream`);pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R /F4 ${f4} 0 R >> >> /Contents ${cid} 0 R >>`));});
  objects[catalog-1]=`<< /Type /Catalog /Pages ${pagesId} 0 R >>`;objects[pagesId-1]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((b,i)=>{offsets[i+1]=Buffer.byteLength(pdf,'binary');pdf+=`${i+1} 0 obj\n${b}\nendobj\n`;});const xref=Buffer.byteLength(pdf,'binary');pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<=objects.length;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;pdf+=`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(pdf,'binary');
}

// ---------------- DOCX OOXML helpers ----------------
function crc32(buf: Buffer): number { let crc=0xffffffff;for(const byte of buf){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}return(crc^0xffffffff)>>>0; }
function u16(n:number){const b=Buffer.alloc(2);b.writeUInt16LE(n&0xffff);return b;} function u32(n:number){const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;}
function zipStore(files:Array<{name:string;data:Buffer}>):Buffer{const locals:Buffer[]=[];const centrals:Buffer[]=[];let offset=0;for(const file of files){const name=Buffer.from(file.name,'utf8');const crc=crc32(file.data);const local=Buffer.concat([Buffer.from('504b0304','hex'),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(file.data.length),u32(file.data.length),u16(name.length),u16(0),name,file.data]);locals.push(local);const central=Buffer.concat([Buffer.from('504b0102','hex'),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(file.data.length),u32(file.data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);centrals.push(central);offset+=local.length;}const centralSize=centrals.reduce((n,b)=>n+b.length,0);return Buffer.concat([...locals,...centrals,Buffer.concat([Buffer.from('504b0506','hex'),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralSize),u32(offset),u16(0)])]);}

function run(text:unknown,opts:{bold?:boolean,color?:string,size?:number,font?:'serif'|'sans'}={}):string{const font=opts.font==='sans'?'Arial':'Times New Roman';return `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>${opts.bold?'<w:b/>':''}${opts.color?`<w:color w:val="${opts.color}"/>`:''}${opts.size?`<w:sz w:val="${opts.size*2}"/><w:szCs w:val="${opts.size*2}"/>`:''}</w:rPr><w:t xml:space="preserve">${xmlEscape(clean(text)||' ')}</w:t></w:r>`;}
function p(text:unknown,style?:string,opts:{bold?:boolean,color?:string,size?:number,align?:'left'|'center'|'both',after?:number,before?:number,font?:'serif'|'sans'}={}):string{const pp=`<w:pPr>${style?`<w:pStyle w:val="${style}"/>`:''}<w:jc w:val="${opts.align||'both'}"/><w:spacing w:line="360" w:lineRule="auto" w:after="${opts.after??120}" w:before="${opts.before??0}"/></w:pPr>`;return `<w:p>${pp}${run(text,opts)}</w:p>`;}
function tc(content:string,width:number,shade?:string,white=false):string{return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:fill="${shade||'FFFFFF'}"/><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar></w:tcPr>${content.replace(/<w:rPr>/g,white?'<w:rPr><w:color w:val="FFFFFF"/>':'<w:rPr>')}</w:tc>`;}
function table(headers:string[],rows:string[][],widths:number[]):string{const borders='<w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7C0CE"/><w:left w:val="single" w:sz="4" w:color="B7C0CE"/><w:bottom w:val="single" w:sz="4" w:color="B7C0CE"/><w:right w:val="single" w:sz="4" w:color="B7C0CE"/><w:insideH w:val="single" w:sz="4" w:color="D8DEE8"/><w:insideV w:val="single" w:sz="4" w:color="D8DEE8"/></w:tblBorders>';const row=(cells:string[],head=false)=>`<w:tr>${head?'<w:trPr><w:tblHeader/></w:trPr>':''}${cells.map((c,i)=>tc(p(c,undefined,{bold:head,size:9.5,font:'sans',align:'left',after:0}),widths[i],head?NAVY:'FFFFFF',head)).join('')}</w:tr>`;return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/>${borders}</w:tblPr><w:tblGrid>${widths.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${row(headers,true)}${rows.map(r=>row(r,false)).join('')}</w:tbl>`;}

export function createDocxBuffer(analysis:any):Buffer{
  const body:string[]=[];
  body.push(p(titleOf(analysis),'Title',{align:'left'}));
  body.push(p('Industrial Executive & Audit Report','Subtitle',{align:'left'}));
  body.push(table(['METADATA','STATUS'],[
    ['Metode Analisis',methodLabel(analysis)],['Status Pembacaan',readingStatus(analysis)],['Verifikasi Profesional',verificationStatus(analysis)],['Skor Risiko',`${Math.round(Number(analysis.overall_risk_score||0))}/100`]
  ],[2600,6500]));
  body.push(p('Daftar Isi','TOCHeading',{align:'left'}));
  body.push('<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Perbarui field untuk menampilkan daftar isi.</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>');
  const h1=(roman:string,title:string)=>body.push(p(`${roman}. ${title.toUpperCase()}`,'Heading1',{align:'left'})); const h2=(t:string)=>body.push(p(t,'Heading2',{align:'left'})); const item=(t:unknown)=>body.push(p(`• ${clean(t)}`,undefined,{align:'both'}));
  h1('I','Konteks Perkara'); if(analysis.summary)body.push(p(analysis.summary)); if(Array.isArray(analysis.facts)&&analysis.facts.length){h2('Fakta Material');analysis.facts.forEach(item);}
  h1('II','Isu Hukum dan Analisis');(analysis.legal_issues||[]).forEach((x:any,i:number)=>{h2(`${i+1}. ${clean(x.issue)}`);if(x.rule)body.push(p(`Dasar / Rule: ${clean(x.rule)}`));if(x.analysis)body.push(p(x.analysis));if(x.conclusion)body.push(p(`Kesimpulan: ${clean(x.conclusion)}`,undefined,{bold:true}));});
  h1('III','Dasar Hukum yang Relevan');if(Array.isArray(analysis.applicable_law)&&analysis.applicable_law.length)body.push(table(['PERATURAN','PASAL','RELEVANSI'],analysis.applicable_law.map((x:any)=>[clean(x.regulation||x.source||x.domain),clean(x.article||'-'),clean(x.relevance||x.status||'-')]),[2600,1300,5200]));
  h1('IV','Matriks Risiko Audit');if(Array.isArray(analysis.risk_matrix)&&analysis.risk_matrix.length)body.push(table(['LEVEL / ASPEK','TEMUAN','MITIGASI'],analysis.risk_matrix.map((x:any)=>[`${clean(x.level)} - ${clean(x.clause)}`,clean(x.finding),clean(x.mitigation)]),[2200,3400,3500]));
  h1('V','Posisi Argumentasi');h2('Argumen yang Menguatkan');(analysis.arguments_for||[]).forEach(item);h2('Argumen Lawan / Kelemahan');(analysis.arguments_against||[]).forEach(item);
  h1('VI','Skenario Litigasi');h2('Skenario Terbaik');if(analysis.best_case)body.push(p(analysis.best_case));h2('Skenario Terburuk');if(analysis.worst_case)body.push(p(analysis.worst_case));
  h1('VII','Rencana Tindakan');if(Array.isArray(analysis.recommendations)&&analysis.recommendations.length)body.push(table(['NO.','WAKTU / PRIORITAS','TINDAKAN','STATUS'],analysis.recommendations.map((x:unknown,i:number)=>[String(i+1),`Belum ditetapkan / P${Math.min(3,Math.floor(i/2)+1)}`,clean(x),'TINDAK LANJUT']),[500,1900,5000,1700]));
  h1('VIII','Verifikasi Profesional');body.push(p(analysis.verification_note||'Menunggu verifikasi profesional oleh advokat.',undefined,{bold:true,color:RED}));

  const documentXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1350" w:right="1134" w:bottom="1134" w:left="1134" w:header="500" w:footer="500"/></w:sectPr></w:body></w:document>`;
  const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="both"/><w:spacing w:line="360" w:lineRule="auto" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="left"/><w:spacing w:before="180" w:after="70"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="38"/><w:szCs w:val="38"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="left"/><w:spacing w:after="220"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="666666"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="260" w:after="100"/><w:outlineLvl w:val="0"/><w:pbdr><w:bottom w:val="single" w:sz="10" w:space="4" w:color="${GOLD}"/></w:pbdr></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${DARK}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="70"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style></w:styles>`;
  const headerXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:tbl><w:tblPr><w:tblW w:w="9100" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="700"/><w:gridCol w:w="4200"/><w:gridCol w:w="4200"/></w:tblGrid><w:tr>${tc(p('LC',undefined,{bold:true,size:11,font:'sans',align:'center',after:0}),700,GOLD)}${tc(p('LEXICORE',undefined,{bold:true,size:10,font:'sans',align:'left',after:0}),4200,NAVY,true)}${tc(p(clean(analysis?.user_name||'Pengguna LexiCore'),undefined,{size:9,font:'sans',align:'left',after:0}),4200,NAVY,true)}</w:tr></w:tbl></w:hdr>`;
  const footerXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:tbl><w:tblPr><w:tblW w:w="9100" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="${MID}"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="7600"/><w:gridCol w:w="1500"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="7600" w:type="dxa"/></w:tcPr>${p('Kertas Kerja Rahasia | Menunggu Verifikasi Profesional',undefined,{size:8,font:'sans',align:'left',after:0,color:'666666'})}</w:tc><w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr>${run('Halaman #',{size:8,font:'sans',color:'666666'})}<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:instrText> PAGE </w:instrText></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:tc></w:tr></w:tbl></w:ftr>`
  const settingsXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/></w:settings>`;
  const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`;
  const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`;
  return zipStore([{name:'[Content_Types].xml',data:Buffer.from(contentTypes)},{name:'_rels/.rels',data:Buffer.from(rels)},{name:'word/document.xml',data:Buffer.from(documentXml)},{name:'word/_rels/document.xml.rels',data:Buffer.from(docRels)},{name:'word/styles.xml',data:Buffer.from(stylesXml)},{name:'word/settings.xml',data:Buffer.from(settingsXml)},{name:'word/header1.xml',data:Buffer.from(headerXml)},{name:'word/footer1.xml',data:Buffer.from(footerXml)}]);
}

export interface WorkingDocumentBlock {
  type: 'heading' | 'paragraph' | 'list' | 'table';
  level?: number;
  text?: string;
  items?: string[];
  rows?: string[][];
}

/** Generic DOCX exporter used by Draft Builder and non-Case workspaces. */
export function createWorkingDocumentDocxBuffer(input: { title: string; subtitle?: string; blocks: WorkingDocumentBlock[]; user_name?: string }): Buffer {
  const body: string[] = [];
  body.push(p(input.title || 'LexiCore Working Document', 'Title', { align: 'left' }));
  if (input.subtitle) body.push(p(input.subtitle, 'Subtitle', { align: 'left' }));
  for (const block of input.blocks || []) {
    if (!block) continue;
    if (block.type === 'heading') body.push(p(block.text || '', (block.level || 2) <= 1 ? 'Heading1' : 'Heading2', { align: 'left' }));
    else if (block.type === 'list') (block.items || []).forEach(x => body.push(p(`• ${clean(x)}`, undefined, { align: 'both' })));
    else if (block.type === 'table' && Array.isArray(block.rows) && block.rows.length) {
      const rows = block.rows.map(r => r.map(clean)); const headers = rows.shift() || [];
      if (headers.length) { const widths = headers.map(() => Math.floor(9100 / headers.length)); body.push(table(headers, rows, widths)); }
    } else if (block.text) {
      const paragraphs = clean(block.text).split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
      paragraphs.forEach(x => body.push(p(x, undefined, { align: 'both' })));
    }
  }
  body.push(p('Dokumen kerja LexiCore. Verifikasi profesional wajib dilakukan sebelum digunakan untuk kepentingan hukum.', undefined, { bold: true, color: RED, size: 9, font: 'sans' }));

  const documentXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1350" w:right="1134" w:bottom="1134" w:left="1134" w:header="500" w:footer="500"/></w:sectPr></w:body></w:document>`;
  const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="both"/><w:spacing w:line="360" w:lineRule="auto" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="38"/><w:szCs w:val="38"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="666666"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/><w:pbdr><w:bottom w:val="single" w:sz="10" w:space="4" w:color="${GOLD}"/></w:pbdr></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style></w:styles>`;
  const headerXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="left"/></w:pPr>${run('LEXICORE',{bold:true,size:10,font:'sans',color:NAVY})}${run(`  |  ${clean(input.user_name||'Pengguna LexiCore')}`,{size:9,font:'sans',color:'666666'})}</w:p></w:hdr>`;
  const footerXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/><w:pbdr><w:top w:val="single" w:sz="4" w:color="${MID}"/></w:pbdr></w:pPr>${run('Kertas Kerja Rahasia | Verifikasi Profesional Diperlukan | Halaman ',{size:8,font:'sans',color:'666666'})}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`;
  const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`;
  return zipStore([{name:'[Content_Types].xml',data:Buffer.from(contentTypes)},{name:'_rels/.rels',data:Buffer.from(rels)},{name:'word/document.xml',data:Buffer.from(documentXml)},{name:'word/_rels/document.xml.rels',data:Buffer.from(docRels)},{name:'word/styles.xml',data:Buffer.from(stylesXml)},{name:'word/header1.xml',data:Buffer.from(headerXml)},{name:'word/footer1.xml',data:Buffer.from(footerXml)}]);
}
