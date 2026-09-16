// V6.9.1 — Readiness Score Calibration (Group B, item 7).
//
// Regression guard: a high-stakes submission (LITIGATION_SUBMISSION,
// COMPLAINT_OR_PETITION, DEFENSE_SUBMISSION_WITH_EXHIBITS, INVESTIGATION_OR_BAP)
// whose legal domain has not been confidently routed must not show a
// case_readiness / working_paper_percentage that contradicts pipeline_gate's
// own domain_routing_confident verdict. Before this fix, pipeline_gate would
// report DEGRADED for exactly this condition while case_readiness (the
// donut / working-paper percentage the lawyer actually sees) stayed at
// MEDIUM confidence with no acknowledgement of the unresolved domain.

import { runCaseAnalysis } from '../server/caseAnalysis';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${label} | ${detail}`);
  if (ok) pass++; else fail++;
}

const litigationSubmissionAmbiguousDomain = `
JAWABAN TERGUGAT

Perkara Nomor 123/Pdt.G/2024/PN.Sby

Penggugat: Budi Santoso.
Tergugat: Andi Saputra.

Dalam jawaban ini, Tergugat menyatakan sebagai berikut.

Pada tanggal 5 Januari 2024, Penggugat dan Tergugat melakukan kesepakatan lisan
mengenai suatu hal. Pada tanggal 10 Februari 2024, terjadi perselisihan antara
kedua pihak mengenai pelaksanaan kesepakatan tersebut. Penggugat menyatakan
telah dirugikan sebesar Rp 50.000.000 akibat tindakan Tergugat.

Pada tanggal 1 Maret 2024, Penggugat mengirimkan surat kepada Tergugat. Pada
tanggal 15 Maret 2024, Tergugat membalas surat tersebut. Saksi Citra Dewi
mengetahui peristiwa ini. Saksi Doni Pratama juga hadir pada saat kejadian.

Berdasarkan uraian di atas, Tergugat memohon kepada Pengadilan untuk menolak
gugatan Penggugat seluruhnya.
`.trim();

const result: any = await runCaseAnalysis({
  title: 'Regression: ambiguous-domain litigation submission',
  narrative: litigationSubmissionAmbiguousDomain,
  input_type: 'narrative',
  regulatory_mode: 'offline',
});

const sourceRole = result.source_role;
const domainConfidence = String(result.domain_classification?.confidence || '').toUpperCase();
const domainAmbiguous = result.domain_classification?.ambiguous === true;
const gateStatus = result.pipeline_gate?.status;
const gateBlockers: string[] = result.pipeline_gate?.blockers || [];
const domainGateFailed = gateBlockers.some((b) => b.startsWith('domain_routing_confident'));
const readinessScore = Number(result.case_readiness?.overall_score);
const readinessConfidence = result.case_readiness?.confidence;
const wpPercentage = Number(result.case_working_paper?.working_paper_percentage?.percentage);
const wpDecreasing: any[] = result.case_working_paper?.working_paper_percentage?.variables_decreasing || [];
const hasDomainRoutingLine = wpDecreasing.some((v) => /domain hukum belum solid/i.test(String(v?.variable || '')));

check(
  '1.1 fixture actually reaches a high-stakes source role with unconfirmed domain',
  ['LITIGATION_SUBMISSION', 'COMPLAINT_OR_PETITION', 'DEFENSE_SUBMISSION_WITH_EXHIBITS', 'INVESTIGATION_OR_BAP'].includes(sourceRole)
    && (domainConfidence === 'LOW' || domainAmbiguous),
  `source_role=${sourceRole}; domain_confidence=${domainConfidence}; ambiguous=${domainAmbiguous}`,
);
check(
  '1.2 pipeline_gate flags domain_routing_confident as a blocker',
  gateStatus === 'DEGRADED' && domainGateFailed,
  `status=${gateStatus}; domain_gate_failed=${domainGateFailed}`,
);
check(
  '2.1 case_readiness does not exceed the domain-unconfirmed ceiling',
  Number.isFinite(readinessScore) && readinessScore <= 55,
  `overall_score=${readinessScore}`,
);
check(
  '2.2 case_readiness confidence is downgraded to LOW',
  readinessConfidence === 'LOW',
  `confidence=${readinessConfidence}`,
);
check(
  '2.3 working_paper_percentage matches case_readiness (no divergent surfaces)',
  wpPercentage === readinessScore,
  `working_paper=${wpPercentage}; case_readiness=${readinessScore}`,
);
check(
  '2.4 working paper explains the domain-routing penalty for auditability',
  hasDomainRoutingLine,
  `variables_decreasing=${JSON.stringify(wpDecreasing.map((v) => v.variable))}`,
);

console.log(`\n${pass}/${pass + fail} readiness-domain-routing checks PASS`);
if (fail > 0) process.exit(1);
