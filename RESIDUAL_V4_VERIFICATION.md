# FINAL RESIDUAL CLOSURE V4 — INTERNAL VERIFICATION

## Before / after deterministic benchmark

The same compatibility probe was executed on the preserved `FINAL_RESIDUAL_REALPATH` tree and on the V4 candidate:

- before: **7/14 PASS**
- after: **14/14 PASS**

The failures before V4 included negated finance activation, sublease disposition recall, procedural timeline dates, and missing Tipikor lex-specialis authority.

The dedicated V4 deterministic/cross-case suite on the final candidate is **57/57 PASS**. It includes positive and negative controls for:

- list negation vs contrast clause;
- `tanpa survei` financial discrepancy;
- criminal Tipikor authority routing;
- sublease redisposition vs ordinary lease;
- actor structural-prefix contamination;
- real civil docket syntax;
- canonical blank-page parsing and page-3 provenance;
- Sprindik / Penetapan Tersangka / BAP examination dates;
- signing/disbursement timeline events;
- previously ungated issue families;
- real production-path offline Tipikor analysis, Section III and supporting-domain leakage;
- non-constant evidence-needed and action-plan propagation.

## Existing regression rerun

All of the following completed with process exit code 0 on the final candidate:

- `audit-v70222-cross-case.ts` — 12/12
- `audit-v70226-procedural-posture-hierarchy.ts` — PASS
- `audit-v70226-procedural-posture-cross-case.ts` — PASS
- `audit-v70223-procedural-authority-precision.ts` — PASS
- `audit-v70223-procedural-authority-cross-case.ts` — PASS
- `audit-v70232-issue-materiality.ts` — 5/5
- `audit-case-general-v5.ts` — 32/32
- `audit-v683-actor-lexical-integrity.ts` — exit 0
- `audit-actor-noise-v685.ts` — 8/8
- `audit-actor-provenance-v684.ts` — 16/16
- `audit-lawyer-workflow-v55.ts` — 20/20
- `audit-lawyer-workflow-v551.ts` — 22/22
- `audit-lawyer-workflow-closure-v2.ts` — 9/9
- `audit-v611-regression-corpus.ts` — 70/70
- `audit-v611-source-quality-guard.ts` — 20/20
- `audit-source-quality-guard-v692.ts` — 3/3
- `audit-v6121-canonical-consolidation.mjs` — 16/16
- `audit-v684-evidence-provenance-integrity.mjs` — 9/9

During regression rerun, a real false-negative was found in the first V4 candidate: the tightened `civil-criminal-response` gate recognized `dirobek` but not legacy fixture wording `merobek`. Production code was corrected; the old test was not changed. `audit-case-general-v5` then returned to 32/32.

## TypeScript

`tsc --noEmit` was **actually executed** against the full final tree in this runner. It returned RC=2 because the runner does not contain the project's dev dependency type surface (`@types/node` and related packages); `npm ci` was attempted but the registry operation timed out in this environment. The errors begin with missing Node declarations (`fs`, `path`, `url`, `Buffer`) and are dependency-resolution errors, not diagnostics in the V4 changed files.

A real TypeScript compile was then run over every production file changed by V4 plus the V4 regression script, with the available runtime dependencies and Node declarations wired only for the check. Result: **SCOPED_TSC_RC=0**.

The user independently reported that the immediately preceding `FINAL_RESIDUAL_REALPATH` tree returns **full-project `tsc --noEmit` exit 0** when its complete dependency set is installed. This report does not relabel the local RC=2 as PASS; a full-dependency rerun on the integration machine remains required before RC freeze.

## Hardcoding / safety

No real-case names or organizations from the BAP fixture occur in production source. Real names are confined to deterministic test fixtures. No snapshot was relocked merely to obtain green results.
