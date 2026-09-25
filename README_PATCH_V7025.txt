LEXICORE V7.0.2.5 - PROBE CONTRACT COMPATIBILITY CORRECTIVE

Purpose
- Fix the exact TypeScript regression reported after V7.0.2.4:
  audit-v7021-live-provider-connectivity.ts still referenced removed fields p.ok and p.status.
- Preserve V7.0.2.4 access_state semantics.
- Add a regression guard so historical live-provider audits cannot silently drift from OfficialProviderConnectivityProbe again.

Changed files only
- scripts/audit-v7021-live-provider-connectivity.ts
- scripts/audit-v7025-probe-contract-compatibility.mjs
- VERIFY_V7025.bat

No production retrieval/reasoning file is changed in this corrective.
V7.0.2.4 server/officialLawRetriever.ts remains authoritative.

Apply
1. Extract this ZIP directly into the LexiCore project root.
2. Overwrite scripts/audit-v7021-live-provider-connectivity.ts when prompted.
3. Run VERIFY_V7025.bat.

Expected first gate
- npm run lint must report zero TypeScript errors.

Important
- V7.0.2.5 does NOT convert blocked providers into PASS.
- HTTP 401/403/429 remains REACHABLE_BLOCKED under V7.0.2.4 semantics.
- Final live usability is still decided by VERIFY_V7024.bat and its official-detail fallback verification.
