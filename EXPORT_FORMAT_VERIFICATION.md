# Export Format Verification

Executed against the cumulative working tree.

## Deterministic export regression

`node --experimental-strip-types scripts/audit-export-legal-document-format-v1.ts`

Result: **19/19 PASS**.

Locks PDF/DOCX generation, Times New Roman contract, 14 pt title, 12 pt body, 1.5 line spacing, 6 pt after-paragraph spacing, 4/3/3/3 cm DOCX margins, actor/timeline table headers, page-label cleanup, OCR-noise cleanup, and preservation of named actors.

## Existing exporter safety-net

- `audit-v684-evidence-provenance-integrity.mjs`: **9/9 PASS**
- `audit-v6121-canonical-consolidation.mjs`: **16/16 PASS**

## TypeScript

A real full-project `tsc --noEmit` was executed. It could not complete successfully in this runner because the uploaded project does not contain a complete development dependency/type-definition installation; an attempted `npm install` timed out and left incomplete `@types/*` packages. This status is **not reported as PASS**.

A scoped TypeScript check of the changed exporter and its new deterministic test was then executed with a temporary Node `Buffer/process` declaration shim (not included in the patch): **PASS / exit 0**.

The test itself also executes the actual `createPdfBuffer` and `createDocxBuffer` production exporter functions.
