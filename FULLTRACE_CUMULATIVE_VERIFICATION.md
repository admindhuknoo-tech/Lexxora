# FULLTRACE CUMULATIVE VERIFICATION

All results below were executed against the final working tree before packaging.

## Exact TypeScript check

Command:

`npm run lint`

which executes:

`tsc --noEmit`

Result: **exit 0**.

No source/type suppression was added to manufacture this result. The check used the project's real runtime dependencies plus the installed TypeScript/Node type packages available in the verification environment.

## Deterministic / cross-case

- Fulltrace source invariants: **12/12 PASS**
- Full compiled production-path API + persisted canonical result + PDF/DOCX export: **PASS**
- Residual real-path V3: **38/38 PASS**
- Residual real-path V4: **57/57 PASS**
- Case general V5: **32/32 PASS**
- Group-A correctness: **16/16 PASS**
- Actor noise V685: **8/8 PASS**
- Actor provenance V684: **16/16 PASS**
- Issue materiality V7.0.2.32: **5/5 PASS**
- Procedural posture hierarchy: **PASS**
- Procedural posture cross-case: **PASS**
- Procedural authority precision: **PASS**
- Procedural authority cross-case: **PASS**
- Lawyer workflow V55/V551/closure: **PASS**
- Permanent regression corpus V611: **PASS**
- Source-quality guards: **PASS**
- Evidence provenance: **PASS**
- Canonical consolidation: **PASS**
- Closure batch: **19/19 PASS**

## Non-cheat evidence

The production-path suite previously failed because a year-only `2022` inherited procedural context from a long OCR line. Production code was corrected by bounding year context; the assertion was not weakened. A civil production-path run also exposed generic `Penggugat` propagation and was fixed in the canonical actor path rather than excluded in the fixture.

## Export/runtime contract

Current contract: `LEXICORE_CANONICAL_ANALYSIS_V8`.
Old V6 persisted analyses are intentionally stale and require re-analysis before PDF/DOCX export.
