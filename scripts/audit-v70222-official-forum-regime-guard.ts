// V7.0.2.22 — procedural-authority precision: OFFICIAL/judicial forum-regime guard.
//
// Background: applyRegimeGuard (forum/regime compatibility screening) was only ever
// applied to LOCAL corpus regulations. OFFICIAL candidates (SEMA/PERMA/Rumusan Kamar,
// Putusan, JDIH_BPK regulations) hardcoded regime_note:null unconditionally, so a
// Putusan Pengadilan Agama or a SEMA on peradilan militer procedure could be bound and
// promoted as authority for a case whose own forum/regime is plainly different, with
// zero mismatch signal. This script is the deterministic regression + cross-case suite
// for the fix (applyOfficialRegimeGuard / inferredOfficialRegimeScope /
// inferredOfficialJurisdictionForum), calling the real exported functions — never a
// reimplementation — so it fails the moment the production logic drifts.
//
// It also locks in the recall-safety correction made after an initial regression was
// caught on scripts/audit-v7023-case-pipeline.ts: unlike LOCAL regulations (mostly
// ANY/UNIVERSAL scope, so a narrow scope is itself a deliberate signal), every judicial
// decision by definition has a specific court — that is not an anomaly. The guard must
// only fire on a *positive* mismatch (both sides known and different), never merely
// because the case narrative does not explicitly name a forum.

import { __test__ } from '../server/caseAnalysis';

const results:{name:string;pass:boolean;detail:string}[]=[];
const check=(name:string,pass:boolean,detail:string)=>results.push({name,pass,detail});

const regimeCivilUmum:any = { forum:'UMUM', regime:'CIVIL', signals:{forum_explicit:['pengadilan_negeri'],criminal_procedural:[],civil_procedural:['gugatan'],administrative_procedural:[],islamic_substantive:[],civil_substantive:['wanprestasi'],customary_substantive:[],personal_identity:[]} };
const regimeUnspecified:any = { forum:'UNSPECIFIED', regime:'UNSPECIFIED', signals:{forum_explicit:[],criminal_procedural:[],civil_procedural:[],administrative_procedural:[],islamic_substantive:[],civil_substantive:[],customary_substantive:[],personal_identity:[]} };

// ---- 1. Classification unit tests (real functions, synthetic inputs) ----

const decisionPengadilanAgama = { title:'Putusan PA Solo Nomor 12/Pdt.G/2024/PA.Sla', excerpt:'Perkara waris islam dan kompilasi hukum islam mengenai pembagian harta warisan', court:'PA Solo', authority_class:'DECISION' };
check('1.1 scope: Putusan waris islam classified ISLAMIC',
  __test__.inferredOfficialRegimeScope(decisionPengadilanAgama)==='ISLAMIC',
  __test__.inferredOfficialRegimeScope(decisionPengadilanAgama));
check('1.2 forum: court "PA Solo" classified AGAMA',
  __test__.inferredOfficialJurisdictionForum(decisionPengadilanAgama)==='AGAMA',
  __test__.inferredOfficialJurisdictionForum(decisionPengadilanAgama));

const decisionPengadilanNegeri = { title:'Putusan PN Jakarta Nomor 11/Pdt.G/2025/PN Jkt', excerpt:'Sengketa wanprestasi kontrak, prestasi, somasi dan ganti rugi', court:'PN Jakarta', authority_class:'DECISION' };
check('1.3 scope: wanprestasi decision classified CIVIL',
  __test__.inferredOfficialRegimeScope(decisionPengadilanNegeri)==='CIVIL',
  __test__.inferredOfficialRegimeScope(decisionPengadilanNegeri));
check('1.4 forum: court "PN Jakarta" classified UMUM',
  __test__.inferredOfficialJurisdictionForum(decisionPengadilanNegeri)==='UMUM',
  __test__.inferredOfficialJurisdictionForum(decisionPengadilanNegeri));

const semaGeneric = { title:'SEMA Nomor 2 Tahun 2024 tentang Pemberlakuan Hasil Rumusan Rapat Pleno Kamar Mahkamah Agung', excerpt:'Pedoman pelaksanaan tugas bagi pengadilan', authority_class:'JUDICIAL_PRODUCT' };
check('1.5 scope: generic Rumusan Kamar classified UNIVERSAL (no forum-specific language)',
  __test__.inferredOfficialRegimeScope(semaGeneric)==='UNIVERSAL',
  __test__.inferredOfficialRegimeScope(semaGeneric));
check('1.6 forum: generic Rumusan Kamar with no court classified ANY',
  __test__.inferredOfficialJurisdictionForum(semaGeneric)==='ANY',
  __test__.inferredOfficialJurisdictionForum(semaGeneric));

// ---- 2. applyOfficialRegimeGuard: positive mismatch is caught ----

const guardMismatch = __test__.applyOfficialRegimeGuard(decisionPengadilanAgama,'HIGH',regimeCivilUmum);
check('2.1 mismatch: Putusan Agama vs case forum=UMUM/regime=CIVIL sets regime_note',
  Boolean(guardMismatch.note), JSON.stringify(guardMismatch));
check('2.2 mismatch: tier downgraded from HIGH',
  guardMismatch.tier!=='HIGH', JSON.stringify(guardMismatch));

// ---- 3. applyOfficialRegimeGuard: matching forum/regime is unaffected ----

const guardMatch = __test__.applyOfficialRegimeGuard(decisionPengadilanNegeri,'HIGH',regimeCivilUmum);
check('3.1 match: PN Jakarta decision vs case forum=UMUM/regime=CIVIL has no regime_note',
  guardMatch.note===null, JSON.stringify(guardMatch));
check('3.2 match: tier stays HIGH',
  guardMatch.tier==='HIGH', JSON.stringify(guardMatch));

