declare const process: any;
import { buildLawyerWorkflow } from '../server/lawyerWorkflow';
import { runCaseAnalysis } from '../server/caseAnalysis';
import { analysisToText } from '../server/exporters';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

function wf(text: string, sourceRole: string) {
  return buildLawyerWorkflow({
    title: 'Group B audit', text, sourceRole,
    domainContext: { confidence: 'HIGH', ambiguous: false },
    evidence: { textual_facts: [], party_claims: [{ statement: 'claim' }] },
    legalIssues: [{ issue: 'Isu material', analysis: 'Analisis isu material yang membutuhkan strategi prosedural yang tepat.' }],
    legalGaps: [], adverseEvidence: [], applicableLaw: [{ source: 'UU', status: 'LOCAL' }],
    verifiedTimeline: [], actorMatrix: [{ actor: 'Andi', roles: ['Pihak'] }, { actor: 'Budi', roles: ['Pihak'] }],
  } as any);
}

async function main() {
  // ============================================================
  // #5 Procedural Posture Integrity
  // ============================================================
  const investigation = wf(
    'BERITA ACARA PEMERIKSAAN. Tersangka Andi diperiksa oleh penyidik. Pendampingan pemeriksaan tersangka berlangsung dalam tahap penyidikan.',
    'INVESTIGATION_OR_BAP',
  );
  const invDraft = investigation.stages.find(s => s.id === 'drafting');
  const invFinal = investigation.drafting_plan[investigation.drafting_plan.length - 1];
  check('5.1 investigation stage detected', investigation.procedural_stage === 'INVESTIGATION', `stage=${investigation.procedural_stage}`);
  check('5.2 investigation final-drafting stage is not READY', invDraft?.status === 'PARTIAL', `status=${invDraft?.status}`);
  check('5.3 investigation output is stage-appropriate internal material', /pendampingan pemeriksaan|keberatan prosedural/i.test(invFinal?.document || ''), `document=${invFinal?.document}`);
  check('5.4 investigation guard blocks premature final pleading', /jangan.*pledoi|jangan.*eksepsi|internal/i.test(invFinal?.stage_guard || ''), `guard=${invFinal?.stage_guard}`);

  const prelit = wf(
    'Klien meminta kembali pembayaran dan akan mengirim somasi serta melakukan negosiasi sebelum gugatan.',
    'CASE_NARRATIVE_OR_QUESTION',
  );
  const preDraft = prelit.stages.find(s => s.id === 'drafting');
  const preFinal = prelit.drafting_plan[prelit.drafting_plan.length - 1];
  check('5.5 pre-litigation stage detected', prelit.procedural_stage === 'PRE_LITIGATION', `stage=${prelit.procedural_stage}`);
  check('5.6 pre-litigation drafting may be READY when stage-appropriate', preDraft?.status === 'READY', `status=${preDraft?.status}`);
  check('5.7 pre-litigation document is somasi/negotiation, not pleading', /somasi|negosiasi|pra-litigasi/i.test(preFinal?.document || '') && !/pledoi/i.test(preFinal?.document || ''), `document=${preFinal?.document}`);

  const pleading = wf(
    'JAWABAN TERGUGAT\nPerkara Nomor 123/Pdt.G/2024/PN.Sby. Tergugat membantah dalil Penggugat dan memohon gugatan ditolak.',
    'LITIGATION_SUBMISSION',
  );
  const pleadingDraft = pleading.stages.find(s => s.id === 'drafting');
  const pleadingFinal = pleading.drafting_plan[pleading.drafting_plan.length - 1];
  check('5.8 pleading stage detected', pleading.procedural_stage === 'PLEADING', `stage=${pleading.procedural_stage}`);
  check('5.9 pleading drafting is READY', pleadingDraft?.status === 'READY', `status=${pleadingDraft?.status}`);
  check('5.10 pleading document matches pleading stage', /gugatan|jawaban|replik|duplik|eksepsi|pledoi/i.test(pleadingFinal?.document || ''), `document=${pleadingFinal?.document}`);

  // ============================================================
  // #6 Risk Score Calibration + #7 Readiness Score Calibration
  // ============================================================
  const investigationRuntime: any = await runCaseAnalysis({
    title: 'Group B investigation calibration',
    narrative: `BERITA ACARA PEMERIKSAAN\nTersangka Andi Saputra diperiksa oleh Penyidik Polres Sidoarjo. Pada tanggal 5 Januari 2024 penyidik menanyakan penerimaan dana Rp50.000.000. Tersangka menyatakan dana tersebut adalah pembayaran utang. Saksi Budi Santoso diperiksa mengenai transfer tersebut. Pendamping hukum meminta agar seluruh pertanyaan dan jawaban dicatat dalam BAP.`,
    input_type: 'narrative', regulatory_mode: 'offline',
  });
  const invRisk = investigationRuntime.risk_score_breakdown || [];
  const invDec = investigationRuntime.case_working_paper?.working_paper_percentage?.variables_decreasing || [];
  check('6.1 posture uncertainty is auditable in risk breakdown', invRisk.some((x:any)=>x.factor === 'Procedural-posture uncertainty' && Number(x.score) >= 60), JSON.stringify(invRisk));
  check('7.1 unresolved high-stakes posture caps readiness at LOW', Number(investigationRuntime.case_readiness?.overall_score) <= 55 && investigationRuntime.case_readiness?.confidence === 'LOW', `score=${investigationRuntime.case_readiness?.overall_score}; confidence=${investigationRuntime.case_readiness?.confidence}`);
  check('7.2 working paper explains posture penalty', invDec.some((x:any)=>/posture prosedural/i.test(String(x.variable || ''))), JSON.stringify(invDec.map((x:any)=>x.variable)));

  const claimOnlyRuntime: any = await runCaseAnalysis({
    title: 'Group B claim-only calibration',
    narrative: `Klien Budi menyatakan telah membeli tanah dari Andi berdasarkan perjanjian. Andi disebut belum menyerahkan dokumen yang dijanjikan. Klien meminta kembali pembayaran dan akan mengirim somasi sebelum melakukan upaya hukum. Saksi Citra disebut mengetahui pembayaran tersebut.`,
    input_type: 'narrative', regulatory_mode: 'offline',
  });
  const claimRisk = claimOnlyRuntime.risk_score_breakdown || [];
  const claimDec = claimOnlyRuntime.case_working_paper?.working_paper_percentage?.variables_decreasing || [];
  check('6.2 claim-only evidence raises an explicit uncertainty floor', claimRisk.some((x:any)=>x.factor === 'Evidence uncertainty' && Number(x.score) >= 55), JSON.stringify(claimRisk));
  check('7.3 claim-only readiness surface explains the evidence limitation', claimDec.some((x:any)=>/claim-only/i.test(String(x.variable || ''))), JSON.stringify(claimDec.map((x:any)=>x.variable)));

  const pleadingRuntime: any = await runCaseAnalysis({
    title: 'Group B pleading control',
    narrative: `JAWABAN TERGUGAT\nPerkara Nomor 123/Pdt.G/2024/PN.Sby\nPenggugat Budi Santoso. Tergugat Andi Saputra. Pada tanggal 5 Januari 2024 para pihak menandatangani perjanjian jual beli. Penggugat mendalilkan Tergugat wanprestasi. Tergugat membantah dalil tersebut karena pembayaran belum dilunasi. Saksi Citra Dewi mengetahui penandatanganan perjanjian. Tergugat memohon gugatan ditolak seluruhnya.`,
    input_type: 'narrative', regulatory_mode: 'offline',
  });
  const pleadRisk = pleadingRuntime.risk_score_breakdown || [];
  const pleadDraftStage = pleadingRuntime.lawyer_workflow?.stages?.find((x:any)=>x.id === 'drafting');
  check('6.3 valid pleading posture does not receive a false posture-risk penalty', !pleadRisk.some((x:any)=>x.factor === 'Procedural-posture uncertainty'), JSON.stringify(pleadRisk));
  check('7.4 valid pleading posture remains READY at workflow level', pleadDraftStage?.status === 'READY', `status=${pleadDraftStage?.status}`);
  check('7.5 working-paper maturity remains internally synchronized', Number(pleadingRuntime.case_readiness?.overall_score) === Number(pleadingRuntime.case_working_paper?.working_paper_percentage?.percentage), `readiness=${pleadingRuntime.case_readiness?.overall_score}; wp=${pleadingRuntime.case_working_paper?.working_paper_percentage?.percentage}`);

  // ============================================================
  // #7 Canonical readiness contract corrective
  // ============================================================
  for (const [label, runtime] of [['investigation', investigationRuntime], ['claim-only', claimOnlyRuntime], ['pleading', pleadingRuntime]] as Array<[string, any]>) {
    const pipeline = Number(runtime.pipeline_gate_readiness?.score ?? runtime.pipeline_gate?.score ?? 0);
    const working = Number(runtime.working_paper_readiness?.score ?? runtime.case_working_paper?.working_paper_percentage?.percentage ?? 0);
    const analysis = Number(runtime.analysis_readiness?.score ?? runtime.analysis_readiness?.overall_score ?? -1);
    check(`7.6 ${label} canonical readiness = min(pipeline, working paper)`, analysis === Math.min(pipeline, working), `pipeline=${pipeline}; working=${working}; analysis=${analysis}`);
  }
  check('7.7 pipeline gate is explicitly internal', investigationRuntime.pipeline_gate_readiness?.internal === true, JSON.stringify(investigationRuntime.pipeline_gate_readiness));
  check('7.8 working-paper maturity is explicitly internal', investigationRuntime.working_paper_readiness?.internal === true, JSON.stringify(investigationRuntime.working_paper_readiness));
  check('7.9 analysis readiness is canonical contract', investigationRuntime.analysis_readiness?.rule === 'MIN_PIPELINE_GATE_AND_WORKING_PAPER', JSON.stringify(investigationRuntime.analysis_readiness));

  const controlText = analysisToText(pleadingRuntime);
  const canonicalScore = Number(pleadingRuntime.analysis_readiness?.score || 0);
  const pipelineScore = Number(pleadingRuntime.pipeline_gate?.score || 0);
  const wpScore = Number(pleadingRuntime.working_paper_readiness?.score || 0);
  check('7.10 exported main readiness uses canonical analysis readiness', controlText.includes(`Kesiapan Analisis: ${pleadingRuntime.analysis_readiness?.status === 'READY' ? 'Siap' : 'Perlu Tinjauan'} - ${canonicalScore}%`), `canonical=${canonicalScore}`);
  check('7.11 exported pipeline gate remains separate', controlText.includes(`PIPELINE GATE: ${String(pleadingRuntime.pipeline_gate?.status || '')}`), `pipeline=${pipelineScore}`);
  check('7.12 working-paper maturity remains distinct from canonical readiness', Number.isFinite(wpScore) && pleadingRuntime.case_working_paper?.working_paper_percentage?.metric === 'WORKING_PAPER_MATURITY', `wp=${wpScore}; metric=${pleadingRuntime.case_working_paper?.working_paper_percentage?.metric}`);

  console.log(`\n${pass}/${pass + fail} group-b-strategic-output checks PASS`);
  if (fail) process.exit(1);
}

main().catch((err:any)=>{ console.error(err); process.exit(1); });
