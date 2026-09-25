# LEXY V8 EXACT-RUNTIME CUMULATIVE CORRECTIVE

## Baseline lock

Single cumulative root overlay against `LEXY FINAL.zip` only.

Locked baseline SHA256:
`64c504b9ecafb7f1224a78d3fec64994d1b7983fdfc145ccb13231f67aa3bc4d`

Do not stack older corrective archives after this overlay.

## Root cause closed

CA13 exposed that canonical source/runtime logic was already producing the intended actor, timeline, authority and domain results, but two legacy server entry points were still independent compiled bundles. A launch through `dist/server.cjs` or `.desktop-runtime/dist/server.cjs` could therefore bypass `dist/runtime/server.js` and reproduce stale semantics in a fresh analysis/export.

V8 removes that split-brain runtime condition:

- `dist/server.cjs` is now a compatibility forwarder to `dist/runtime/server.js`;
- `.desktop-runtime/dist/server.cjs` is the same compatibility forwarder to its canonical desktop runtime;
- `build-runtime-commonjs.mjs` regenerates the canonical runtime and always rewrites the legacy root entry as the forwarder;
- `verify-runtime-parity.mjs` now rejects stale/independent legacy entries;
- desktop staging refuses a non-forwarding legacy server entry.

## Semantic hardening

- Lawyer-facing actor projection is identity-first: if a concrete PERSON/ORGANIZATION exists, generic ROLE nodes cannot appear as parallel pseudo-parties.
- Honorific aliases remain canonicalized by the actor identity layer.
- Procedural timeline stays priority-sorted for BAP/investigation output.
- Procedural tempus is determined from the authority family itself, not only from `remedy-procedure`; a later procedural authority can be tested against process tempus instead of the older transaction tempus.
- Stage-family authority guard remains fail-closed, including mediation/pre-litigation authority at investigation stage.
- Secondary legal paths remain strength-ranked below the primary path unless independently justified.

## Canonical contract

Current analysis contract:
`LEXICORE_CANONICAL_ANALYSIS_V8`

V7 and older persisted analyses must be re-analysed before PDF/DOCX export.

## Deterministic exact-runtime test

`scripts/audit-exact-runtime-entrypoints-v8.mjs` executes the same BAP invariant through all four supported launch entries:

1. `dist/runtime/server.js`
2. `dist/server.cjs`
3. `.desktop-runtime/dist/runtime/server.js`
4. `.desktop-runtime/dist/server.cjs`

For every entry it performs production HTTP analysis, validates persisted canonical fields, exports real DOCX bytes, extracts `word/document.xml`, and asserts the rendered output has no stale actor rows, has procedural chronology first, blocks mediation authority at investigation stage, and prevents HIGH secondary-domain parity.
