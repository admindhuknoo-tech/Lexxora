LEXICORE PATCH V6.8.1 — Canonical Authority Contract Normalization
=================================================================

ROOT CAUSE — CONFIRMED BY SOURCE
--------------------------------
caseAnalysis.ts builds canonicalAuthoritySeeds from regulation.nomor, therefore
its runtime type is string[]. The V6.8.0b retriever contract expected
CanonicalSeed[] and dereferenced seed.instrument_family / seed.number / seed.year.
For string seeds those properties are undefined, so the exact resolver exits
fail-closed before producing an official candidate.

FIX
---
Normalize at the retriever boundary. discoverOfficialLaw accepts:

  canonicalAuthorities?: Array<string | CanonicalSeed>

String labels are parsed into strict family/number/year identities. Labels joined
with "jo" / "jo." are expanded so each instrument is independently verified.
The existing parseQueryIdentity() remains the strict identity parser; no
regulation number is hardcoded into production logic.

WHY A GUARDED APPLY SCRIPT
--------------------------
The current project source contains accumulated fixes that must not be replaced
by an older whole-file baseline. This package therefore modifies the active
server/officialLawRetriever.ts in place, after checking the expected V6.8.0b
source shape, and creates server/officialLawRetriever.ts.v681.bak once.

FILES IN THIS PATCH
-------------------
- scripts/apply-canonical-authority-contract-v681.ts
- scripts/audit-canonical-authority-contract-v681.ts
- README.txt

PRODUCTION EFFECT
-----------------
Only server/officialLawRetriever.ts is modified by the apply script.
Not modified: caseAnalysis.ts, legalOntology.ts, evidenceModel.ts, thresholds,
topical/subtopic/hierarchy policy, search cap 8, scheduler, UI, exporter.

APPLY
-----
npx tsx scripts/apply-canonical-authority-contract-v681.ts
npx tsx scripts/audit-canonical-authority-contract-v681.ts
npm run build

Regression:
npx tsx scripts/audit-authority-query-v6710.ts
npx tsx scripts/audit-query-scheduling-v679.ts
npx tsx scripts/audit-topical-policy-v678.ts

RUNTIME
-------
npm run dev *> lexi-v681.log

Rerun Tanah, then inspect API-level diagnostics:

curl -s "http://localhost:3000/api/case-analysis?limit=1" > tanah-v681.json
$j = Get-Content tanah-v681.json -Raw | ConvertFrom-Json
$d = $j.data[0].official_law_retrieval.diagnostics
$d.canonical_authorities_input_count
$d.canonical_authorities_attempted
$d.canonical_authorities_resolved
$d.canonical_authorities_normalized | ConvertTo-Json -Depth 4
$d.canonical_seed_attempts | ConvertTo-Json -Depth 8
$d.final_candidates
$d.provider_status

ACCEPTANCE — TANAH
------------------
canonical_authorities_input_count >= 1
canonical_authorities_attempted >= 1
canonical_authorities_resolved >= 1
final_candidates > 0
At least one final candidate must be IDENTITY_VERIFIED / EXACT.

If attempted > 0 but resolved == 0, stop changing scoring/query policy and inspect
canonical_seed_attempts: the remaining bottleneck is exact provider resolution.
