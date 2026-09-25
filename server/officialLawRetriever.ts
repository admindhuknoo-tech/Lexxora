import { authorityAnchorsForContext, officialQueriesForContext, coreInstrumentQueriesForContext } from './legalOntology';
import { searchOfficialAuthorityIndex, officialAuthorityIndexStats } from './officialAuthorityIndex';

// A single official-source lookup is a network round-trip to an external
// government site (fetchText, 8-9s timeout each). Earlier revisions issued
// these one at a time in a plain for-await loop with no cross-item
// dependency, so a case needing 10-16 lookups could take minutes of pure
// sequential network wait even though every lookup is independent. This
// bounded-concurrency runner preserves result order (so downstream
// diagnostics/selection logic sees the exact same sequence it always did)
// while letting a small number of lookups be in flight at once, instead of
// firing every request at once (which would be impolite to the external
// site) or one at a time (which is what caused the multi-minute waits).
async function runWithConcurrency<T,R>(items:T[], limit:number, task:(item:T,index:number)=>Promise<R>):Promise<R[]>{
  const results:R[]=new Array(items.length);
  let next=0;
  async function worker(){
    while(true){
      const i=next++;
      if(i>=items.length) return;
      results[i]=await task(items[i],i);
    }
  }
  const workerCount=Math.max(1,Math.min(limit,items.length));
  await Promise.all(Array.from({length:workerCount},()=>worker()));
  return results;
}

export type RegulatoryMode = 'offline' | 'hybrid' | 'online';
export type OfficialSourceStrategy = 'auto' | 'manual' | 'manual_plus_auto';

export interface ManualAuthorityResolution {
  input: string;
  kind: 'URL' | 'EXACT_CITATION' | 'FREE_TEXT';
  status: 'RESOLVED' | 'AMBIGUOUS' | 'NOT_FOUND' | 'UNREACHABLE' | 'UNSUPPORTED_SOURCE';
  message: string;
  candidate?: OfficialLawCandidate;
  alternatives?: Array<{ title:string; url:string }>;
  exact_attempts?: ExactProviderAttempt[];
}

export interface OfficialLawCandidate {
  provider: 'JDIH_BPK'|'JDIHN'|'JDIH_MA'|'PUTUSAN_MA'|'OFFICIAL_INDEX'|'LOCAL_CORPUS';
  query: string;
  title: string;
  url: string;
  source_domain: string;
  status: 'DISCOVERED' | 'REACHABLE' | 'MATERIALLY_RELEVANT' | 'IDENTITY_VERIFIED' | 'UNREACHABLE';
  instrument_type?: string;
  number?: string;
  year?: number;
  subject?: string;
  effective_status?: string;
  direct_official_links?: string[];
  excerpt?: string;
  fetched_at: string;
  tempus_status: 'UNVERIFIED' | 'POTENTIALLY_COMPATIBLE' | 'POTENTIALLY_INCOMPATIBLE';
  identity_match?: 'EXACT'|'TOPICAL';
  query_kind?: 'EXACT_CITATION'|'TOPICAL_DISCOVERY'|'USER_EXACT_CITATION'|'USER_DIRECT_URL'|'OFFICIAL_INDEX'|'LOCAL_CORPUS';
  source_origin?: 'AUTO'|'USER'|'LOCAL';
  material_nexus_score?: number;
  material_nexus_status?: 'VERIFIED'|'REJECTED'|'NOT_REQUIRED';
  hierarchy_status?: 'ALLOWED'|'REJECTED';
  verification_reasons?: string[];
  authority_class?: 'LEGISLATION'|'JUDICIAL_PRODUCT'|'DECISION'|'INSTITUTIONAL_GUIDANCE';
  judicial_product_type?: 'SEMA'|'PERMA'|'RUMUSAN_KAMAR'|'OTHER';
  decision_number?: string;
  court?: string;
  decision_date?: string;
  source_tier?: 'PRIMARY_OFFICIAL'|'SECONDARY_OFFICIAL';
  discovery_context?: string;
  // Catalog/retrieval metadata (e.g. OFFICIAL_INDEX entry.keywords). It may
  // improve discovery/diagnostics but MUST NOT be treated as authority substance
  // by downstream issue-binding gates.
  keywords?: string[];
  verification_state?: 'VERIFIED_OFFICIAL'|'INDEXED_OFFICIAL'|'VERIFY_BLOCKED';
}


export interface OfficialLawRetrievalResult {
  mode: RegulatoryMode;
  queries: string[];
  candidates: OfficialLawCandidate[];
  providers: Array<{ name: string; status: string; query_count: number }>;
  notes: string[];
  source_strategy?: OfficialSourceStrategy;
  manual_resolutions?: ManualAuthorityResolution[];
  diagnostics?: {
    search_attempts: number;
    reachable_searches: number;
    found_links: number;
    selected_links: number;
    candidate_rejections: number;
    rejection_stage_counts?: Record<string, number>;
    rejection_reason_counts?: Record<string, number>;
    per_query_selected?: Array<{
      query: string;
      selected: number;
      available: number;
    }>;
    final_candidates: number;
    fetch_failures: number;
    no_detail_link_searches: number;
    provider_status: string;
  };
}

