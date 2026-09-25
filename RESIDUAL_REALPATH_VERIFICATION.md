# FINAL RESIDUAL REALPATH VERIFICATION

## Before/after deterministic benchmark

The same 38-check cross-case suite was executed against the preserved FINAL_CLOSURE tree and the corrected tree.

- FINAL_CLOSURE before corrective: **12/38 PASS** (26 failures).
- Corrected tree: **38/38 PASS**.

The suite includes positive and negative controls for: canonical named actors, OCR near-aliases, false structural actors, organization consolidation, distinct-person/distinct-company non-merging, BAP procedural dates, document-number date-fragment rejection, procedural priority, employment-domain noise, true employment disputes, formal-status noise, multi-path domain resurrection, and role-only material actors.

## Existing regressions rerun

- Group-A canonical/entity/authority/temporal runtime: **16/16 PASS**.
- Actor lexical integrity: **4/4 PASS**.
- Actor noise: **8/8 PASS**.
- Actor provenance: **16/16 PASS**.
- Case general semantic: **32/32 PASS**.
- Issue materiality: **5/5 PASS**.
- Procedural posture hierarchy: **31/31 PASS**.
- Procedural posture cross-case: **13/13 PASS**.
- Procedural authority precision: **15/15 PASS**.
- Procedural authority cross-case: **6/6 PASS**.
- Lawyer workflow v55: **20/20 PASS**.
- Lawyer workflow v551: **22/22 PASS**.
- Lawyer workflow closure v2: **9/9 PASS**.
- Permanent regression corpus v611: **70/70 PASS**.
- Source-quality v611: **20/20 PASS**.
- Legacy source-quality compatibility v692: **3/3 PASS**.
- Evidence provenance integrity: **9/9 PASS**.
- Canonical consolidation: **16/16 PASS**.
- V7.0.2.22 closure batch: **19/19 PASS** when executed with the project root as cwd (required because the test reads the local regulation corpus through db).

## TypeScript verification — no fake PASS

Full-project command was **actually executed after the final source changes**:

`tsc --noEmit`

Result in this runner: **exit 2**, with exactly one diagnostic:

`licensing/web/session.ts(5,16): TS2664: Invalid module name in augmentation, module 'express-serve-static-core' cannot be found.`

The same command on the preserved FINAL_CLOSURE tree (without the new residual test file) produces the same single environment/dependency diagnostic. The uploaded runtime dependency set contains production Express but not the full `@types/express` / `@types/express-serve-static-core` development package; registry DNS is unavailable in this runner, so a clean `npm ci` cannot complete. This status is therefore **not reported as PASS**.

To separate that pre-existing environment dependency from the corrective source, `tsc --noEmit` was also genuinely run over every changed TypeScript production module plus the deterministic regression test with normal TS module resolution. Result: **exit 0**.

Changed-scope command covered:
- `server/evidenceModel.ts`
- `server/legalOntology.ts`
- `server/forensicReasoner.ts`
- `server/caseAnalysis.ts`
- `scripts/audit-residual-realpath-cumulative-v3.ts`

## Limits

The original source BAP file used to generate the shared 40-page PDF was not available as an ingestion input in this turn, so the exact document could not be rerun through upload → ingestion → analysis. The new permanent regression fixture is derived from the concrete failure patterns visible in that production export and is complemented by negative cross-case controls. No claim of full RC readiness is made from this patch alone.
