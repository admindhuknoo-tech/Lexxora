import { deriveOntologyIssues } from './legalOntology';

export type EvidenceClass = 'TEXTUAL_FACT'|'PARTY_CLAIM'|'ANOMALY'|'ADVERSE_EVIDENCE'|'SUPPORTING_EVIDENCE'|'MISSING_FACT';
export type TimelineEventType = 'IDENTITY_DATE'|'DOCUMENT_DATE'|'PROCEDURAL_EVENT'|'CLAIMED_EVENT';

export interface EvidenceStatement {
  id: string;
  page: number;
  class: EvidenceClass;
  statement: string;
  quote: string;
  speaker?: string;
  confidence: number;
}

export interface EvidenceActor {
  actor: string;
  roles: string[];
  pages: number[];
  evidence_quotes: string[];
  entity_type?: 'PERSON'|'ROLE'|'ORGANIZATION';
  canonical_key?: string;
  aliases?: string[];
}

export interface EvidenceTimelineItem {
  date: string;
  event: string;
  page: number;
  quote: string;
  type?: TimelineEventType;
}

export interface EvidenceIssueSeed {
  issue: string;
  basis: string;
  pages: number[];
  domain?: string;
  id?: string;
  query_terms?: string[];
}

export interface EvidenceModel {
  source_role: string;
  source_role_confidence: number;
  source_role_signals: string[];
  statements: EvidenceStatement[];
  textual_facts: EvidenceStatement[];
  party_claims: EvidenceStatement[];
  anomalies: EvidenceStatement[];
  adverse_evidence: EvidenceStatement[];
  supporting_evidence: EvidenceStatement[];
  missing_facts: EvidenceStatement[];
  actors: EvidenceActor[];
  timeline: EvidenceTimelineItem[];
  timeline_metadata?: EvidenceTimelineItem[];
  document_exhibits: Array<{id:string;page:number;quote:string}>;
  issue_seeds: EvidenceIssueSeed[];
}

const clean=(v:unknown)=>String(v??'').replace(/\s+/g,' ').trim();
const uniq=<T>(xs:T[])=>[...new Set(xs)];

function pages(text:string){
  const re=/---\s*HALAMAN\s+(\d+)\s*---/gi;
  const ms=[...String(text||'').matchAll(re)];
  if(!ms.length)return[{page:1,text:clean(text)}];
  return ms.map((m,i)=>({page:Number(m[1])||i+1,text:clean(String(text).slice((m.index||0)+m[0].length,i+1<ms.length?(ms[i+1].index||text.length):text.length))}));
}

function sentences(s:string){
  return String(s||'').split(/(?<=[.!?;:])\s+|\n+/).map(clean).filter(x=>x.length>=18&&x.length<=1800);
}

/**
 * Extract the sentence containing the given index. Used by extractActors so
 * that an actor's evidence_quote is the sentence that actually mentions the
 * actor, not a fixed-width character window that may bleed into adjacent
 * sentences about other parties.
 */
function sentenceAround(text:string, index:number):string{
  const s=String(text||'');
  if(!s) return '';
  const i=Math.max(0, Math.min(s.length-1, index));

  // Find last sentence boundary before i.
  let start=0;
  for(let k=i-1;k>=0;k--){
    const ch=s[k];
    if(ch==='\n'){ start=k+1; break; }
    if((ch==='.'||ch==='!'||ch==='?') && (k+1>=s.length || s[k+1]===' ' || s[k+1]==='\n')){
      start=k+1; break;
    }
  }
  while(start<s.length && /\s/.test(s[start])) start++;

  // Find next sentence boundary after i.
  let end=s.length;
  for(let k=i;k<s.length;k++){
    const ch=s[k];
    if(ch==='\n'){ end=k; break; }
    if((ch==='.'||ch==='!'||ch==='?') && (k+1>=s.length || s[k+1]===' ' || s[k+1]==='\n')){
      end=k+1; break;
    }
  }
  return clean(s.slice(start,end));
}

/**
 * Source role is functional for lawyer analysis. A judgment/decision is reference material,
 * never a separate judicial-analysis mode.
 */
