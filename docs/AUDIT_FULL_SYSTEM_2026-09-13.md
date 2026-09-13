# LexiCore — Full-System Corrective Audit
Date: 2026-09-13
Baseline policy: preservation-first; no UI/ecosystem refactor. Active 8-menu legacy workspace remains intact.

## Scope
End-to-end audit of input ingestion, Case Analysis four-script contract, legal-source honesty, persistence/history behavior, Contract Review, Legal Drafting, Compliance & Risk, Legal Research, Norm Conflict, PDF/DOCX export, error handling, and dead/hard-coded behavior affecting professional reliability.

## Critical findings corrected
1. **Binary document corruption** — PDF/DOCX/image uploads were previously decoded with `buffer.toString('utf8')`, causing binary bytes to become facts. Replaced with a controlled ingestion layer: local text/RTF/DOCX/PDF text-layer extraction, and AI-assisted transcription only when a scan/image requires it and Gemini is configured. Unsupported/unreadable scans now fail explicitly instead of entering legal reasoning as gibberish.
2. **Case Analysis fallback integrity** — removed hard-coded land/SHM/BPN litigation assumptions, hard-coded 82 readiness, automatic UUD 1945 fallback, empty risk matrix/zero risk behavior, and false online-source verification claims. Four-script output remains mandatory: summary, facts, legal issues, applicable law, arguments for/against, risk matrix + score, best/worst case, recommendations, verification note.
3. **Source verification honesty** — official-source status now distinguishes local corpus candidates, host reachability, and professional verification. Host reachability is not represented as proof that a regulation is current or applicable.
4. **Exporter content integrity** — exporter sanitizes control/binary contamination and refuses to print obvious corrupt source text. PDF/DOCX continue using the Industrial Executive & Audit layout.
5. **Contract Review ingestion** — now uses the same controlled document ingestion instead of raw binary decoding; result shape is normalized for the existing frontend.
6. **Legal Drafting fallback** — deterministic fallback is document-type aware (somasi, kuasa, pleadings, legal opinion, contracts) instead of returning a generic contract for every template.
7. **Compliance API contract** — questions are returned in the shape expected by the active frontend.
8. **Legal Research contract** — frontend/backend fields are aligned. Without AI, LexiCore now summarizes only the supplied source and refuses to invent a doctrine/yurisprudence summary when no source text is provided.
9. **Norm Conflict contract** — returns the comparison matrix expected by the UI, uses conservative lex-superior/posterior candidate logic, and does not assume lex specialis automatically. Dashboard count is now dynamic rather than hard-coded `12`.
10. **DOCX routes** — restored missing Draft DOCX and generic workspace DOCX endpoints.
11. **Demo data** — fabricated showcase Case Analysis is now opt-in via `LEXICORE_SEED_DEMO=1`; production/default history no longer starts with a fake matter.
12. **Regulatory comparison** — invalid IDs no longer silently fall back to unrelated first/second regulations.
13. **UI ingestion disclosure** — removed false “OCR lokal otomatis” claim. UI now accurately states which formats are locally extracted and when AI OCR/transcription may be used.
14. **Request-size posture** — JSON body limit reduced because Case export now works by ID rather than resending the full working paper.

## Validation performed
- `npm run lint` / `tsc --noEmit`: PASS.
- `npm run audit:baseline`: static regression checks for eight panels, four-script contract, ingestion safety, exporters, drafting, research/compliance/norm contracts, source-verification honesty, and demo-data policy.

## Important remaining architectural risks (not silently refactored)
1. **Persistence is in-memory.** Drafts, analyses, communications, research, compliance and audit logs are lost when the Node process restarts. Replacing this with SQLite/PostgreSQL is a separate persistence migration and should be treated as an explicit baseline change, not slipped into a bug-fix patch.
2. **Online legal research is not a full web scraper/search engine.** Current code can identify local-corpus official URLs and test official-host reachability. It does not claim that merely having/reaching a URL verifies the legal instrument, article text, tempus or applicability.
3. **OCR quality remains evidence-sensitive.** AI-assisted transcription is marked for manual review. A scanned document must not be treated as authoritative text without comparison to the original image/PDF.
4. **Unreferenced React prototype files remain outside the active `index.html` application.** They are not part of the production navigation/runtime. They were not deleted in this corrective patch to avoid another architectural/refactor change; the active Case Analysis path has no Living Analysis.

## Release rule
Do not promote a future patch if `npm run audit:baseline`, `npm run lint`, build, runtime smoke test, one Case Analysis from plain text, one from DOCX/PDF, Draft Builder, all eight menu links, and PDF/DOCX export do not pass.
