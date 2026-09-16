declare const process:any;

import { deriveOntologyIssues, inferLegalContext } from '../server/legalOntology';
import { buildLawyerWorkflow } from '../server/lawyerWorkflow';
import { __test__ } from '../server/caseAnalysis';

const {
  bindIssuesToAuthorities,
  buildDomainRankingContext,
  detectCaseRegimeContext,
  matchRegulations,
  hasConsumerRelationshipEvidence,
}=__test__;

let pass=0,fail=0;
function check(name:string,ok:boolean,detail=''){
  console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?` | ${detail}`:''}`);
  ok?pass++:fail++;
}
function candidate(overrides:Partial<any>={}):any{
  return {
    title:'',source_kind:'LOCAL',source_label:'',article_summary:'',
    domain_tags:[],article_text_pool:'',material_confidence:'HIGH',
    citation_hit:false,regime_note:null,domain_alignment:'PRIMARY',...overrides,
  };
}

const landText=`
Perihal: Jual beli tanah.
Para pihak: 1. Agnes 2. Irma (Klien) 3. Imam 4. Hendra.
Duduk Perkara: Sekira tahun 2023 terjadi kesepakatan Jual Beli antara Agnes dan Irma.
Agnes membeli sebidang tanah dari Imam seluas 150 m2 dengan legalitas objek SHM.
Agnes menjual kembali tanah seluas 150 m2 berdasarkan girik karena SHM belum dipecah.
Tanah dijual Agnes kepada Irma dengan harga 1M.
Berdasarkan Surat Notaris Pengikatan Jual Beli Irma melakukan pembayaran bertahap DP 110 juta
dan tahap kedua saat AJB keluar, lunas ketika menerima SHM atas namanya.
AJB tidak kunjung dibuat. Irma dan Agnes melakukan pembatalan Jual Beli dan Irma meminta
pengembalian uang yang telah dibayarkan. Belakangan Agnes melakukan upaya pemecahan SHM
dan bermaksud menjual lahan yang sama kepada Hendra. Irma akan melakukan upaya hukum.
`;

// ------------------------------------------------------------
// C — Consumer-law false positive
// ------------------------------------------------------------
{
  check('C1 land sale has no consumer relationship evidence',
    !hasConsumerRelationshipEvidence(landText));

  const issues=[{
    issue:'Apakah kewajiban telah dapat ditagih dan terjadi wanprestasi, termasuk syarat lalai/somasi, kausalitas, kerugian, dan remedy?',
    rule:'',analysis:'',conclusion:'',evidence_tags:[]
  }];
  const ontology=[{
    issue:issues[0].issue,
    id:'default-remedies',
    query_terms:['wanprestasi','somasi','ganti rugi'],
    domain:'PERDATA_KONTRAKTUAL'
  }];
  const pool=[
    candidate({
      title:'UU No. 8 Tahun 1999 tentang Perlindungan Konsumen',
      source_label:'UU Perlindungan Konsumen',
      domain_tags:['perlindungan konsumen','hak konsumen','pelaku usaha'],
      article_text_pool:'ganti rugi hak konsumen kewajiban pelaku usaha klausula baku',
    }),
    candidate({
      title:'Kitab Undang-Undang Hukum Perdata',
      source_label:'KUHPerdata',
      domain_tags:['perikatan','wanprestasi'],
      article_text_pool:'wanprestasi somasi ganti rugi perjanjian',
    }),
  ];
  const ctx={
    primary_id:'PERDATA_KONTRAKTUAL' as any,
    primary_anchors:['perikatan','wanprestasi'],
    secondary_anchors:['agraria','pertanahan'],
    foreign_anchors:['perlindungan konsumen'],
  };
  const bound=bindIssuesToAuthorities(issues,ontology,pool,ctx,landText,'CIVIL')[0]?.bound_authorities||[];
  const labels=bound.map((x:any)=>String(x.source_label||''));
  check('C2 land-sale wanprestasi rejects consumer authority',
    !labels.some((x:string)=>/Konsumen/i.test(x)),
    `bound=${labels.join(' | ')||'(kosong)'}`);
  check('C3 land-sale wanprestasi retains private-law authority',
    labels.some((x:string)=>/KUHPerdata/i.test(x)),
    `bound=${labels.join(' | ')||'(kosong)'}`);
}

{
  const consumerText='Konsumen membeli produk elektronik. Pelaku usaha menolak garansi dan pengembalian dana atas produk cacat.';
  check('C4 real consumer dispute has relationship evidence',
    hasConsumerRelationshipEvidence(consumerText));
  const issues=[{issue:'Apakah terdapat pelanggaran hak konsumen, tanggung jawab pelaku usaha, dan mekanisme ganti rugi yang berlaku?',rule:'',analysis:'',conclusion:'',evidence_tags:[]}];
  const ontology=[{issue:issues[0].issue,id:'consumer-relationship',query_terms:['perlindungan konsumen','cacat produk','ganti rugi'],domain:'PERDATA_UMUM'}];
  const pool=[candidate({
    title:'UU Perlindungan Konsumen',source_label:'UU Perlindungan Konsumen',
    domain_tags:['perlindungan konsumen','hak konsumen','pelaku usaha'],
    article_text_pool:'cacat produk ganti rugi garansi klausula baku',
  })];
  const ctx={primary_id:'PERDATA_UMUM' as any,primary_anchors:['perlindungan konsumen'],secondary_anchors:[],foreign_anchors:[]};
  const labels=(bindIssuesToAuthorities(issues,ontology,pool,ctx,consumerText,'CIVIL')[0]?.bound_authorities||[]).map((x:any)=>String(x.source_label||''));
  check('C5 real consumer dispute still binds consumer authority',
    labels.some((x:string)=>/Konsumen/i.test(x)),
    `bound=${labels.join(' | ')||'(kosong)'}`);
}

// ------------------------------------------------------------
// D — Agraria authority retrieval using the REAL local corpus
// ------------------------------------------------------------
{
  const issues=deriveOntologyIssues(landText);
  const landIssue=issues.find((x:any)=>x.id==='land-sale-chain');
  check('D1 land-sale-chain issue exists',!!landIssue,issues.map((x:any)=>x.id).join(','));
  check('D2 land-sale-chain query carries agraria bridge terms',
    !!landIssue && ['hak atas tanah','pendaftaran tanah','sertifikat'].some(t=>landIssue.query_terms.includes(t)),
    landIssue?.query_terms?.join(' | ')||'(missing)');

  const inferred=inferLegalContext(landText);
  const secondary=(inferred.secondary||[]).map((x:any)=>x.id);
  const ctx=buildDomainRankingContext(inferred.primary.id,secondary);
  const regime=detectCaseRegimeContext(landText);
  const issueTerms=[...new Set(issues.flatMap((x:any)=>x.query_terms||[]))];
  const matched=matchRegulations(landText,inferred.primary.label,issueTerms,ctx,regime);
  const selected=(matched.rows||[]).map((r:any)=>`${r.regulation?.nomor||''} ${r.regulation?.tentang||''}`);

  check('D3 local retrieval selects at least one agraria authority',
    selected.some((x:string)=>/Pokok-Pokok Agraria|Pendaftaran Tanah/i.test(x)),
    `selected=${selected.join(' || ')||'(kosong)'}`);

  check('D4 land-registration authority is not lost behind consumer law',
    selected.some((x:string)=>/Pendaftaran Tanah/i.test(x)),
    `selected=${selected.join(' || ')||'(kosong)'}`);
}

// ------------------------------------------------------------
// E — Workflow orientation / stage
// ------------------------------------------------------------
{
  const wf=buildLawyerWorkflow({
    title:'Jual beli tanah',
    text:landText,
    sourceRole:'CONTRACT_OR_AGREEMENT',
    domainContext:{primary:{id:'PERDATA_KONTRAKTUAL'}},
    evidence:{textual_facts:[{statement:'PPJB dan DP telah dilakukan'}],party_claims:[{statement:'Irma meminta pengembalian uang'}]},
    legalIssues:[],
    legalGaps:[],
    adverseEvidence:[],
    applicableLaw:[],
    verifiedTimeline:[{date:'2023',event:'jual beli'}],
    actorMatrix:[{actor:'Irma',roles:['Klien'],pages:[1]},{actor:'Agnes',roles:['Pihak'],pages:[1]}],
  });
  check('E1 land-sale client orientation is CIVIL_PLAINTIFF',
    wf.orientation==='CIVIL_PLAINTIFF',
    `${wf.orientation}/${wf.role_confidence}`);
  check('E2 generic intended legal action is PRE_LITIGATION, not APPEAL',
    wf.procedural_stage==='PRE_LITIGATION',
    wf.procedural_stage);
}

{
  const appealText='MEMORI BANDING. Penggugat mengajukan permohonan banding ke Pengadilan Tinggi terhadap putusan Pengadilan Negeri.';
  const wf=buildLawyerWorkflow({
    title:'Memori Banding',text:appealText,sourceRole:'LEGAL_CORRESPONDENCE',
    domainContext:{},evidence:{textual_facts:[],party_claims:[]},legalIssues:[],
    legalGaps:[],adverseEvidence:[],applicableLaw:[],verifiedTimeline:[],actorMatrix:[]
  });
  check('E3 explicit appeal remains APPEAL',wf.procedural_stage==='APPEAL',wf.procedural_stage);
}

console.log(`\n${pass}/${pass+fail} v674 checks PASS`);
if(fail)process.exit(1);
