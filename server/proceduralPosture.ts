export const CIVIL_DOCKET_RE = /\b(?:perkara\s+)?nomor\s+\d+\s*\/\s*pdt\.?\s*(?:g|p|bth|plw)\b/i;

export type ProceduralStage =
  | 'PRE_LITIGATION'
  | 'INVESTIGATION'
  | 'PROSECUTION'
  | 'EVIDENCE_HEARING'
  | 'PLEADING'
  | 'APPEAL'
  | 'EXECUTION'
  | 'CONSULTATION';

export type ProceduralEvidenceTier = 'T1_DOCUMENT_IDENTITY'|'T2_CURRENT_ACTION'|'T3_STRUCTURE'|'T4_WEAK_CONTEXT'|'T5_FALLBACK';

export interface ProceduralPostureResolution {
  stage: ProceduralStage;
  tier: ProceduralEvidenceTier;
  confidence: 'HIGH'|'MEDIUM'|'LOW';
  evidence: string;
}

type Marker = { stage: ProceduralStage; label: string; re: RegExp };

type Candidate = {
  stage: ProceduralStage;
  label: string;
  index: number;
  specificity: number;
};

const DOCUMENT_MARKERS: Marker[] = [
  { stage:'EXECUTION', label:'permohonan eksekusi', re:/\bpermohonan\s+(?:sita\s+)?eksekusi\b/i },
  { stage:'EXECUTION', label:'permohonan lelang', re:/\bpermohonan\s+lelang\b/i },
  { stage:'EXECUTION', label:'relas eksekusi', re:/\brelas\s+eksekusi\b/i },
  { stage:'EXECUTION', label:'berita acara eksekusi', re:/\bberita\s+acara\s+eksekusi\b/i },
  { stage:'EXECUTION', label:'sita eksekusi', re:/\bsita\s+eksekusi\b/i },
  { stage:'EXECUTION', label:'aanmaning', re:/\baanmaning\b/i },

  { stage:'APPEAL', label:'kontra memori banding', re:/\bkontra\s+memori\s+banding\b/i },
  { stage:'APPEAL', label:'memori banding', re:/\bmemori\s+banding\b/i },
  { stage:'APPEAL', label:'kontra memori kasasi', re:/\bkontra\s+memori\s+kasasi\b/i },
  { stage:'APPEAL', label:'memori kasasi', re:/\bmemori\s+kasasi\b/i },
  { stage:'APPEAL', label:'permohonan banding', re:/\bpermohonan\s+banding\b/i },
  { stage:'APPEAL', label:'permohonan kasasi', re:/\bpermohonan\s+kasasi\b/i },
  { stage:'APPEAL', label:'permohonan peninjauan kembali', re:/\bpermohonan\s+peninjauan\s+kembali\b/i },
  { stage:'APPEAL', label:'permohonan pk', re:/\bpermohonan\s+pk\b/i },
  { stage:'APPEAL', label:'verzet', re:/\bverzet\b/i },

  { stage:'PROSECUTION', label:'surat dakwaan', re:/\bsurat\s+dakwaan\b/i },
  { stage:'PROSECUTION', label:'requisitoir', re:/\brequisitoir\b/i },
  { stage:'PROSECUTION', label:'tuntutan pidana', re:/\btuntutan\s+pidana\b/i },
  { stage:'PROSECUTION', label:'surat tuntutan', re:/\bsurat\s+tuntutan\b/i },

  { stage:'INVESTIGATION', label:'berita acara pemeriksaan', re:/\bberita\s+acara\s+pemeriksaan\b/i },
  { stage:'INVESTIGATION', label:'surat perintah penyidikan', re:/\bsurat\s+perintah\s+penyidikan\b/i },
  { stage:'INVESTIGATION', label:'permohonan praperadilan', re:/\bpermohonan\s+praperadilan\b/i },

  { stage:'EVIDENCE_HEARING', label:'agenda pemeriksaan saksi', re:/\bagenda\s+(?:sidang\s+)?pemeriksaan\s+saksi\b/i },
  { stage:'EVIDENCE_HEARING', label:'daftar pertanyaan saksi', re:/\bdaftar\s+pertanyaan\s+saksi\b/i },

  { stage:'PRE_LITIGATION', label:'surat somasi', re:/\bsurat\s+somasi\b/i },
  { stage:'PRE_LITIGATION', label:'somasi', re:/^\s*somasi(?:\s+(?:pertama|kedua|ketiga|terakhir|wanprestasi))?\b/i },
  { stage:'PRE_LITIGATION', label:'surat teguran', re:/\bsurat\s+teguran\b/i },
  { stage:'PRE_LITIGATION', label:'surat keberatan', re:/\bsurat\s+keberatan\b/i },
  { stage:'PRE_LITIGATION', label:'legal notice', re:/\blegal\s+notice\b/i },
  { stage:'PRE_LITIGATION', label:'undangan mediasi', re:/\bundangan\s+mediasi\b/i },

  { stage:'PLEADING', label:'surat gugatan', re:/\bsurat\s+gugatan\b/i },
  { stage:'PLEADING', label:'gugatan', re:/^\s*gugatan\b/i },
  { stage:'PLEADING', label:'repliek', re:/\brepliek\b/i },
  { stage:'PLEADING', label:'replik', re:/\breplik\b/i },
  { stage:'PLEADING', label:'duplik', re:/\bduplik\b/i },
  { stage:'PLEADING', label:'jawaban tergugat', re:/\bjawaban\s+(?:para\s+)?tergugat\b/i },
  { stage:'PLEADING', label:'jawaban penggugat', re:/\bjawaban\s+(?:para\s+)?penggugat\b/i },
  { stage:'PLEADING', label:'eksepsi', re:/\beksepsi\b/i },
  { stage:'PLEADING', label:'pledoi', re:/\bpledoi\b/i },
  { stage:'PLEADING', label:'nota pembelaan', re:/\bnota\s+pembelaan\b/i },
  { stage:'PLEADING', label:'perlawanan', re:/\bperlawanan\b/i },
  { stage:'PLEADING', label:'kesimpulan pihak', re:/\bkesimpulan\s+(?:para\s+)?pihak\b/i },
];

