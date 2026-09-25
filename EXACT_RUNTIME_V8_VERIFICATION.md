# LEXY V8 EXACT-RUNTIME VERIFICATION

## Required compiler gate

Literal command executed:

```text
tsc --noEmit
```

Result: **exit 0**.

The test environment used the real project runtime dependencies plus installed TypeScript/Node type packages; no source stubs or fake module declarations were added to the project.

## Exact runtime matrix

`node scripts/audit-exact-runtime-entrypoints-v8.mjs`

Result: **PASS — 4/4 server entry points**.

Each entry independently passed:

- current `LEXICORE_CANONICAL_ANALYSIS_V8` contract stamp;
- no generic `Terdakwa` / `Pemohon` actor leakage beside named actors;
- `Sdr. Dewi Mufarida` canonicalized to one `Dewi Mufarida` identity;
- 25 Maret 2026, 20 Mei 2026, and 21-05-2026 retained and placed before historical substantive dates;
- PERMA No. 1 Tahun 2016 / mediation authority absent at investigation stage;
- KUHAP procedural authority evaluated against process tempus, not the 2022 transaction tempus;
- secondary paths do not render HIGH at parity with the primary criminal path;
- actual DOCX export bytes valid;
- extracted `word/document.xml` confirms the same actor/timeline/authority invariants in the rendered lawyer-facing document.

## Regression results executed after V8 changes

- `audit-v690-group-a-correctness.mjs`: **16/16 PASS**
- `audit-v6121-canonical-consolidation.mjs`: **16/16 PASS**
- `audit-v70228-lawyer-facing-cross-case.mjs`: **65/65 PASS**
- `audit-v70227-lawyer-facing-export-cross-case.mjs`: **48/48 PASS**
- `audit-residual-realpath-cumulative-v3.ts` against current compiled runtime: **38/38 PASS**
- `audit-case-general-v5.ts`: **32/32 PASS**
- `audit-generalization-invariants-v5.ts`: **9/9 PASS**
- `audit-actor-provenance-v684.ts`: **16/16 PASS**
- `audit-actor-noise-v685.ts`: **8/8 PASS**
- `audit-v70232-issue-materiality.ts`: **5/5 PASS**
- `audit-v70223-procedural-authority-cross-case.ts`: **PASS**
- `audit-v70226-procedural-posture-cross-case.ts`: **PASS**
- `audit-lawyer-workflow-v551.ts`: **22/22 PASS**
- `audit-v611-regression-corpus.ts`: **70/70 PASS**
- `audit-v611-source-quality-guard.ts`: **20/20 PASS**

`audit-residual-realpath-cumulative-v4.ts` was not counted as a clean regression result in the ad-hoc CommonJS harness because its direct `.mjs` import requires the original TSX/ESM runner. Its production Tipikor assertions were separately executed against the canonical V8 runtime and returned the expected non-empty Tipikor/KUHAP applicable-law set. This is stated explicitly rather than converting that harness limitation into a fake PASS.

## Anti-hardcode check

Production source contains no `Dewi Mufarida`, `ELYA DWI ADMOKO`, or `RUMATA ROSININTA` fixture names. Those names exist only in deterministic regression fixtures.