function roleScore(text:string){
  const original=String(text||'').slice(0,20000);
  const h=original.toLowerCase();
  const pleadingSignals:Array<[RegExp,string]>=[
    [/\brepliek\b|\breplik\b/i,'repliek'],
    [/\bduplik\b/i,'duplik'],
    [/\bjawaban\s+(?:atas\s+eksepsi|tergugat|penggugat|para\s+tergugat)\b/i,'jawaban'],
    [/\bkesimpulan\s+(?:para\s+)?pihak\b/i,'kesimpulan pihak'],
    [/kepada\s+y(?:a|th)\.?\s+(?:yang\s+terhormat\s+)?majelis\s+hakim/i,'dialamatkan ke Majelis Hakim'],
    [/\bperkara\s+nomor\s+\d+\s*\/\s*pdt\./i,'perkara perdata'],
    [/\bnomor\s+\d+\s*\/\s*pdt\.(?:g|p|bth|plw)\./i,'nomor perkara perdata'],
    [/\b(?:para\s+)?penggugat\b[\s\S]{0,300}\b(?:para\s+)?tergugat\b/i,'penggugat + tergugat'],
    [/\brekonvensi\b|\bkonvensi\b/i,'konvensi/rekonvensi'],
    [/\bpetitum\b/i,'petitum'],
    [/surat\s+kuasa\s+khusus/i,'surat kuasa khusus'],
  ];
  const pleadingHits=pleadingSignals.filter(([re])=>re.test(original)).map(([,label])=>label);
  const hasStrongPleading=pleadingHits.some(x=>/repliek|duplik|jawaban|kesimpulan/.test(x));
  if(pleadingHits.length>=2||hasStrongPleading){
    return {role:'LITIGATION_SUBMISSION',confidence:Math.min(.98,.86+Math.min(.12,pleadingHits.length*.02)),signals:pleadingHits};
  }

  const hasFullBap=/berita\s+acara\s+pemeriksaan/i.test(original);
  const hasBapWord=/\bbap\b/i.test(original);
  const hasExaminerActor=/penyidik\s+(?:memeriksa|menanyakan)|tersangka\s+diperiksa|saksi\s+diperiksa|yang\s+diperiksa\s*[:,]|diperiksa\s+oleh\s+penyidik/i.test(original);
  const hasInvestigativeContext=/kepolisian|reserse|reskrim|penyidik|surat\s+perintah\s+penyidikan|sprindik|kejaksaan|penuntut\s+umum|penyidikan/i.test(original);
  if((hasFullBap||(hasBapWord&&hasExaminerActor))&&hasInvestigativeContext){
    return {role:'INVESTIGATION_OR_BAP',confidence:hasFullBap?.94:.80,signals:['berita acara pemeriksaan',...(hasExaminerActor?['aktor pemeriksaan']:[]),'konteks penyidikan']};
  }

  const defs:Array<{role:string;rules:Array<[RegExp,number,string]>}>=[
    {role:'DEFENSE_SUBMISSION_WITH_EXHIBITS',rules:[[/jawaban\s+atas\s+laporan|jawaban\s+teradu|petitum\s+teradu/,7,'jawaban/petitum pembelaan'],[/\beksepsi\b/,3,'eksepsi'],[/\bbukti\s+t-\d+/i,4,'bukti pihak pembela'],[/\bteradu\b/,2,'aktor teradu']]},
    {role:'COMPLAINT_OR_PETITION',rules:[[/pokok\s+pengaduan|laporan\s+dugaan\s+pelanggaran|petitum\s+pengadu/,7,'pengaduan/petitum'],[/\bpengadu\b|\bpelapor\b/,2,'aktor pengadu/pelapor']]},
    {role:'CONTRACT_OR_AGREEMENT',rules:[[/^\s*(?:perjanjian|kontrak|memorandum\s+of\s+understanding|nota\s+kesepahaman)\b/im,7,'judul kontrak'],[/para\s+pihak/,3,'para pihak'],[/pasal\s+\d+/,3,'struktur pasal'],[/hak\s+dan\s+kewajiban|jangka\s+waktu/,2,'struktur klausul']]},
    {role:'LEGAL_CORRESPONDENCE',rules:[[/\b(somasi|surat\s+teguran|surat\s+jawaban|surat\s+keberatan|legal\s+notice)\b/,6,'korespondensi hukum'],[/kepada\s+yth|perihal\s*:/,2,'format surat']]},
    {role:'CASE_NARRATIVE_OR_QUESTION',rules:[[/pertanyaan(?:nya)?|mohon\s+(?:petunjuk|pendapat|analisis)|langkah(?:-langkah)?\s+hukum|bagaimana\s+(?:hak|status|langkah|upaya)|sebagai\s+kuasa\s+hukum/,6,'narasi konsultasi/pertanyaan'],[/\?/,2,'pertanyaan eksplisit'],[/duduk\s+perkara|kronologi|sekira\s+tahun|berjalannya\s+waktu|belakangan/,2,'narasi kronologis']]},
    {role:'LEGAL_REFERENCE_MATERIAL',rules:[[/\bputusan\b|\bpenetapan\b|\bmengadili\b|amar\s+putusan|pertimbangan\s+hukum/,5,'bahan putusan/penetapan'],[/yurisprudensi|doktrin|pendapat\s+ahli/,3,'bahan referensi']]},
    {role:'EVIDENCE_BUNDLE',rules:[[/daftar\s+bukti|lampiran\s+bukti|alat\s+bukti/,5,'bundle bukti'],[/\bbukti\s+[pt]-\d+/i,3,'penomoran bukti']]},
  ];
  let best={role:'MIXED_CASE_MATERIAL',score:0,signals:[] as string[]};
  for(const d of defs){
    let score=0; const signals:string[]=[];
    for(const [re,w,label] of d.rules){ if(re.test(h)){score+=w;signals.push(label);} }
    if(score>best.score) best={role:d.role,score,signals};
  }
  const materialActionRe=/\b(?:ditangkap|ditahan|melapor|melaporkan|menyewa|disewa|menggadaikan|digadaikan|menjual|dijual|membeli|dibeli|mengalihkan|dialihkan|menyerahkan|menerima|membayar|dibayar|menguasai|dikuasai|meminjam|dipinjam|menandatangani|sepakat|perjanjian|kontrak)\b/g;
  const materialActions=(h.match(materialActionRe)||[]).length;
  const hasNarrativeActors=/\b(?:pemilik|penyewa|pelapor|terlapor|tersangka|pihak\s+(?:lain|ketiga)|perusahaan|klien)\b/.test(h);
  const hasSubstantiveCorrespondence=/\b(?:somasi|surat\s+teguran|surat\s+jawaban|surat\s+keberatan|legal\s+notice)\b/.test(h);
  if(best.role==='LEGAL_CORRESPONDENCE'&&!hasSubstantiveCorrespondence&&materialActions>=2&&hasNarrativeActors){
    best={role:'CASE_NARRATIVE_OR_QUESTION',score:Math.max(best.score,6),signals:['narasi tindakan material','aktor perkara','format surat hanya sinyal lemah']};
  }else if(best.score===0&&materialActions>=2&&hasNarrativeActors){
    best={role:'CASE_NARRATIVE_OR_QUESTION',score:6,signals:['narasi tindakan material','aktor perkara']};
  }
  const confidence=best.score===0?0.45:Math.min(.98,.48+best.score*.045);
  return {role:best.role,confidence,signals:best.signals};
}

export function classifySourceRole(text:string){ return roleScore(text); }

function detectSpeaker(s:string){
  const m=s.match(/\b(Pengadu|Teradu|Penggugat|Tergugat|Pemohon|Termohon|Pelapor|Terlapor|Saksi|Penyidik|Penuntut Umum|Jaksa|Klien|Penjual|Pembeli|Debitur|Kreditur|Pekerja|Pengusaha|Penggugat Rekonvensi|Tergugat Rekonvensi)\b/i);
  return m?m[1]:undefined;
}

