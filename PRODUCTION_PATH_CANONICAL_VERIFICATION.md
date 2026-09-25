# PRODUCTION-PATH CANONICAL VERIFICATION

All commands below were executed on the final working tree before packaging. No assertion was relaxed to force a pass.

## Deterministic / cross-case regression

- `audit-residual-realpath-cumulative-v3.ts`: **38/38 PASS**
- `audit-residual-realpath-cumulative-v4.ts`: **57/57 PASS**
- `audit-case-general-v5.ts`: **32/32 PASS**
- `audit-v70223-procedural-authority-cross-case.ts`: **PASS**
- `audit-v70226-procedural-posture-cross-case.ts`: **PASS**
- `audit-v611-regression-corpus.ts`: **70/70 PASS**
- `audit-generalization-invariants-v5.ts`: **9/9 PASS**
- `audit-v690-group-a-correctness.mjs`: **16/16 PASS**
- `audit-v684-evidence-provenance-integrity.mjs`: **9/9 PASS**
- `audit-v6121-canonical-consolidation.mjs`: **16/16 PASS**

## Exact production path

`audit-production-path-canonical-v6.mjs`: **PASS**

Verified through compiled production runtime:

- POST `/api/case-analysis` returns HTTP 200;
- current canonical contract is stamped;
- BAP actor role/unit noise is absent from lawyer-facing actor matrix;
- Dewi Mufarida aliases collapse once;
- ELYA DWI ADMOKO is bound to Tersangka;
- 25 Maret 2026, 20 Mei 2026, and 21-05-2026 survive as procedural timeline events;
- DOB is excluded from material timeline;
- mediation/appellate authority cannot bind at investigation stage;
- civil honorific alias collapses to Kasiyah;
- generic litigation roles are absent from civil actor matrix;
- OJK consumer authority is blocked without consumer nexus;
- actual PDF export returns HTTP 200, canonical-contract header, and `%PDF` bytes;
- distinct-person and distinct-organization negative controls remain distinct.

## Runtime parity

- `build-runtime-commonjs.mjs`: **PASS**, 21 canonical source modules emitted.
- `verify-runtime-parity.mjs`: **PASS**, 21 canonical source files match runtime manifest.

## TypeScript

Executed exactly:

```
tsc --noEmit
```

Final result: **exit 0**.

The earlier local blocker caused by `express-serve-static-core` augmentation was removed by using an explicit project-local `SessionRequest` type instead of global module augmentation.