function cleanText(v: unknown): string {
  return String(v ?? '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#xD;|&#xA;/gi,' ').replace(/\s+/g, ' ').trim();
}
function uniq<T>(arr: T[]): T[] { return [...new Set(arr)]; }
function normalize(s:string){return cleanText(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function tokens(s: string): string[] {
  const stop = new Set(['yang','dan','atau','dengan','dalam','dari','untuk','pada','atas','oleh','terhadap','tentang','perkara','hukum','indonesia','adalah','sebagai','telah','akan','tidak','dapat','karena','serta','para','pihak','nomor','tahun']);
  return uniq((normalize(s).match(/[a-z0-9]{4,}/g) || []).filter(x => !stop.has(x)));
}

// ============================================================
// TOPICAL POLICY PROFILING (V6.7.6, restored in V6.7.8)
// ------------------------------------------------------------
// SHORT_SPECIFIC: <=6 token dengan minimal 1 marker spesifik.
// LONG_ONTOLOGY: >=7 token dengan >=2 marker + >=2 non-generic.
// GENERIC_FALLBACK: sisanya.
// ============================================================
type QueryKind = 'SHORT_SPECIFIC' | 'LONG_ONTOLOGY' | 'GENERIC_FALLBACK';

interface TopicalPolicyProfile {
  kind: QueryKind;
  tokenCount: number;
  specificMarkers: number;
  nonGenericTokens: number;
  minNexus: number;
  minQuerySpecificHits: number;
}

const TOPICAL_GENERIC_TOKENS = new Set([
  'yang','dan','atau','dengan','dalam','dari','untuk','pada','atas','oleh','terhadap','tentang',
  'hukum','perdata','pidana','indonesia','nasional','republik','umum','khusus',
  'perjanjian','perikatan',
]);

const TOPICAL_SPECIFIC_MARKER_RE = /\b(ppjb|ajb|shm|shgb|hgb|sertifikat|sertipikat|pemecahan|waris|kewarisan|pewarisan|wanprestasi|somasi|ganti\s+rugi|perbuatan\s+melawan\s+hukum|pmh|pelanggaran|kewenangan|kapasitas|remedy|prosedur|tenggang|forum|pembatalan|restitusi|pengembalian|prestasi|syarat|kredit|agunan|jual\s+beli|peralihan|hibah|wasiat|harta|boedel|perseroan|direksi|komisaris|rups|phk|upah|pesangon|konsumen|asuransi|polis|merek|paten|hak\s+cipta|tipikor|korupsi|dakwaan|penyidikan|eksepsi|pledoi|penahanan|sengketa|tata\s+usaha|ktun|ptun|keaslian|otentik|autentikasi|pemalsuan)\b/gi;

function profileQueryForTopicalPolicy(query: string): TopicalPolicyProfile {
  const queryTokens = String(query || '').toLowerCase().split(/\s+/).filter(t => t.length >= 3);
  const tokenCount = queryTokens.length;
  const nonGenericTokens = queryTokens.filter(t => !TOPICAL_GENERIC_TOKENS.has(t) && t.length >= 5).length;
  const markers = query.match(TOPICAL_SPECIFIC_MARKER_RE);
  const specificMarkers = markers ? markers.length : 0;

  if (tokenCount <= 6 && specificMarkers >= 1) {
    return { kind: 'SHORT_SPECIFIC', tokenCount, specificMarkers, nonGenericTokens, minNexus: 10, minQuerySpecificHits: 1 };
  }
  if (tokenCount >= 7 && specificMarkers >= 2 && nonGenericTokens >= 2) {
    return { kind: 'LONG_ONTOLOGY', tokenCount, specificMarkers, nonGenericTokens, minNexus: 10, minQuerySpecificHits: 2 };
  }
  return { kind: 'GENERIC_FALLBACK', tokenCount, specificMarkers, nonGenericTokens, minNexus: 12, minQuerySpecificHits: 2 };
}
function overlapScore(a: string, b: string): number {
  const aa = new Set(tokens(a)); const bb = tokens(b); if (!bb.length) return 0;
  let hit = 0; for (const t of bb) if (aa.has(t)) hit += t.length >= 8 ? 2 : 1; return hit;
}

export interface ParsedQueryIdentity {
  authority?: string;
  instrument_type?: string;
  instrument_family?: string;
  number?: string;
  year?: number;
  exact: boolean;
}
function inferAuthority(s:string):string|undefined{
  const n=normalize(s);
  const pairs:[RegExp,string][]=[[/\bdkpp\b|dewan kehormatan penyelenggara pemilu/,'DKPP'],[/\bkpu\b|komisi pemilihan umum/,'KPU'],[/\bbawaslu\b|badan pengawas pemilu/,'BAWASLU'],[/mahkamah agung|\bma\b/,'MA'],[/mahkamah konstitusi|\bmk\b/,'MK'],[/atr bpn|badan pertanahan nasional/,'ATR_BPN']];
  for(const [r,v] of pairs) if(r.test(n)) return v; return undefined;
}
function inferInstrumentIdentity(title: string) {
  const t = cleanText(title);
  const patterns: Array<{ family: string; re: RegExp }> = [
    { family:'PERPPU', re:/\b(Peraturan\s+Pemerintah\s+Pengganti\s+Undang[- ]Undang|Perppu)\s+(?:Republik\s+Indonesia\s+)?(?:Nomor|No\.?)\s*:?\s*([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i },
    { family:'UU', re:/\b(Undang[- ]Undang|UU)\s+(?:Republik\s+Indonesia\s+)?(?:Nomor|No\.?)\s*:?\s*([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i },
    { family:'PP', re:/\b(Peraturan\s+Pemerintah|PP)\s+(?:Republik\s+Indonesia\s+)?(?:Nomor|No\.?)\s*:?\s*([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i },
    { family:'PERPRES', re:/\b(Peraturan\s+Presiden|Perpres)\s+(?:Republik\s+Indonesia\s+)?(?:Nomor|No\.?)\s*:?\s*([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i },
    { family:'PERATURAN_DKPP', re:/\b(Peraturan\s+DKPP)\s+(?:Republik\s+Indonesia\s+)?(?:Nomor|No\.?)\s*:?\s*([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i },
    { family:'PERATURAN_KPU', re:/\b(Peraturan\s+KPU|PKPU)\s+(?:Republik\s+Indonesia\s+)?(?:Nomor|No\.?)\s*:?\s*([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i },
    { family:'PERATURAN_BAWASLU', re:/\b(Peraturan\s+Bawaslu)\s+(?:Republik\s+Indonesia\s+)?(?:Nomor|No\.?)\s*:?\s*([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i },
    { family:'SEMA', re:/\b(Surat\s+Edaran\s+Mahkamah\s+Agung|SEMA)\s+(?:Republik\s+Indonesia\s+)?(?:Nomor|No\.?)\s*:?\s*([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i },
    { family:'PERMA', re:/\b(Peraturan\s+Mahkamah\s+Agung|PERMA)\s+(?:Republik\s+Indonesia\s+)?(?:Nomor|No\.?)\s*:?\s*([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i },
    { family:'PERMEN', re:/\b(Peraturan\s+Menteri[^.;]{0,90}?)\s+(?:Republik\s+Indonesia\s+)?(?:Nomor|No\.?)\s*:?\s*([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i },
    { family:'PERDA', re:/\b(Peraturan\s+Daerah|PERDA)[^.;]{0,80}?(?:Nomor|No\.?)\s*:?\s*([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i },
    { family:'PERBUP', re:/\b(Peraturan\s+Bupati|PERBUP)[^.;]{0,80}?(?:Nomor|No\.?)\s*:?\s*([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i },
    { family:'PERWALI', re:/\b(Peraturan\s+Wali(?:kota)?|PERWALI)[^.;]{0,80}?(?:Nomor|No\.?)\s*:?\s*([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i },
  ];
  // A regulation title may quote another instrument in its subject, e.g.
  // "Undang-Undang Nomor 1 Tahun 2015 tentang Penetapan PERPPU Nomor 1 Tahun 2014".
  // Selecting by pattern order alone can therefore misclassify the outer instrument.
  // Resolve the identity whose match occurs earliest in the title; on the same offset,
  // prefer the longer matched instrument name. This is generic and family-agnostic.
  let best: { index:number; matchedLength:number; family:string; m:RegExpMatchArray } | undefined;
  for (const p of patterns) {
    const m=t.match(p.re);
    if (!m) continue;
    const index=m.index ?? Number.MAX_SAFE_INTEGER;
    const matchedLength=cleanText(m[1]).length;
    if (!best || index < best.index || (index === best.index && matchedLength > best.matchedLength)) {
      best={index,matchedLength,family:p.family,m};
    }
  }
  if (best) return { instrument_type: cleanText(best.m[1]), instrument_family:best.family, number: cleanText(best.m[2]), year: Number(best.m[3]) };
  return {};
}
export function parseQueryIdentity(q:string):ParsedQueryIdentity{
  const id=inferInstrumentIdentity(q) as any;
  const authority=inferAuthority(q);
  const family=id.instrument_family||instrumentFamily(id.instrument_type);
  return {authority,instrument_type:id.instrument_type,instrument_family:family,number:id.number,year:id.year,exact:Boolean(id.number&&id.year)};
}
function instrumentFamily(v:string|undefined):string|undefined{
  const n=normalize(v||'');
  if(!n) return undefined;
  if(/peraturan pemerintah pengganti undang undang|perppu/.test(n)) return 'PERPPU';
  if(/undang undang|^uu$/.test(n)) return 'UU';
  if(/peraturan pemerintah|^pp$/.test(n)) return 'PP';
  if(/peraturan presiden|perpres/.test(n)) return 'PERPRES';
  if(/surat edaran mahkamah agung|^sema$/.test(n)) return 'SEMA';
  if(/peraturan mahkamah agung|^perma$/.test(n)) return 'PERMA';
  if(/peraturan dkpp/.test(n)) return 'PERATURAN_DKPP';
  if(/peraturan kpu|pkpu/.test(n)) return 'PERATURAN_KPU';
  if(/peraturan bawaslu/.test(n)) return 'PERATURAN_BAWASLU';
  if(/peraturan menteri/.test(n)) return 'PERMEN';
  if(/peraturan daerah|perda/.test(n)) return 'PERDA';
  if(/peraturan bupati|perbup/.test(n)) return 'PERBUP';
  if(/peraturan walikota|perwali/.test(n)) return 'PERWALI';
  return n.toUpperCase().replace(/\s+/g,'_');
}
function authorityMatches(authority:string|undefined,text:string):boolean{
  if(!authority) return true; const n=normalize(text);
  if(authority==='DKPP') return /\bdkpp\b|dewan kehormatan penyelenggara pemilu/.test(n);
  if(authority==='KPU') return /\bkpu\b|komisi pemilihan umum/.test(n) && !/dkpp/.test(n);
  if(authority==='BAWASLU') return /\bbawaslu\b|badan pengawas pemilu/.test(n);
  if(authority==='MA') return /mahkamah agung/.test(n);
  if(authority==='MK') return /mahkamah konstitusi/.test(n);
  if(authority==='ATR_BPN') return /agraria|pertanahan|bpn/.test(n);
  return true;
}
function identityCompatible(query:string,candidateText:string):{ok:boolean;kind:'EXACT'|'TOPICAL';score:number}{
  const qid=parseQueryIdentity(query); const cid=inferInstrumentIdentity(candidateText) as any;
  const authorityOk=authorityMatches(qid.authority,candidateText);
  if(!authorityOk) return {ok:false,kind:qid.exact?'EXACT':'TOPICAL',score:0};
  if(qid.exact){
    if(!cid.number || !cid.year) return {ok:false,kind:'EXACT',score:0};
    const numberOk=normalize(String(cid.number))===normalize(String(qid.number));
    const yearOk=Number(cid.year)===Number(qid.year);
    const qFamily=instrumentFamily(qid.instrument_type);
    const cFamily=instrumentFamily(cid.instrument_type);
    const familyOk=!qFamily || !cFamily || qFamily===cFamily;
    if(!numberOk||!yearOk||!familyOk) return {ok:false,kind:'EXACT',score:0};
    return {ok:true,kind:'EXACT',score:100+overlapScore(query,candidateText)};
  }
  const score=overlapScore(query,candidateText);
  return {ok:score>=4,kind:'TOPICAL',score};
}

function isLocalRegulationFamily(v:string|undefined): boolean {
  const f=instrumentFamily(v);
  return f==='PERDA'||f==='PERBUP'||f==='PERWALI';
}
function queryPermitsLocalRegulation(query:string, domain?:string): boolean {
  const n=normalize(`${query} ${domain||''}`);
  return /pemerintah daerah|pemda|otonomi daerah|kabupaten|kota |provinsi|peraturan daerah|\bperda\b|peraturan bupati|\bperbup\b|peraturan walikota|\bperwali\b|kepala daerah/.test(n);
}
function domainPolicyAllowsCandidate(domain:string|undefined, query:string, candidateText:string, instrumentType?:string): boolean {
  const d=normalize(domain||'');
  const c=normalize(candidateText);
  if(isLocalRegulationFamily(instrumentType) && !queryPermitsLocalRegulation(query,domain)) return false;
  // Private-law disputes must not be polluted by local administrative regulations unless the facts expressly concern local government.
  if(/perdata|perikatan|kontrak|wanprestasi|jual beli|utang|piutang|perbuatan melawan hukum/.test(d)) {
    if(/peraturan daerah|peraturan bupati|peraturan walikota|\bperda\b|\bperbup\b|\bperwali\b/.test(c)) return false;
  }
  // Criminal/family/labour/land/election national-law searches likewise reject unrelated local regulations by default.
  if(/pidana|keluarga|waris|ketenagakerjaan|agraria|pertanahan|pemilu|etik penyelenggara/.test(d)) {
    if(/peraturan daerah|peraturan bupati|peraturan walikota|\bperda\b|\bperbup\b|\bperwali\b/.test(c) && !queryPermitsLocalRegulation(query,domain)) return false;
  }
  return true;
}
function materialNexusScore(query:string, domain:string|undefined, candidateText:string): number {
  const cn = normalize(candidateText);
  const qTokens = tokens(query);
  const candidateTokens = new Set(tokens(candidateText));

  // 1. Lexical overlap
  let lexical = 0;
  for(const t of qTokens){
    if(candidateTokens.has(t)) lexical += t.length >= 10 ? 3 : t.length >= 7 ? 2 : 1;
  }

  // 2. Query-only anchors — dominan
  const queryAnchors = authorityAnchorsForContext(query);
  let semantic = 0;
  for(const anchor of queryAnchors){
    const a = normalize(anchor);
    if(a && cn.includes(a)) semantic += a.split(' ').length > 1 ? 5 : 3;
  }

  // 3. Domain anchors — kontribusi tambahan dengan bobot rendah
  if(domain){
    const domainAnchors = authorityAnchorsForContext(domain);
    for(const anchor of domainAnchors){
      const a = normalize(anchor);
      if(a && cn.includes(a) && !queryAnchors.includes(anchor)) semantic += 1;
    }
  }

  return lexical + semantic;
}

function domainAnchors(domain:string|undefined, query:string): string[] {
  const anchors=authorityAnchorsForContext(`${domain||''} ${query}`);
  if(anchors.length) return anchors;
  return tokens(query).filter(t=>t.length>=6).slice(0,10);
}

function lexicalFallbackQuery(domain:string|undefined, text:string): string {
  const stop=new Set(['analisis','perkara','hukum','indonesia','dokumen','pihak','tersebut','dengan','bahwa','untuk','dalam','sebagai','karena','terhadap']);
  const freq=new Map<string,number>();
  for(const t of tokens(`${domain||''} ${text}`)){
    if(stop.has(t) || /^\d+$/.test(t) || t.length<6) continue;
    freq.set(t,(freq.get(t)||0)+1);
  }
  return [...freq.entries()].sort((a,b)=>b[1]-a[1] || b[0].length-a[0].length).slice(0,6).map(([t])=>t).join(' ');
}

interface SubtopicGuard { id:string; matcher:RegExp; requiredTriggers:RegExp; reason:string; }
const SUBTOPIC_GUARDS:SubtopicGuard[]=[
  {id:'tanah_wakaf',matcher:/\btanah\s+wakaf\b|\bwakaf\b/i,requiredTriggers:/\bwakaf\b|\bnazhir\b|\bikrar\s+wakaf\b|\bbadan\s+wakaf\b|\bwakif\b/i,reason:'subtopic guard: tanah wakaf tidak diminta oleh fact-pattern'},
  {id:'hak_ulayat',matcher:/\bhak\s+ulayat\b|\bulayat\b|\bmasyarakat\s+hukum\s+adat\b|\bmha\b/i,requiredTriggers:/\bulayat\b|\bmasyarakat\s+hukum\s+adat\b|\bmha\b|\btanah\s+adat\b|\bhutan\s+adat\b/i,reason:'subtopic guard: hak ulayat / MHA tidak diminta oleh fact-pattern'},
  {id:'pengampunan_pajak',matcher:/\bpengampunan\s+pajak\b|\btax\s+amnesty\b/i,requiredTriggers:/\bpengampunan\s+pajak\b|\btax\s+amnesty\b|\bdeklarasi\s+(?:harta|pajak)\b|\brepatriasi\b|\bpengungkapan\s+harta\b/i,reason:'subtopic guard: pengampunan pajak tidak diminta oleh fact-pattern'},
  {id:'tanah_musnah',matcher:/\btanah\s+musnah\b/i,requiredTriggers:/\btanah\s+musnah\b|\bkeputusan\s+tanah\s+musnah\b|\bpenetapan\s+tanah\s+musnah\b|\bobjek\s+tanah\s+musnah\b/i,reason:'subtopic guard: tanah musnah tidak diminta oleh fact-pattern'},
  {id:'reformasi_agraria',matcher:/\breformasi\s+agraria\b|\blandreform\b|\bland\s+reform\b|\bredistribusi\s+tanah\b|\btora\b/i,requiredTriggers:/\breformasi\s+agraria\b|\blandreform\b|\bredistribusi\s+tanah\b|\btanah\s+obyek\s+reformasi\b|\btora\b/i,reason:'subtopic guard: reformasi agraria tidak diminta oleh fact-pattern'},
  {id:'transmigrasi',matcher:/\btransmigrasi\b|\btransmigran\b/i,requiredTriggers:/\btransmigrasi\b|\btransmigran\b|\bkawasan\s+transmigrasi\b/i,reason:'subtopic guard: transmigrasi tidak diminta oleh fact-pattern'},
  {id:'tata_ruang',matcher:/\bpenataan\s+ruang\b|\brencana\s+(?:umum|detail|induk|strategis)?\s*tata\s+ruang\b|\brtrw\b|\brdtr\b|\bkkpr\b|\brencana\s+tata\s+ruang\s+(?:wilayah|kabupaten|kota|provinsi|nasional)\b/i,requiredTriggers:/\btata\s+ruang\b|\bpenataan\s+ruang\b|\brtrw\b|\brdtr\b|\bkkpr\b|\bzonasi\b|\bperuntukan\s+lahan\b|\brencana\s+kota\b/i,reason:'subtopic guard: tata ruang tidak diminta oleh fact-pattern'},
  {id:'pertambangan',matcher:/\bpertambangan\b|\bminerba\b|\biup\b|\bkk\s+pertambangan\b|\bbatubara\b/i,requiredTriggers:/\bpertambangan\b|\bminerba\b|\biup\b|\btambang\b|\bmineral\b|\bbatubara\b/i,reason:'subtopic guard: pertambangan tidak diminta oleh fact-pattern'},
  {id:'perkebunan',matcher:/\bperkebunan\b|\bhgu\b|\bhak\s+guna\s+usaha\b/i,requiredTriggers:/\bperkebunan\b|\bhgu\b|\bhak\s+guna\s+usaha\b|\bkebun\b|\bsawit\b|\bkaret\b/i,reason:'subtopic guard: perkebunan / HGU tidak diminta oleh fact-pattern'},
  {id:'kawasan_hutan',matcher:/\bkawasan\s+hutan\b|\bhutan\s+lindung\b|\bhutan\s+produksi\b|\bhutan\s+konservasi\b/i,requiredTriggers:/\bkawasan\s+hutan\b|\bhutan\s+lindung\b|\bhutan\s+produksi\b|\bhutan\s+konservasi\b|\bkehutanan\b/i,reason:'subtopic guard: kawasan hutan tidak diminta oleh fact-pattern'},
];
/**
 * Return the subject clause of an instrument title (the part after "tentang").
 * This prevents issuer names such as "Kementerian Agraria dan Tata Ruang"
 * from being mistaken for the substantive subject matter.
 */
function subjectOf(title:string):string{
  const s=String(title||'');
  const m=s.match(/\btentang\b(.+)$/i);
  return (m?m[1]:s).trim().toLowerCase();
}

function subtopicMaterialNexusGuard(query:string,domain:string|undefined,candidateTitle:string,caseText:string=''):{ok:boolean;reason?:string}{
  const context=`${query} ${domain||''} ${caseText}`.toLowerCase();
  const subjectText=subjectOf(candidateTitle);
  for(const guard of SUBTOPIC_GUARDS){
    // Evaluate the material subject, not the issuing authority in the title.
    if(!guard.matcher.test(subjectText)) continue;
    if(!guard.requiredTriggers.test(context)) return {ok:false,reason:guard.reason};
  }
  return {ok:true};
}

// Verbatim title match for a domain's named foundational codified instrument
// (e.g. "Kitab Undang-Undang Hukum Perdata"). These instruments predate the
// modern "Nomor/Tahun" citation convention (KUHPerdata/KUHP are colonial-era
// codifications historically cited by Staatsblad number), so they never
// qualify for the EXACT identity path, and their own title never repeats the
// case's courtroom-language terms (wanprestasi, somasi, etc.) the way the
// topical nexus formula expects — the code's *articles* contain those terms,
// not its title. A plain, full-phrase title match is therefore treated as its
// own identity signal here, independent of nexus keyword density.
function coreInstrumentTitleMatch(coreInstruments:string[]|undefined, candidateTitle:string): string|undefined {
  if(!coreInstruments || !coreInstruments.length) return undefined;
  const ct = normalize(candidateTitle);
  for(const name of coreInstruments){
    const n = normalize(name);
    if(n && n.length>=10 && ct.includes(n)) return name;
  }
  return undefined;
}

function topicalCandidateAccepts(
  query:string,
  domain:string|undefined,
  candidateTitle:string,
  candidateFullText:string,
  instrumentType?:string,
  caseText:string='',
  coreInstruments?:string[],
): { ok:boolean; score:number; reasons:string[] } {
  const reasons:string[] = [];

  // 1. Subtopic guard (judul saja, unchanged)
  const subtopic = subtopicMaterialNexusGuard(query, domain, candidateTitle, caseText);
  if(!subtopic.ok) return { ok:false, score:0, reasons:[subtopic.reason||'subtopic guard rejected'] };

  // 2. Hierarchy/domain policy (unchanged)
  if(!domainPolicyAllowsCandidate(domain, query, candidateFullText, instrumentType)) {
    return { ok:false, score:0, reasons:['hierarchy/domain policy rejected'] };
  }

  // 2.5. Named codified instrument title identity (see coreInstrumentTitleMatch
  // above). Subtopic and domain-policy gates above still apply; this only
  // substitutes for the keyword-density nexus check below, not for those gates.
  const coreMatch = coreInstrumentTitleMatch(coreInstruments, candidateTitle);
  if(coreMatch){
    return { ok:true, score: Math.max(materialNexusScore(query,domain,candidateFullText), 20), reasons:[`kodifikasi resmi cocok pada judul: "${coreMatch}"`] };
  }

  // 3. Query-only anchors
  const anchors = authorityAnchorsForContext(query);
  const cn = normalize(candidateFullText);
  const anchorHits = anchors.filter(a => cn.includes(normalize(a)));
  const strongAnchorHits = anchorHits.filter(a => a.length >= 6);
  const meaningfulHits = tokens(query).filter(t => t.length >= 6 && cn.includes(t));

  // 4. Gate minimum: minimal satu strong anchor atau satu meaningful hit
  if(strongAnchorHits.length === 0 && meaningfulHits.length === 0) {
    return { ok:false, score:0, reasons:['minimal satu material anchor kuat tidak ditemukan'] };
  }

  // 5. Adaptive profile
  const profile = profileQueryForTopicalPolicy(query);

  // 6. Query-specific hit requirement (adaptive)
  const querySpecificHits = Math.max(anchorHits.length, meaningfulHits.length);
  if(querySpecificHits < profile.minQuerySpecificHits) {
    reasons.push(`query-specific hits ${querySpecificHits}/${profile.minQuerySpecificHits} (profile=${profile.kind})`);
  }

  // 7. Nexus score threshold (adaptive)
  const score = materialNexusScore(query, domain, candidateFullText);
  if(score < profile.minNexus) {
    reasons.push(`nexus score ${score}<${profile.minNexus} (profile=${profile.kind})`);
  }

  // 8. Local regulation check (unchanged)
  const family = instrumentFamily(instrumentType);
  const nationalFamily = !family || !['PERDA','PERBUP','PERWALI'].includes(family);
  if(!nationalFamily && !queryPermitsLocalRegulation(query, domain)) {
    reasons.push('local regulation not permitted');
  }

  return { ok: reasons.length === 0, score, reasons };
}

export function evaluateOfficialCandidatePolicy(
  query:string,
  domain:string|undefined,
  candidateTitle:string,
  instrumentType?:string,
  caseText:string='',
  candidateFullText:string=candidateTitle,
) {
  const fullText=candidateFullText||candidateTitle;
  const identity=identityCompatible(query,fullText);
  const qid=parseQueryIdentity(query);
  if(qid.exact) return {accepted:identity.ok,kind:'EXACT' as const,score:identity.score,reasons:identity.ok?['exact identity match']:['exact identity mismatch']};
  const inferredType=instrumentType || (inferInstrumentIdentity(candidateTitle) as any).instrument_type;
  const topical=topicalCandidateAccepts(query,domain,candidateTitle,fullText,inferredType,caseText);
  return {accepted:topical.ok,kind:'TOPICAL' as const,score:topical.score,reasons:topical.reasons};
}

function inferTempusStatus(candidateYear: number | undefined, tempusYear?: number): OfficialLawCandidate['tempus_status'] {
  if (!candidateYear || !tempusYear) return 'UNVERIFIED';
  if (candidateYear > tempusYear) return 'POTENTIALLY_INCOMPATIBLE';
  return 'POTENTIALLY_COMPATIBLE';
}

function inferAuthorityTempusStatus(
  candidateYear:number|undefined,
  tempusYear:number|undefined,
  authorityClass:OfficialLawCandidate['authority_class'],
):OfficialLawCandidate['tempus_status']{
  // Legislation remains event-time sensitive. Judicial products/decisions may be
  // later than the material event yet still relevant to the court's current
  // interpretation/procedure. They therefore remain UNVERIFIED instead of being
  // automatically rejected as post-event law; professional verification must
  // determine temporal/procedural applicability.
  if(authorityClass==='JUDICIAL_PRODUCT'||authorityClass==='DECISION'){
    if(!candidateYear||!tempusYear) return 'UNVERIFIED';
    return candidateYear<=tempusYear?'POTENTIALLY_COMPATIBLE':'UNVERIFIED';
  }
  return inferTempusStatus(candidateYear,tempusYear);
}
type HttpAccessState='OK'|'BLOCKED'|'HTTP_ERROR'|'NETWORK_ERROR';
function classifyHttpAccess(status:number,ok:boolean):HttpAccessState{
  if(ok) return 'OK';
  if([401,403,429].includes(status)) return 'BLOCKED';
  if(status>0) return 'HTTP_ERROR';
  return 'NETWORK_ERROR';
}

type FetchProfile='official'|'public_search';
function fetchHeadersFor(profile:FetchProfile):Record<string,string>{
  return profile==='public_search'
    ? {
        'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language':'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding':'gzip, deflate, br',
        'Cache-Control':'no-cache',
        'Pragma':'no-cache',
        'Connection':'keep-alive',
        'Upgrade-Insecure-Requests':'1',
        'Sec-Fetch-Dest':'document',
        'Sec-Fetch-Mode':'navigate',
        'Sec-Fetch-Site':'none',
        'Sec-Fetch-User':'?1',
        'sec-ch-ua':'"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile':'?0',
        'sec-ch-ua-platform':'"Windows"',
      }
    : {
        'User-Agent':'LexiCore-Official-Law-Retriever/1.2',
        'Accept':'text/html,application/xhtml+xml',
        'Accept-Language':'id-ID,id;q=0.9,en;q=0.7',
      };
}

// Bot-protection WAFs in front of some official .go.id hosts (notably the
// Mahkamah Agung judicial properties) appear to key off the identifying
// 'official' profile UA/header set rather than IP or TLS fingerprint: the
// same hosts that 403 that profile consistently 200 for a browser-shaped
// request (see the 'public_search' profile used successfully for search
// discovery). When an 'official' request comes back BLOCKED, escalate once
// to browser-shaped headers before giving up, so a header-level block does
// not masquerade as a real connectivity/availability failure.
async function fetchText(url: string, timeoutMs = 9000, profile:FetchProfile='official'): Promise<{ ok: boolean; reachable:boolean; access_state:HttpAccessState; status: number; text: string; finalUrl: string; error?: string; escalated?: boolean }> {
  const transientCodes=new Set(['EAI_AGAIN','ETIMEDOUT','ECONNRESET','ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT']);

  async function attemptWithHeaders(headers:Record<string,string>){
    let lastError='';
    for(let attempt=1;attempt<=2;attempt++){
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await fetch(url,{signal:ctl.signal,redirect:'follow',headers});
        return {ok:r.ok,reachable:true,access_state:classifyHttpAccess(r.status,r.ok),status:r.status,text:await r.text(),finalUrl:r.url||url};
      }
      catch (err: any) {
        const name=cleanText(err?.name||'FetchError');
        const message=cleanText(err?.message||String(err||''));
        const causeCode=cleanText(err?.cause?.code||err?.code||'');
        const causeMessage=cleanText(err?.cause?.message||'');
        const cause=[causeCode,causeMessage].filter(Boolean).join(' ');
        lastError=`${name}${message?`: ${message}`:''}${cause?` | cause: ${cause}`:''}`;
        const transient=transientCodes.has(causeCode)||name==='AbortError';
        if(attempt===1 && transient){
          await new Promise(resolve=>setTimeout(resolve,180));
          continue;
        }
        return {ok:false,reachable:false,access_state:'NETWORK_ERROR' as HttpAccessState,status:0,text:'',finalUrl:url,error:`${lastError} | attempts=${attempt}`};
      } finally { clearTimeout(timer); }
    }
    return {ok:false,reachable:false,access_state:'NETWORK_ERROR' as HttpAccessState,status:0,text:'',finalUrl:url,error:lastError||'FetchError | attempts=2'};
  }

  const primary=await attemptWithHeaders(fetchHeadersFor(profile));
  if(profile==='official' && primary.reachable && primary.access_state==='BLOCKED'){
    const escalated=await attemptWithHeaders(fetchHeadersFor('public_search'));
    return {...escalated,escalated:true};
  }
  return primary;
}

function isOfficialLegalDomain(raw:string):boolean{
  try{
    const host=new URL(raw).hostname.toLowerCase();
    return host==='go.id'||host.endsWith('.go.id');
  }catch{return false;}
}

type ExactProviderName='BPK'|'JDIHN'|'DIRECT_PATTERN'|'WEB_DISCOVERY';

interface ExactProviderAttempt {
  provider: ExactProviderName;
  queries_or_urls: string[];
  reachable: boolean;
  hits: number;
  matched_identity: boolean;
  reason: string;
}

interface ResolvedExactCandidate {
  title:string;
  url:string;
  source_domain:string;
  provider:ExactProviderName;
  instrument_type?:string;
  number?:string;
  year?:number;
  effective_status?:string;
  direct_official_links?:string[];
  excerpt?:string;
}

interface ExactResolutionResult {
  resolved:ResolvedExactCandidate[];
  attempts:ExactProviderAttempt[];
}

function exactIdentityMatches(identity:ParsedQueryIdentity,titleOrText:string):boolean{
  const cid=inferInstrumentIdentity(titleOrText) as any;
  if(!cid.number||!cid.year) return false;
  if(normalize(String(cid.number))!==normalize(String(identity.number||''))) return false;
  if(Number(cid.year)!==Number(identity.year)) return false;
  const cf=cid.instrument_family||instrumentFamily(cid.instrument_type);
  if(identity.instrument_family&&cf&&identity.instrument_family!==cf) return false;
  if(identity.authority&&!authorityMatches(identity.authority,titleOrText)) return false;
  return true;
}

function dedupeExactResolved(items:ResolvedExactCandidate[]):ResolvedExactCandidate[]{
  const seen=new Set<string>();
  const out:ResolvedExactCandidate[]=[];
  for(const it of items){
    const fam=instrumentFamily(it.instrument_type)||'UNKNOWN';
    const key=`${fam}|${normalize(String(it.number||''))}|${it.year||0}`;
    if(seen.has(key)) continue;
    seen.add(key); out.push(it);
  }
  return out;
}

async function bpkExactProvider(query:string,identity:ParsedQueryIdentity):Promise<{items:ResolvedExactCandidate[];attempt:ExactProviderAttempt}>{
  const formulations=uniq([
    cleanText(query),
    `${identity.instrument_type||identity.instrument_family||''} Nomor ${identity.number} Tahun ${identity.year}`.trim(),
    `${identity.instrument_family||identity.instrument_type||''} ${identity.number} ${identity.year}`.trim(),
    `${identity.instrument_type||identity.instrument_family||''} No. ${identity.number} Tahun ${identity.year}`.trim(),
    `${identity.instrument_type||identity.instrument_family||''} Nomor ${identity.number}/${identity.year}`.trim(),
    `"${identity.instrument_type||identity.instrument_family||''}" "${identity.number}" "${identity.year}"`.trim(),
  ]).filter(x=>x.length>=4);

  const items:ResolvedExactCandidate[]=[];
  let reachable=false;
  for(const q of formulations){
    const res=await fetchText(`https://peraturan.bpk.go.id/Search?keywords=${encodeURIComponent(q)}`,9000);
    if(!res.ok) continue;
    reachable=true;

    // Exact lookup must not depend on the old top-8 topical ranking.
    // Scan a wider set of detail links from the official search response.
    const links=parseBpkSearch(res.text,q,32);
    for(const link of links){
      const detail=await fetchText(link.url,8000);
      if(!detail.ok) continue;
      const parsed=parseBpkDetail(detail.text);
      const title=parsed.title||link.title;
      if(!exactIdentityMatches(identity,`${title} ${parsed.excerpt||''}`)) continue;
      const id=inferInstrumentIdentity(title) as any;
      items.push({
        title,url:detail.finalUrl,source_domain:'peraturan.bpk.go.id',provider:'BPK',
        instrument_type:id.instrument_type,number:id.number,year:id.year,
        effective_status:parsed.effective_status||undefined,
        direct_official_links:parsed.direct_official_links,
        excerpt:parsed.excerpt,
      });
      if(items.length>=3) break;
    }
    if(items.length) break;
  }
  const unique=dedupeExactResolved(items);
  return {items:unique,attempt:{
    provider:'BPK',queries_or_urls:formulations,reachable,hits:unique.length,
    matched_identity:unique.length>0,
    reason:unique.length?'strict family/number/year identity matched on BPK detail':reachable?'BPK reachable but no strict identity match':'BPK unreachable',
  }};
}

function parseJdihnSearchLinks(html:string,limit=20):Array<{title:string;url:string}>{
  const out:Array<{title:string;url:string}>=[];
  const seen=new Set<string>();
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const m of html.matchAll(re)){
    const href=cleanText(m[1]); const title=cleanText(m[2]);
    if(!href||!title||title.length<8) continue;
    if(!/\/pencarian\/detail\//i.test(href)) continue;
    const url=href.startsWith('http')?href:`https://jdihn.go.id${href.startsWith('/')?'':'/'}${href}`;
    if(!isOfficialLegalDomain(url)||seen.has(url)) continue;
    seen.add(url); out.push({title,url});
    if(out.length>=limit) break;
  }
  return out;
}

function parseJdihnDetail(html:string):{title:string;instrument_type?:string;number?:string;year?:number;effective_status?:string;excerpt?:string}{
  const text=cleanText(html);
  const h1=cleanText((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||'');
  const title=h1||cleanText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'')||text.slice(0,400);
  const titleIdentity=inferInstrumentIdentity(title) as any;

  const numberMatch=text.match(/\bNomor\s*[:\-]?\s*([0-9A-Za-z./-]+)/i);
  const yearMatch=text.match(/\bTahun\s*[:\-]?\s*(\d{4})/i);
  const typeMatch=text.match(/\bJenis\s+Dokumen\s*[:\-]?\s*([A-Za-z -]{2,80})/i);
  const statusMatch=text.match(/\bStatus\s*[:\-]?\s*(Berlaku|Tidak Berlaku|Dicabut|Diubah)/i);

  const instrument_type=titleIdentity.instrument_type||cleanText(typeMatch?.[1]||'')||undefined;
  const number=titleIdentity.number||cleanText(numberMatch?.[1]||'')||undefined;
  const year=titleIdentity.year||Number(yearMatch?.[1]||0)||undefined;
  return {title,instrument_type,number,year,effective_status:statusMatch?.[1]||undefined,excerpt:text.slice(0,1800)};
}

async function jdihnExactProvider(query:string,identity:ParsedQueryIdentity):Promise<{items:ResolvedExactCandidate[];attempt:ExactProviderAttempt}>{
  const q=`${identity.instrument_type||identity.instrument_family||''} Nomor ${identity.number} Tahun ${identity.year}`.trim();
  // JDIHN has changed route shapes over time. Probe several public search URLs;
  // each is best-effort and failure is non-fatal.
  const searchUrls=uniq([
    `https://jdihn.go.id/search/all?q=${encodeURIComponent(q)}`,
    `https://jdihn.go.id/index.php/pencarian?search=${encodeURIComponent(q)}`,
    `https://jdihn.go.id/pencarian?search=${encodeURIComponent(q)}`,
  ]);

  const items:ResolvedExactCandidate[]=[];
  let reachable=false;
  for(const searchUrl of searchUrls){
    const res=await fetchText(searchUrl,9000);
    if(!res.ok) continue;
    reachable=true;
    const links=parseJdihnSearchLinks(res.text,20);
    for(const link of links){
      const detail=await fetchText(link.url,8000);
      if(!detail.ok) continue;
      const parsed=parseJdihnDetail(detail.text);
      const identityText=`${parsed.title} ${parsed.instrument_type||''} Nomor ${parsed.number||''} Tahun ${parsed.year||''}`;
      if(!exactIdentityMatches(identity,identityText)) continue;
      items.push({
        title:parsed.title,url:detail.finalUrl,source_domain:new URL(detail.finalUrl).hostname,
        provider:'JDIHN',instrument_type:parsed.instrument_type,number:parsed.number,year:parsed.year,
        effective_status:parsed.effective_status,excerpt:parsed.excerpt,
      });
      if(items.length>=3) break;
    }
    if(items.length) break;
  }
  const unique=dedupeExactResolved(items);
  return {items:unique,attempt:{
    provider:'JDIHN',queries_or_urls:searchUrls,reachable,hits:unique.length,
    matched_identity:unique.length>0,
    reason:unique.length?'strict family/number/year identity matched on JDIHN detail':reachable?'JDIHN reachable but no strict identity match':'JDIHN search endpoints unreachable',
  }};
}


function isWebDiscoveryEnabled():boolean{
  const env=(globalThis as any)?.process?.env||{};
  const v=String(env.LEXICORE_WEB_DISCOVERY||'').toLowerCase().trim();
  if(v==='disabled'||v==='false'||v==='0'||v==='off') return false;
  return true;
}

interface WebDiscoveryHit { title:string; url:string; locator:string; context?:string; }

function unwrapDuckDuckGoUrl(raw:string):string{
  try{
    const u=new URL(raw,'https://html.duckduckgo.com');
    const target=u.searchParams.get('uddg');
    return target?decodeURIComponent(target):u.href;
  }catch{return raw;}
}

async function duckduckgoOfficialSearch(query:string,limit=8):Promise<WebDiscoveryHit[]>{
  const url=`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query+' site:go.id')}`;
  const res=await fetchText(url,9000);
  if(!res.ok) return [];
  const out:WebDiscoveryHit[]=[];
  const seen=new Set<string>();
  const re=/<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const m of res.text.matchAll(re)){
    const candidate=unwrapDuckDuckGoUrl(cleanText(m[1]));
    const title=cleanText(m[2]);
    if(!/^https?:\/\//i.test(candidate)||!title) continue;
    if(!isOfficialLegalDomain(candidate)||seen.has(candidate)) continue;
    seen.add(candidate); out.push({title,url:candidate,locator:'duckduckgo'});
    if(out.length>=limit) break;
  }
  return out;
}

async function bingOfficialSearch(query:string,limit=8):Promise<WebDiscoveryHit[]>{
  const url=`https://www.bing.com/search?q=${encodeURIComponent(query+' site:go.id')}&count=20`;
  const res=await fetchText(url,9000);
  if(!res.ok) return [];
  const out:WebDiscoveryHit[]=[];
  const seen=new Set<string>();
  const re=/<h2[^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const m of res.text.matchAll(re)){
    const href=cleanText(m[1]);
    const title=cleanText(m[2]);
    if(!/^https?:\/\//i.test(href)||!title) continue;
    if(!isOfficialLegalDomain(href)||seen.has(href)) continue;
    seen.add(href); out.push({title,url:href,locator:'bing'});
    if(out.length>=limit) break;
  }
  return out;
}


type DiscoveryBodyState='HTML'|'SHORT_RESPONSE'|'CHALLENGE_OR_BLOCK'|'CONSENT_OR_INTERSTITIAL'|'EMPTY';
interface FallbackDiscoveryDiagnostic {
  engine:'JDIHN_AGGREGATOR'|'DUCKDUCKGO_HTML'|'DUCKDUCKGO_LITE'|'BING'|'CACHE';
  url:string;
  ok:boolean;
  reachable:boolean;
  access_state:HttpAccessState;
  status:number;
  hits:number;
  body_length:number;
  body_state:DiscoveryBodyState;
  error?:string;
}
function discoveryBodyState(text:string):DiscoveryBodyState{
  const body=String(text||''); const l=body.toLowerCase();
  if(!body.trim()) return 'EMPTY';
  if(/captcha|unusual traffic|verify (?:you are|that you are)|robot check|challenge-platform|cf-chl|access denied/.test(l)) return 'CHALLENGE_OR_BLOCK';
  if(/consent|privacy choices|before you continue|cookie preferences/.test(l) && body.length<250000) return 'CONSENT_OR_INTERSTITIAL';
  if(body.length<500) return 'SHORT_RESPONSE';
  return 'HTML';
}
function domainMatches(candidate:string,domain:string):boolean{
  try{ const h=new URL(candidate).hostname.toLowerCase(); return h===domain.toLowerCase()||h.endsWith(`.${domain.toLowerCase()}`); }catch{return false;}
}
function stripHtmlLabel(v:string):string{return cleanText(String(v||'').replace(/<[^>]+>/g,' '));}
function parseDuckDuckGoDomainHits(html:string,domain:string,limit=8):WebDiscoveryHit[]{
  const out:WebDiscoveryHit[]=[]; const seen=new Set<string>();
  const anchors=html.matchAll(/<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi);
  for(const m of anchors){
    const attrs=`${m[1]||''} ${m[3]||''}`; const raw=cleanText(m[2]);
    if(!raw) continue;
    const candidate=unwrapDuckDuckGoUrl(raw);
    if(!/^https?:\/\//i.test(candidate)||!domainMatches(candidate,domain)) continue;
    const title=stripHtmlLabel(m[4])||candidate;
    // Prefer result-like anchors, but accept a domain-matching anchor from Lite/changed markup.
    const resultish=/result|links_main|result-link|result__a/i.test(attrs)||/duckduckgo/i.test(raw)||domainMatches(candidate,domain);
    if(!resultish||seen.has(candidate)) continue;
    seen.add(candidate); out.push({title,url:candidate,locator:`duckduckgo:${domain}`});
    if(out.length>=limit) break;
  }
  return out;
}
function unwrapBingUrl(raw:string):string{
  try{
    const u=new URL(raw,'https://www.bing.com');
    for(const k of ['url','u','r']){
      const v=u.searchParams.get(k); if(!v) continue;
      const decoded=decodeURIComponent(v);
      if(/^https?:\/\//i.test(decoded)) return decoded;
      // Bing sometimes prefixes base64-ish targets with "a1"; do not guess-decode opaque payloads.
    }
    return u.href;
  }catch{return raw;}
}
function parseBingDomainHits(html:string,domain:string,limit=8):WebDiscoveryHit[]{
  const out:WebDiscoveryHit[]=[]; const seen=new Set<string>();
  for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const candidate=unwrapBingUrl(cleanText(m[1]));
    if(!/^https?:\/\//i.test(candidate)||!domainMatches(candidate,domain)) continue;
    const title=stripHtmlLabel(m[2])||candidate;
    if(seen.has(candidate)) continue;
    seen.add(candidate); out.push({title,url:candidate,locator:`bing:${domain}`});
    if(out.length>=limit) break;
  }
  return out;
}
async function duckduckgoDomainSearch(query:string,domain:string,limit=8,variant:'html'|'lite'='html'):Promise<{hits:WebDiscoveryHit[];diagnostic:FallbackDiscoveryDiagnostic}>{
  const base=variant==='lite'?'https://lite.duckduckgo.com/lite/':'https://html.duckduckgo.com/html/';
  const url=`${base}?q=${encodeURIComponent(`${query} site:${domain}`)}`;
  const res=await fetchText(url,9000,'public_search');
  const hits=res.ok?parseDuckDuckGoDomainHits(res.text,domain,limit):[];
  return {hits,diagnostic:{engine:variant==='lite'?'DUCKDUCKGO_LITE':'DUCKDUCKGO_HTML',url,ok:res.ok,reachable:res.reachable,access_state:res.access_state,status:res.status,hits:hits.length,body_length:res.text.length,body_state:discoveryBodyState(res.text),error:res.error}};
}
async function bingDomainSearch(query:string,domain:string,limit=8):Promise<{hits:WebDiscoveryHit[];diagnostic:FallbackDiscoveryDiagnostic}>{
  const url=`https://www.bing.com/search?q=${encodeURIComponent(`${query} site:${domain}`)}&count=20`;
  const res=await fetchText(url,9000,'public_search');
  const hits=res.ok?parseBingDomainHits(res.text,domain,limit):[];
  return {hits,diagnostic:{engine:'BING',url,ok:res.ok,reachable:res.reachable,access_state:res.access_state,status:res.status,hits:hits.length,body_length:res.text.length,body_state:discoveryBodyState(res.text),error:res.error}};
}


const OFFICIAL_DISCOVERY_CACHE_TTL_MS=24*60*60*1000;
const officialDiscoveryPositiveCache=new Map<string,{expires:number;hits:WebDiscoveryHit[];strategy:string}>();
function officialDiscoveryCacheKey(query:string,domain:string):string{return `${domain.toLowerCase()}|${normalize(query)}`;}
function readOfficialDiscoveryCache(query:string,domain:string,limit:number):{hits:WebDiscoveryHit[];strategy:string}|undefined{
  const key=officialDiscoveryCacheKey(query,domain); const item=officialDiscoveryPositiveCache.get(key);
  if(!item) return undefined;
  if(item.expires<=Date.now()){officialDiscoveryPositiveCache.delete(key);return undefined;}
  const hits=item.hits.filter(h=>isOfficialLegalDomain(h.url)).slice(0,limit);
  if(!hits.length){officialDiscoveryPositiveCache.delete(key);return undefined;}
  return {hits,strategy:item.strategy};
}
function writeOfficialDiscoveryCache(query:string,domain:string,hits:WebDiscoveryHit[],strategy:string):void{
  const safe=hits.filter(h=>isOfficialLegalDomain(h.url));
  if(!safe.length) return;
  officialDiscoveryPositiveCache.set(officialDiscoveryCacheKey(query,domain),{expires:Date.now()+OFFICIAL_DISCOVERY_CACHE_TTL_MS,hits:safe,strategy});
}

async function jdihnTopicalSearch(query:string,targetDomain:string,limit=8):Promise<{hits:WebDiscoveryHit[];diagnostic:FallbackDiscoveryDiagnostic}>{
  const targetHint=targetDomain==='putusan3.mahkamahagung.go.id'?'putusan Mahkamah Agung':'Mahkamah Agung';
  const q=cleanText(`${query} ${targetHint}`);
  const urls=uniq([
    `https://jdihn.go.id/search/all?q=${encodeURIComponent(q)}`,
    `https://jdihn.go.id/index.php/pencarian?search=${encodeURIComponent(q)}`,
    `https://jdihn.go.id/pencarian?search=${encodeURIComponent(q)}`,
  ]);
  let reachable=false,lastStatus=0,lastState:HttpAccessState='NETWORK_ERROR',lastLength=0,lastBodyState:DiscoveryBodyState='EMPTY',lastError='';
  for(const url of urls){
    const res=await fetchText(url,9000,'official');
    reachable=reachable||res.reachable; lastStatus=res.status; lastState=res.access_state; lastLength=res.text.length; lastBodyState=discoveryBodyState(res.text); lastError=res.error||'';
    if(!res.ok) continue;
    const links=parseJdihnSearchLinks(res.text,Math.max(limit*3,20));
    const hits:WebDiscoveryHit[]=[];
    const seen=new Set<string>();
    const qTokens=tokens(query).filter(t=>t.length>=4);
    for(const link of links){
      if(seen.has(link.url)) continue;
      const titleNorm=normalize(link.title);
      const lexical=qTokens.length?qTokens.some(t=>titleNorm.includes(t)):true;
      if(!lexical && !/(SEMA|PERMA|putusan|Mahkamah Agung|rumusan kamar)/i.test(link.title)) continue;
      seen.add(link.url);
      hits.push({title:link.title,url:link.url,locator:`jdihn:${targetDomain}`,context:`Official JDIHN aggregator result for ${targetDomain}`});
      if(hits.length>=limit) break;
    }
    if(hits.length) return {hits,diagnostic:{engine:'JDIHN_AGGREGATOR',url,ok:true,reachable:true,access_state:'OK',status:res.status,hits:hits.length,body_length:res.text.length,body_state:discoveryBodyState(res.text)}};
  }
  return {hits:[],diagnostic:{engine:'JDIHN_AGGREGATOR',url:urls[0],ok:false,reachable,access_state:lastState,status:lastStatus,hits:0,body_length:lastLength,body_state:lastBodyState,error:lastError||undefined}};
}

type OfficialProviderAccessState='REACHABLE_OK'|'REACHABLE_BLOCKED'|'REACHABLE_HTTP_ERROR'|'NETWORK_UNREACHABLE'|'REACHABLE_VIA_FALLBACK';
interface OfficialDomainSearchResult {
  hits: WebDiscoveryHit[];
  reachable: boolean;
  access_state: OfficialProviderAccessState;
  strategy:'DIRECT_OFFICIAL'|'JDIHN_AGGREGATOR'|'CACHE'|'DUCKDUCKGO_HTML'|'DUCKDUCKGO_LITE'|'BING_FALLBACK'|'EXHAUSTED'|'NONE';
  attempts:Array<{url:string;ok:boolean;reachable:boolean;access_state:HttpAccessState;status:number;error?:string;escalated?:boolean}>;
  fallback_attempted:boolean;
  fallback_attempts:FallbackDiscoveryDiagnostic[];
}

function parseDirectOfficialSearch(html:string,domain:string,limit=8):WebDiscoveryHit[]{
  const out:WebDiscoveryHit[]=[]; const seen=new Set<string>();
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const m of html.matchAll(re)){
    const raw=cleanText(m[1]); const title=cleanText(m[2]); if(!raw||!title) continue;
    let url=''; try{url=new URL(raw,`https://${domain}`).href;}catch{continue;}
    if(!domainMatches(url,domain)||seen.has(url)) continue;
    const lower=url.toLowerCase();
    const looksDetail=domain==='jdih.mahkamahagung.go.id'?(/\/legal-product\//.test(lower)||/\/dokumen\//.test(lower)):(/\/direktori\/putusan\//.test(lower)||/\/putusan\//.test(lower));
    if(!looksDetail) continue;
    const idx=typeof m.index==='number'?m.index:0;
    const context=cleanText(html.slice(Math.max(0,idx-420),Math.min(html.length,idx+(m[0]?.length||0)+700))).slice(0,900);
    seen.add(url); out.push({title,url,locator:`direct:${domain}`,context});
    if(out.length>=limit) break;
  }
  return out;
}

async function directOfficialDomainSearch(query:string,domain:string,limit=8):Promise<OfficialDomainSearchResult>{
  const urls=domain==='jdih.mahkamahagung.go.id'
    ? [`https://${domain}/dokumen?search=${encodeURIComponent(query)}`]
    : domain==='putusan3.mahkamahagung.go.id'
      ? [`https://${domain}/search.html?q=${encodeURIComponent(query)}`]
      : [];
  const attempts:OfficialDomainSearchResult['attempts']=[];
  let reachable=false;
  let accessState:OfficialProviderAccessState='NETWORK_UNREACHABLE';
  for(const url of urls){
    const res=await fetchText(url,9000);
    attempts.push({url,ok:res.ok,reachable:res.reachable,access_state:res.access_state,status:res.status,error:res.error,escalated:res.escalated});
    if(res.reachable){ reachable=true; accessState=res.access_state==='BLOCKED'?'REACHABLE_BLOCKED':res.access_state==='HTTP_ERROR'?'REACHABLE_HTTP_ERROR':'REACHABLE_OK'; }
    if(!res.ok) continue;
    const hits=parseDirectOfficialSearch(res.text,domain,limit);
    if(hits.length) return {hits,reachable:true,access_state:'REACHABLE_OK',strategy:'DIRECT_OFFICIAL',attempts,fallback_attempted:false,fallback_attempts:[]};
  }
  return {hits:[],reachable,access_state:accessState,strategy:'NONE',attempts,fallback_attempted:false,fallback_attempts:[]};
}

async function searchOfficialDomain(query:string,domain:string,limit=8):Promise<OfficialDomainSearchResult>{
  const cached=readOfficialDiscoveryCache(query,domain,limit);
  if(cached) return {hits:cached.hits,reachable:true,access_state:'REACHABLE_VIA_FALLBACK',strategy:'CACHE',attempts:[],fallback_attempted:true,fallback_attempts:[{engine:'CACHE',url:'memory://official-discovery-cache',ok:true,reachable:true,access_state:'OK',status:200,hits:cached.hits.length,body_length:0,body_state:'HTML'}]};
  const direct=await directOfficialDomainSearch(query,domain,limit);
  if(direct.hits.length){writeOfficialDiscoveryCache(query,domain,direct.hits,'DIRECT_OFFICIAL');return direct;}
  const fallbackAttempts:FallbackDiscoveryDiagnostic[]=[];
  const jdihn=await jdihnTopicalSearch(query,domain,limit); fallbackAttempts.push(jdihn.diagnostic);
  if(jdihn.hits.length){writeOfficialDiscoveryCache(query,domain,jdihn.hits,'JDIHN_AGGREGATOR');return {hits:jdihn.hits,reachable:true,access_state:'REACHABLE_VIA_FALLBACK',strategy:'JDIHN_AGGREGATOR',attempts:direct.attempts,fallback_attempted:true,fallback_attempts:fallbackAttempts};}
  const ddgLite=await duckduckgoDomainSearch(query,domain,limit,'lite'); fallbackAttempts.push(ddgLite.diagnostic);
  if(ddgLite.hits.length){writeOfficialDiscoveryCache(query,domain,ddgLite.hits,'DUCKDUCKGO_LITE');return {hits:ddgLite.hits,reachable:true,access_state:'REACHABLE_VIA_FALLBACK',strategy:'DUCKDUCKGO_LITE',attempts:direct.attempts,fallback_attempted:true,fallback_attempts:fallbackAttempts};}
  const ddgHtml=await duckduckgoDomainSearch(query,domain,limit,'html'); fallbackAttempts.push(ddgHtml.diagnostic);
  if(ddgHtml.hits.length){writeOfficialDiscoveryCache(query,domain,ddgHtml.hits,'DUCKDUCKGO_HTML');return {hits:ddgHtml.hits,reachable:true,access_state:'REACHABLE_VIA_FALLBACK',strategy:'DUCKDUCKGO_HTML',attempts:direct.attempts,fallback_attempted:true,fallback_attempts:fallbackAttempts};}
  const bing=await bingDomainSearch(query,domain,limit); fallbackAttempts.push(bing.diagnostic);
  if(bing.hits.length){writeOfficialDiscoveryCache(query,domain,bing.hits,'BING_FALLBACK');return {hits:bing.hits,reachable:true,access_state:'REACHABLE_VIA_FALLBACK',strategy:'BING_FALLBACK',attempts:direct.attempts,fallback_attempted:true,fallback_attempts:fallbackAttempts};}
  const anyFallbackReachable=fallbackAttempts.some(a=>a.reachable);
  return {hits:[],reachable:direct.reachable||anyFallbackReachable,access_state:direct.access_state,strategy:'EXHAUSTED',attempts:direct.attempts,fallback_attempted:true,fallback_attempts:fallbackAttempts};
}

export interface JudicialAuthorityIdentity {
  authority_class: 'JUDICIAL_PRODUCT'|'DECISION';
  judicial_product_type?: 'SEMA'|'PERMA'|'RUMUSAN_KAMAR'|'OTHER';
  instrument_type?: string;
  number?: string;
  year?: number;
  decision_number?: string;
  court?: string;
  decision_date?: string;
}

export function inferJudicialAuthorityIdentity(raw:string,url=''):JudicialAuthorityIdentity|undefined{
  const text=cleanText(raw); const lower=`${url} ${text}`.toLowerCase();

  // Rumusan Kamar can quote the parent SEMA in the same page. Detect it before
  // generic SEMA/PERMA identity so the authority class is not collapsed.
  if(/rumusan[_\s-]?kamar|nomor\s+rumusan\s+kamar/i.test(lower)){
    const sema=text.match(/SEMA\s+(?:Nomor\s+)?([0-9A-Za-z./-]+)\s+Tahun\s+(\d{4})/i);
    return {authority_class:'JUDICIAL_PRODUCT',judicial_product_type:'RUMUSAN_KAMAR',instrument_type:sema?'SEMA / Rumusan Kamar':'Rumusan Kamar',number:sema?.[1],year:sema?Number(sema[2]):undefined};
  }

  const instrument=inferInstrumentIdentity(text) as any;
  const family=instrument.instrument_family||instrumentFamily(instrument.instrument_type);
  if(family==='SEMA'||family==='PERMA'){
    return {authority_class:'JUDICIAL_PRODUCT',judicial_product_type:family,instrument_type:instrument.instrument_type,number:instrument.number,year:instrument.year};
  }

  if(/direktori\/putusan|\bputusan\b/i.test(lower)){
    const decisionPatterns=[
      /(?:Putusan[^\n]{0,100}?Nomor|\bNomor)\s*[:|]?\s*([0-9]{1,7}\/[A-Za-z0-9.()_-]+\/(?:19|20)\d{2}\/[A-Za-z0-9.()_-]+(?:\s+[A-Za-z0-9.()_-]+)?)/i,
      /(?:Putusan[^\n]{0,100}?Nomor|\bNomor)\s*[:|]?\s*([0-9]{1,7}\s+(?:K|PK)\/[A-Za-z0-9.()_-]+\/(?:19|20)\d{2})/i,
      /([0-9]{1,7}\/[A-Za-z0-9.()_-]+\/(?:19|20)\d{2}\/[A-Za-z0-9.()_-]+(?:\s+[A-Za-z0-9.()_-]+)?)/i,
      /([0-9]{1,7}\s+(?:K|PK)\/[A-Za-z0-9.()_-]+\/(?:19|20)\d{2})/i,
    ];
    const m=decisionPatterns.map(rx=>text.match(rx)).find(Boolean) as RegExpMatchArray|undefined;
    const decision_number=cleanText(m?.[1]||'')||undefined;
    const y=decision_number?.match(/(?:\/|\s)((?:19|20)\d{2})(?:\/|$)/);
    const courtRaw=cleanText((text.match(/Lembaga\s+Peradilan\s*[:|]?\s*([A-Z][A-Z ._-]{2,80}?)(?=\s+Tanggal\b|\s+Jenis\b|\s+Hakim\b|$)/i)||[])[1]||'');
    const court=courtRaw||undefined;
    const decision_date=cleanText((text.match(/Tanggal\s+Dibacakan\s*[:|]?\s*([0-9]{1,2}\s+[A-Za-z]+\s+(?:19|20)\d{2})/i)||[])[1]||'')||undefined;
    if(decision_number || /direktori\/putusan/i.test(lower)) return {authority_class:'DECISION',decision_number,court,decision_date,year:y?Number(y[1]):undefined};
  }
  return undefined;
}

function providerForOfficialDomain(domain:string):OfficialLawCandidate['provider']{
  const host=String(domain||'').toLowerCase();
  if(host==='jdih.mahkamahagung.go.id'||host.endsWith('.jdih.mahkamahagung.go.id')) return 'JDIH_MA';
  if(host==='putusan3.mahkamahagung.go.id'||host.endsWith('.putusan3.mahkamahagung.go.id')) return 'PUTUSAN_MA';
  if(host==='jdihn.go.id'||host.endsWith('.jdihn.go.id')) return 'JDIHN';
  return 'JDIH_BPK';
}

async function jdihKemenkumSearch(query:string,limit=8):Promise<WebDiscoveryHit[]>{
  const urls=[
    `https://peraturan.go.id/search?q=${encodeURIComponent(query)}`,
    `https://peraturan.go.id/cari?query=${encodeURIComponent(query)}`,
  ];
  const out:WebDiscoveryHit[]=[];
  const seen=new Set<string>();
  for(const url of urls){
    const res=await fetchText(url,9000);
    if(!res.ok) continue;
    const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for(const m of res.text.matchAll(re)){
      const href=cleanText(m[1]); const title=cleanText(m[2]);
      if(!href||!title||title.length<8) continue;
      const abs=href.startsWith('http')?href:`https://peraturan.go.id${href.startsWith('/')?'':'/'}${href}`;
      if(!isOfficialLegalDomain(abs)||seen.has(abs)) continue;
      seen.add(abs); out.push({title,url:abs,locator:'jdih-kemenkum'});
      if(out.length>=limit) return out;
    }
  }
  return out;
}

function parseGenericOfficialPage(html:string,fallbackTitle=''):{title:string;excerpt:string}{
  const title=cleanText(
    (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||
    fallbackTitle
  );
  return {title,excerpt:cleanText(html).slice(0,2200)};
}

async function directPatternProvider(identity:ParsedQueryIdentity):Promise<{items:ResolvedExactCandidate[];attempt:ExactProviderAttempt}>{
  const familySlug:Record<string,string>={
    UU:'uu',PERPPU:'perppu',PP:'pp',PERPRES:'perpres',
    PERDA:'perda',PERBUP:'perbup',PERWALI:'perwali',PERMEN:'permen',
    PERATURAN_DKPP:'peraturan-dkpp',PERATURAN_KPU:'peraturan-kpu',PERATURAN_BAWASLU:'peraturan-bawaslu',
  };
  const slug=familySlug[identity.instrument_family||''];
  if(!slug||!identity.number||!identity.year){
    return {items:[],attempt:{provider:'DIRECT_PATTERN',queries_or_urls:[],reachable:false,hits:0,matched_identity:false,reason:'family/number/year unavailable for direct pattern'}};
  }

  const n=String(identity.number).trim(), y=String(identity.year);
  // Do NOT invent a BPK /Details/<slug> path: current BPK detail pages use numeric IDs.
  // peraturan.go.id patterns are locator attempts only and remain fail-closed on identity.
  const urls=uniq([
    `https://peraturan.go.id/id/${slug}-no-${n}-tahun-${y}`,
    `https://peraturan.go.id/id/${slug}-nomor-${n}-tahun-${y}`,
  ]);

  const items:ResolvedExactCandidate[]=[];
  let reachable=false;
  for(const url of urls){
    const res=await fetchText(url,7000);
    if(!res.ok) continue;
    reachable=true;
    if(!isOfficialLegalDomain(res.finalUrl)) continue;
    const generic=parseGenericOfficialPage(res.text);
    const identityText=`${generic.title} ${generic.excerpt.slice(0,900)}`;
    if(!exactIdentityMatches(identity,identityText)) continue;
    const id=inferInstrumentIdentity(identityText) as any;
    items.push({
      title:generic.title||`${identity.instrument_type||identity.instrument_family} Nomor ${n} Tahun ${y}`,
      url:res.finalUrl,source_domain:new URL(res.finalUrl).hostname,provider:'DIRECT_PATTERN',
      instrument_type:id.instrument_type||identity.instrument_type,
      number:id.number||identity.number,year:id.year||identity.year,
      excerpt:generic.excerpt,
    });
    break;
  }
  const unique=dedupeExactResolved(items);
  return {items:unique,attempt:{
    provider:'DIRECT_PATTERN',queries_or_urls:urls,reachable,hits:unique.length,
    matched_identity:unique.length>0,
    reason:unique.length?'strict identity matched on direct official pattern':reachable?'direct official patterns reachable but no strict identity match':'direct official patterns unreachable',
  }};
}

async function resolveViaWebDiscovery(query:string,identity:ParsedQueryIdentity):Promise<{items:ResolvedExactCandidate[];attempt:ExactProviderAttempt;locator_attempts:Array<{locator:string;hits:number}>}>{
  if(!isWebDiscoveryEnabled()){
    return {items:[],locator_attempts:[],attempt:{provider:'WEB_DISCOVERY',queries_or_urls:[],reachable:false,hits:0,matched_identity:false,reason:'web discovery disabled by LEXICORE_WEB_DISCOVERY'}};
  }

  const locatorAttempts:Array<{locator:string;hits:number}>=[];
  const collected:WebDiscoveryHit[]=[];

  const ddg=await duckduckgoOfficialSearch(query,8);
  locatorAttempts.push({locator:'duckduckgo',hits:ddg.length}); collected.push(...ddg);

  const bing=await bingOfficialSearch(query,8);
  locatorAttempts.push({locator:'bing',hits:bing.length}); collected.push(...bing);

  const kem=await jdihKemenkumSearch(query,8);
  locatorAttempts.push({locator:'jdih-kemenkum',hits:kem.length}); collected.push(...kem);

  const seenUrl=new Set<string>();
  const uniqueHits=collected.filter(h=>{
    if(seenUrl.has(h.url)) return false;
    seenUrl.add(h.url); return true;
  });

  const items:ResolvedExactCandidate[]=[];
  let reachable=false;
  for(const hit of uniqueHits.slice(0,16)){
    const normalizedHitUrl=normalizeManualOfficialUrl(hit.url);
    if(!isOfficialLegalDomain(normalizedHitUrl)) continue;

    // Search engines may point directly to an official PDF. In that case we
    // can verify exact citation identity from the official resource URL before
    // trying to treat the binary as HTML.
    if(isPdfLikeUrl(normalizedHitUrl)){
      const urlId=inferInstrumentIdentityFromOfficialUrl(normalizedHitUrl);
      if(
        urlId.number&&urlId.year&&urlId.instrument_family&&
        String(urlId.number).trim()===String(identity.number).trim()&&
        Number(urlId.year)===Number(identity.year)&&
        urlId.instrument_family===identity.instrument_family
      ){
        items.push({
          title:urlId.canonical_title||hit.title,
          url:normalizedHitUrl,
          source_domain:new URL(normalizedHitUrl).hostname,
          provider:'WEB_DISCOVERY',
          instrument_type:urlId.instrument_type,
          number:urlId.number,
          year:urlId.year,
          excerpt:'Official PDF resource located and identity-verified from official URL.',
        });
        reachable=true;
        if(items.length>=3) break;
      }
      continue;
    }

    const detail=await fetchText(normalizedHitUrl,8000);
    if(!detail.ok) continue;
    reachable=true;
    if(!isOfficialLegalDomain(detail.finalUrl)) continue;

    let title=''; let excerpt=''; let effective_status: string|undefined; let direct_official_links:string[]|undefined;
    try{
      const host=new URL(detail.finalUrl).hostname.toLowerCase();
      if(host==='peraturan.bpk.go.id'){
        const parsed=parseBpkDetail(detail.text);
        title=parsed.title||hit.title; excerpt=parsed.excerpt||'';
        effective_status=parsed.effective_status||undefined;
        direct_official_links=parsed.direct_official_links;
      }else if(host==='jdihn.go.id'||host.endsWith('.jdihn.go.id')){
        const parsed=parseJdihnDetail(detail.text);
        title=parsed.title||hit.title; excerpt=parsed.excerpt||'';
        effective_status=parsed.effective_status;
      }else{
        const generic=parseGenericOfficialPage(detail.text,hit.title);
        title=generic.title; excerpt=generic.excerpt;
      }
    }catch{
      const generic=parseGenericOfficialPage(detail.text,hit.title);
      title=generic.title; excerpt=generic.excerpt;
    }

    const identityText=`${title} ${excerpt.slice(0,1200)}`;
    if(!exactIdentityMatches(identity,identityText)) continue;
    const id=inferInstrumentIdentity(identityText) as any;

    items.push({
      title:title||hit.title,url:detail.finalUrl,source_domain:new URL(detail.finalUrl).hostname,
      provider:'WEB_DISCOVERY',instrument_type:id.instrument_type||identity.instrument_type,
      number:id.number||identity.number,year:id.year||identity.year,
      effective_status,direct_official_links,excerpt,
    });
    if(items.length>=3) break;
  }

  const unique=dedupeExactResolved(items);
  return {items:unique,locator_attempts:locatorAttempts,attempt:{
    provider:'WEB_DISCOVERY',
    queries_or_urls:locatorAttempts.map(a=>`${a.locator}(${a.hits})`),
    reachable:reachable||collected.length>0,
    hits:unique.length,matched_identity:unique.length>0,
    reason:unique.length
      ? `strict identity matched through official web locator (${locatorAttempts.map(a=>`${a.locator}:${a.hits}`).join('|')})`
      : `all locators exhausted; no official .go.id page passed strict family/number/year identity (${locatorAttempts.map(a=>`${a.locator}:${a.hits}`).join('|')})`,
  }};
}

interface ExactResolutionOptions {
  skipJdihn?: boolean;
  skipWebDiscovery?: boolean;
}

async function resolveExactCitation(
  query:string,
  identity:ParsedQueryIdentity,
  options?:ExactResolutionOptions,
):Promise<ExactResolutionResult>{
  if(!identity.exact||!identity.number||!identity.year||!identity.instrument_family){
    return {resolved:[],attempts:[{provider:'BPK',queries_or_urls:[],reachable:false,hits:0,matched_identity:false,reason:'not-exact'}]};
  }

  const attempts:ExactProviderAttempt[]=[];

  const direct=await directPatternProvider(identity);
  attempts.push(direct.attempt);
  if(direct.items.length) return {resolved:direct.items,attempts};

  const bpk=await bpkExactProvider(query,identity);
  attempts.push(bpk.attempt);
  if(bpk.items.length) return {resolved:bpk.items,attempts};

  if(options?.skipJdihn){
    attempts.push({provider:'JDIHN',queries_or_urls:[],reachable:false,hits:0,matched_identity:false,reason:'skipped by caller option (canonical seed bounded resolution)'});
  } else {
    const jdihn=await jdihnExactProvider(query,identity);
    attempts.push(jdihn.attempt);
    if(jdihn.items.length) return {resolved:jdihn.items,attempts};
  }

  if(options?.skipWebDiscovery){
    attempts.push({provider:'WEB_DISCOVERY',queries_or_urls:[],reachable:false,hits:0,matched_identity:false,reason:'skipped by caller option (canonical seed bounded resolution)'});
    return {resolved:[],attempts};
  }

  const web=await resolveViaWebDiscovery(query,identity);
  attempts.push(web.attempt);
  return {resolved:dedupeExactResolved(web.items),attempts};
}

// ============================================================
// CANONICAL AUTHORITY SEED (V6.8.0)
// ------------------------------------------------------------
// Seeds are derived from local corpus identities. The official resolver
// verifies family/number/year; no regulation identity is hardcoded here.
// ============================================================
// ============================================================
// CANONICAL AUTHORITY CONTRACT NORMALIZATION (V6.8.1a)
// ------------------------------------------------------------
// Accept legacy string labels and CanonicalSeed objects.
// Compound labels joined by jo/jo. are split and parsed by
// parseQueryIdentity(). No regulation identity is hardcoded.
// ============================================================
interface CanonicalIdentity {
  instrument_family: string;
  number: string;
  year: number;
}

function parseCanonicalIdentities(label: string): CanonicalIdentity[] {
  const raw = String(label || '').trim();
  if (!raw) return [];

  const segments = raw
    .split(/\s+jo\.?\s+/i)
    .map(s => s.trim())
    .filter(Boolean);

  const out: CanonicalIdentity[] = [];
  const seen = new Set<string>();

  for (const seg of segments.length ? segments : [raw]) {
    const id = parseQueryIdentity(seg);
    if (!id.exact || !id.instrument_family || !id.number || !id.year) continue;

    const key = String(id.instrument_family) + '|' + String(id.number).trim() + '|' + String(Number(id.year));
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      instrument_family: String(id.instrument_family),
      number: String(id.number).trim(),
      year: Number(id.year),
    });
  }

  return out;
}

export function normalizeCanonicalAuthorities(
  values: Array<string | CanonicalSeed>,
): CanonicalSeed[] {
  const out: CanonicalSeed[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value === 'string') {
      const identities = parseCanonicalIdentities(value);
      for (const id of identities) {
        const key = id.instrument_family + '|' + id.number + '|' + String(id.year);
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
          localRegulationId: value,
          canonical_label: value,
          instrument_family: id.instrument_family,
          number: id.number,
          year: id.year,
        });
      }
      continue;
    }

    if (!value || typeof value !== 'object') continue;
    if (!value.instrument_family || !value.number || !value.year) continue;

    const key = String(value.instrument_family) + '|' + String(value.number).trim() + '|' + String(value.year);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      localRegulationId: value.localRegulationId || value.canonical_label || '',
      canonical_label: value.canonical_label || '',
      instrument_family: String(value.instrument_family),
      number: String(value.number).trim(),
      year: Number(value.year),
    });
  }

  return out.slice(0, CANONICAL_SEED_MAX);
}
export interface CanonicalSeed {
  localRegulationId: string;
  canonical_label: string;
  instrument_family: string;
  number: string;
  year: number;
}

interface CanonicalSeedResolution {
  candidates: OfficialLawCandidate[];
  attempts: Array<{ seed: CanonicalSeed; attempts: ExactProviderAttempt[] }>;
}

const CANONICAL_SEED_MAX = 6;
const CANONICAL_SEED_BUDGET_MS = 45000;

async function resolveCanonicalSeeds(
  mode: RegulatoryMode,
  seeds: CanonicalSeed[],
  tempusYear?: number,
): Promise<CanonicalSeedResolution> {
  if(mode==='offline' || !seeds.length) return {candidates:[],attempts:[]};

  const candidates:OfficialLawCandidate[]=[];
  const attempts:Array<{seed:CanonicalSeed;attempts:ExactProviderAttempt[]}>=[];
  const seen=new Set<string>();
  const started=Date.now();

  for(const seed of seeds.slice(0,CANONICAL_SEED_MAX)){
    if(Date.now()-started>CANONICAL_SEED_BUDGET_MS){
      attempts.push({seed,attempts:[{provider:'BPK',queries_or_urls:[],reachable:false,hits:0,matched_identity:false,reason:'skipped: canonical seed resolution budget exhausted'}]});
      continue;
    }

    const dedupKey=`${seed.instrument_family}|${seed.number}|${seed.year}`;
    if(seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const query=`${seed.instrument_family} Nomor ${seed.number} Tahun ${seed.year}`;
    const identity:ParsedQueryIdentity={
      instrument_family:seed.instrument_family,
      instrument_type:seed.instrument_family,
      number:seed.number,
      year:seed.year,
      exact:true,
    };

    const result=await resolveExactCitation(query,identity,{
      skipJdihn:true,
      skipWebDiscovery:true,
    });
    attempts.push({seed,attempts:result.attempts});

    for(const r of result.resolved){
      candidates.push({
        provider: providerForOfficialDomain(r.source_domain),
        query,
        title: r.title,
        url: r.url,
        source_domain: r.source_domain,
        status: 'IDENTITY_VERIFIED',
        instrument_type: r.instrument_type,
        number: r.number,
        year: r.year,
        effective_status: r.effective_status,
        direct_official_links: r.direct_official_links,
        excerpt: r.excerpt,
        fetched_at: new Date().toISOString(),
        tempus_status: inferTempusStatus(r.year, tempusYear),
        identity_match: 'EXACT',
        query_kind: 'EXACT_CITATION',
        source_origin: 'AUTO',
        material_nexus_score: 100,
        material_nexus_status: 'NOT_REQUIRED',
        hierarchy_status: 'ALLOWED',
        verification_reasons: [
          `canonical seed derived from local corpus (${seed.localRegulationId})`,
          `exact identity resolved via ${r.provider}`,
          `strict family/number/year identity match`,
        ],
      });
    }
  }

  return {candidates,attempts};
}
function parseBpkSearch(html: string, query: string, limit: number): Array<{ title: string; url: string; score: number; identity_match:'EXACT'|'TOPICAL' }> {
  const links: Array<{ title: string; url: string; score: number; identity_match:'EXACT'|'TOPICAL' }> = [];
  const qid=parseQueryIdentity(query);
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let ordinal=0;
  for (const m of html.matchAll(re)) {
    const href=m[1], title=cleanText(m[2]); if(!title||!/\/Details\//i.test(href)) continue;
    const url=href.startsWith('http')?href:`https://peraturan.bpk.go.id${href.startsWith('/')?'':'/'}${href}`;
    if(qid.exact){
      const compat=identityCompatible(query,title); if(!compat.ok) continue;
      links.push({title,url,score:compat.score+( /Tahun\s+\d{4}/i.test(title)?2:0),identity_match:'EXACT'});
    } else {
      // For topical discovery do not over-filter on the anchor title. BPK search often puts the material term in the abstract/detail, not in the title.
      const score=overlapScore(query,title) + Math.max(0,8-ordinal)*0.1;
      links.push({title,url,score,identity_match:'TOPICAL'});
    }
    ordinal++;
  }
  const seen=new Set<string>(); return links.sort((a,b)=>b.score-a.score).filter(x=>{if(seen.has(x.url))return false;seen.add(x.url);return true;}).slice(0,limit);
}
function parseBpkDetail(html: string) {
  const text=cleanText(html);
  const htmlTitle=cleanText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
  const heading=cleanText((html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)||[])[1]||'');
  const identityPattern=/((?:Peraturan Pemerintah Pengganti Undang-Undang|Perppu|Undang-Undang|UU|Peraturan Pemerintah|PP|Peraturan Presiden|Perpres|Peraturan Menteri|Peraturan DKPP|Peraturan KPU|PKPU|Peraturan Bawaslu|Peraturan Daerah|PERDA|Peraturan Bupati|PERBUP|Peraturan Walikota|PERWALI)[^.]{0,240}?(?:Nomor|No\.?)\s*[:]?\s*[0-9A-Za-z./-]+\s+Tahun\s+\d{4}[^.]{0,220})/i;
  const titleMatch=(heading.match(identityPattern)||htmlTitle.match(identityPattern)||text.match(identityPattern));
  const statusMatch=text.match(/Status\s*[:\-]?\s*(Berlaku|Tidak Berlaku|Dicabut|Diubah|Mencabut|Mengubah)/i);
  const directLinks=uniq([...(html.match(/https?:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]*jdih[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]*/gi)||[])]).slice(0,6);
  const title=cleanText(titleMatch?.[1]||''); const identity=inferInstrumentIdentity(title||text.slice(0,900));
  return {title,effective_status:statusMatch?.[1]||'',direct_official_links:directLinks,excerpt:text.slice(0,2200),...identity};
}
export function inferTempusYearFromCase(text: string): number | undefined {
  const now=new Date().getFullYear();
  const sentences=String(text||'').replace(/\s+/g,' ').split(/(?<=[.!?;:])\s+/).filter(Boolean);
  const event=/meninggal|wafat|menikah|lahir|ditandatangani|diterbitkan|ditetapkan|dikirim|membayar|menyerahkan|menguasai|merusak|menghilangkan|mengalihkan|menjual|membeli|somasi|jatuh tempo|phk|ditangkap|ditahan|disita|diputus|mengadili|terjadi|melakukan/i;
  const citation=/undang[- ]undang|peraturan|pasal|nomor\s+\d+\s+tahun/i;
  const weighted=new Map<number,number>();
  for(const sentence of sentences){
    const years=(sentence.match(/\b(?:19|20)\d{2}\b/g)||[]).map(Number).filter(y=>y>=1945&&y<=now);
    if(!years.length) continue;
    const isEvent=event.test(sentence); const isCitation=citation.test(sentence);
    const weight=isEvent&&!isCitation?5:isEvent?2:isCitation?-1:1;
    for(const y of years) weighted.set(y,(weighted.get(y)||0)+weight);
  }
  const ranked=[...weighted.entries()].filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  return ranked[0]?.[0];
}
export function buildOfficialLawQueries(input: {
  title: string;
  domain: string;
  text: string;
  explicitLawCitations?: string[];
  issues?: Array<{ id?: string; issue?: string; question?: string; query_terms?: string[] }>;
}): string[] {
  const quoted = (input.explicitLawCitations || []).map(cleanText).filter(Boolean).slice(0, 8);

  // Query generation is delegated entirely to the ontology layer, which
  // performs bounded decomposition on real token count. The previous
  // "issueQueries" branch joined every query_term into a single long string
  // (e.g. 15+ tokens), which BPK Search cannot match as a lexical phrase and
  // which overwhelmed the search budget with unproductive queries. Removing
  // it lets the decomposed ontology queries drive discovery; explicit
  // citations and title-based fallback remain.
  const ontologyQueries = officialQueriesForContext(`${input.domain} ${input.text.slice(0, 28000)}`);

  const issueConceptQueries=(input.issues||[]).map(issue=>{
    const semantic=uniq([
      ...((issue.query_terms||[]).map(cleanText).filter(Boolean)),
      ...tokens(cleanText(issue.question||issue.issue||'')),
    ]).filter(x=>x.length>=4);
    return semantic.slice(0,6).join(' ');
  }).filter(q=>q.length>=6 && tokens(q).length>=2).slice(0,6);

  const genericTitle = /^(case analysis|analisis perkara hukum|analisis kasus)$/i.test(cleanText(input.title));
  const titleQuery = genericTitle ? '' : cleanText(`${input.title} ${input.domain}`);
  const queries = [...quoted, ...ontologyQueries, ...issueConceptQueries, titleQuery].filter(x => x.length >= 6);

  if (!ontologyQueries.length && !quoted.length) {
    const fallback = lexicalFallbackQuery(input.domain, input.text.slice(0, 18000));
    if (fallback.length >= 6) queries.push(fallback);
  }

  return uniq(queries).slice(0, 20);
}



export interface AuthorityProviderExecutionPlan {
  regulation_queries: string[];
  judicial_product_queries: string[];
  case_law_queries: string[];
  total_query_slots: number;
}

function spreadQuerySelection(queries:string[],count:number):string[]{
  const xs=uniq((queries||[]).map(cleanText).filter(Boolean));
  if(xs.length<=count) return xs;
  if(count<=1) return xs.slice(0,1);
  const out:string[]=[];
  for(let i=0;i<count;i++){
    const idx=Math.round(i*(xs.length-1)/(count-1));
    if(xs[idx]&&!out.includes(xs[idx])) out.push(xs[idx]);
  }
  return out;
}

function stripJudicialSearchDecorators(raw:string):string{
  return cleanText(raw)
    .replace(/\b(?:SEMA|PERMA)\b/gi,' ')
    .replace(/\brumusan\s+kamar\b/gi,' ')
    .replace(/\bputusan(?:\s+Mahkamah\s+Agung)?\b/gi,' ')
    .replace(/\bMahkamah\s+Agung\b/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function judicialProductQuery(base:string,index=0):string{
  const q=stripJudicialSearchDecorators(base);
  const hint=index%3===0?'SEMA':index%3===1?'PERMA':'rumusan kamar';
  return cleanText(`${q} ${hint}`);
}
function caseLawQuery(base:string):string{
  const q=stripJudicialSearchDecorators(base);
  return cleanText(`${q} putusan Mahkamah Agung`);
}

/**
 * Provider-aware bounded network plan. The previous runtime spent the entire first
 * eight slots on one regulation provider. V7.0.2 preserves regulation-first
 * retrieval while reserving bounded slots for judicial products and case law.
 * No case identity, doctrine, regulation number, or party name is hardcoded here.
 *
 * V7.0.2.9: reserve up to 2 of the 6 regulation slots for the domain's named
 * foundational codified instrument(s) (e.g. KUHPerdata), when the ontology has
 * one for the classified domain. Without a reserved slot, spreadQuerySelection's
 * even-spacing over up to 20 generic ontology queries can (and empirically did:
 * see V7.0.2.8 operational-readiness audit, JDIH_BPK 0/12 candidates accepted)
 * drop the single most likely-to-succeed query — a plain, undiluted search for
 * the controlling code by name is a much stronger topical/identity match than
 * courtroom-language phrases against modern regulation titles that rarely
 * repeat them verbatim.
 */
export function buildAuthorityProviderPlan(queries:string[],mode:RegulatoryMode='hybrid',coreInstrumentQueries:string[]=[]):AuthorityProviderExecutionPlan{
  const regulationBudget=6;
  const judicialProductBudget=2;
  const caseLawBudget=2;
  const reservedCore=uniq((coreInstrumentQueries||[]).map(cleanText).filter(x=>x.length>=6)).slice(0,2);
  const remainingBudget=Math.max(1,regulationBudget-reservedCore.length);
  const generalQueries=spreadQuerySelection((queries||[]).filter(q=>!reservedCore.includes(q)),remainingBudget);
  const regulation_queries=uniq([...reservedCore,...generalQueries]).slice(0,regulationBudget);
  const judicial_product_queries=spreadQuerySelection(queries,judicialProductBudget).map((q,i)=>judicialProductQuery(q,i));
  const case_law_queries=spreadQuerySelection(queries,caseLawBudget).map(caseLawQuery);
  return {regulation_queries,judicial_product_queries,case_law_queries,total_query_slots:regulation_queries.length+judicial_product_queries.length+case_law_queries.length};
}

async function discoverJudicialProviderCandidates(input:{
  provider:'JDIH_MA'|'PUTUSAN_MA';
  domain:string;
  caseText:string;
  queries:string[];
  tempusYear?:number;
  maxCandidates:number;
}):Promise<{candidates:OfficialLawCandidate[];attempts:number;reachable:number;found:number;detail_fetches:number;detail_failures:number;identity_rejected:number;topical_rejected:number;accepted:number;rejected:number;search_diagnostics:Array<Record<string,unknown>>}>{
  const domain=input.provider==='JDIH_MA'?'jdih.mahkamahagung.go.id':'putusan3.mahkamahagung.go.id';
  const candidates:OfficialLawCandidate[]=[]; const seen=new Set<string>();
  const search_diagnostics:Array<Record<string,unknown>>=[];
  let attempts=0,reachable=0,found=0,detail_fetches=0,detail_failures=0,identity_rejected=0,topical_rejected=0,rejected=0;
  for(const query of input.queries){
    attempts++;
    const search=await searchOfficialDomain(query,domain,6);
    const hits=search.hits;
    if(search.reachable) reachable++;
    found+=hits.length;
    search_diagnostics.push({query,provider:input.provider,reachable:search.reachable,access_state:search.access_state,strategy:search.strategy,hits:hits.length,attempts:search.attempts});
    for(const hit of hits.slice(0,4)){
      if(seen.has(hit.url)) continue; seen.add(hit.url);
      detail_fetches++;
      const detail=await fetchText(hit.url,8000);
      if(!detail.ok){ detail_failures++; continue; }
      let host=''; try{host=new URL(detail.finalUrl).hostname.toLowerCase();}catch{continue;}
      const viaJdihn=hit.locator.startsWith('jdihn:') && (host==='jdihn.go.id'||host.endsWith('.jdihn.go.id'));
      if(host!==domain && !viaJdihn) continue;
      const generic=viaJdihn?parseJdihnDetail(detail.text):parseGenericOfficialPage(detail.text,hit.title);
      const text=`${generic.title} ${hit.context||''} ${generic.excerpt}`;
      const judicial=inferJudicialAuthorityIdentity(text,detail.finalUrl);
      if(!judicial){identity_rejected++;rejected++;continue;}
      if(input.provider==='JDIH_MA' && judicial.authority_class!=='JUDICIAL_PRODUCT'){identity_rejected++;rejected++;continue;}
      if(input.provider==='PUTUSAN_MA' && !['DECISION','JUDICIAL_PRODUCT'].includes(judicial.authority_class)){identity_rejected++;rejected++;continue;}
      const relevanceQuery=stripJudicialSearchDecorators(query);
      const topical=topicalCandidateAccepts(relevanceQuery,input.domain,generic.title,text,judicial.instrument_type,input.caseText);
      if(!topical.ok){topical_rejected++;rejected++;continue;}
      const year=judicial.year;
      const candidate:OfficialLawCandidate={
        provider:input.provider,
        query,
        title:generic.title||hit.title,
        url:detail.finalUrl,
        source_domain:host,
        status:'IDENTITY_VERIFIED',
        instrument_type:judicial.instrument_type,
        number:judicial.number,
        year,
        excerpt:generic.excerpt,
        fetched_at:new Date().toISOString(),
        tempus_status:inferAuthorityTempusStatus(year,input.tempusYear,judicial.authority_class),
        identity_match:'TOPICAL',
        query_kind:'TOPICAL_DISCOVERY',
        source_origin:'AUTO',
        material_nexus_score:topical.score,
        material_nexus_status:'VERIFIED',
        hierarchy_status:'ALLOWED',
        authority_class:judicial.authority_class,
        judicial_product_type:judicial.judicial_product_type,
        decision_number:judicial.decision_number,
        court:judicial.court,
        decision_date:judicial.decision_date,
        source_tier:viaJdihn?'SECONDARY_OFFICIAL':'PRIMARY_OFFICIAL',
        verification_state:'VERIFIED_OFFICIAL',
        discovery_context:cleanText(hit.context||'').slice(0,900)||undefined,
        verification_reasons:[
          `official judicial source: ${host}`,
          ...(viaJdihn?['official JDIHN aggregator fallback; issuing authority must be professionally verified']:[]),
          ...(detail.escalated?['detail page required browser-header escalation past WAF UA block']:[]),
          `material nexus score=${topical.score}`,
          judicial.authority_class==='DECISION'?'decision identity parsed from official page':'judicial product identity parsed from official page',
          ...(year&&input.tempusYear&&year>input.tempusYear?['judicial authority post-dates material event: temporal/procedural applicability requires professional verification']:[]),
        ],
      };
      candidates.push(candidate);
      if(candidates.length>=input.maxCandidates) break;
    }
    if(candidates.length>=input.maxCandidates) break;
  }
  return {candidates,attempts,reachable,found,detail_fetches,detail_failures,identity_rejected,topical_rejected,accepted:candidates.length,rejected,search_diagnostics};
}

async function discoverAutoOfficialLaw(input: { mode: RegulatoryMode; queries: string[]; tempusYear?: number; maxCandidates?: number; domain?: string; caseText?: string }): Promise<OfficialLawRetrievalResult> {
  if(input.mode==='offline') return {mode:input.mode,queries:[],candidates:[],providers:[{name:'JDIH_BPK',status:'DISABLED_LOCAL_MODE',query_count:0}],notes:['Mode lokal: tidak ada pencarian online.']};
  const maxCandidates=Math.max(3,Math.min(16,input.maxCandidates||(input.mode==='online'?12:8)));
  const coreInstrumentQueries=coreInstrumentQueriesForContext(`${input.domain||''} ${(input.caseText||'').slice(0,6000)}`);
  const providerPlan=buildAuthorityProviderPlan(input.queries,input.mode,coreInstrumentQueries);

  // Verification depth is intentionally larger than the final output cap so
  // strict topical policy has enough diverse material to evaluate.
  const verificationDepth=16;
  const maxPerQuery=2;

  const found:Array<{title:string;url:string;query:string;score:number;identity_match:'EXACT'|'TOPICAL'}>=[];
  let reachableSearches=0;

  // TEMPORARY P0 DIAGNOSTIC: acceptance/rejection semantics below are unchanged.
  // Remove after one real run identifies why the final candidate array is empty.
  const searchDiagnostics:Array<Record<string,unknown>>=[];
  const candidateDiagnostics:Array<Record<string,unknown>>=[];

  const searchOutcomes=await runWithConcurrency(providerPlan.regulation_queries,4,async(query)=>{
    const searchUrl=`https://peraturan.bpk.go.id/Search?keywords=${encodeURIComponent(query)}`;
    const res=await fetchText(searchUrl,9000);
    const links=res.ok?parseBpkSearch(res.text,query,8):[];
    const firstHrefMatch=res.text.match(/href=["']([^"']*\/Details\/[^"']*)["']/i);
    return {query,res,links,firstHrefMatch};
  });
  for(const {query,res,links,firstHrefMatch} of searchOutcomes){
    searchDiagnostics.push({
      query:query.slice(0,120),
      fetch_ok:res.ok,
      http_status:res.status,
      error:res.error||'',
      final_url:res.finalUrl.slice(0,180),
      html_length:res.text.length,
      details_href_found:Boolean(firstHrefMatch),
      first_href_sample:firstHrefMatch?.[1]?.slice(0,180)||'',
      links_parsed:links.length,
    });
    if(!res.ok)continue;
    reachableSearches++;
    for(const x of links) found.push({...x,query});
  }

  // ============================================================
  // 2. PER-QUERY DEDUP + ROUND-ROBIN DIVERSITY SELECTION
  // ============================================================
  // Keep the best score for a URL INSIDE each query first. Do not globally
  // collapse query membership here: the same official URL may legitimately be
  // discovered by several issue-driven queries, and global dedup at this stage
  // can erase query diversity before selection.
  const byQueryMap=new Map<string,Map<string,typeof found[number]>>();
  for(const x of found){
    if(!byQueryMap.has(x.query)) byQueryMap.set(x.query,new Map());
    const qMap=byQueryMap.get(x.query)!;
    const existing=qMap.get(x.url);
    if(!existing || x.score>existing.score) qMap.set(x.url,x);
  }

  const byQuery=new Map<string,Array<typeof found[number]>>();
  for(const [q,qMap] of byQueryMap.entries()){
    byQuery.set(q,[...qMap.values()].sort((a,b)=>b.score-a.score));
  }

  // Preserve the caller's query priority/order instead of relying on incidental
  // Map insertion after parsing. Queries with no links simply contribute no slot.
  const queryOrder=providerPlan.regulation_queries.filter(q=>(byQuery.get(q)?.length||0)>0);
  const selected:Array<typeof found[number]>=[];
  const seenUrls=new Set<string>();
  const perQueryCount=new Map<string,number>();

  let round=0;
  let addedInRound=true;
  while(selected.length<verificationDepth && addedInRound){
    addedInRound=false;
    for(const q of queryOrder){
      if(selected.length>=verificationDepth) break;
      const current=perQueryCount.get(q)||0;
      if(current>=maxPerQuery) continue;

      const arr=byQuery.get(q)!;

      // Advance within the query until an URL not already selected globally is
      // found. This preserves the query's opportunity even when result sets overlap.
      let idx=round;
      while(idx<arr.length && seenUrls.has(arr[idx].url)) idx++;
      if(idx>=arr.length) continue;

      const candidate=arr[idx];
      selected.push(candidate);
      seenUrls.add(candidate.url);
      perQueryCount.set(q,current+1);
      addedInRound=true;
    }
    round++;
  }

  const perQuerySelected=queryOrder.map(q=>{
    const arr=byQuery.get(q)!;
    return {
      query:q,
      selected:selected.filter(s=>s.query===q).length,
      available:arr.length,
    };
  });

  const candidates:OfficialLawCandidate[]=[];

  const detailFetches=await runWithConcurrency(selected,4,async(item)=>({item,detail:await fetchText(item.url,9000)}));
  for(const {item,detail} of detailFetches){
    if(!detail.ok){
      const id=inferInstrumentIdentity(item.title) as any;
      candidateDiagnostics.push({stage:'detail_fetch',result:'UNREACHABLE',query:item.query.slice(0,100),title:item.title.slice(0,140),status:detail.status,error:detail.error||''});
      candidates.push({provider:'JDIH_BPK',query:item.query,title:item.title,url:item.url,source_domain:'peraturan.bpk.go.id',status:'UNREACHABLE',...id,fetched_at:new Date().toISOString(),tempus_status:inferTempusStatus(id.year,input.tempusYear),identity_match:item.identity_match,source_origin:'AUTO'});
      continue;
    }
    const parsed=parseBpkDetail(detail.text);
    const title=parsed.title||item.title;
    const fullText=`${title} ${parsed.excerpt}`;
    const qid=parseQueryIdentity(item.query);
    const compat=identityCompatible(item.query,fullText);

    // Exact citations still require strict identity matching.
    // Topical discovery must NOT be pre-rejected by the coarse lexical
    // identityCompatible(score>=4) gate; the richer topical policy below
    // already enforces hierarchy + material nexus + independent support.
    if(qid.exact && !compat.ok){
      candidateDiagnostics.push({stage:'identity_compatible',result:'REJECTED',query:item.query.slice(0,100),title:title.slice(0,140),reason:'exact identityCompatible=false'});
      continue;
    }

    const id=inferInstrumentIdentity(title) as any;
    const identityVerified=Boolean(qid.exact && id.year&&id.number&&compat.ok&&compat.kind==='EXACT');
    if(!identityVerified){
      const topical=topicalCandidateAccepts(item.query,input.domain,title,fullText,id.instrument_type,input.caseText,coreInstrumentQueries);
      if(!topical.ok){
        candidateDiagnostics.push({stage:'topical_policy',result:'REJECTED',query:item.query.slice(0,100),title:title.slice(0,140),reasons:topical.reasons,score:topical.score});
        continue;
      }
      if(!id.number || !id.year){
        candidateDiagnostics.push({stage:'instrument_identity',result:'REJECTED',query:item.query.slice(0,100),title:title.slice(0,140),reason:'missing instrument number/year after topical acceptance'});
        continue;
      }
      candidateDiagnostics.push({stage:'accepted',result:'TOPICAL',query:item.query.slice(0,100),title:title.slice(0,140),score:topical.score,number:id.number,year:id.year});
      candidates.push({provider:'JDIH_BPK',query:item.query,title,url:detail.finalUrl,source_domain:'peraturan.bpk.go.id',status:'IDENTITY_VERIFIED',instrument_type:id.instrument_type,number:id.number,year:id.year,effective_status:parsed.effective_status||undefined,direct_official_links:parsed.direct_official_links,excerpt:parsed.excerpt,fetched_at:new Date().toISOString(),tempus_status:inferTempusStatus(id.year,input.tempusYear),identity_match:'TOPICAL',query_kind:'TOPICAL_DISCOVERY',material_nexus_score:topical.score,material_nexus_status:'VERIFIED',hierarchy_status:'ALLOWED',source_origin:'AUTO',verification_reasons:[`material nexus score=${topical.score}`]});
      continue;
    }
    candidateDiagnostics.push({stage:'accepted',result:'EXACT',query:item.query.slice(0,100),title:title.slice(0,140),number:id.number,year:id.year});
    candidates.push({provider:'JDIH_BPK',query:item.query,title,url:detail.finalUrl,source_domain:'peraturan.bpk.go.id',status:'IDENTITY_VERIFIED',instrument_type:id.instrument_type,number:id.number,year:id.year,effective_status:parsed.effective_status||undefined,direct_official_links:parsed.direct_official_links,excerpt:parsed.excerpt,fetched_at:new Date().toISOString(),tempus_status:inferTempusStatus(id.year,input.tempusYear),identity_match:'EXACT',query_kind:'EXACT_CITATION',material_nexus_score:100,material_nexus_status:'NOT_REQUIRED',hierarchy_status:'ALLOWED',source_origin:'AUTO',verification_reasons:['exact authority/type/number/year identity match']});
  }


  // V7.0.2.8 FINAL: local-first official authority index. The index is a
  // versioned snapshot of official catalog metadata and is searched before any
  // live MA request. It prevents temporary provider bot-protection (403) from
  // collapsing judicial discovery while keeping verification state explicit.
  const indexedJudicialHits=searchOfficialAuthorityIndex({queries:providerPlan.judicial_product_queries,domain:input.domain,caseText:input.caseText,limit:4,authorityClass:'JUDICIAL_PRODUCT'});
  const indexedDecisionHits=searchOfficialAuthorityIndex({queries:providerPlan.case_law_queries,domain:input.domain,caseText:input.caseText,limit:4,authorityClass:'DECISION'});
  for(const hit of [...indexedJudicialHits,...indexedDecisionHits]){
    const e=hit.entry;
    candidates.push({
      provider:'OFFICIAL_INDEX',query:hit.query,title:e.title,url:e.official_url,source_domain:e.source_domain,status:'IDENTITY_VERIFIED',
      instrument_type:e.instrument_type,number:e.number,year:e.year,subject:e.subject,effective_status:e.effective_status,excerpt:e.subject,
      fetched_at:e.indexed_at,tempus_status:inferAuthorityTempusStatus(e.year,input.tempusYear,e.authority_class),identity_match:'TOPICAL',query_kind:'OFFICIAL_INDEX',source_origin:'AUTO',
      material_nexus_score:hit.score,material_nexus_status:'VERIFIED',hierarchy_status:'ALLOWED',authority_class:e.authority_class,judicial_product_type:e.judicial_product_type,
      decision_number:e.decision_number,court:e.court,source_tier:'PRIMARY_OFFICIAL',
      // V7.0.2.11: discovery_context previously embedded a "matched=<query-filtered
      // terms>" string, which is text derived from the search query rather than
      // the document itself — the exact category of self-reinforcement risk
      // caseAnalysis.ts's binding gate is meant to be independent of, even though
      // each individual term was itself present in the entry's own content.
      // Expose the entry's real, unfiltered keyword tags directly instead — the
      // same data, but never passed through a query-shaped filter first.
      discovery_context:'official catalog index snapshot',
      keywords:Array.isArray(e.keywords)?e.keywords:[],
      verification_state:'INDEXED_OFFICIAL',verification_reasons:[`official catalog snapshot ${e.indexed_at}`,`official source domain=${e.source_domain}`,`local-first material match score=${hit.score}`,'live detail verification remains professionally reviewable when provider blocks automated access'],
    });
  }

  const judicialAndCaseLaw=await Promise.all([
    discoverJudicialProviderCandidates({
      provider:'JDIH_MA',domain:input.domain||'',caseText:input.caseText||'',queries:providerPlan.judicial_product_queries,tempusYear:input.tempusYear,maxCandidates:3,
    }),
    discoverJudicialProviderCandidates({
      provider:'PUTUSAN_MA',domain:input.domain||'',caseText:input.caseText||'',queries:providerPlan.case_law_queries,tempusYear:input.tempusYear,maxCandidates:4,
    }),
  ]);
  const judicialProducts=judicialAndCaseLaw[0];
  const caseLaw=judicialAndCaseLaw[1];
  candidates.push(...judicialProducts.candidates,...caseLaw.candidates);

  const canonical=new Map<string,OfficialLawCandidate>();
  for(const c of candidates){
    const fam=instrumentFamily(c.instrument_type)||c.judicial_product_type||c.authority_class||'UNKNOWN';
    const key=c.authority_class==='DECISION'&&c.decision_number
      ? `DECISION|${normalize(c.decision_number)}|${normalize(c.court||'')}`
      : c.authority_class==='JUDICIAL_PRODUCT'&&c.number&&c.year
        ? `JUDICIAL_PRODUCT|${normalize(c.judicial_product_type||fam)}|${normalize(String(c.number))}|${c.year}`
        : `${fam}|${normalize(String(c.number||''))}|${c.year||0}|${normalize(c.title)}`;
    const current=canonical.get(key);
    const cVerified=c.verification_state==='VERIFIED_OFFICIAL'?1:0;
    const curVerified=current?.verification_state==='VERIFIED_OFFICIAL'?1:0;
    if(!current || (c.material_nexus_score||0)>(current.material_nexus_score||0) || ((c.material_nexus_score||0)===(current.material_nexus_score||0)&&cVerified>curVerified)) canonical.set(key,c);
  }
  const authorityClassRank=(c:OfficialLawCandidate)=>c.authority_class==='JUDICIAL_PRODUCT'?3:c.authority_class==='DECISION'?2:1;
  const finalCandidates=[...canonical.values()]
    .sort((a,b)=>((b.material_nexus_score||0)-(a.material_nexus_score||0)) || (authorityClassRank(b)-authorityClassRank(a)))
    .slice(0,maxCandidates);

  const searchAttempts=providerPlan.total_query_slots;
  const fetchFailures=searchDiagnostics.filter((d:any)=>d.fetch_ok===false).length;
  const noDetailLinkSearches=searchDiagnostics.filter((d:any)=>d.fetch_ok===true && Number(d.links_parsed||0)===0).length;
  const judicialSearchAttempts=judicialProducts.attempts+caseLaw.attempts;
  const judicialCandidates=judicialProducts.candidates.length+caseLaw.candidates.length;
  const candidateRejections=candidateDiagnostics.filter((d:any)=>d.result==='REJECTED').length;
  const rejectionStageCounts = candidateDiagnostics.reduce((acc:any,d:any)=>{
    if(d.result!=='REJECTED') return acc;
    const k=String(d.stage||'unknown');
    acc[k]=(acc[k]||0)+1;
    return acc;
  },{});
  const rejectionReasonCounts = candidateDiagnostics.reduce((acc:any,d:any)=>{
    if(d.result!=='REJECTED') return acc;
    const rs = Array.isArray(d.reasons) ? d.reasons : (d.reason ? [d.reason] : ['unknown']);
    for(const r of rs){
      const k=String(r);
      acc[k]=(acc[k]||0)+1;
    }
    return acc;
  },{});
  const bpkProviderStatus = !reachableSearches
    ? 'UNREACHABLE'
    : !found.length
      ? 'REACHABLE_NO_LINKS'
      : !candidates.some(c=>c.provider==='JDIH_BPK')
        ? 'REACHABLE_LINKS_REJECTED'
        : 'REACHABLE_CANDIDATES';
  const jdihMaStatus=judicialProviderRuntimeStatus(judicialProducts);
  const putusanMaStatus=judicialProviderRuntimeStatus(caseLaw);
  const indexStats=officialAuthorityIndexStats();
  const indexedCandidateCount=candidates.filter(c=>c.provider==='OFFICIAL_INDEX').length;
  const runtimeProviders=[
    {name:'OFFICIAL_INDEX',status:indexedCandidateCount?'REACHABLE_CANDIDATES':'INDEX_NO_MATCH',query_count:providerPlan.judicial_product_queries.length+providerPlan.case_law_queries.length},
    {name:'JDIH_BPK',status:bpkProviderStatus,query_count:providerPlan.regulation_queries.length},
    {name:'JDIH_MA',status:jdihMaStatus,query_count:providerPlan.judicial_product_queries.length},
    {name:'PUTUSAN_MA',status:putusanMaStatus,query_count:providerPlan.case_law_queries.length},
  ];
  const providerStatus=finalCandidates.length?'REACHABLE_CANDIDATES':aggregateProviderStatuses(runtimeProviders);

  const diagnostics={
    search_attempts:searchAttempts,
    reachable_searches:reachableSearches,
    found_links:found.length,
    selected_links:selected.length,
    candidate_rejections:candidateRejections,
    rejection_stage_counts:rejectionStageCounts,
    rejection_reason_counts:rejectionReasonCounts,
    per_query_selected:perQuerySelected,
    final_candidates:finalCandidates.length,
    fetch_failures:fetchFailures,
    no_detail_link_searches:noDetailLinkSearches,
    provider_plan:providerPlan,
    judicial_search_attempts:judicialSearchAttempts,
    judicial_candidates:judicialCandidates,
    official_index:{...indexStats,matched_candidates:indexedCandidateCount},
    jdih_ma:{attempts:judicialProducts.attempts,reachable:judicialProducts.reachable,found:judicialProducts.found,detail_fetches:judicialProducts.detail_fetches,detail_failures:judicialProducts.detail_failures,identity_rejected:judicialProducts.identity_rejected,topical_rejected:judicialProducts.topical_rejected,rejected:judicialProducts.rejected,candidates:judicialProducts.candidates.length},
    putusan_ma:{attempts:caseLaw.attempts,reachable:caseLaw.reachable,found:caseLaw.found,detail_fetches:caseLaw.detail_fetches,detail_failures:caseLaw.detail_failures,identity_rejected:caseLaw.identity_rejected,topical_rejected:caseLaw.topical_rejected,rejected:caseLaw.rejected,candidates:caseLaw.candidates.length},
    judicial_search_diagnostics:[...judicialProducts.search_diagnostics,...caseLaw.search_diagnostics],
    provider_status:providerStatus,
  };

  console.log('[LEXICORE:official-law:diagnostics]', JSON.stringify({
    mode:input.mode,
    query_count:input.queries.length,
    ...diagnostics,
    pre_canonical_candidates:candidates.length,
    search:searchDiagnostics,
    candidate_flow:candidateDiagnostics,
  }));

  const providerNote = providerStatus==='UNREACHABLE'
    ? 'Tidak ada provider official-law yang dapat dijangkau pada percobaan ini.'
    : providerStatus==='REACHABLE_BLOCKED'
      ? 'Provider resmi dapat dijangkau pada level HTTP tetapi direct automated access diblokir (mis. 401/403/429); fallback discovery tetap dicoba dan authority akhir tetap wajib berasal dari domain resmi.'
      : providerStatus==='REACHABLE_HTTP_ERROR'
        ? 'Provider resmi dapat dijangkau pada level HTTP tetapi mengembalikan error server/non-success; fallback discovery tetap dipertimbangkan.'
        : providerStatus==='REACHABLE_NO_LINKS'
          ? 'Sedikitnya satu provider resmi dapat dijangkau, tetapi tidak ada link kandidat yang berhasil ditemukan.'
          : providerStatus==='REACHABLE_LINKS_REJECTED'
            ? 'Provider resmi mengembalikan link kandidat, tetapi seluruh kandidat gugur pada identity/material-nexus/authority gate.'
            : 'Sedikitnya satu kandidat sumber resmi lolos pemeriksaan awal.';

  return {
    mode:input.mode,
    queries:input.queries,
    candidates:finalCandidates,
    providers:runtimeProviders,
    notes:[providerNote,'Judicial authority discovery aktif secara generik melalui JDIH Mahkamah Agung dan Direktori Putusan MA; kandidat tetap wajib lolos official-domain, identity-class, material-nexus, tempus, dan professional-verification gates.','Strict identity guard aktif. Exact citation wajib cocok family/authority/number/year; topical discovery wajib lolos hierarchy + material-nexus + independent concept support. Query lexical fallback hanya dipakai bila ontology tidak menghasilkan issue-driven query.'],
    diagnostics,
  };
}


function normalizeOfficialSourceStrategy(value:unknown):OfficialSourceStrategy{
  const v=String(value||'auto').toLowerCase();
  if(v==='manual') return 'manual';
  if(v==='manual_plus_auto'||v==='manual+auto'||v==='manual-auto') return 'manual_plus_auto';
  return 'auto';
}

function splitManualAuthorityInputs(values:unknown):string[]{
  const raw=Array.isArray(values)?values.join('\n'):String(values||'');
  return uniq(raw.split(/\r?\n|;/).map(cleanText).filter(x=>x.length>=4)).slice(0,20);
}

function unwrapKnownRedirectUrl(raw:string):string{
  try{
    const u=new URL(raw);
    const host=u.hostname.toLowerCase();

    // Google redirect links commonly wrap the actual target in ?url= or ?q=.
    // We only unwrap; the target still has to pass the official-domain gate.
    if((host==='google.com'||host==='www.google.com'||host.endsWith('.google.com')) && u.pathname==='/url'){
      const target=u.searchParams.get('url')||u.searchParams.get('q');
      if(target && /^https?:\/\//i.test(target)) return target;
    }

    return raw;
  }catch{return raw;}
}

function normalizeManualOfficialUrl(raw:string):string{
  let current=cleanText(raw);
  for(let i=0;i<3;i++){
    const next=unwrapKnownRedirectUrl(current);
    if(next===current) break;
    current=next;
  }
  return current;
}

function isSupportedOfficialUrl(raw:string):boolean{
  try{
    const normalized=normalizeManualOfficialUrl(raw);
    const u=new URL(normalized);
    return (u.protocol==='https:'||u.protocol==='http:') && isOfficialLegalDomain(normalized);
  }catch{return false;}
}

function isPdfLikeUrl(raw:string):boolean{
  try{
    const u=new URL(raw);
    return /\.pdf$/i.test(decodeURIComponent(u.pathname));
  }catch{return false;}
}

function inferInstrumentIdentityFromOfficialUrl(raw:string):{
  instrument_type?:string;
  instrument_family?:string;
  number?:string;
  year?:number;
  canonical_title?:string;
}{
  try{
    const u=new URL(raw);
    const decoded=decodeURIComponent(u.pathname).replace(/[+_]+/g,' ').replace(/\s+/g,' ').trim();
    const basename=(decoded.split('/').pop()||decoded).replace(/\.pdf$/i,'').trim();

    // First try the normal legal-title parser.
    const strict=inferInstrumentIdentity(basename) as any;
    if(strict.number&&strict.year){
      return {
        instrument_type:strict.instrument_type,
        instrument_family:strict.instrument_family||instrumentFamily(strict.instrument_type),
        number:String(strict.number),
        year:Number(strict.year),
        canonical_title:basename,
      };
    }

    // Official download filenames often abbreviate "Nomor" / "Tahun", e.g.
    // "PERDA 1 TH 2021.pdf". This is a generic filename parser, not a
    // regulation-specific exception.
    const relaxed=basename.match(
      /\b(UNDANG[- ]UNDANG|UU|PERPPU|PERATURAN\s+PEMERINTAH|PP|PERATURAN\s+PRESIDEN|PERPRES|PERATURAN\s+DAERAH|PERDA|PERATURAN\s+BUPATI|PERBUP|PERATURAN\s+WALI(?:KOTA)?|PERWALI|PERATURAN\s+MENTERI|PERMEN|SURAT\s+EDARAN\s+MAHKAMAH\s+AGUNG|SEMA|PERATURAN\s+MAHKAMAH\s+AGUNG|PERMA)\b[\s.-]*(?:(?:NO|NOMOR)\.?\s*)?([0-9A-Za-z./-]+)\s*(?:TH|TAHUN)\.?\s*(\d{4})\b/i
    );
    if(!relaxed) return {};

    const rawType=cleanText(relaxed[1]);
    const family=instrumentFamily(rawType);
    const number=cleanText(relaxed[2]);
    const year=Number(relaxed[3]);
    const label=family==='UU'?'Undang-Undang':
      family==='PERPPU'?'Peraturan Pemerintah Pengganti Undang-Undang':
      family==='PP'?'Peraturan Pemerintah':
      family==='PERPRES'?'Peraturan Presiden':
      family==='PERDA'?'Peraturan Daerah':
      family==='PERBUP'?'Peraturan Bupati':
      family==='PERWALI'?'Peraturan Wali Kota':
      family==='PERMEN'?'Peraturan Menteri':
      family==='SEMA'?'Surat Edaran Mahkamah Agung':
      family==='PERMA'?'Peraturan Mahkamah Agung':rawType;

    return {
      instrument_type:label,
      instrument_family:family,
      number,
      year,
      canonical_title:`${label} Nomor ${number} Tahun ${year}`,
    };
  }catch{return {};}
}

function manualCandidateFromOfficialPdfUrl(
  rawInput:string,
  finalUrl:string,
  tempusYear?:number,
):OfficialLawCandidate|undefined{
  const id=inferInstrumentIdentityFromOfficialUrl(finalUrl);
  if(!id.number||!id.year||!id.instrument_type) return undefined;

  const host=new URL(finalUrl).hostname.toLowerCase();
  return {
    provider:providerForOfficialDomain(host),
    query:rawInput,
    title:id.canonical_title||`${id.instrument_type} Nomor ${id.number} Tahun ${id.year}`,
    url:finalUrl,
    source_domain:host,
    status:'IDENTITY_VERIFIED',
    instrument_type:id.instrument_type,
    number:id.number,
    year:id.year,
    fetched_at:new Date().toISOString(),
    tempus_status:inferTempusStatus(id.year,tempusYear),
    identity_match:'EXACT',
    query_kind:'USER_DIRECT_URL',
    source_origin:'USER',
    material_nexus_score:100,
    material_nexus_status:'NOT_REQUIRED',
    hierarchy_status:'ALLOWED',
    verification_reasons:[
      'official PDF URL supplied/resolved by user',
      'official .go.id domain verified',
      'instrument family/number/year parsed from official resource filename',
    ],
  };
}

function manualCandidateFromExactResolved(raw:string,r:ResolvedExactCandidate,tempusYear?:number):OfficialLawCandidate|undefined{
  if(!r.number||!r.year) return undefined;
  return {
    provider:providerForOfficialDomain(r.source_domain),
    query:raw,title:r.title,url:r.url,source_domain:r.source_domain,status:'IDENTITY_VERIFIED',
    instrument_type:r.instrument_type,number:r.number,year:r.year,effective_status:r.effective_status,
    direct_official_links:r.direct_official_links,excerpt:r.excerpt,fetched_at:new Date().toISOString(),
    tempus_status:inferTempusStatus(r.year,tempusYear),identity_match:'EXACT',query_kind:'USER_EXACT_CITATION',source_origin:'USER',
    material_nexus_score:100,material_nexus_status:'NOT_REQUIRED',hierarchy_status:'ALLOWED',
    verification_reasons:[`user exact citation resolved online via ${r.provider}; strict family/number/year identity matched`,`official domain: ${r.source_domain}`]
  };
}

function manualCandidateFromParsed(raw:string,detailUrl:string,parsed:ReturnType<typeof parseBpkDetail>,tempusYear?:number,kind:'USER_EXACT_CITATION'|'USER_DIRECT_URL'='USER_EXACT_CITATION'):OfficialLawCandidate|undefined{
  const title=parsed.title||'';
  const id=inferInstrumentIdentity(title) as any;
  if(!id.number||!id.year) return undefined;
  return {
    provider:'JDIH_BPK',query:raw,title,url:detailUrl,source_domain:'peraturan.bpk.go.id',status:'IDENTITY_VERIFIED',
    instrument_type:id.instrument_type,number:id.number,year:id.year,effective_status:parsed.effective_status||undefined,
    direct_official_links:parsed.direct_official_links,excerpt:parsed.excerpt,fetched_at:new Date().toISOString(),
    tempus_status:inferTempusStatus(id.year,tempusYear),identity_match:'EXACT',query_kind:kind,source_origin:'USER',
    material_nexus_score:100,material_nexus_status:'NOT_REQUIRED',hierarchy_status:'ALLOWED',
    verification_reasons:[kind==='USER_DIRECT_URL'?'official URL supplied by user; official identity parsed from source':'user exact citation resolved online; family/number/year identity matched']
  };
}

async function resolveManualAuthority(raw:string,tempusYear?:number):Promise<ManualAuthorityResolution>{
  const value=cleanText(raw);
  if(/^https?:\/\//i.test(value)){
    const normalizedUrl=normalizeManualOfficialUrl(value);
    if(!isSupportedOfficialUrl(normalizedUrl)){
      return {
        input:value,kind:'URL',status:'UNSUPPORTED_SOURCE',
        message:normalizedUrl!==value
          ? 'Redirect berhasil dibuka, tetapi target bukan domain resmi pemerintah Indonesia (.go.id).'
          : 'URL harus berasal dari domain resmi pemerintah Indonesia (.go.id), atau redirect yang target akhirnya .go.id.'
      };
    }

    // Direct official PDF: verify the official target and parse legal identity
    // from the official resource filename. This supports BPK /Download/*.pdf
    // and equivalent official .go.id PDF resources without requiring an HTML
    // detail page first.
    if(isPdfLikeUrl(normalizedUrl)){
      const candidate=manualCandidateFromOfficialPdfUrl(value,normalizedUrl,tempusYear);
      if(candidate){
        const redirectNote=normalizedUrl!==value?' Redirect eksternal berhasil diurai ke target resmi.':'';
        return {
          input:value,kind:'URL',status:'RESOLVED',
          message:`PDF resmi berhasil diverifikasi dari URL sumber.${redirectNote}`,
          candidate,
        };
      }
      return {
        input:value,kind:'URL',status:'NOT_FOUND',
        message:'Target PDF berada pada domain resmi, tetapi identitas jenis/nomor/tahun tidak dapat diparsing dari resource resmi.'
      };
    }

    const detail=await fetchText(normalizedUrl,9000);
    if(!detail.ok) return {input:value,kind:'URL',status:'UNREACHABLE',message:`Sumber resmi tidak dapat dijangkau (HTTP ${detail.status||0}).`};

    const finalOfficial=normalizeManualOfficialUrl(detail.finalUrl);
    if(!isSupportedOfficialUrl(finalOfficial)){
      return {input:value,kind:'URL',status:'UNSUPPORTED_SOURCE',message:'Redirect akhir meninggalkan domain resmi pemerintah Indonesia (.go.id).'};
    }

    // Some official HTML endpoints redirect to a PDF download.
    if(isPdfLikeUrl(finalOfficial)){
      const candidate=manualCandidateFromOfficialPdfUrl(value,finalOfficial,tempusYear);
      if(candidate) return {input:value,kind:'URL',status:'RESOLVED',message:'Sumber resmi mengarah ke PDF dan identitas hukumnya berhasil diverifikasi.',candidate};
    }

    const host=new URL(finalOfficial).hostname.toLowerCase();
    if(host==='peraturan.bpk.go.id'){
      const parsed=parseBpkDetail(detail.text);
      const candidate=manualCandidateFromParsed(value,finalOfficial,parsed,tempusYear,'USER_DIRECT_URL');
      if(!candidate) return {input:value,kind:'URL',status:'NOT_FOUND',message:'Halaman resmi BPK dapat dijangkau tetapi identitas nomor/tahun tidak berhasil diparsing.'};
      return {input:value,kind:'URL',status:'RESOLVED',message:'URL resmi BPK berhasil diverifikasi secara online.',candidate};
    }

    if(host==='jdihn.go.id'||host.endsWith('.jdihn.go.id')){
      const parsed=parseJdihnDetail(detail.text);
      const id=inferInstrumentIdentity(`${parsed.title} ${parsed.instrument_type||''} Nomor ${parsed.number||''} Tahun ${parsed.year||''}`) as any;
      if(!id.number||!id.year) return {input:value,kind:'URL',status:'NOT_FOUND',message:'Halaman resmi JDIHN dapat dijangkau tetapi identitas nomor/tahun tidak berhasil diparsing.'};
      const candidate:OfficialLawCandidate={
        provider:'JDIHN',query:value,title:parsed.title,url:finalOfficial,source_domain:host,status:'IDENTITY_VERIFIED',
        instrument_type:parsed.instrument_type||id.instrument_type,number:parsed.number||id.number,year:parsed.year||id.year,
        effective_status:parsed.effective_status,excerpt:parsed.excerpt,fetched_at:new Date().toISOString(),
        tempus_status:inferTempusStatus(parsed.year||id.year,tempusYear),identity_match:'EXACT',query_kind:'USER_DIRECT_URL',source_origin:'USER',
        material_nexus_score:100,material_nexus_status:'NOT_REQUIRED',hierarchy_status:'ALLOWED',authority_class:'LEGISLATION',source_tier:'PRIMARY_OFFICIAL',
        verification_reasons:['official JDIHN URL supplied by user; official identity parsed from source']
      };
      return {input:value,kind:'URL',status:'RESOLVED',message:'URL resmi JDIHN berhasil diverifikasi secara online.',candidate};
    }

    if(host==='jdih.mahkamahagung.go.id'||host==='putusan3.mahkamahagung.go.id'){
      const generic=parseGenericOfficialPage(detail.text);
      const judicial=inferJudicialAuthorityIdentity(`${generic.title} ${generic.excerpt}`,finalOfficial);
      if(!judicial) return {input:value,kind:'URL',status:'NOT_FOUND',message:'Halaman resmi Mahkamah Agung dapat dijangkau, tetapi identitas produk yudisial/putusan tidak berhasil diparsing.'};
      const candidate:OfficialLawCandidate={
        provider:providerForOfficialDomain(host),query:value,title:generic.title,url:finalOfficial,source_domain:host,status:'IDENTITY_VERIFIED',
        instrument_type:judicial.instrument_type,number:judicial.number,year:judicial.year,excerpt:generic.excerpt,fetched_at:new Date().toISOString(),
        tempus_status:inferAuthorityTempusStatus(judicial.year,tempusYear,judicial.authority_class),identity_match:'EXACT',query_kind:'USER_DIRECT_URL',source_origin:'USER',
        material_nexus_score:100,material_nexus_status:'NOT_REQUIRED',hierarchy_status:'ALLOWED',authority_class:judicial.authority_class,
        judicial_product_type:judicial.judicial_product_type,decision_number:judicial.decision_number,court:judicial.court,decision_date:judicial.decision_date,source_tier:'PRIMARY_OFFICIAL',
        verification_reasons:['official Mahkamah Agung URL supplied by user; judicial identity parsed from official page']
      };
      return {input:value,kind:'URL',status:'RESOLVED',message:'URL resmi Mahkamah Agung berhasil diverifikasi secara online.',candidate};
    }

    return {input:value,kind:'URL',status:'UNSUPPORTED_SOURCE',message:'Domain .go.id valid, tetapi parser metadata HTML provider ini belum tersedia. Gunakan sitasi exact atau PDF resmi jika tersedia.'};
  }

  const qid=parseQueryIdentity(value);
  const kind:ManualAuthorityResolution['kind']=qid.exact?'EXACT_CITATION':'FREE_TEXT';

  if(qid.exact){
    const exact=await resolveExactCitation(value,qid);
    const first=exact.resolved[0];
    if(first){
      const candidate=manualCandidateFromExactResolved(value,first,tempusYear);
      if(candidate) return {input:value,kind,status:'RESOLVED',message:`Referensi pengguna berhasil diverifikasi ketat secara online melalui ${first.provider}.`,candidate,exact_attempts:exact.attempts};
    }
    const reachable=exact.attempts.some(a=>a.reachable);
    return {
      input:value,kind,status:reachable?'NOT_FOUND':'UNREACHABLE',
      message:reachable
        ? 'Seluruh provider resmi dan official web locator telah dicoba, tetapi tidak ditemukan kecocokan ketat family/nomor/tahun.'
        : 'Seluruh provider resmi yang tersedia tidak dapat dijangkau.',
      exact_attempts:exact.attempts,
    };
  }

  // Free text remains non-authoritative until the lawyer supplies an exact citation
  // or chooses a verified official URL. Use BPK only to surface candidate suggestions.
  const search=await fetchText(`https://peraturan.bpk.go.id/Search?keywords=${encodeURIComponent(value)}`,9000);
  if(!search.ok) return {input:value,kind,status:'UNREACHABLE',message:`Pencarian sumber resmi tidak dapat dijangkau (HTTP ${search.status||0}).`};
  const links=parseBpkSearch(search.text,value,12);
  if(!links.length) return {input:value,kind,status:'NOT_FOUND',message:'Tidak ditemukan kandidat detail pada sumber resmi.'};
  const alternatives:Array<{title:string;url:string}>=[];
  for(const link of links.slice(0,5)) alternatives.push({title:link.title,url:link.url});
  return {input:value,kind,status:'AMBIGUOUS',message:'Input belum memiliki nomor+tahun yang cukup untuk verifikasi identitas otomatis. Gunakan salah satu kandidat sebagai URL atau masukkan sitasi yang lebih lengkap.',alternatives};
}

async function resolveManualAuthorities(values:unknown,tempusYear?:number):Promise<{candidates:OfficialLawCandidate[];resolutions:ManualAuthorityResolution[]}>{
  const inputs=splitManualAuthorityInputs(values);
  const resolutions:ManualAuthorityResolution[]=[];
  const candidates:OfficialLawCandidate[]=[];
  for(const raw of inputs){
    const r=await resolveManualAuthority(raw,tempusYear);
    resolutions.push(r);
    if(r.status==='RESOLVED'&&r.candidate) candidates.push(r.candidate);
  }
  return {candidates,resolutions};
}

function candidateCanonicalKey(c:OfficialLawCandidate):string{
  if(c.authority_class==='DECISION' && c.decision_number) return `DECISION|${normalize(c.decision_number)}|${normalize(c.court||'')}`;
  const fam=instrumentFamily(c.instrument_type)||c.judicial_product_type||'UNKNOWN';
  return `${fam}|${normalize(String(c.number||''))}|${c.year||0}|${normalize(c.title)}`;
}

function judicialProviderRuntimeStatus(x:{candidates:OfficialLawCandidate[];reachable:number;found:number;search_diagnostics:Array<Record<string,unknown>>}):string{
  if(x.candidates.length) return 'REACHABLE_CANDIDATES';
  if(x.found) return 'REACHABLE_LINKS_REJECTED';
  const states=x.search_diagnostics.map(d=>String(d.access_state||''));
  if(states.some(s=>s==='REACHABLE_BLOCKED')) return 'REACHABLE_BLOCKED';
  if(states.some(s=>s==='REACHABLE_HTTP_ERROR')) return 'REACHABLE_HTTP_ERROR';
  if(x.reachable) return 'REACHABLE_NO_LINKS';
  return 'UNREACHABLE';
}

function aggregateProviderStatuses(providers:Array<{name:string;status:string;query_count:number}>|undefined):string{
  const ps=(providers||[]).map(p=>String(p.status||''));
  if(ps.some(s=>s==='REACHABLE_CANDIDATES')) return 'REACHABLE_CANDIDATES';
  if(ps.some(s=>s==='REACHABLE_LINKS_REJECTED')) return 'REACHABLE_LINKS_REJECTED';
  if(ps.some(s=>s==='REACHABLE_BLOCKED')) return 'REACHABLE_BLOCKED';
  if(ps.some(s=>s==='REACHABLE_HTTP_ERROR')) return 'REACHABLE_HTTP_ERROR';
  if(ps.some(s=>s==='REACHABLE_NO_LINKS'||s==='REACHABLE_NO_CANDIDATE')) return 'REACHABLE_NO_LINKS';
  if(ps.length && ps.every(s=>s==='UNREACHABLE')) return 'UNREACHABLE';
  return ps[0]||'REACHABLE_NO_CANDIDATE';
}

export interface OfficialProviderConnectivityProbe {
  provider:string;
  url:string;
  direct_ok:boolean;
  direct_status:number;
  direct_state:OfficialProviderAccessState;
  network_reachable:boolean;
  fallback_attempted:boolean;
  fallback_strategy:'DIRECT_OFFICIAL'|'JDIHN_AGGREGATOR'|'CACHE'|'DUCKDUCKGO_HTML'|'DUCKDUCKGO_LITE'|'BING_FALLBACK'|'EXHAUSTED'|'NONE';
  fallback_attempts?:FallbackDiscoveryDiagnostic[];
  fallback_hits:number;
  official_detail_ok:boolean;
  official_detail_status:number;
  usable:boolean;
  final_state:'USABLE_DIRECT'|'USABLE_VIA_OFFICIAL_AGGREGATOR'|'USABLE_VIA_FALLBACK'|'REACHABLE_BLOCKED'|'REACHABLE_HTTP_ERROR'|'NETWORK_UNREACHABLE'|'REACHABLE_NO_RESULTS';
  finalUrl:string;
  error?:string;
  header_escalated?:boolean;
}

export async function probeOfficialProviderConnectivity():Promise<OfficialProviderConnectivityProbe[]>{
  const out:OfficialProviderConnectivityProbe[]=[];
  const bpkUrl='https://peraturan.bpk.go.id/Search?keywords=undang-undang';
  const bpk=await fetchText(bpkUrl,12000);
  out.push({
    provider:'JDIH_BPK',url:bpkUrl,direct_ok:bpk.ok,direct_status:bpk.status,
    direct_state:bpk.ok?'REACHABLE_OK':bpk.access_state==='BLOCKED'?'REACHABLE_BLOCKED':bpk.access_state==='HTTP_ERROR'?'REACHABLE_HTTP_ERROR':'NETWORK_UNREACHABLE',
    network_reachable:bpk.reachable,fallback_attempted:false,fallback_strategy:'NONE',fallback_hits:0,
    official_detail_ok:false,official_detail_status:0,usable:bpk.ok,
    final_state:bpk.ok?'USABLE_DIRECT':bpk.access_state==='BLOCKED'?'REACHABLE_BLOCKED':bpk.access_state==='HTTP_ERROR'?'REACHABLE_HTTP_ERROR':'NETWORK_UNREACHABLE',
    finalUrl:bpk.finalUrl,error:bpk.error,
  });

  const judicial=[
    {provider:'JDIH_MA',domain:'jdih.mahkamahagung.go.id',query:'SEMA',url:'https://jdih.mahkamahagung.go.id/dokumen?search=SEMA'},
    {provider:'PUTUSAN_MA',domain:'putusan3.mahkamahagung.go.id',query:'perdata',url:'https://putusan3.mahkamahagung.go.id/search.html?q=perdata'},
  ] as const;
  for(const spec of judicial){
    const direct=await fetchText(spec.url,12000);
    let fallbackStrategy:'DIRECT_OFFICIAL'|'JDIHN_AGGREGATOR'|'CACHE'|'DUCKDUCKGO_HTML'|'DUCKDUCKGO_LITE'|'BING_FALLBACK'|'EXHAUSTED'|'NONE'='NONE';
    let fallbackAttempts:FallbackDiscoveryDiagnostic[]=[];
    let fallbackHits=0,detailOk=false,detailStatus=0,detailEscalated=false;
    if(!direct.ok){
      const search=await searchOfficialDomain(spec.query,spec.domain,3);
      fallbackStrategy=search.strategy;
      fallbackHits=search.hits.length;
      fallbackAttempts=search.fallback_attempts;
      if(search.hits.length){
        const detail=await fetchText(search.hits[0].url,10000);
        detailStatus=detail.status;
        detailEscalated=Boolean(detail.escalated);
        if(detail.ok){
          const host=(()=>{try{return new URL(detail.finalUrl).hostname.toLowerCase();}catch{return '';}})();
          const generic=(host==='jdihn.go.id'||host.endsWith('.jdihn.go.id'))?parseJdihnDetail(detail.text):parseGenericOfficialPage(detail.text,search.hits[0].title);
          detailOk=Boolean(inferJudicialAuthorityIdentity(`${generic.title} ${generic.excerpt||''}`,detail.finalUrl));
        }
      }
    }
    const directState:OfficialProviderAccessState=direct.ok?'REACHABLE_OK':direct.access_state==='BLOCKED'?'REACHABLE_BLOCKED':direct.access_state==='HTTP_ERROR'?'REACHABLE_HTTP_ERROR':'NETWORK_UNREACHABLE';
    const usable=direct.ok||detailOk;
    const finalState:OfficialProviderConnectivityProbe['final_state']=direct.ok?'USABLE_DIRECT':detailOk?(fallbackStrategy==='JDIHN_AGGREGATOR'||fallbackStrategy==='CACHE'?'USABLE_VIA_OFFICIAL_AGGREGATOR':'USABLE_VIA_FALLBACK'):!direct.reachable?'NETWORK_UNREACHABLE':direct.access_state==='BLOCKED'?'REACHABLE_BLOCKED':direct.access_state==='HTTP_ERROR'?'REACHABLE_HTTP_ERROR':'REACHABLE_NO_RESULTS';
    out.push({
      provider:spec.provider,url:spec.url,direct_ok:direct.ok,direct_status:direct.status,direct_state:directState,
      network_reachable:direct.reachable,fallback_attempted:!direct.ok,fallback_strategy:fallbackStrategy,fallback_hits:fallbackHits,fallback_attempts:fallbackAttempts,
      official_detail_ok:detailOk,official_detail_status:detailStatus,usable,final_state:finalState,
      finalUrl:direct.finalUrl,error:direct.error,header_escalated:Boolean(direct.escalated)||detailEscalated,
    });
  }
  return out;
}

export async function discoverOfficialLaw(input: {
  mode: RegulatoryMode;
  queries: string[];
  tempusYear?: number;
  maxCandidates?: number;
  domain?: string;
  caseText?: string;
  sourceStrategy?: OfficialSourceStrategy|string;
  manualAuthorities?: string[]|string;
  canonicalAuthorities?: Array<string | CanonicalSeed>;
}): Promise<OfficialLawRetrievalResult> {
  const strategy=normalizeOfficialSourceStrategy(input.sourceStrategy);
  if(input.mode==='offline'){
    return {mode:input.mode,queries:[],candidates:[],providers:[{name:'JDIH_BPK',status:'DISABLED_LOCAL_MODE',query_count:0}],notes:['Mode lokal: tidak ada pencarian online.'],source_strategy:strategy,manual_resolutions:[]};
  }

  const manualEnabled=strategy==='manual'||strategy==='manual_plus_auto';
  const autoEnabled=strategy==='auto'||strategy==='manual_plus_auto';
  const normalizedCanonicalSeeds = normalizeCanonicalAuthorities(input.canonicalAuthorities || []);
  const seedEnabled = normalizedCanonicalSeeds.length > 0;
  // These three sources are independent of each other (manual URLs/citations
  // the user pasted in, a canonical corpus seed, and keyword auto-discovery)
  // and are only merged afterward by candidateCanonicalKey precedence below,
  // so there is no ordering dependency that requires awaiting them one at a
  // time; running them concurrently only shortens wall-clock time.
  const [manual,auto,seed]=await Promise.all([
    manualEnabled?resolveManualAuthorities(input.manualAuthorities,input.tempusYear):Promise.resolve({candidates:[],resolutions:[]}),
    autoEnabled
      ? discoverAutoOfficialLaw({mode:input.mode,queries:input.queries,tempusYear:input.tempusYear,maxCandidates:input.maxCandidates,domain:input.domain,caseText:input.caseText})
      : Promise.resolve({mode:input.mode,queries:[] as string[],candidates:[] as OfficialLawCandidate[],providers:[{name:'JDIH_BPK',status:'MANUAL_SCOPE',query_count:0}],notes:['Auto-discovery dinonaktifkan oleh strategi sumber manual.']} as OfficialLawRetrievalResult),
    seedEnabled
      ? resolveCanonicalSeeds(input.mode, normalizedCanonicalSeeds, input.tempusYear)
      : Promise.resolve({ candidates: [], attempts: [] as Array<{ seed: CanonicalSeed; attempts: ExactProviderAttempt[] }> }),
  ]);

  const combined=new Map<string,OfficialLawCandidate>();
  // Priority: manual user selection > canonical corpus seed > keyword auto-discovery.
  for(const c of manual.candidates) combined.set(candidateCanonicalKey(c),c);
  for(const c of seed.candidates) if(!combined.has(candidateCanonicalKey(c))) combined.set(candidateCanonicalKey(c),c);
  for(const c of auto.candidates) if(!combined.has(candidateCanonicalKey(c))) combined.set(candidateCanonicalKey(c),c);
  const maxCandidates=Math.max(3,Math.min(16,input.maxCandidates||(input.mode==='online'?12:8)));
  const finalCandidates=[...combined.values()].slice(0,maxCandidates);
  const resolved=manual.resolutions.filter(r=>r.status==='RESOLVED').length;
  const unresolved=manual.resolutions.length-resolved;
  const providerStatus=finalCandidates.length?'REACHABLE_CANDIDATES':(manualEnabled&&manual.resolutions.length&&!autoEnabled?'MANUAL_NO_VERIFIED_SOURCE':aggregateProviderStatuses(auto.providers));
  const diagnostics:any={...(auto.diagnostics||{})};
  diagnostics.manual_inputs=manual.resolutions.length;
  diagnostics.manual_resolved=resolved;
  diagnostics.manual_unresolved=unresolved;
  diagnostics.manual_exact_attempts=manual.resolutions.filter(r=>r.exact_attempts?.length).map(r=>({input:r.input,status:r.status,attempts:r.exact_attempts}));
  diagnostics.canonical_authorities_input_count=input.canonicalAuthorities?.length||0;
  diagnostics.canonical_authorities_attempted=normalizedCanonicalSeeds.length;
  diagnostics.canonical_authorities_resolved=seed.candidates.length;
  diagnostics.canonical_authorities_normalized=normalizedCanonicalSeeds.map(s=>({
    localRegulationId:s.localRegulationId,
    instrument_family:s.instrument_family,
    number:s.number,
    year:s.year,
  }));
  // Backward-compatible aliases for V6.8.0 diagnostics consumers.
  diagnostics.canonical_seeds_attempted=diagnostics.canonical_authorities_attempted;
  diagnostics.canonical_seeds_resolved=diagnostics.canonical_authorities_resolved;
  diagnostics.canonical_seed_attempts=seed.attempts;
  diagnostics.final_candidates=finalCandidates.length;
  diagnostics.provider_status=providerStatus;

  const manualNotes=manualEnabled
    ? [`Manual authority: ${resolved}/${manual.resolutions.length} berhasil diverifikasi online.${unresolved?` ${unresolved} perlu diperjelas/diperiksa.`:''}`]
    : [];
  return {
    mode:input.mode,
    queries:auto.queries||[],
    candidates:finalCandidates,
    providers:(auto.providers&&auto.providers.length)?auto.providers:[{name:'JDIH_BPK',status:providerStatus,query_count:(auto.queries||[]).length}],
    notes:[...manualNotes,...(auto.notes||[])],
    source_strategy:strategy,
    manual_resolutions:manual.resolutions,
    diagnostics,
  };
}

// ============================================================
// TEST-ONLY EXPORTS (V6.7.8)
// ============================================================
export const __test__ = {
  profileQueryForTopicalPolicy,
  topicalCandidateAccepts,
  materialNexusScore,
  normalizeCanonicalAuthorities,
  parseCanonicalIdentities,
  inferInstrumentIdentity,
  inferJudicialAuthorityIdentity,
  buildAuthorityProviderPlan,
  providerForOfficialDomain,
  parseDirectOfficialSearch,
  aggregateProviderStatuses,
  judicialProviderRuntimeStatus,
  classifyHttpAccess,
  discoveryBodyState,
  parseDuckDuckGoDomainHits,
  parseBingDomainHits,
  parseJdihnSearchLinks,
  stripJudicialSearchDecorators,
  inferAuthorityTempusStatus,
};
