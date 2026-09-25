# Session Fix Manifest — on top of LEXY_V8_EXACT_RUNTIME_CUMULATIVE_ROOT_OVERLAY

Base: LEXY_FINAL.zip (sha256 64c504b9ecafb7f1224a78d3fec64994d1b7983fdfc145ccb13231f67aa3bc4d)
      + LEXY_V8_EXACT_RUNTIME_CUMULATIVE_ROOT_OVERLAY.zip (adopted as-is; superseded the
        earlier LEXY_ONE_CUMULATIVE_CORRECTIVE_FINAL.zip, which independent verification
        showed V8 already re-fixes with equal or better precision).

`tsc --noEmit`: exit 0 (verified, not asserted).
Full audit sweep: 105 scripts executed; 87 exit 0. Every non-zero exit was individually
inspected; each is one of: a stale/obsolete assertion already superseded by an intentional
later rename (report's own "usang" category), a script requiring a live network provider,
a packaging artifact absent from this zip export (Dockerfile/, desktop-electron/), or a
pre-existing, unrelated infra/perf/security check identical in baseline and patched tree.
None of the remaining non-zero exits touch the regression family this audit covers.

## Real defects found this session and fixed (none were in the V8 manifest's own claims)

### 1. server/caseAnalysis.ts — inferProceduralAuthorityFamily()
A judicial decision ("Putusan PN Jakarta Nomor .../Pdt.G/...") was classified as
PRE_LITIGATION family whenever its own substantive text merely *discussed* "somasi" —
the same root-cause pattern as the original F3 bug (a single keyword anywhere in text
flipping a classification), resurfaced in the authority-binding stage instead of the
posture stage. Effect: real court-decision precedents silently failed to bind to any
issue at the pleading stage. Fix: the instrument's own title (Putusan/Penetapan) is
checked first and wins over content-derived stage vocabulary.
Verified: audit-v70222-official-forum-regime-guard.ts 16/16 (was 15/16, "forum-matching
Putusan PN still binds" now passes). No regression across v70223 (precision+cross-case),
v70226 (posture hierarchy+cross-case), residual-realpath-cumulative-v3/v4, v7023-case-pipeline.

### 2. server/evidenceModel.ts — dateContext() fallback window
A document's own dateline ("Malang, 04 Juni 2026") and a referenced Surat Kuasa's date
("... tanggal 10 Februari 2026") were classified as IDENTITY_DATE merely because an
*adjacent* line in a dense multi-party header block mentioned a different person's birth
date ("lahir ... 1956" / "lahir ... 1970"). The generic context fallback pulled the whole
neighbouring line in regardless of its content. Fix: a neighbouring line is only used for
context if it does not itself carry a competing identity/action cue.
Verified: audit-semantic-v5541.ts 15/15 (was 13/15). No regression across
generalization-invariants-v5, production-path-fulltrace-v7, residual-realpath-cumulative-v3,
case-general-v5.

### 3. server/legalOntology.ts — issueMaterialitySatisfied('resignation-replacement')
The "office" confirmation check was scoped only to the page(s) where the resignation
signal itself matched, so a resignation reported on one page ("pengunduran diri ...")
was rejected as immaterial when the person's office ("Wakil Ketua ...") was named on an
earlier page — the same narrow same-segment co-occurrence fallacy the original report
criticized for issue-evidence linking (F7). Fix: the office confirmation now checks the
whole document, while the primary resignation/replacement trigger stays scoped (avoiding
new false positives).
Verified: audit-case-semantic.ts 13/13 (was 12/13, "Concrete issue seeds" now passes).
No regression across v70232-issue-materiality, case-general-v5, generalization-invariants-v5,
residual-realpath-cumulative-v3/v4, v7023-case-pipeline.

### 4. server/officialLawRetriever.ts — sequential network retrieval (severe wall-clock/perf bug)
User-reported evidence: a real Case Analysis run took 12.6 minutes and produced 934 requests
in the browser's Network tab, with individual `/api/case-analysis/progress/:token` polls
(a trivial in-memory Map lookup) taking 7-22 seconds each. Root cause traced to
`discoverOfficialLaw`/`discoverAutoOfficialLaw`: every official-source lookup against
peraturan.bpk.go.id (search step, up to N query formulations; detail-fetch step, up to 16
selected candidates) was awaited one at a time in a plain for-loop, each with an 8-9s
timeout, plus `manual`/`auto`/`seed` resolution and `judicialProducts`/`caseLaw` lookups
were awaited sequentially despite being fully independent of each other. None of these
loops had an early-exit condition, so parallelizing changes wall-clock time only, not
which candidates are found. Fixed with a small bounded-concurrency helper
(`runWithConcurrency`, limit 4) applied to both retrieval loops, and `Promise.all` for the
three independent top-level branches and the two independent judicial-provider calls.
Verified: `tsc --noEmit` exit 0; every officialLawRetriever-dependent suite re-run clean
with identical pass counts (authority-query-v6710, canonical-authority-contract-v681,
canonical-authority-seed-v6712, canonical-authority-v680b, canonical-runtime-shape-v682,
canonical-seed-v680, query-decomposition-v677, query-scheduling-v679, topical-policy-v678,
v702-judicial-authority-retrieval, v7023-authority-funnel, v7024-provider-access-semantics,
v7026-fallback-discovery, v7027-official-aggregator, v7028-local-first-integration — all
still fully pass, several of which make live network calls to jdih.mahkamahagung.go.id and
succeeded in this sandbox). Full pipeline suites (case-general-v5, case-semantic,
generalization-invariants-v5, production-path-fulltrace-v7, v7023-case-pipeline) unchanged.

### 5. public/lexicore.v70218.js (+ identical dist/ and .desktop-runtime/dist/ copies) —
client-side polling storm
`startCaseProgressPolling`'s `tick()` was fired every 700ms by `setInterval` with no guard
against the previous call still being in flight. Once the server-side event loop was busy
(see #4) each tick could take many seconds to resolve, so new ticks kept firing regardless,
producing the request pile-up seen in the user's screenshot (934 requests in 12.6 minutes).
Fixed with a simple `inFlight` guard so a new tick is skipped while the previous one hasn't
resolved yet. Applied identically to all three copies of the bundle (confirmed byte-identical
before the edit); syntax-validated with `new Function(...)` after editing.

### 6. server/forensicReasoner.ts — actor status cross-contamination (found from user's real
LC-CA19-20260923-134723-E6BD38 output)
The user uploaded a real Case Analysis PDF (a BAP/corruption case, Perumda BPR Kota Blitar).
The "Posisi Para Pihak" table showed the *identical* status text — "...Ia diperiksa sebagai
Tersangka dalam perkara dugaan Tindak Pidana Korupsi... kepada Debitur Dewi Mufarida..." —
attached to THREE different actors: the actual suspect (Elya Dwi Admoko, correct), the debtor
Dewi Mufarida (wrong — she is not the suspect), and the business entity Perumda BPR Kota
Blitar (wrong). Root cause: `actorStatus()`'s `statementMentionsActor()` check only proved an
actor's name appears *somewhere* in a long run-on BAP sentence, not that the status/role word
in that sentence (sebagai/selaku/berwenang/etc.) is actually asserting something about that
specific actor rather than about a different name mentioned earlier in the same sentence as a
grammatical object ("...oleh Perumda BPR Kota Blitar kepada Debitur Dewi Mufarida..."). Fixed
by adding `statementAssertsActorStatus()`, which requires the status/role keyword to fall
within a 60-character window of the actor's own name before the statement is used as that
actor's status; when no such statement exists the code already falls back to the honest
"tidak diinferensikan otomatis" placeholder, which is the correct, safe behavior here.
Verified by reproducing the exact bug in a minimal fixture matching the real document (Dewi
Mufarida and Perumda BPR Kota Blitar both correctly fall back to the placeholder after the
fix; Elya's own row, already correct before the fix, is unaffected). No regression across
case-general-v5, case-semantic, generalization-invariants-v5, production-path-fulltrace-v7,
v683-actor-lexical-integrity, actor-noise-v685, actor-provenance-v684 (which already uses
"Perumda BPR Kota Blitar" as a fixture name), v7023-case-pipeline, residual-realpath-v3/v4.

**Update from the user's second run on the same document (LC-CA20):** the 60-character-window
version above reduced but did not eliminate the bug — it now picked a *different* wrong
statement for Dewi Mufarida (a page-18 sentence about Kabag Pemasaran's credit-review method,
ending "...menyampaikan kepada saya selaku Direktur", which has nothing to do with her). This
showed a fixed character distance is not reliable for BAP text, where a single multi-point
answer ("a. ..., b. ..., c. ...") packs several unrelated clauses within a short span.
Replaced the distance check with a same-clause requirement instead: `statementAssertsActorStatus`
now splits the statement on `.,;:` and requires the actor's own name and a status/role keyword
to appear in the *same* clause, never merely nearby. Directly unit-tested against a
hand-built EvidenceModel reproducing the exact page-18 merged-statement scenario (Dewi
Mufarida falls back to the honest placeholder, as she should). Re-verified all 10 actor/
pipeline suites listed above still fully pass with the clause-based version, plus a full
105-script sweep shows the identical, already-triaged failure set (87/105 pass) with no new
regressions, and `tsc --noEmit` remains exit 0.

**Third update, from the user's own raw source PDF (36-page scanned BAP, not just the
rendered report):** ran the REAL document through the actual, unmodified
`buildEvidenceModel`/`reasonForensically` pipeline end to end — and the clause-only version
still failed on Dewi Mufarida and Perumda BPR Kota Blitar. Root cause: the offending sentence
has NO internal comma/period at all ("...diperiksa sebagai Tersangka ... oleh Perumda BPR
Kota Blitar kepada Debitur Dewi Mufarida Tahun 2022..."), so it is one single "clause" by the
`.,;:` split, and the same-clause check alone could not tell that "oleh X" and "kepada Y" name
two different parties, neither of which is the one described as "sebagai Tersangka". Added a
further, still fully generic check: a status/role keyword and a name in the same clause are
only credited to each other if no object-marking preposition ("kepada"/"oleh") sits between
them — those two words mark what follows as a recipient or a different acting party than the
clause's own subject, in Indonesian generally, not specific to this case's vocabulary.
Verified three ways: (1) directly against the user's actual 36-page source PDF end-to-end —
Dewi Mufarida and Perumda BPR Kota Blitar both now correctly fall back to the honest
placeholder; (2) against a synthetic case with entirely unrelated fictional names/domain
("Hendra Wijaya", "PT Nusantara Jaya", penggelapan dana) replicating only the *structural*
pattern, confirming the fix is not keyed to this case's vocabulary; (3) full 105-script sweep
unchanged (87/105, identical already-triaged failures) and `tsc --noEmit` exit 0. No line of
the fix references any name, company, or fact specific to this case — the only place those
names appear anywhere in the diff is in an explanatory code comment.

## Found from the same user PDF, diagnosed but NOT yet fixed (flagged, not silently dropped)

- **A charged statute vanishes between extraction and the final report — TRACED AND PARTIALLY
  FIXED this session.** Root cause confirmed: `extractSourceLawCitations()` correctly extracts
  citations the source document quotes directly (e.g. "Pasal 603 Undang-Undang ... Nomor 1
  Tahun 2023 tentang KUHP"), and they were merged directly into `applicable_law` — but they
  were never added to `bindingPool` (the candidate set `bindIssuesToAuthorities` actually
  evaluates), so `filterApplicableLawToBoundAuthorities` always stripped them back out
  immediately afterward, since they could never appear in `boundAuthorityLabels`/
  `boundAuthorityIdentities`. Fixed the architectural gap: `extractSourceLawCitations` now
  also carries `authority_identity`, `article_text_pool` (the citation's own local context
  window), and parsed `instrument_type`/`number`/`year`; a new mapping in `bindingPool` feeds
  every source-cited statute through the same domain/family/regime binding gates as any other
  candidate, with `citation_hit:true` (it is by definition cited in the source). Verified end
  to end against the user's real 36-page BAP (`runCaseAnalysis` with `regulatory_mode:
  'offline'`): "Undang-Undang Nomor 31 Tahun 1999" and "Undang-Undang Nomor 20 Tahun 2001" —
  previously invisible in `applicable_law` — now correctly survive to the final table.
  **Not fully fixed:** "Undang-Undang Nomor 1 Tahun 2023 tentang KUHP" (Pasal 603) and
  "Undang-Undang Nomor 1 Tahun 2026" still don't bind, because their own ~460-character local
  context window (used for the domain-alignment check) doesn't itself contain corruption-
  specific vocabulary — in the source text they are joined to the corruption-specific UU
  31/1999 citation via "Jo." (juncto) rather than containing that vocabulary themselves. A
  correct fix likely needs "Jo."-chained citations to share context/domain-alignment with the
  citation they are chained to, which has NOT been implemented — flagging rather than rushing
  an unverified change. Full 106-script sweep (88 pass, identical already-triaged failure set)
  and `tsc --noEmit` (exit 0) both confirm no regression from what was changed.
- **A misattributed chronology date.** The "01 Maret 2016" row in "Kronologi Fakta" quotes a
  passage discussing "jenis-jenis kredit ... pada Tahun 2022" — the quoted text contains no
  date matching "01 Maret 2016" at all. Confirmed still present in the user's most recent
  LC-CA21 output. Spotted but not traced to a specific function this session; flagging for the
  next pass rather than guessing at a fix.

- audit-v683-authority-applicability "Section III fails closed when nothing binds":
  pre-exists in the unmodified V8 tree; the check is a raw regex match against
  caseAnalysis.ts source text for one literal old code pattern, not a behavioral test.
  The actual fail-closed behavior is independently verified elsewhere (e.g.
  audit-v70223 "sectionIII:fail-closed-without-binding", passing). Not a real defect.
- audit-deep.ts "active external script located": checks index.html for a reference to
  the old lexicore.v6122.js bundle; index.html correctly references the current
  lexicore.v70218.js. Stale version-string assertion, not a defect.
- lawyer-workflow-v55/v551 "witness categories"/"witness questions planned": the actor
  matrix in these fixtures has no actor tagged with an explicit witness/expert/custodian
  role, and the witness-candidate filter is deliberately high-precision (an actor is not
  manufactured into a witness merely for being present) — the same precision principle
  the original report's F2 fix relied on. Loosening this would reopen exactly the false
  actor/role class of bug the report spent most of its effort closing. Left alone as a
  genuine precision/recall trade-off, not a proven regression.
