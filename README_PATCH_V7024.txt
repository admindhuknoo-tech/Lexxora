LEXICORE V7.0.2.4 - OFFICIAL AUTHORITY PROVIDER ACCESS CORRECTIVE

Scope: minimal corrective over V7.0.2.3. No large refactor.

Root cause addressed:
1) HTTP 403/401/429 from JDIH MA / Putusan MA was incorrectly treated as network-unreachable.
2) Direct official search can be blocked while the official provider is still reachable.
3) Release probe tested only direct endpoint, not the complete fallback -> official-detail path.
4) Legacy audits still asserted the obsolete global network cap=8 instead of provider-aware <=10 plan.

Behavior after patch:
- HTTP 2xx => REACHABLE_OK.
- HTTP 401/403/429 => REACHABLE_BLOCKED (network reached; automated direct access blocked).
- HTTP 5xx/non-success response => REACHABLE_HTTP_ERROR.
- No HTTP response / DNS / timeout / refused => NETWORK_UNREACHABLE.
- Judicial direct search blocked => DuckDuckGo/Bing discovery fallback may locate an official URL.
- Fallback is considered usable ONLY if the final jdih.mahkamahagung.go.id / putusan3.mahkamahagung.go.id detail page is actually fetched successfully.
- Search engines remain locators only; they are never authority sources.

Apply:
Extract this ZIP directly into the LexiCore repo root, preserving paths.

Verify:
VERIFY_V7024.bat

Release rule:
Static/regression PASS is not enough. The final live provider audit must report all required provider paths usable before calling live retrieval release-ready.
