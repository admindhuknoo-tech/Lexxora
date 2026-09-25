LEXICORE V7.0.2.6 - FALLBACK DISCOVERY & DIAGNOSTICS CORRECTIVE

Scope:
- server/officialLawRetriever.ts
- scripts/audit-v7024-live-provider-connectivity.ts
- scripts/audit-v7024-provider-access-semantics.ts
- scripts/audit-v7026-fallback-discovery.ts
- VERIFY_V7026.bat

Fixes:
1. DDG parser no longer depends only on result__a markup.
2. Adds DuckDuckGo Lite fallback after DDG HTML.
3. Bing parser accepts generic domain-matching result anchors.
4. Adds per-engine HTTP/access/body diagnostics without storing full body.
5. Prints fallback_attempted and detailed fallback attempts in live audit.
6. Public-search requests use a browser-compatible request profile; official provider requests remain on the LexiCore identified client profile.
7. Adds EXHAUSTED state when fallbacks were actually tried but produced no verified official URL.
8. Search engines remain locators only; provider is usable only after an official-domain detail page is successfully fetched.

Apply:
Extract directly into the LexiCore project root, preserving paths.
Then run:
  VERIFY_V7026.bat

Release rule:
Do not treat the patch as live-ready unless the final NO-MOCK live provider step reports all required provider paths usable.
