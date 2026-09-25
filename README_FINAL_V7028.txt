LEXICORE V7.0.2.8 FINAL — LOCAL-FIRST OFFICIAL AUTHORITY INDEX

Purpose
- Replace fragile real-time judicial discovery as the sole retrieval path.
- Keep existing BPK/JDIH MA/Putusan MA live retrieval as verification/enrichment.
- Add a versioned local official-authority catalog snapshot for deterministic judicial discovery.
- Keep all professional-verification and material-nexus gates.

Apply
1. Extract this ZIP directly into the LexiCore project root.
2. Allow overwrite of the three existing server files.
3. Run: VERIFY_FINAL_V7028.bat

Expected architecture
Case query -> OFFICIAL_INDEX local search -> candidate authority -> live official verification/enrichment when available.
HTTP 403 from MA no longer destroys judicial discovery. Indexed results remain explicitly INDEXED_OFFICIAL, not falsely VERIFIED_OFFICIAL.

This patch contains no party/case-name hardcoding in production logic.