// ---- 4. Recall-safety regression lock: case forum/regime UNSPECIFIED must NOT
//         penalize a judicial decision merely for having a (any) specific court ----

const guardUnspecifiedCase = __test__.applyOfficialRegimeGuard(decisionPengadilanNegeri,'HIGH',regimeUnspecified);
check('4.1 recall-safety: case forum/regime UNSPECIFIED does not downgrade a judicial decision',
  guardUnspecifiedCase.tier==='HIGH' && guardUnspecifiedCase.note===null,
  JSON.stringify(guardUnspecifiedCase));

const guardGenericUnspecified = __test__.applyOfficialRegimeGuard(semaGeneric,'HIGH',regimeUnspecified);
check('4.2 recall-safety: generic Rumusan Kamar unaffected regardless of case forum/regime',
  guardGenericUnspecified.tier==='HIGH' && guardGenericUnspecified.note===null,
  JSON.stringify(guardGenericUnspecified));

// ---- 5. LOCAL guard behaviour must remain byte-for-byte unchanged (strictOnUnspecified=true) ----

const localRegUnspecifiedScope:any = { id:'x', jenis:'UU', nomor:'UU Uji', tentang:'Ketentuan umum', status:'berlaku', domain_tags:[] };
const localGuardUniversal = __test__.applyRegimeGuard(localRegUnspecifiedScope,'HIGH',regimeUnspecified);
check('5.1 LOCAL: universal-scope regulation unaffected by unspecified case regime/forum',
  localGuardUniversal.tier==='HIGH' && localGuardUniversal.note===null,
  JSON.stringify(localGuardUniversal));

const localRegNarrowScope:any = { id:'y', jenis:'UU', nomor:'UU Peradilan Agama Uji', tentang:'Peradilan agama', status:'berlaku', domain_tags:[] };
const localGuardNarrowUnspecified = __test__.applyRegimeGuard(localRegNarrowScope,'HIGH',regimeUnspecified);
check('5.2 LOCAL: narrow-scope regulation still downgraded on unspecified case forum (original behaviour preserved)',
  localGuardNarrowUnspecified.tier!=='HIGH' && Boolean(localGuardNarrowUnspecified.note),
  JSON.stringify(localGuardNarrowUnspecified));

// ---- 6. End-to-end: a forum-mismatched OFFICIAL candidate is excluded from binding,
//         while an otherwise-identical, forum-matching candidate still binds. ----

const domain = __test__.buildDomainRankingContext('PERDATA_KONTRAKTUAL',[]);
const issue = [{ issue:'Apakah kewajiban telah dapat ditagih dan terjadi wanprestasi, termasuk syarat lalai/somasi, kausalitas, kerugian, dan remedy?', issue_id:'default-remedy', analysis:'uji' }];
const ontology = [{ question:'Apakah kewajiban telah dapat ditagih dan terjadi wanprestasi, termasuk syarat lalai/somasi, kausalitas, kerugian, dan remedy?', id:'default-remedy', query_terms:['wanprestasi','somasi','ganti rugi'], domain:'PERDATA_KONTRAKTUAL' }];

const mismatchedCandidate:any = {
  title:'Putusan PA Solo Nomor 12/Pdt.G/2024/PA.Sla', source_kind:'OFFICIAL', source_label:'Putusan PA Solo Nomor 12/Pdt.G/2024/PA.Sla',
  article_summary:'', domain_tags:[], article_text_pool:'wanprestasi somasi ganti rugi perkara waris islam kompilasi hukum islam',
  material_confidence:'HIGH', citation_hit:false,
  regime_note:__test__.applyOfficialRegimeGuard(decisionPengadilanAgama,'HIGH',regimeCivilUmum).note,
  domain_alignment:'PRIMARY', authority_identity:'official:mismatch-test', tempus_status:'POTENTIALLY_COMPATIBLE',
};
const matchedCandidate:any = {
  title:'Putusan PN Jakarta Nomor 11/Pdt.G/2025/PN Jkt', source_kind:'OFFICIAL', source_label:'Putusan PN Jakarta Nomor 11/Pdt.G/2025/PN Jkt',
  article_summary:'', domain_tags:[], article_text_pool:'wanprestasi somasi ganti rugi kontrak prestasi',
  material_confidence:'HIGH', citation_hit:false,
  regime_note:__test__.applyOfficialRegimeGuard(decisionPengadilanNegeri,'HIGH',regimeCivilUmum).note,
  domain_alignment:'PRIMARY', authority_identity:'official:match-test', tempus_status:'POTENTIALLY_COMPATIBLE',
};

const bound = __test__.bindIssuesToAuthorities(issue, ontology, [mismatchedCandidate, matchedCandidate], domain, 'gugatan wanprestasi kontrak Pengadilan Negeri', regimeCivilUmum);
const boundLabels = (bound[0]?.bound_authorities||[]).map((b:any)=>b.source_label);
check('6.1 end-to-end: forum-mismatched Putusan Agama excluded from binding',
  !boundLabels.includes('Putusan PA Solo Nomor 12/Pdt.G/2024/PA.Sla'), boundLabels.join(', '));
check('6.2 end-to-end: forum-matching Putusan PN still binds',
  boundLabels.includes('Putusan PN Jakarta Nomor 11/Pdt.G/2025/PN Jkt'), boundLabels.join(', '));

for(const r of results) console.log(`${r.pass?'PASS':'FAIL'} ${r.name} :: ${r.detail}`);
const passed=results.filter(x=>x.pass).length;
console.log(`\nSUMMARY ${passed}/${results.length} V7.0.2.22 official-forum-regime-guard checks PASS`);
if(passed!==results.length) process.exit(1);
