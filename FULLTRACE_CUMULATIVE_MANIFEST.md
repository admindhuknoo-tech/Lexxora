# LEXY FULLTRACE CUMULATIVE CORRECTIVE

## Baseline
Single cumulative root overlay against `LEXY FINAL.zip`.

Locked baseline SHA256:
`64c504b9ecafb7f1224a78d3fec64994d1b7983fdfc145ccb13231f67aa3bc4d`

Apply only to a clean `LEXY FINAL` root. Do not stack earlier corrective overlays afterward.

## Production-path root causes closed

1. **Canonical actor identity**
   - honorific prefixes (`Sdr`, `Sdri`, `Ibu`, `Bapak`, etc.) are normalized before canonical keying;
   - role/title/unit mentions do not become lawyer-facing actors merely because a material verb occurs elsewhere in the statement;
   - role-only fallback remains when the role itself performs a concrete material act and no named identity exists;
   - distinct-person and distinct-organization negative controls remain separate.

2. **BAP timeline**
   - Sprindik, Penetapan Tersangka, and BAP examination dates are extracted explicitly;
   - year-only dates use bounded local context rather than a whole OCR line;
   - DOB/document-number fragments do not become procedural events;
   - investigation procedural events are prioritized ahead of substantive historical events while substantive dates remain available.

3. **Procedural authority binding**
   - specific mediation/pre-litigation families are classified before broad general-procedure fallback;
   - investigation/prosecution reject general procedural authorities without a criminal-procedure nexus;
   - appellate/mediation authorities cannot enter investigation output through generic lexical overlap.

4. **Supporting-domain presentation**
   - secondary paths are strength-ranked relative to the primary path and cannot present HIGH parity merely from raw lexical score.

5. **Exact production path**
   - `npm start` verifies source/runtime parity and starts `dist/runtime/server.js` built from canonical source;
   - PDF/DOCX export requires current canonical analysis contract;
   - contract bumped to `LEXICORE_CANONICAL_ANALYSIS_V8`, so V6/stale persisted analyses must be re-analysed before export;
   - desktop runtime copy contains the same compiled canonical runtime.

## Cross-case guards

- BAP / investigation: named suspect, investigator, credit/corporate vocabulary, procedural dates, criminal authorities.
- Civil inheritance/land pleading: honorific alias collapse, generic litigation-role suppression, no OJK authority without consumer nexus.
- Role-only civil fallback: a directly acting unnamed role remains representable.
- Negative controls: distinct people and distinct organizations are not fuzzy-merged.

## New/updated deterministic tests

- `scripts/audit-production-path-fulltrace-v7.ts`
- `scripts/audit-production-path-fulltrace-v7.mjs`
- `npm run audit:production-path` now executes the compiled production-path V7 test.