const CURRENT_ACTION_MARKERS: Marker[] = [
  { stage:'EXECUTION', label:'memohon eksekusi', re:/\b(?:mengajukan\s+permohonan\s+eksekusi|memohon(?:kan)?\s+eksekusi|memohon\s+lelang|memohon\s+sita\s+eksekusi|melaksanakan\s+eksekusi)\b/i },
  { stage:'APPEAL', label:'mengajukan upaya hukum', re:/\b(?:mengajukan\s+(?:permohonan\s+)?banding|mengajukan\s+(?:permohonan\s+)?kasasi|mengajukan\s+(?:permohonan\s+)?peninjauan\s+kembali|mengajukan\s+(?:permohonan\s+)?pk|mengajukan\s+verzet)\b/i },
  { stage:'PROSECUTION', label:'membacakan dakwaan/tuntutan', re:/\b(?:membacakan\s+(?:surat\s+)?dakwaan|membacakan\s+tuntutan|penuntut\s+umum\s+menuntut)\b/i },
  { stage:'EVIDENCE_HEARING', label:'melakukan pemeriksaan saksi', re:/\b(?:memeriksa\s+saksi|pemeriksaan\s+saksi\s+digelar|memasuki\s+tahap\s+pembuktian)\b/i },
  { stage:'INVESTIGATION', label:'melakukan tindakan penyidikan', re:/\b(?:melakukan\s+penyidikan|melakukan\s+penahanan|melakukan\s+penangkapan|melakukan\s+penyitaan|memeriksa\s+tersangka|mengajukan\s+praperadilan)\b/i },
  { stage:'PRE_LITIGATION', label:'melakukan tindakan pra-litigasi', re:/\b(?:mengirim(?:kan)?\s+somasi|menyampaikan\s+somasi|melakukan\s+mediasi|melakukan\s+negosiasi|akan\s+melakukan\s+upaya\s+hukum|bermaksud\s+mengajukan\s+gugatan|akan\s+mengajukan\s+gugatan)\b/i },
  { stage:'PLEADING', label:'mengajukan pleading', re:/\b(?:mengajukan\s+gugatan|mengajukan\s+eksepsi|mengajukan\s+perlawanan|mengajukan\s+jawaban|menyampaikan\s+replik|menyampaikan\s+repliek|menyampaikan\s+duplik|membacakan\s+eksepsi|membacakan\s+pledoi|menanggapi\s+eksepsi|menanggapi\s+perlawanan)\b/i },
];

function clean(v:unknown):string { return String(v ?? '').replace(/\r/g,'').trim(); }