function classifySentence(s:string, sourceRole:string):{cls:EvidenceClass;confidence:number;speaker?:string}{
  const n=s.toLowerCase();
  const speaker=detectSpeaker(s);
  const question=/\?|bagaimana\s+(?:hak|status|langkah|upaya)|apakah\s+/.test(n);
  const claimVerb=/\b(menyatakan|mendalilkan|berpendapat|menganggap|membantah|menolak|mengakui|menurut|menuduh|mengklaim|memohon|beralasan|menghendaki|menginginkan|menduga|mengeluh|merasa)\b/.test(n);
  const legalConclusion=/\b(cacat\s+hukum|tidak\s+sah|batal\s+demi\s+hukum|melawan\s+hukum|terbukti|bersalah|wajib\s+dihukum|berhak\s+mutlak|jelas\s+melanggar)\b/.test(n);
  const contradiction=/\b(bertentangan|tidak\s+konsisten|inkonsisten|salah\s+tulis|seharusnya\s+alat\s+bukti|dua\s+versi|berbeda\s+dengan|tidak\s+sesuai\s+dengan)\b/.test(n);
  const docMetadata=/\b(surat\s+(?:nomor|no\.?|tertanggal)|akta\s+(?:nomor|no\.?)|berita\s+acara|nomor\s*[:.]?\s*[0-9A-Za-z./-]+|ditandatangani\s+pada|diterbitkan\s+pada|bukti\s+[tp]-\d+|sertifikat\s+(?:nomor|no\.?))\b/.test(n);
  const materialAssertion=/\b(adalah|merupakan|milik|dimiliki|dikuasai|menguasai|dibagi|membagi|dibeli|membeli|dijual|menjual|dipalsukan|pemalsuan|cacat\s+hukum|tidak\s+benar|tidak\s+sah|melanggar|menuntut|membayar|menghukum|menolak|mengabulkan|membenarkan|mendalilkan|menyatakan|membantah)\b/.test(n);
  const metadataOnly=docMetadata && !claimVerb && !legalConclusion && !materialAssertion && n.length<=320;
  const adverseDefense=sourceRole==='DEFENSE_SUBMISSION_WITH_EXHIBITS' && /\bpengadu\b.*\b(mendalilkan|menyatakan|menuduh|mengajukan)\b/.test(n);
  const adverseComplaint=sourceRole==='COMPLAINT_OR_PETITION' && /\bteradu\b.*\b(membantah|menolak|menyatakan)\b/.test(n);

  // V6.8.2 — Litigation submissions (repliek/duplik/jawaban/kesimpulan)
  // often quote or summarise the opposing party's proposition.  In V6.8.1
  // these sentences were always collapsed into PARTY_CLAIM, which made the
  // adverse-evidence gate impossible to satisfy for LITIGATION_SUBMISSION.
  // Keep this intentionally attribution-driven: a generic claim by the author
  // is not adverse merely because it contains words such as "menolak".
  const litigationOpponentSubject = /\b(?:para\s+)?(?:tergugat|termohon|terlapor|penggugat\s+rekonvensi|tergugat\s+rekonvensi)\b.{0,140}\b(?:mendalilkan|menyatakan|menuduh|mengajukan|membantah|menolak|mengakui|beralasan|memohon)\b/;
  const litigationAccordingToOpponent = /\bmenurut\s+(?:para\s+)?(?:tergugat|termohon|terlapor|penggugat\s+rekonvensi|tergugat\s+rekonvensi)\b/;
  const litigationAttributedProposition = /\b(?:dalil|dalil-dalil|jawaban|bantahan|eksepsi|tanggapan|keterangan)\s+(?:dari\s+)?(?:para\s+)?(?:tergugat|termohon|terlapor|penggugat\s+rekonvensi|tergugat\s+rekonvensi)\b.{0,100}\bbahwa\b/;
  const adverseLitigation = sourceRole==='LITIGATION_SUBMISSION' && (litigationOpponentSubject.test(n) || litigationAccordingToOpponent.test(n) || litigationAttributedProposition.test(n));

  if(question) return {cls:'MISSING_FACT',confidence:.72,speaker};
  if(adverseDefense||adverseComplaint||adverseLitigation) return {cls:'ADVERSE_EVIDENCE',confidence:adverseLitigation ? .82 : .84,speaker};
  if(contradiction) return {cls:'ANOMALY',confidence:.82,speaker};

  // Consultation narratives are client/author assertions until independently corroborated.
  if(sourceRole==='CASE_NARRATIVE_OR_QUESTION') return {cls:'PARTY_CLAIM',confidence:.78,speaker};

  // Pleadings/submissions remain claim-first. A document identifier/date can be textual
  // metadata only when the sentence does not simultaneously assert ownership, validity,
  // liability, chronology, or another contested proposition.
  if(sourceRole==='DEFENSE_SUBMISSION_WITH_EXHIBITS'||sourceRole==='COMPLAINT_OR_PETITION'||sourceRole==='LITIGATION_SUBMISSION'){
    if(metadataOnly) return {cls:'TEXTUAL_FACT',confidence:.80,speaker};
    return {cls:'PARTY_CLAIM',confidence:(claimVerb||legalConclusion||speaker||materialAssertion)? .88 : .70,speaker};
  }

  // Legal correspondence is still a party-authored source.  Its substantive body is
  // claim-first unless a narrow documentary-metadata proposition is detected.  Source
  // role changes evidentiary weight; it must not silently erase material propositions.
  if(sourceRole==='LEGAL_CORRESPONDENCE'){
    if(metadataOnly) return {cls:'TEXTUAL_FACT',confidence:.80,speaker};
    return {cls:'PARTY_CLAIM',confidence:(claimVerb||legalConclusion||speaker)? .84 : .66,speaker};
  }

  // A prior decision/jurisprudence is reference material, not a fact of the current case.
  if(sourceRole==='LEGAL_REFERENCE_MATERIAL') return {cls:'SUPPORTING_EVIDENCE',confidence:.78,speaker};
  if(sourceRole==='CONTRACT_OR_AGREEMENT'||sourceRole==='INVESTIGATION_OR_BAP'||sourceRole==='EVIDENCE_BUNDLE'){
    if(claimVerb||legalConclusion) return {cls:'PARTY_CLAIM',confidence:.76,speaker};
    return {cls:'TEXTUAL_FACT',confidence:docMetadata?.84:.72,speaker};
  }
  if(claimVerb||legalConclusion) return {cls:'PARTY_CLAIM',confidence:.76,speaker};
  if(docMetadata) return {cls:'TEXTUAL_FACT',confidence:.80,speaker};
  return {cls:'MISSING_FACT',confidence:.45,speaker};
}

function actorIdentityKey(raw:string):string{
  const s=clean(raw)
    .replace(/^(?:drs?|prof|ir|h|hj|mr|mrs)\.?\s+/i,'')
    .replace(/(?:,?\s+(?:s\.?h\.?|m\.?h\.?|m\.?m\.?|s\.?e\.?|s\.?kom\.?|m\.?kn\.?|sp\.?n\.?))+$/i,'')
    .replace(/[^a-z0-9]+/gi,' ')
    .trim()
    .toLowerCase();
  return s;
}

