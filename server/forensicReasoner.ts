/**
 * LexiCore deterministic forensic reasoning core.
 *
 * Design constraints:
 * - no external generative-AI dependency;
 * - no case/person/regulation hardcoding;
 * - no unverified substantive rule is invented;
 * - facts, claims, supporting material, anomalies and gaps remain distinct;
 * - legal rules are surfaced only from verified retrieval candidates or source citations upstream.
 */
import type { EvidenceIssueSeed, EvidenceModel, EvidenceStatement } from './evidenceModel';
import type { OfficialLawCandidate } from './officialLawRetriever';
import { inferLegalContext } from './legalOntology';

const clean=(v:unknown)=>String(v??'').replace(/\s+/g,' ').trim();
const uniq=<T>(xs:T[])=>[...new Set(xs)];
const clip=(s:string,n=220)=>clean(s).slice(0,n);
const tokenise=(s:string)=>uniq((clean(s).toLowerCase().match(/[a-z0-9à-ÿ]{4,}/g)||[]).filter(x=>!new Set(['yang','dan','atau','dengan','dalam','dari','untuk','pada','atas','oleh','tentang','hukum','perkara','pihak','tahun','nomor']).has(x)));

function usableLawCandidate(c:OfficialLawCandidate):boolean{
  if(c.tempus_status==='POTENTIALLY_INCOMPATIBLE') return false;
  if(c.hierarchy_status==='REJECTED'||c.material_nexus_status==='REJECTED') return false;

  if(c.provider==='LOCAL_CORPUS'||c.source_origin==='LOCAL'||c.query_kind==='LOCAL_CORPUS'){
    return c.status==='IDENTITY_VERIFIED' && c.material_nexus_status==='VERIFIED';
  }
  return c.status==='IDENTITY_VERIFIED' && (c.identity_match==='EXACT'||c.material_nexus_status==='VERIFIED');
}


export interface ForensicReasoningInput {
  title: string;
  primaryDomain: string;
  domainContext: ReturnType<typeof inferLegalContext>;
  evidence: EvidenceModel;
  lawCandidates: OfficialLawCandidate[];
  tempusYear?: number;
}

export interface ForensicReasoningOutput {
  document_type: string;
  summary: string;
  statement_buckets: {
    textual_facts: Array<{statement:string;page:number;evidence_tag:string}>;
    party_claims: Array<{statement:string;speaker:string;page:number;evidence_tag:string}>;
    anomalies: Array<{statement:string;page:number;evidence_tag:string}>;
    supporting_evidence: Array<{statement:string;page:number;evidence_tag:string}>;
  };
  actor_matrix: Array<{actor:string;proven_status:string;explicit_rights_obligations:string;evidence_tag:string;pages:number[];entity_type?:'PERSON'|'ROLE'|'ORGANIZATION';canonical_key?:string;aliases?:string[]}>;
  verified_timeline: Array<{time:string;event:string;evidence_tag:string;page:number}>;
  facts: string[];
  legal_issues: Array<{issue:string;rule:string;analysis:string;conclusion:string;evidence_tags:string[];issue_id?:string;query_terms?:string[]}>;
  applicable_law: Array<{regulation:string;article:string;relevance:string;source_url?:string;verification_status?:string;tempus_status?:string}>;
  legal_gaps: Array<{gap:string;why_material:string;evidence_tag:string}>;
  multi_path_diagnosis: Array<{path:string;legal_theory:string;strength:string;application:string;counter_case:string;evidence_needed:string[]}>;
  integration_matrix: Array<{actor:string;factual_act:string;local_kb_nexus:string;online_law_nexus:string;risk:string;evidence_tag:string}>;
  adverse_evidence: Array<{evidence_id:string;page:number;adverse_point:string;analysis:string;evidence_tag:string}>;
  arguments_for: string[];
  arguments_against: string[];
  risks: Array<{clause:string;level:'HIGH'|'MEDIUM'|'LOW';finding:string;mitigation:string}>;
  overall_risk_score: number;
  recommendations: string[];
  tactical_strategy: Array<{step:number;action:string;objective:string;priority:'P1'|'P2'|'P3'}>;
  blank_spot_questions: string[];
  best_case: string;
  worst_case: string;
  verification_note: string;
  reasoning_status: 'READY' | 'DEGRADED';
  reasoning_reasons: string[];
}