function markerCandidates(text:string, markers:Marker[]):Candidate[] {
  const out:Candidate[]=[];
  for(const marker of markers){
    const flags=marker.re.flags.includes('g')?marker.re.flags:marker.re.flags+'g';
    const re=new RegExp(marker.re.source,flags);
    for(const m of text.matchAll(re)){
      out.push({stage:marker.stage,label:marker.label,index:m.index||0,specificity:(m[0]||'').length});
    }
  }
  return out;
}

function pickEarliest(candidates:Candidate[]):Candidate|undefined {
  return [...candidates].sort((a,b)=>a.index-b.index || b.specificity-a.specificity || a.label.localeCompare(b.label))[0];
}

function probableHeadingLines(text:string):Array<{line:string;index:number}> {
  const opening=clean(text).slice(0,6500);
  const lines=opening.split(/\n+/).map((line,idx)=>({line:line.trim(),idx})).filter(x=>x.line);
  let cursor=0;
  const out:Array<{line:string;index:number}>=[];
  for(const {line,idx} of lines.slice(0,70)){
    const found=opening.indexOf(line,cursor);
    const index=found>=0?found:idx*100;
    cursor=Math.max(cursor,index+line.length);
    const compact=line.replace(/\s+/g,' ').trim();
    const allCaps=/^[A-Z0-9 .,:;()\/-]{5,220}$/.test(compact);
    const shortIdentityLine=compact.length<=120 && !/[.!?].{8,}$/u.test(compact) && !/\b(?:telah|pernah|sebelumnya|bahwa|menyatakan|mendalilkan|mengirimkan|dikirimkan)\b/i.test(compact);
    const looksHeading=allCaps || shortIdentityLine;
    if(looksHeading) out.push({line:compact,index});
  }
  // OCR can collapse the opening into a single long line. Preserve only the
  // very beginning as a possible identity zone; do not treat the whole first
  // page as a title.
  if(out.length===0 && opening){ out.push({line:opening.slice(0,500),index:0}); }
  return out;
}

function resolveDocumentIdentity(title:string,text:string):Candidate|undefined {
  const titleText=clean(title);
  const titleCandidates=markerCandidates(titleText,DOCUMENT_MARKERS).map(c=>({...c,index:c.index-100000}));
  if(titleCandidates.length) return pickEarliest(titleCandidates);

  const lineCandidates:Candidate[]=[];
  for(const item of probableHeadingLines(text)){
    for(const c of markerCandidates(item.line,DOCUMENT_MARKERS)){
      // Heading identity must appear near the beginning of a heading-like line.
      // This prevents a long explanatory sentence from becoming a document title.
      if(c.index<=80) lineCandidates.push({...c,index:item.index+c.index});
    }
  }
  if(lineCandidates.length) return pickEarliest(lineCandidates);

  const opening=clean(text).slice(0,650);
  return pickEarliest(markerCandidates(opening,DOCUMENT_MARKERS).filter(c=>c.index<=180));
}

function isHistoricalOrQuoted(text:string,index:number):boolean {
  const before=text.slice(Math.max(0,index-90),index).toLowerCase();
  return /\b(?:telah|pernah|sebelumnya|sebelum itu|dahulu|riwayat|pada tanggal|menurut|mendalilkan|menyatakan bahwa|dijelaskan bahwa|disebutkan bahwa)\b/.test(before);
}

function resolveCurrentAction(text:string):Candidate|undefined {
  const candidates=markerCandidates(text,CURRENT_ACTION_MARKERS).filter(c=>!isHistoricalOrQuoted(text,c.index));
  return pickEarliest(candidates);
}

function resolveStructural(sourceRole:string,text:string):ProceduralPostureResolution|undefined {
  const role=clean(sourceRole).toUpperCase();
  const t=text.toLowerCase();
  if(role==='INVESTIGATION_OR_BAP') return {stage:'INVESTIGATION',tier:'T3_STRUCTURE',confidence:'HIGH',evidence:'sourceRole=INVESTIGATION_OR_BAP'};
  if(role==='LITIGATION_SUBMISSION'||role==='PLEADING_OR_SUBMISSION'||role==='DEFENSE_SUBMISSION_WITH_EXHIBITS') return {stage:'PLEADING',tier:'T3_STRUCTURE',confidence:'HIGH',evidence:`sourceRole=${role}`};

  if(/\bagenda\s+(?:sidang\s+)?(?:pemeriksaan\s+saksi|pembuktian)\b|\btahap\s+pembuktian\b/.test(t))
    return {stage:'EVIDENCE_HEARING',tier:'T3_STRUCTURE',confidence:'MEDIUM',evidence:'struktur agenda pembuktian'};
  if(/\bagenda\s+(?:sidang\s+)?pembacaan\s+(?:surat\s+)?dakwaan\b|\bagenda\s+(?:sidang\s+)?pembacaan\s+tuntutan\b/.test(t))
    return {stage:'PROSECUTION',tier:'T3_STRUCTURE',confidence:'MEDIUM',evidence:'struktur agenda penuntutan'};

  const civilDocket=CIVIL_DOCKET_RE.test(text);
  const pleadingStructure=/\b(?:penggugat|tergugat|rekonvensi|konvensi|petitum)\b/i.test(text);
  if(civilDocket&&pleadingStructure) return {stage:'PLEADING',tier:'T3_STRUCTURE',confidence:'MEDIUM',evidence:'nomor perkara perdata + struktur pleading'};
  return undefined;
}

