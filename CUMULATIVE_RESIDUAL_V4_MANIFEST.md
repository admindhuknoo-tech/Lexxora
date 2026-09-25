# LEXY ONE CUMULATIVE CORRECTIVE — FINAL RESIDUAL CLOSURE V4

## Baseline / layering contract

This ZIP is a **single cumulative overlay against `LEXY FINAL.zip`**. It already contains all source/test changes from the previously accepted cumulative corrective chain through `LEXY_ONE_CUMULATIVE_CORRECTIVE_FINAL_RESIDUAL_REALPATH`, plus the V4 residual closure below.

Recommended clean integration:

`LEXY FINAL` → overlay `LEXY_ONE_CUMULATIVE_CORRECTIVE_FINAL_RESIDUAL_CLOSURE_V4`

Do **not** stack Stage2 / FINAL / FINAL_CLOSURE / RESIDUAL_REALPATH again after applying this ZIP.

## Scope lock

No new architecture, no resolver replacement, no mass rename, no fixture hardcoding in production, no new element-analysis framework.

Residual closure addresses the measured defects around:

1. negation scope in financial/collateral activation;
2. criminal lex-specialis routing for corruption / Tipikor;
3. redisposition/sublease issue recall;
4. actor prefix contamination and canonical actor capture;
5. canonical civil docket recognition (`45/Pdt.G/2023/...`);
6. canonical page splitting and blank-page isolation;
7. wrapped-line / numeric procedural timeline dates;
8. materiality gates for previously keyword-only issue templates;
9. propagation of structured evidence-needed / action-plan fields from existing canonical results.

`element_analysis` remains out of scope because the current schema has no element-level data model; implementing it would be a new reasoning capability rather than regression repair.

## New delta over FINAL_RESIDUAL_REALPATH

Production files changed by V4:

- `server/caseIntegrityPolicy.mjs`
- `server/documentIngestion.ts`
- `server/evidenceModel.ts`
- `server/legalOntology.ts`
- `server/proceduralPosture.ts`
- `server/lawyerWorkflow.ts`
- `server/caseAnalysis.ts`

New deterministic regression:

- `scripts/audit-residual-realpath-cumulative-v4.ts`

## Root-cause corrections

- Page marker parsing is centralized in `splitMarkedPages`; production page consumers use the same splitter, preventing a blank page from consuming the following page.
- Civil docket recognition is centralized in `CIVIL_DOCKET_RE`, accepting real register forms such as `45/Pdt.G/2023` without requiring a dot after `G`.
- Timeline extraction reads bounded adjacent-line context for wrapped labels and recognizes numeric dates, examination, signing and disbursement events without treating slash-delimited case/document-number years as event dates.
- Tipikor lex-specialis terms are attached to the criminal issue/authority route itself, not borrowed from a corporate supporting domain.
- Materiality gating is applied to the substantive issue-template families; isolated/negated lexical mentions do not promote issues, while positive controls remain live.
- Sublease/redisposition retains recall through action + party/authority nexus rather than a single closed keyword.
- Financial negative scope removes the negated clause, not the entire sentence: `tidak ada ...` lists remain negative while a contrast clause (`tetapi kredit ...`) remains positive.
- Actor trimming removes structural court/role/title contamination without merging distinct people or organizations.
- `evidence_needed` and `action_plan` are derived from existing gaps/workflow/issues rather than fixed generic strings; no new reasoning schema is introduced.

## Payload

32 project files differ from `LEXY FINAL`. See `PAYLOAD_SHA256.txt` and `CUMULATIVE_RESIDUAL_V4.diff`.