function tagFact(page:number|undefined,q:string){return `[FAKTA${page?` H${page}`:''}: "${clip(q)}"]`;}
function tagClaim(page:number|undefined,q:string){return `[KLAIM${page?` H${page}`:''}: "${clip(q)}"]`;}
function tagSupport(page:number|undefined,q:string){return `[REFERENSI${page?` H${page}`:''}: "${clip(q)}"]`;}
function tagAdverse(page:number|undefined,q:string){return `[BUKTI LAWAN${page?` H${page}`:''}: "${clip(q)}"]`;}
function tagAnomaly(page:number|undefined,q:string){return `[ANOMALI${page?` H${page}`:''}: "${clip(q)}"]`;}
function tagGap(what:string){return `[KLAIM KOSONG: ${clip(what)}]`;}

function tagForEvidenceStatement(s:EvidenceStatement|undefined,fallbackPage?:number,fallbackQuote=''){
  if(!s) return tagClaim(fallbackPage,fallbackQuote);
  switch(s.class){
    case 'TEXTUAL_FACT': return tagFact(s.page,s.quote);
    case 'PARTY_CLAIM': return tagClaim(s.page,s.quote);
    case 'SUPPORTING_EVIDENCE': return tagSupport(s.page,s.quote);
    case 'ADVERSE_EVIDENCE': return tagAdverse(s.page,s.quote);
    case 'ANOMALY': return tagAnomaly(s.page,s.quote);
    default: return tagGap(s.statement||fallbackQuote);
  }
}

function relevantLawsForIssue(seed:EvidenceIssueSeed,candidates:OfficialLawCandidate[]):OfficialLawCandidate[]{
  const issueText=`${seed.issue} ${seed.basis} ${(seed.query_terms||[]).join(' ')}`;
  const qTokens=new Set(tokenise(issueText));
  const scored=candidates
    .filter(usableLawCandidate)
    .map(c=>{
      const hay=tokenise(`${c.query} ${c.title} ${c.subject||''} ${c.excerpt||''}`);
      let score=0; for(const t of hay) if(qTokens.has(t)) score+=t.length>=8?2:1;
      if((seed.query_terms||[]).some(term=>clean(`${c.query} ${c.title} ${c.excerpt||''}`).toLowerCase().includes(clean(term).toLowerCase()))) score+=5;
      return {c,score};
    })
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score);
  return scored.slice(0,3).map(x=>x.c);
}

function strengthenIssues(
  issues:EvidenceIssueSeed[],
  facts:EvidenceStatement[],
  claims:EvidenceStatement[],
  supporting:EvidenceStatement[],
  lawCandidates:OfficialLawCandidate[],
):ForensicReasoningOutput['legal_issues']{
  const out:ForensicReasoningOutput['legal_issues']=[];
  for(const seed of issues){
    const fMatches=facts.filter(f=>seed.pages.includes(f.page)).slice(0,5);
    const cMatches=claims.filter(c=>seed.pages.includes(c.page)).slice(0,5);
    const sMatches=supporting.filter(c=>seed.pages.includes(c.page)).slice(0,3);
    const laws=relevantLawsForIssue(seed,lawCandidates);
    const evidenceTags=[...fMatches.map(f=>tagFact(f.page,f.quote)),...sMatches.map(s=>tagSupport(s.page,s.quote)),...cMatches.map(c=>tagClaim(c.page,c.quote))];
    const supportCount=fMatches.length+sMatches.length;
    const assessment=supportCount>=2 && supportCount>=cMatches.length
      ? 'DIDUKUNG MATERI TEKSTUAL — dapat dipakai sebagai issue working hypothesis, tetap tunduk pada verifikasi dokumen asli dan norma.'
      : supportCount>=1 && cMatches.length>=1
        ? 'CAMPURAN FAKTA/KLAIM — sebagian mempunyai dukungan tekstual, sebagian masih memerlukan pembuktian.'
        : cMatches.length>0
          ? 'BERBASIS KLAIM — belum cukup untuk dinyatakan sebagai fakta hukum.'
          : 'BELUM CUKUP BUKTI — perlu dokumen atau keterangan primer.';
    const rule=laws.length
      ? `Kandidat norma terverifikasi-identitas yang mempunyai nexus awal: ${laws.map(x=>x.title).join(' | ')}. Pasal spesifik dan penerapan pada fakta tetap harus diverifikasi.`
      : 'Belum ada norma spesifik yang aman untuk dinyatakan sebagai rule. Retrieval harus menghasilkan instrumen yang lolos identitas, tempus, status berlaku, dan material nexus.';
    out.push({
      issue:seed.issue,
      issue_id:seed.id,
      query_terms:seed.query_terms || [],
      rule,
      analysis:`Basis isu: ${clip(seed.basis,280)} Halaman terkait: ${seed.pages.join(', ')||'-'}. Dukungan: ${fMatches.length} fakta tekstual, ${sMatches.length} bahan pendukung, ${cMatches.length} klaim/dalil.`,
      conclusion:`Kesimpulan taktis sementara: ${assessment}`,
      evidence_tags:evidenceTags.length?evidenceTags:[tagGap(`bukti primer untuk isu: ${seed.issue}`)],
    });
    if(out.length>=12)break;
  }
  return out;
}