function resolveWeakContext(sourceRole:string,text:string):ProceduralPostureResolution|undefined {
  const role=clean(sourceRole).toUpperCase();
  if(role==='LITIGATION_SUBMISSION'||role==='PLEADING_OR_SUBMISSION'||role==='DEFENSE_SUBMISSION_WITH_EXHIBITS'||role==='INVESTIGATION_OR_BAP') return undefined;
  const t=text.toLowerCase();

  const execution=[/\baanmaning\b/,/\bsita\s+eksekusi\b/,/\bpelelangan\b/,/\bdasar\s+eksekutorial\b/].filter(re=>re.test(t)).length;
  if(execution>=2) return {stage:'EXECUTION',tier:'T4_WEAK_CONTEXT',confidence:'LOW',evidence:'multiple execution-context markers'};

  const appeal=[/\bbanding\b/,/\bpengadilan\s+tinggi\b/,/\btenggang\s+banding\b/].filter(re=>re.test(t)).length;
  if(appeal>=2) return {stage:'APPEAL',tier:'T4_WEAK_CONTEXT',confidence:'LOW',evidence:'multiple appeal-context markers'};

  const investigation=[/\bpenyidik\b/,/\bpenyidikan\b/,/\bpenahanan\b/,/\bpenyitaan\b/,/\btersangka\b/].filter(re=>re.test(t)).length;
  if(investigation>=3) return {stage:'INVESTIGATION',tier:'T4_WEAK_CONTEXT',confidence:'LOW',evidence:'multiple investigation-context markers'};

  return undefined;
}

export function resolveProceduralPosture(input:{title?:string;text?:string;sourceRole?:string}):ProceduralPostureResolution {
  const title=clean(input.title);
  const text=clean(input.text);
  const sourceRole=clean(input.sourceRole);

  const identity=resolveDocumentIdentity(title,text);
  if(identity && !isHistoricalOrQuoted(text, Math.max(0, identity.index))) return {stage:identity.stage,tier:'T1_DOCUMENT_IDENTITY',confidence:'HIGH',evidence:`document identity: ${identity.label}`};

  const action=resolveCurrentAction(text);
  if(action) return {stage:action.stage,tier:'T2_CURRENT_ACTION',confidence:'HIGH',evidence:`current procedural action: ${action.label}`};

  const structural=resolveStructural(sourceRole,text);
  if(structural) return structural;

  const weak=resolveWeakContext(sourceRole,text);
  if(weak) return weak;

  return {stage:'CONSULTATION',tier:'T5_FALLBACK',confidence:'LOW',evidence:'no reliable current-posture evidence'};
}

export function proceduralQueryTermsForStage(stage:ProceduralStage):string[] {
  switch(stage){
    case 'EXECUTION': return ['hukum acara','eksekusi','aanmaning','sita eksekusi'];
    case 'APPEAL': return ['hukum acara','upaya hukum','banding','kasasi','peninjauan kembali','tenggang upaya hukum'];
    case 'INVESTIGATION': return ['hukum acara pidana','penyidikan','upaya paksa','praperadilan'];
    case 'PROSECUTION': return ['hukum acara pidana','penuntutan','surat dakwaan'];
    case 'EVIDENCE_HEARING': return ['hukum acara','pembuktian','pemeriksaan saksi','alat bukti'];
    case 'PRE_LITIGATION': return ['somasi','mediasi','negosiasi'];
    case 'PLEADING': return ['hukum acara','syarat formil','kompetensi pengadilan','kewenangan mengadili'];
    default: return ['hukum acara','kompetensi pengadilan'];
  }
}