function actorEntityType(name:string,role:string):'PERSON'|'ROLE'|'ORGANIZATION'{
  if(/^(?:PT|CV|UD|Yayasan|Koperasi|Firma|Perumda)\b/i.test(name)||['KPU','DKPP','Bawaslu'].includes(name)) return 'ORGANIZATION';
  if(role===name || /^(?:Pengadu|Teradu|Pelapor|Terlapor|Penggugat|Tergugat|Pemohon|Termohon|Pembanding|Terbanding|Penjual|Pembeli|Debitur|Kreditur|Penyewa|Pemberi Sewa|Kuasa Hukum|Direktur|Komisaris|Pemegang Saham|Pewaris|Ahli Waris|Anak Kandung|Anak Angkat|Janda|Duda|Istri|Suami|Ibu Tiri|Ayah Tiri|Tersangka|Terdakwa|Korban|Penyidik|Penuntut Umum|Jaksa|Terpidana|Klien|Saksi|Notaris|Advokat)$/i.test(name)) return 'ROLE';
  return 'PERSON';
}

function addActor(map:Map<string,EvidenceActor>,actor:string,role:string,page:number,quote:string){
  const name=clean(actor).replace(/[,:;.-]+$/,'').trim();
  if(name.length<2||name.length>100) return;
  const entityType=actorEntityType(name,role);
  const identity=entityType==='PERSON'?actorIdentityKey(name):clean(name).toLowerCase();
  if(!identity) return;
  const key=`${entityType}:${identity}`;
  const cur=map.get(key)||{actor:name,roles:[],pages:[],evidence_quotes:[],entity_type:entityType,canonical_key:key,aliases:[]};
  // Preserve the most informative display form while keeping deterministic alias history.
  if(entityType==='PERSON' && name.length>cur.actor.length) cur.actor=name;
  cur.aliases=uniq([...(cur.aliases||[]),name]);
  cur.roles=uniq([...cur.roles,role]);
  cur.pages=uniq([...cur.pages,page]);
  if(quote&&cur.evidence_quotes.length<4) cur.evidence_quotes.push(clean(quote));
  map.set(key,cur);
}

// ============================================================
// ACTOR NOISE FILTERS — selective Group A corrective
// ------------------------------------------------------------
// Reject multi-token fragments made only from professional rank/title or
// credential/acronym vocabulary. Single-token role identifiers remain
// preserved through roleWords.
// ============================================================
const PROFESSIONAL_RANK_WORDS = new Set([
  'jaksa','hakim','panitera','juru','sita','penyidik','penuntut','umum',
  'madya','utama','muda','pratama','agung','tinggi','rendah','pertama',
  'kepala','wakil','anggota','ajun','pengganti','pembantu',
  'purnawirawan','pensiunan','pensiun','mantan',
  'brigadir','ipda','iptu','akp','kompol','kombes','akbp',
  'letnan','kapten','mayor','kolonel','jenderal','polisi','polri',
  'notaris','advokat','pengacara','kuasa','hukum','klien','saksi',
  'dewan','perwakilan','rakyat','daerah',
  'kejaksaan','pengadilan','negeri','mahkamah',
  'alm','almarhum','almarhumah','ibu','bapak','saudara','saudari',
]);

const PROFESSIONAL_ACRONYM_WORDS = new Set([
  'nip','nik','nia','npwp','nuptk','kta','ktp','sim','paspor',
  'sh','mh','mm','se','mpd','mp','ir','drs','dra','sip','sos',
  'si','kom','ma','msi','phd','dr','prof','s2','s1','s3',
]);

function isProfessionalRankOrAcronymOnly(name:string):boolean{
  const cleaned=String(name||'').toLowerCase().replace(/[.,]/g,'').trim();
  if(!cleaned)return true;
  const tokens=cleaned.split(/\s+/).filter(Boolean);
  if(tokens.length<2)return false;
  return tokens.every(t=>PROFESSIONAL_RANK_WORDS.has(t)||PROFESSIONAL_ACRONYM_WORDS.has(t));
}

const OCR_ARTIFACT_CONTEXT_RE =
  /dipindai\s+dengan\s+camscanner|scanned\s+by\s+camscanner|dipindai\s+oleh\s+camscanner|documentscanner|camscanner\s+mobile|dokumen\s+ini\s+dipindai/i;

function hasOcrArtifactContext(text:string):boolean{
  return OCR_ARTIFACT_CONTEXT_RE.test(String(text||''));
}