function escapeRegex(value:string):string{
  return String(value||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

function statementMentionsActor(statement:string,actor:{actor:string;aliases?:string[]}):boolean{
  const hay=clean(statement);
  const names=uniq([actor.actor,...(actor.aliases||[])]).map(clean).filter(Boolean);
  return names.some(name=>{
    const pattern=escapeRegex(name).replace(/\\\s+/g,'\\s+');
    // Token-aware boundary avoids matching "Agus" inside "Bagus" while
    // still allowing punctuation/titles around multi-word names.
    const re=new RegExp(`(^|[^A-Za-zÀ-ÿ0-9])${pattern}(?=$|[^A-Za-zÀ-ÿ0-9])`,'i');
    return re.test(hay);
  });
}

function actorStatus(evidence:EvidenceModel,actor:{actor:string;roles:string[];pages:number[];evidence_quotes:string[];aliases?:string[]}):string{
  const same=evidence.statements.filter(s=>actor.pages.includes(s.page)&&statementMentionsActor(s.statement,actor)).slice(0,3);
  const explicit=same.find(s=>/\b(hak|kewajiban|berwenang|kuasa|mewakili|selaku|sebagai)\b/i.test(s.statement));
  return explicit
    ? `Status/kapasitas yang tertulis perlu dibaca dari sumber: ${clip(explicit.statement,220)}`
    : 'Hak, kewajiban, kapasitas, dan kewenangan tidak diinferensikan otomatis; tetapkan hanya dari dokumen sumber dan norma yang telah diverifikasi.';
}

function buildLegalGaps(evidence:EvidenceModel,issues:ForensicReasoningOutput['legal_issues']):ForensicReasoningOutput['legal_gaps']{
  const out:ForensicReasoningOutput['legal_gaps']=[];
  const factTokens=new Set(evidence.textual_facts.flatMap(f=>tokenise(f.statement)));
  for(const c of evidence.party_claims.slice(0,12)){
    const material=tokenise(c.statement).filter(t=>factTokens.has(t)).length;
    if(material<2) out.push({gap:`Dalil "${clip(c.statement,160)}" belum memiliki korelasi tekstual yang cukup dengan bukti/fakta yang terdeteksi.`,why_material:'Klaim tidak boleh dipromosikan menjadi fakta hanya karena diulang atau ditulis dalam dokumen pihak.',evidence_tag:tagGap(c.statement)});
    if(out.length>=6)break;
  }
  for(const i of issues){
    if(i.evidence_tags.some(t=>t.startsWith('[KLAIM KOSONG'))) out.push({gap:`Isu "${clip(i.issue,160)}" belum mempunyai bukti primer terpetakan.`,why_material:'Analisis unsur dan remedy bergantung pada bukti material, bukan pada label hukum semata.',evidence_tag:tagGap(i.issue)});
    if(out.length>=10)break;
  }
  for(const a of evidence.anomalies.slice(0,4)) out.push({gap:`Anomali/inkonsistensi: ${clip(a.statement,170)}`,why_material:'Inkonsistensi dapat mengubah reliability, kronologi, atau atribusi bukti.',evidence_tag:tagAnomaly(a.page,a.quote)});
  return out.slice(0,14);
}

function buildMultiPath(context:ReturnType<typeof inferLegalContext>,issues:ForensicReasoningOutput['legal_issues']):ForensicReasoningOutput['multi_path_diagnosis']{
  const active=context.scores.filter(d=>d.score>=6).slice(0,4);
  const paths=active.map(d=>({
    path:d.label,
    legal_theory:'Jalur kualifikasi sementara. Substantive rule belum diasumsikan; gunakan hanya norma yang lolos retrieval dan verifikasi.',
    strength:d.score>=18?'HIGH':d.score>=10?'MEDIUM':'LOW',
    application:`Sinyal domain=${d.score}; isu material: ${issues.slice(0,4).map(i=>clip(i.issue,125)).join(' | ')||'belum cukup'}.`,
    counter_case:`Uji apakah fakta yang sama lebih tepat dikualifikasikan pada domain lain, atau apakah unsur domain ${d.label} tidak terbukti.`,
    evidence_needed:['Dokumen primer pembentuk hubungan hukum.','Kronologi bertanggal.','Bukti lawan/counter-evidence.','Norma resmi yang berlaku pada tempus.'],
  }));
  if(!paths.length) paths.push({path:context.primary.label,legal_theory:'Open-world factual analysis: kualifikasi hukum belum dipaksakan.',strength:'LOW',application:'Mulai dari aktor, tindakan, bukti, akibat, dan tujuan hukum sebelum memilih domain.',counter_case:'Buka kemungkinan domain alternatif ketika bukti baru masuk.',evidence_needed:['Dokumen primer.','Kronologi.','Identitas dan kapasitas aktor.']});
  return paths;
}

function buildIntegrationMatrix(evidence:EvidenceModel,primaryDomain:string):ForensicReasoningOutput['integration_matrix']{
  const rows:ForensicReasoningOutput['integration_matrix']=[];
  const materials=[...evidence.textual_facts,...evidence.party_claims].slice(0,16);
  for(const actor of evidence.actors.slice(0,10)){
    const hit=materials.find(m=>actor.pages.includes(m.page)&&statementMentionsActor(m.statement,actor));
    if(!hit)continue;
    rows.push({actor:actor.actor,factual_act:clip(hit.statement,210),local_kb_nexus:`Gunakan corpus lokal hanya sebagai indeks kandidat untuk domain ${primaryDomain}; jangan promosikan sebagai authority tanpa verifikasi.`,online_law_nexus:'Cari sumber resmi berdasarkan isu material; wajib lolos identity, tempus, status, dan material nexus.',risk:hit.class==='PARTY_CLAIM'?'HIGH':'MEDIUM',evidence_tag:hit.class==='PARTY_CLAIM'?tagClaim(hit.page,hit.quote):tagFact(hit.page,hit.quote)});
  }
  return rows.slice(0,12);
}

function buildAdverseEvidence(evidence:EvidenceModel):ForensicReasoningOutput['adverse_evidence']{
  const out:ForensicReasoningOutput['adverse_evidence']=[];let i=1;
  for(const a of evidence.adverse_evidence.slice(0,16)) out.push({evidence_id:`ADV-${i++}`,page:a.page,adverse_point:clip(a.statement,240),analysis:'Materi ini secara eksplisit berpotensi bertentangan dengan posisi pihak dalam sumber. Uji autentisitas, atribusi, kronologi, konteks lengkap, dan counter-reading sebelum dipakai.',evidence_tag:tagAdverse(a.page,a.quote)});
  for(const a of evidence.anomalies.slice(0,6)) if(out.length<12) out.push({evidence_id:`ANOM-${i++}`,page:a.page,adverse_point:`Anomali yang dapat melemahkan reliability: ${clip(a.statement,210)}`,analysis:'Anomali bukan otomatis bukti lawan, tetapi harus dijelaskan karena dapat menyerang konsistensi atau kredibilitas konstruksi.',evidence_tag:tagAnomaly(a.page,a.quote)});
  return out;
}

function buildRisks(evidence:EvidenceModel,context:ReturnType<typeof inferLegalContext>,lawCandidates:OfficialLawCandidate[]):ForensicReasoningOutput['risks']{
  const risks:ForensicReasoningOutput['risks']=[];
  risks.push({clause:'Kualitas basis fakta',level:evidence.textual_facts.length>=4?'LOW':evidence.party_claims.length?'HIGH':'MEDIUM',finding:`Fakta tekstual=${evidence.textual_facts.length}; klaim=${evidence.party_claims.length}; missing/unknown=${evidence.missing_facts.length}.`,mitigation:'Pasangkan proposisi material dengan dokumen primer; jangan mengubah narasi/klaim menjadi fakta tanpa corroboration.'});
  risks.push({clause:'Kualifikasi domain',level:context.ambiguous?'HIGH':context.confidence==='MEDIUM'?'MEDIUM':'LOW',finding:`Primary=${context.primary.label}; confidence=${context.confidence}; margin=${context.margin}.`,mitigation:'Uji secondary/alternative domain sebelum memilih remedy.'});
  const usable=lawCandidates.filter(usableLawCandidate);
  risks.push({clause:'Hukum positif & tempus',level:usable.length?'MEDIUM':'HIGH',finding:usable.length?`${usable.length} kandidat beridentitas dan tidak tertolak tempus tersedia; pasal/penerapan belum otomatis terverifikasi.`:'Belum ada kandidat hukum yang aman untuk dijadikan rule final.',mitigation:'Verifikasi pasal, perubahan/pencabutan, effective date, dan nexus faktual pada sumber resmi.'});
  if(evidence.timeline.length<2) risks.push({clause:'Kronologi',level:'MEDIUM',finding:`Peristiwa bertanggal terdeteksi=${evidence.timeline.length}.`,mitigation:'Lengkapi tanggal tindakan material dari dokumen/korespondensi primer.'});
  return risks;
}


function conciseIssueLabel(issue:{issue:string;query_terms?:string[]}):string{
  const terms=uniq((issue.query_terms||[]).map(clean).filter(Boolean)).slice(0,4);
  if(terms.length) return terms.join(', ');
  const tokens=tokenise(issue.issue).slice(0,7);
  return tokens.length?tokens.join(' '):clip(issue.issue,90);
}

function buildBlankSpots(evidence:EvidenceModel,issues:ForensicReasoningOutput['legal_issues'],gaps:ForensicReasoningOutput['legal_gaps']):string[]{
  return uniq([
    ...evidence.party_claims.slice(0,4).map(c=>`Bukti primer apa yang mengonfirmasi atau membantah dalil "${clip(c.statement,120)}"?`),
    ...issues.slice(0,4).map(i=>`Fakta mana yang menentukan unsur isu "${clip(i.issue,120)}" dan bukti apa yang paling kuat?`),
    ...gaps.slice(0,3).map(g=>`Bagaimana gap berikut akan ditutup: ${clip(g.gap,120)}?`),
    'Apa tempus tepat setiap tindakan material, dan instrumen versi mana yang berlaku pada tempus tersebut?',
    'Adakah counter-evidence, korespondensi, atau dokumen pihak lawan yang belum masuk bundle?',
    'Forum, tenggang, standing, kewenangan kuasa, dan syarat formil apa yang harus diverifikasi sebelum tindakan?',
  ]).slice(0,12);
}

export function reasonForensically(input:ForensicReasoningInput):ForensicReasoningOutput{
  const {evidence,domainContext:context,primaryDomain,lawCandidates}=input;
  const facts=evidence.textual_facts,claims=evidence.party_claims,supporting=evidence.supporting_evidence||[],anomalies=evidence.anomalies;
  const statement_buckets={
    textual_facts:facts.slice(0,50).map(x=>({statement:x.statement,page:x.page,evidence_tag:tagFact(x.page,x.quote)})),
    party_claims:claims.slice(0,50).map(x=>({statement:x.statement,speaker:x.speaker||'PIHAK/SUMBER',page:x.page,evidence_tag:tagClaim(x.page,x.quote)})),
    anomalies:anomalies.slice(0,30).map(x=>({statement:x.statement,page:x.page,evidence_tag:tagAnomaly(x.page,x.quote)})),
    supporting_evidence:supporting.slice(0,160).map(x=>({statement:x.statement,page:x.page,evidence_tag:tagSupport(x.page,x.quote)})),
  };
  const actor_matrix=evidence.actors.slice(0,50).map(a=>{
    const provenance=evidence.statements.find(s=>a.pages.includes(s.page) && statementMentionsActor(s.statement,a));
    const fallbackTag=evidence.source_role==='LEGAL_REFERENCE_MATERIAL'
      ? tagSupport
      : ['CASE_NARRATIVE_OR_QUESTION','LEGAL_CORRESPONDENCE','DEFENSE_SUBMISSION_WITH_EXHIBITS','COMPLAINT_OR_PETITION','LITIGATION_SUBMISSION'].includes(evidence.source_role)
        ? tagClaim
        : tagFact;
    return {actor:a.actor,proven_status:a.roles.join(', '),explicit_rights_obligations:actorStatus(evidence,a),evidence_tag:provenance?tagForEvidenceStatement(provenance):fallbackTag(a.pages[0],a.evidence_quotes[0]||a.actor),pages:a.pages,entity_type:a.entity_type,canonical_key:a.canonical_key,aliases:a.aliases};
  });
  // V6.8.3 — preserve epistemic status of chronology. A dated event extracted
  // from a pleading remains a CLAIMED_EVENT until independently corroborated.
  const verified_timeline=evidence.timeline.slice(0,80).map(t=>({
    time:t.date,
    event:t.event,
    evidence_tag:(t.type==='CLAIMED_EVENT'||evidence.source_role==='CASE_NARRATIVE_OR_QUESTION')
      ? tagClaim(t.page,t.quote)
      : tagFact(t.page,t.quote),
    page:t.page,
  }));
  const legal_issues=strengthenIssues(evidence.issue_seeds,facts,claims,supporting,lawCandidates);
  const legal_gaps=buildLegalGaps(evidence,legal_issues);
  const multi_path_diagnosis=buildMultiPath(context,legal_issues);
  const integration_matrix=buildIntegrationMatrix(evidence,primaryDomain);
  const adverse_evidence=buildAdverseEvidence(evidence);
  const risks=buildRisks(evidence,context,lawCandidates);
  const blank_spot_questions=buildBlankSpots(evidence,legal_issues,legal_gaps);
  const applicable_law=lawCandidates.filter(usableLawCandidate).slice(0,12).map(c=>({regulation:c.title,article:'PERLU VERIFIKASI',relevance:`Provenance=${c.provider==='LOCAL_CORPUS'?'Regulatory Corpus':'official online'}; identity=${c.identity_match}; nexus=${c.material_nexus_status||'NOT_REQUIRED'}; status=${clean(c.effective_status||'belum terbaca')}; tempus=${c.tempus_status}.`,source_url:c.url,verification_status:c.status,tempus_status:c.tempus_status}));
  const arguments_for=legal_issues.filter(i=>!i.evidence_tags.some(t=>t.startsWith('[KLAIM KOSONG'))).slice(0,6).map(i=>`Jalur yang dapat dikembangkan bila bukti tetap konsisten: ${clip(i.issue,180)}`);
  const arguments_against=[...adverse_evidence.slice(0,4).map(a=>`Counter-case/anomali: ${clip(a.adverse_point,170)}`),...legal_issues.filter(i=>i.evidence_tags.some(t=>t.startsWith('[KLAIM KOSONG'))).slice(0,3).map(i=>`Kelemahan pembuktian: ${clip(i.issue,170)}`)];
  const weights={HIGH:85,MEDIUM:55,LOW:25} as const;
  const overall_risk_score=risks.length?Math.max(10,Math.min(95,Math.round(risks.reduce((n,r)=>n+weights[r.level],0)/risks.length))):55;
  const recommendations=uniq([
    ...legal_issues.slice(0,6).map(i=>`Kunci bukti primer, counter-evidence, dan norma untuk: ${conciseIssueLabel(i)}.`),
    'Pisahkan fakta tekstual, klaim pihak, bahan referensi, inferensi, dan anomali.',
    'Verifikasi authority final, status berlaku, tempus, pasal, dan material nexus.',
    'Susun matriks aktor × tindakan × bukti × isu × norma sebelum memilih remedy.'
  ]).slice(0,10);
  const tactical_strategy=legal_issues.slice(0,7).map((i,idx)=>({step:idx+1,action:`Validasi: ${conciseIssueLabel(i)}.`,objective:'Kunci fakta penentu, bukti primer, counter-evidence, norma resmi, tempus, dan remedy.',priority:(idx<2?'P1':idx<5?'P2':'P3') as 'P1'|'P2'|'P3'}));
  const strongest=legal_issues.find(i=>i.conclusion.includes('DIDUKUNG MATERI'));
  const weakest=legal_issues.find(i=>i.conclusion.includes('BERBASIS KLAIM')||i.conclusion.includes('BELUM CUKUP'));
  const best_case=strongest?`Jika bukti primer dan norma resmi mengonfirmasi isu "${clip(strongest.issue,175)}", jalur tersebut dapat menjadi konstruksi utama; isu lain tetap diuji sebagai alternatif.`:'Jika bukti primer yang hilang masuk dan nexus norma terverifikasi, kualifikasi serta remedy dapat dipersempit secara lebih meyakinkan.';
  const worst_case=weakest?`Jika isu "${clip(weakest.issue,175)}" tidak memperoleh bukti atau norma yang diperlukan, konstruksi utama harus diturunkan, dialihkan, atau diformulasi ulang.`:'Jika bukti lawan, tempus, atau norma resmi mematahkan asumsi utama, strategi harus dialihkan ke jalur alternatif yang lebih dapat dibuktikan.';
  const materialCount=facts.length+claims.length+supporting.length;
  const reasoning_reasons:string[]=[];
  if(materialCount===0) reasoning_reasons.push('tidak ada materi substantif terklasifikasi');
  if(legal_issues.length===0) reasoning_reasons.push('issue graph kosong');
  if(evidence.actors.length===0 && materialCount>2) reasoning_reasons.push('aktor belum teridentifikasi');
  const reasoning_status: 'READY'|'DEGRADED'=reasoning_reasons.length?'DEGRADED':'READY';
  const secondaryLabels=context.secondary.map(x=>x.label).filter(Boolean).slice(0,3);
  const summary=`Analisis forensik deterministik atas "${input.title}". Primary domain=${primaryDomain}; secondary=${secondaryLabels.length?secondaryLabels.join(' | '):'tidak ada yang lolos ambang'}; confidence=${context.confidence}; source role=${evidence.source_role}. Materi terpetakan: ${facts.length} fakta tekstual, ${claims.length} klaim/dalil, ${supporting.length} bahan referensi/pendukung, ${anomalies.length} anomali, ${evidence.actors.length} aktor, ${verified_timeline.length} peristiwa bertanggal, ${legal_issues.length} isu. Tidak ada substantive rule yang dibuat tanpa provenance.`;
  return {
    document_type:evidence.source_role,summary,statement_buckets,actor_matrix,verified_timeline,facts:facts.slice(0,24).map(x=>x.statement),legal_issues,applicable_law,legal_gaps,multi_path_diagnosis,integration_matrix,adverse_evidence,arguments_for,arguments_against,risks,overall_risk_score,recommendations,tactical_strategy,blank_spot_questions,best_case,worst_case,verification_note:'VERIFIKASI PROFESIONAL PENDING. Reasoning core bersifat deterministik dan evidence-grounded. Dokumen asli, status norma, pasal, tempus, yurisdiksi, forum, tenggang, dan remedy harus diverifikasi sebelum tindakan hukum.',reasoning_status,reasoning_reasons,
  };
}
