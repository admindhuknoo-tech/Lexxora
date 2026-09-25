# LEXY PRODUCTION-PATH CANONICAL CUMULATIVE CORRECTIVE

## Baseline contract

This archive is a **single cumulative root overlay against `LEXY FINAL.zip`**.

- Locked baseline SHA256: `64c504b9ecafb7f1224a78d3fec64994d1b7983fdfc145ccb13231f67aa3bc4d`
- Integration: extract directly into the root of a clean `LEXY FINAL` tree and overwrite matching files.
- Do not stack Stage2 / Closure / Residual / V4 / Generalization overlays after this archive; their required corrective deltas are already cumulative here.

## Root causes closed

1. Production start path previously executed a compiled server artifact that could be stale relative to canonical TypeScript source. `npm start` now validates source/runtime parity and executes `dist/runtime/server.js`, which is generated from canonical source.
2. PDF/DOCX export previously accepted persisted analyses without proving that they were produced by the current canonical contract. Export now requires `LEXICORE_CANONICAL_ANALYSIS_V6`; stale records require re-analysis.
3. Actor extraction now distinguishes named actors from role/title/unit fragments and keeps conservative alias handling, including honorific normalization and negative merge controls.
4. BAP timeline extraction retains wrapped procedural dates and prioritizes investigation events without promoting DOB/document-number fragments.
5. Procedural authority binding applies stage compatibility across issue classes; investigation output cannot inherit mediation/appellate authorities merely from lexical overlap.
6. Supporting domains and issues retain material-nexus gates rather than raw lexical-score propagation.
7. Express session typing was decoupled from global `express-serve-static-core` augmentation; authenticated request typing is now explicit and project-local.

## Production-path guard

`audit-production-path-canonical-v6.mjs` starts the compiled production runtime, submits BAP and civil cases through `/api/case-analysis`, validates persisted canonical output, and exports real PDF bytes through the production endpoint. It also includes distinct-person and distinct-organization negative controls.

## Payload

89 project files differ from the locked `LEXY FINAL` baseline. See `PAYLOAD_SHA256.txt`.