function isPlausiblePersonName(raw:string):boolean{
  const s=String(raw||'').trim().replace(/[.,;:]+$/,'');
  if(s.length<3||s.length>50)return false;
  // Lexical integrity guard: legal drafting tokens, honorifics, and citation
  // fragments are not standalone human actors even when capitalized.
  if(/^(?:Undang|Undang-Undang|Pasal|Ayat|Huruf|Nomor|No|Tahun|Surat|Sdri|Sdr|Tuan|Nyonya|Bapak|Ibu|Hj|H)$/i.test(s))return false;
  if(/\b(?:Nomor|No|Pasal|Ayat|Surat|Edaran)\b/i.test(s))return false;
  if(/^(?:Perumda|PT|CV|UD|Yayasan|Koperasi|Firma|BPR|Bank|Kejaksaan|Pengadilan)\b/i.test(s))return false;
  const fragmentWords=/\b(?:kepada|adalah|itu|sudah|dengan|tanpa|maka|yang|dan|atau|dari|sebagai|untuk|pada|dalam|akan|telah|bagi|oleh|bagian|para|setengah|disertipikatkan|dibagi|selesai|membatalkan|produknya|berupa|dimiliki|diperoleh|memberikan|menyatakan|mendalilkan|ahliw|anaknya|tersebut|merupakan|memiliki|menjadi|milik|berhak|memperoleh|dijaminkan|menipu|membuat|menyetujui)\b/i;
  if(fragmentWords.test(s)||!/^[A-Z]/.test(s))return false;
  const words=s.split(/\s+/).filter(Boolean);
  if(!words.length||words.length>4)return false;
  const nameWord=/^[A-Z][A-Za-zÀ-ÿ.'-]*$/;
  if(!words.every(w=>nameWord.test(w)))return false;
  if(words.length===1&&words[0].replace(/\./g,'').length<3)return false;
  return true;
}

function resolveActorAliases(items:EvidenceActor[]):EvidenceActor[]{
  const persons=items.filter(a=>a.entity_type==='PERSON').sort((a,b)=>(b.canonical_key||'').length-(a.canonical_key||'').length);
  const absorbed=new Set<EvidenceActor>();
  for(const short of [...persons].reverse()){
    if(absorbed.has(short)) continue;
    const shortKey=(short.canonical_key||'').replace(/^PERSON:/,'');
    const shortTokens=shortKey.split(/\s+/).filter(Boolean);
    if(shortTokens.length<2) continue;
    const target=persons.find(long=>{
      if(long===short||absorbed.has(long)) return false;
      const longKey=(long.canonical_key||'').replace(/^PERSON:/,'');
      if(longKey===shortKey) return true;
      const overlapPage=long.pages.some(p=>short.pages.includes(p));
      return overlapPage && (longKey.endsWith(` ${shortKey}`)||longKey.startsWith(`${shortKey} `));
    });
    if(!target) continue;
    target.roles=uniq([...target.roles,...short.roles]);
    target.pages=uniq([...target.pages,...short.pages]);
    target.aliases=uniq([...(target.aliases||[]),...(short.aliases||[]),short.actor]);
    target.evidence_quotes=uniq([...target.evidence_quotes,...short.evidence_quotes]).slice(0,4);
    absorbed.add(short);
  }
  return items.filter(a=>!absorbed.has(a));
}

function extractActors(text:string){
  const pgs=pages(text);
  const roleWords=[
    'Pengadu','Teradu','Pelapor','Terlapor','KPU','DKPP','Bawaslu','Penggugat','Tergugat','Pemohon','Termohon','Pembanding','Terbanding','Turut Tergugat','Penggugat Rekonvensi','Tergugat Rekonvensi',
    'Penjual','Pembeli','Debitur','Kreditur','Pihak Pertama','Pihak Kedua','Pihak Ketiga','Penyewa','Pemberi Sewa','Pemberi Hibah','Penerima Hibah','Pemberi Kuasa','Penerima Kuasa','Kuasa Hukum',
    'Pemberi Kerja','Pekerja','Buruh','Pengusaha','Konsumen','Pelaku Usaha','Tertanggung','Penanggung','Direktur','Komisaris','Pemegang Saham','Pewaris','Ahli Waris','Anak Kandung','Anak Angkat','Janda','Duda','Istri','Suami','Ibu Tiri','Ayah Tiri',
    'Tersangka','Terdakwa','Korban','Penyidik','Penuntut Umum','Jaksa','Terpidana','Klien','Saksi','Notaris','Advokat'
  ];
  const map=new Map<string,EvidenceActor>();
  for(const p of pgs) for(const role of roleWords){
    const rolePattern=role.replace(/\s+/g,'\\s+');
    const re=new RegExp(`\\b${rolePattern}\\b`,'i');
    const idx=p.text.search(re); if(idx<0)continue;
    addActor(map,role,role,p.page,sentenceAround(p.text, idx));
  }
  for(const p of pgs){
    const region=p.text.match(/(?:para\s+pihak|pihak-pihak)\s*[:\-]\s*([\s\S]{0,800}?)(?=\b(?:duduk\s+perkara|kronologi|fakta\s+perkara|pertanyaan|posita|pokok\s+perkara)\b|$)/i)?.[1]||'';
    if(region){
      for(const m of region.matchAll(/(?:^|\s)(\d{1,2})\.\s*([^\d]{2,100}?)(?=\s+\d{1,2}\.\s|$)/g)){
        let raw=clean(m[2]).replace(/^[,:;]+|[,:;]+$/g,'');
        const roleHint=raw.match(/\(([^)]{2,50})\)/)?.[1];
        raw=clean(raw.replace(/\([^)]*\)/g,''));
        if(/^(saksi|notaris|kuasa hukum)$/i.test(raw))addActor(map,raw,raw,p.page,m[0]);
        else if(isPlausiblePersonName(raw))addActor(map,raw,roleHint||'NAMED_PARTY',p.page,m[0]);
      }
    }
  }
  for(const p of pgs) for(const m of p.text.matchAll(/\bNama\s*[:\-]\s*([A-Z][A-Za-zÀ-ÿ.'-]*(?:\s+[A-Z][A-Za-zÀ-ÿ.'-]*){0,3})\b/g)){
    const name=clean(m[1]); if(isPlausiblePersonName(name))addActor(map,name,'NAMED_PERSON',p.page,m[0]);
  }
  for(const p of pgs) for(const m of p.text.matchAll(/\b(?:Sdr\.?|Sdri\.?|Tuan|Nyonya|Bapak|Ibu|Hj\.?|H\.?)\s+([A-Z][A-Za-zÀ-ÿ.'-]*(?:\s+[A-Z][A-Za-zÀ-ÿ.'-]*){0,3})\b/g)){
    const name=clean(m[1]); if(isPlausiblePersonName(name))addActor(map,name,'NAMED_PERSON',p.page,m[0]);
  }
  // Explicit ownership/name-list pattern only. This intentionally does not
  // generalize to arbitrary comma-separated capitalized text: it is scoped to
  // legal phrases such as "atas nama 3 orang, Agus, Budi dan Bambang".
  const ownershipListRe=/\batas\s+nama(?:\s+\d+\s+orang)?\s*[,;:]?\s*([^\n.]{3,180})/gi;
  for(const p of pgs) for(const m of p.text.matchAll(ownershipListRe)){
    let region=clean(m[1]);
    // Stop before location/explanatory prose so it cannot become a person name.
    region=region.split(/\b(?:lokasinya|berlokasi|beralamat|terletak|yang\s+berlokasi|dengan\s+luas|seluas)\b/i)[0].trim();
    if(!region)continue;
    const parts=region.split(/\s*,\s*|\s+dan\s+/i).map(clean).filter(Boolean);
    if(parts.length<2||parts.length>8)continue;
    for(const part of parts){
      const name=part.replace(/^\d+\s+orang\s*/i,'').trim();
      if(!isPlausiblePersonName(name))continue;
      addActor(map,name,'NAMED_OWNER',p.page,sentenceAround(p.text,(m.index||0)));
    }
  }
  // Resolve explicit role-to-person mentions without merging role-only actors by assumption.
  // Example: "Terdakwa Drs. Elya Dwi Admoko, M.M." becomes one named PERSON
  // carrying role=Terdakwa; a standalone word "Terdakwa" remains a ROLE entity.
  const roleNameRe=/\b(Penggugat|Tergugat|Pemohon|Termohon|Pelapor|Terlapor|Tersangka|Terdakwa|Debitur|Kreditur|Direktur(?:\s+Utama)?|Komisaris|Penuntut\s+Umum|Jaksa)\s+(?:(?:Drs?|Prof|Ir|H|Hj)\.?\s+)?([A-Z][A-Za-zÀ-ÿ.'-]*(?:\s+[A-Z][A-Za-zÀ-ÿ.'-]*){1,4})(?:,?\s+(?:S\.?H\.?|M\.?H\.?|M\.?M\.?|S\.?E\.?|M\.?Kn\.?))?/gi;
  for(const p of pgs) for(const m of p.text.matchAll(roleNameRe)){
    const role=clean(m[1]); const name=clean(m[2]);
    if(isPlausiblePersonName(name)) addActor(map,name,role,p.page,m[0]);
  }
  for(const p of pgs) for(const m of p.text.matchAll(/\b(PT|CV|UD|Yayasan|Koperasi|Firma|Perumda)\.?\s+((?:[A-Z][A-Za-z0-9.'&\-]*\s*){1,6})/g)){
    const full=clean(`${m[1]} ${m[2]}`); if(full.length>=5&&full.length<=80)addActor(map,full,'BUSINESS_ENTITY',p.page,m[0]);
  }
  const actionName=/\b([A-Z][a-zÀ-ÿ'-]{2,}(?:\s+[A-Z][a-zÀ-ÿ'-]{2,})?)\s+(?=(?:ditangkap|ditahan|menyewa|menjual|membeli|menggadaikan|mengalihkan|membayar|melaporkan|meminjam|menyerahkan|menguasai|menerima|menandatangani)\b)/g;
  const relationName=/\b(?:milik|kepada|oleh|dari)\s+([A-Z][a-zÀ-ÿ'-]{2,}(?:\s+[A-Z][a-zÀ-ÿ'-]{2,})?)\b/g;
  for(const p of pgs) for(const re of [actionName,relationName]) for(const m of p.text.matchAll(re)){
    const name=clean(m[1]); if(!isPlausiblePersonName(name))continue;
    addActor(map,name,'NAMED_PARTY',p.page,sentenceAround(p.text,(m.index||0)));
  }
  const roleWordSet=new Set(roleWords.map(r=>r.toLowerCase()));
  const filtered=[...map.values()].filter(a=>{
    if(roleWordSet.has(a.actor.toLowerCase()))return true;
    if(/^(PT|CV|UD|Yayasan|Koperasi|Firma|Perumda)\b/i.test(a.actor))return true;
    if(!isPlausiblePersonName(a.actor))return false;
    if(isProfessionalRankOrAcronymOnly(a.actor))return false;
    const quotes=(a.evidence_quotes||[]).filter(q=>typeof q==='string');
    if(quotes.length&&quotes.every(q=>hasOcrArtifactContext(q)))return false;
    return true;
  });
  return resolveActorAliases(filtered).slice(0,40);
}

function classifyDateType(context:string):TimelineEventType{
  const s=context.toLowerCase();
  if(/\b(?:lahir|tanggal\s+lahir|tgl\.?\s+lahir|usia|umur|nik|nomor\s+induk\s+kependudukan|ktp|akta\s+lahir)\b/i.test(s)) return 'IDENTITY_DATE';

  const proceduralAction=/\b(?:replik|repliek|duplik|jawaban|kesimpulan|eksepsi|pledoi|memori\s+banding|kontra\s+memori|memori\s+kasasi)\s+(?:telah\s+)?(?:diajukan|disampaikan|dibacakan|diserahkan|diberikan|didaftarkan|diputuskan|dikabulkan|ditolak)\b/i;
  const proceduralDateContext=/\b(?:persidangan|sidang|agenda\s+sidang|pembacaan\s+(?:dakwaan|putusan))\s+(?:pada\s+)?(?:tanggal|tgl\.?|hari)\b/i;
  const proceduralFiling=/\b(?:didaftarkan|diajukan|dipanggil|dihadirkan)\s+(?:pada|di)\s+(?:persidangan|pengadilan|kepaniteraan|register)\b/i;
  const proceduralRegister=/\b(?:register\s+perkara|pendaftaran\s+perkara|perkara\s+(?:didaftarkan|terdaftar))\b/i;
  const proceduralStageAction=/\b(?:somasi|mediasi|praperadilan|banding|kasasi|peninjauan\s+kembali)\s+(?:telah\s+)?(?:diajukan|didaftarkan|dilakukan|dilaksanakan|diputus|dimohonkan|diberikan|disampaikan|dikirimkan)\b/i;
  const proceduralStageInverse=/\b(?:mengajukan|mendaftarkan|melakukan|melaksanakan|memohon|memohonkan|menyampaikan|mengirimkan|mengeluarkan)\s+(?:somasi|mediasi|praperadilan|banding|kasasi|peninjauan\s+kembali)\b/i;
  const proceduralVerdict=/\b(?:putusan|amar\s+putusan)\s+(?:telah\s+)?(?:dibacakan|diputuskan|dijatuhkan|dikabulkan|ditolak|diucapkan)\b/i;
  if(proceduralAction.test(s)||proceduralDateContext.test(s)||proceduralFiling.test(s)||proceduralRegister.test(s)||proceduralStageAction.test(s)||proceduralStageInverse.test(s)||proceduralVerdict.test(s)) return 'PROCEDURAL_EVENT';

  // A dated document can also describe a material legal/status transition.
  // In a party-authored source that transition belongs in the claimed-event
  // chronology, while a bare document/header date remains metadata.
  const materialDocumentEvent=/\b(?:pengunduran\s+diri|mengundurkan\s+diri|diangkat|pengangkatan|diberhentikan|pemberhentian|mencantumkan|tidak\s+mencantumkan|menghapus|dihapus|menambahkan|ditambahkan|mengubah|diubah|perubahan|direvisi|revisi)\b/i;
  if(materialDocumentEvent.test(s)) return 'CLAIMED_EVENT';

  if(/\b(?:surat\s+kuasa|surat\s+keputusan|sk|akta|sertifikat\s+(?:nomor|tanggal)|kwitansi|perjanjian\s+(?:nomor|tanggal|tertanggal)|ditandatangani|bertanggal|tertanggal|nomor\s+surat|tanggal\s+surat)\b/i.test(s)) return 'DOCUMENT_DATE';

  if(/\b(?:meninggal|wafat|menikah|bercerai|menceraikan|perceraian|kematian|membagi|dibagi|pembagian|terbagi|menjual|dijual|terjual|penjualan|membeli|dibeli|pembelian|membayar|dibayar|pembayaran|melunasi|pelunasan|meminjamkan|meminjam|dipinjam|pinjaman|mengalihkan|dialihkan|pengalihan|menyerahkan|diserahkan|penyerahan|menerima|diterima|penerimaan|menguasai|dikuasai|penguasaan|merusak|dirusak|perusakan|menghilangkan|dihilangkan|penghilangan|menggadaikan|digadaikan|penggadaian|mengagunkan|diagunkan|dijaminkan|peminjaman|disertipikatkan|pensertipikatan|diterbitkan|penerbitan|ditetapkan|penetapan|ditandatangani|penandatanganan|diputus|putusan|dicabut|pencabutan|dibatalkan|pembatalan|dipindahtangankan|pemindahtanganan|memalsukan|dipalsukan|pemalsuan|menipu|ditipu|penipuan)\b/i.test(s)) return 'CLAIMED_EVENT';
  return 'DOCUMENT_DATE';
}

function rawPages(text:string){
  const source=String(text||'');
  const re=/---\s*HALAMAN\s+(\d+)\s*---/gi;
  const ms=[...source.matchAll(re)];
  if(!ms.length)return[{page:1,text:source}];
  return ms.map((m,i)=>({page:Number(m[1])||i+1,text:source.slice((m.index||0)+m[0].length,i+1<ms.length?(ms[i+1].index||source.length):source.length)}));
}

function extractAllDates(text:string){
  const out:EvidenceTimelineItem[]=[];
  const month='Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember';
  const fullDateRe=new RegExp(`\\b(\\d{1,2}\\s+(?:${month})\\s+(?:19|20)\\d{2})\\b`,'gi');
  const yearRe=/\b((?:19|20)\d{2})\b/g;
  const legalCitation=/undang[- ]undang|peraturan\s+nomor|pasal\s+\d+|nomor\s+\d+\s+tahun|nomor\s+\d+\s*\/\s*pdt/i;
  const strongYearEvent=/\b(?:meninggal|wafat|menikah|bercerai|perceraian|kematian|membagi|dibagi|pembagian|terbagi|menjual|dijual|terjual|penjualan|membeli|dibeli|pembelian|membayar|dibayar|pembayaran|melunasi|pelunasan|meminjamkan|meminjam|pinjaman|mengalihkan|dialihkan|pengalihan|menyerahkan|diserahkan|penyerahan|menerima|diterima|penerimaan|menguasai|dikuasai|penguasaan|merusak|dirusak|perusakan|menghilangkan|dihilangkan|penghilangan|menggadaikan|digadaikan|mengagunkan|dijaminkan|disertipikatkan|pensertipikatan|diterbitkan|penerbitan|ditetapkan|penetapan|ditandatangani|diputus|dicabut|pencabutan|dibatalkan|pembatalan|dipindahtangankan|pemindahtanganan|memalsukan|dipalsukan|pemalsuan|menipu|ditipu|penipuan)\b/i;
  const seen=new Set<string>();

  for(const p of rawPages(text)){
    const lines=String(p.text||'').split(/\r?\n+/).map(clean).filter(Boolean);
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      // Full dates are classified from their own physical line to prevent a nearby DOB/header from contaminating the type.
      for(const m of line.matchAll(fullDateRe)){
        const date=clean(m[1]);
        const context=line;
        if(legalCitation.test(context)&&!strongYearEvent.test(context)) continue;
        const type=classifyDateType(context);
        const key=`${p.page}|${date}|${type}|${context.toLowerCase()}`;
        if(seen.has(key))continue; seen.add(key);
        out.push({date,event:context.slice(0,700),page:p.page,quote:context.slice(0,260),type});
        if(out.length>=80)return out;
      }

      // Year-only: include previous wrapped line so "pembagian ... / tahun 2015" survives OCR/layout wrapping.
      const yearContext=clean(`${i>0?lines[i-1]:''} ${line}`);
      for(const m of line.matchAll(yearRe)){
        const year=m[1];
        if(line.match(fullDateRe)?.[0]?.includes(year)) continue;
        if(legalCitation.test(yearContext)) continue;
        if(!strongYearEvent.test(yearContext)) continue;

        // Generic non-event guards for year-only candidates (V6.7.2).
        // Anchored to the selected year token; full dates are classified above.
        const yearPos=line.indexOf(year);
        const yEsc=year.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

        // 1) Candidate year is itself part of an Indonesian plate shape.
        if(yearPos>=0){
          const near=line.slice(Math.max(0,yearPos-18),Math.min(line.length,yearPos+year.length+18));
          if(/\b[A-Z]{1,3}\s+\d{1,4}\s+[A-Z]{1,3}\b/.test(near)) continue;
        }

        // 2) Model/production year followed by a vehicle-document / plate marker.
        // Handles "tahun YYYY warna ... Nomor Polisi ..." without make/model hardcode.
        const yearModelTail=new RegExp(
          `\\b(?:tahun|model|produksi|pembuatan)\\s+${yEsc}\\b[^.;]{0,120}\\b(?:no\\s*\\.?\\s*polisi|nomor\\s+polisi|nopol|pelat\\s+nomor|bpkb|stnk)\\b`,
          'i',
        );
        if(yearModelTail.test(line)||yearModelTail.test(yearContext)) continue;

        // 3) OCR fallback: generic vehicle/agunan context + year + nearby plate shape.
        const vehicleYearPlate=new RegExp(
          `\\b(?:mobil|motor|kendaraan|agunan|jaminan)\\b[^.;]{0,140}\\b(?:tahun|model|produksi|pembuatan)\\s+${yEsc}\\b[^.;]{0,100}\\b[A-Z]{1,3}\\s+\\d{1,4}\\s+[A-Z]{1,3}\\b`,
          'i',
        );
        if(vehicleYearPlate.test(line)||vehicleYearPlate.test(yearContext)) continue;

        const y=Number(year);
        const currentYear=new Date().getFullYear();
        if(!Number.isFinite(y)||y<1900||y>currentYear+1) continue;

        const type=classifyDateType(yearContext);
        const key=`${p.page}|${year}|${type}|${yearContext.toLowerCase()}`;
        if(seen.has(key))continue; seen.add(key);
        out.push({date:year,event:yearContext.slice(0,700),page:p.page,quote:yearContext.slice(0,260),type});
        if(out.length>=80)return out;
      }
    }
  }
  return out;
}

function extractExhibits(text:string){
  const out:Array<{id:string;page:number;quote:string}>=[]; const seen=new Set<string>();
  for(const p of pages(text)) for(const m of p.text.matchAll(/\b(?:Bukti\s*)?([TP]-\d{1,3})\b/gi)){
    const id=m[1].toUpperCase(),key=`${id}@${p.page}`; if(seen.has(key))continue; seen.add(key);
    const i=m.index||0; out.push({id,page:p.page,quote:clean(p.text.slice(Math.max(0,i-120),i+380))});
  }
  return out.slice(0,220);
}

function deriveIssueSeeds(text:string, role:string):EvidenceIssueSeed[]{
  const allPages=pages(text);
  const out:EvidenceIssueSeed[]=deriveOntologyIssues(text).map(x=>({issue:x.issue,basis:x.basis,pages:x.pages,domain:x.domain,id:x.id,query_terms:x.query_terms}));
  if(role==='DEFENSE_SUBMISSION_WITH_EXHIBITS') out.push({
    issue:'Dalil pembelaan mana yang didukung bukti primer, mana yang masih berupa posisi pihak, dan bukti mana yang membuka counter-case?',
    basis:'Materi utama merupakan pembelaan dengan lampiran sehingga setiap dalil perlu diuji silang secara adversarial.',
    pages:allPages.slice(0,8).map(p=>p.page), id:'adversarial-defense-review', query_terms:['pembuktian','beban pembuktian','alat bukti']
  });
  if(role==='COMPLAINT_OR_PETITION') out.push({
    issue:'Dalil pengaduan/permohonan mana yang mempunyai bukti primer dan unsur hukum yang dapat diuji, serta apa kemungkinan bantahan pihak lawan?',
    basis:'Materi utama merupakan pengaduan/permohonan sehingga klaim belum boleh diperlakukan sebagai temuan independen.',
    pages:allPages.slice(0,8).map(p=>p.page), id:'adversarial-complaint-review', query_terms:['pembuktian','alat bukti']
  });
  // Report contract requires at least three audit issues. When substantive ontology produces fewer,
  // fill only with neutral audit issues that do not invent a legal rule or case-specific conclusion.
  const genericAuditSeeds:EvidenceIssueSeed[]=[
    {issue:'Proposisi material mana yang sudah didukung bukti primer, mana yang masih berupa klaim, dan bukti apa yang diperlukan untuk mengubah statusnya?',basis:'Kualitas analisis bergantung pada pemisahan fakta tekstual, klaim, bahan pendukung, anomali, dan missing fact.',pages:allPages.slice(0,8).map(p=>p.page),id:'audit-evidence-sufficiency',query_terms:['pembuktian','alat bukti','bukti primer']},
    {issue:'Siapa aktor material, apa kapasitas atau kewenangannya menurut sumber, dan tindakan mana yang dapat diatribusikan kepada masing-masing aktor?',basis:'Atribusi tindakan, kapasitas, dan kewenangan harus dibuktikan sebelum konsekuensi hukum ditarik.',pages:allPages.slice(0,8).map(p=>p.page),id:'audit-actor-capacity',query_terms:['kapasitas hukum','kewenangan','atribusi tindakan']},
    {issue:'Remedy, forum, tenggang, dan syarat prosedural apa yang relevan setelah fakta, kapasitas aktor, dan norma materiil terverifikasi?',basis:'Issue spotting harus dipisahkan dari pemilihan remedy dan prosedur agar strategi tidak dibangun dari asumsi.',pages:allPages.slice(0,8).map(p=>p.page),id:'audit-remedy-procedure',query_terms:['remedy hukum','forum','tenggang','prosedur']},
  ];
  for(const seed of genericAuditSeeds){ if(out.length>=3) break; if(!out.some(x=>x.id===seed.id)) out.push(seed); }

  if(!out.length){
    const anchors=allPages.flatMap(p=>sentences(p.text).slice(0,3).map(x=>({p:p.page,x}))).slice(0,8);
    out.push({issue:'Apa hubungan hukum, tindakan material, hak/kewajiban yang didalilkan, bukti yang tersedia, dan remedy yang mungkin relevan?',basis:anchors.map(x=>x.x.slice(0,120)).join(' | '),pages:uniq(anchors.map(x=>x.p)),id:'open-world-issue-spotting',query_terms:[]});
  }
  const seen=new Set<string>();
  return out.filter(x=>{const k=clean(x.id||x.issue).toLowerCase();if(seen.has(k))return false;seen.add(k);return true}).slice(0,24);
}

export function buildEvidenceModel(text:string):EvidenceModel{
  const r=roleScore(text); const statements:EvidenceStatement[]=[]; let seq=1;
  outer: for(const p of pages(text)) for(const s of sentences(p.text)){
    const c=classifySentence(s,r.role);
    statements.push({id:`S${seq++}`,page:p.page,class:c.cls,statement:s,quote:s.slice(0,360),speaker:c.speaker,confidence:c.confidence});
    if(statements.length>=900) break outer;
  }
  const allDates=extractAllDates(text);
  const timeline=allDates.filter(x=>x.type==='PROCEDURAL_EVENT'||x.type==='CLAIMED_EVENT');
  const timeline_metadata=allDates.filter(x=>x.type==='IDENTITY_DATE'||x.type==='DOCUMENT_DATE');
  return {
    source_role:r.role,source_role_confidence:r.confidence,source_role_signals:r.signals,statements,
    textual_facts:statements.filter(x=>x.class==='TEXTUAL_FACT').slice(0,220),
    party_claims:statements.filter(x=>x.class==='PARTY_CLAIM').slice(0,220),
    anomalies:statements.filter(x=>x.class==='ANOMALY').slice(0,100),
    adverse_evidence:statements.filter(x=>x.class==='ADVERSE_EVIDENCE').slice(0,100),
    supporting_evidence:statements.filter(x=>x.class==='SUPPORTING_EVIDENCE').slice(0,160),
    missing_facts:statements.filter(x=>x.class==='MISSING_FACT').slice(0,160),
    actors:extractActors(text),timeline,timeline_metadata,document_exhibits:extractExhibits(text),issue_seeds:deriveIssueSeeds(text,r.role),
  };
}
