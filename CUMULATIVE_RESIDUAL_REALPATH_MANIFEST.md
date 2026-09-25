# LEXY ONE CUMULATIVE CORRECTIVE FINAL — RESIDUAL REALPATH

## Integration contract

This archive is a **single cumulative overlay** built from the preserved `LEXY FINAL.zip` baseline, with `LEXY_ONE_CUMULATIVE_CORRECTIVE_FINAL_CLOSURE.zip` applied first internally and the residual-realpath corrective applied on top.

For a clean integration use only:

`LEXY FINAL` → `LEXY_ONE_CUMULATIVE_CORRECTIVE_FINAL_RESIDUAL_REALPATH.zip`

Do **not** stack STAGE2 / FINAL / FINAL_CLOSURE after this archive. The closure changes required by the current source are already included in this cumulative payload.

Baseline SHA256: `64c504b9ecafb7f1224a78d3fec64994d1b7983fdfc145ccb13231f67aa3bc4d`

Preserved FINAL_CLOSURE SHA256: `53656eeb88c330aee7d3b0a308610b1363dd5f8257725f063ddd5958acb780d8`

## Scope lock

No new architecture, no new reasoning framework, no mass rename, no hardcoded case names in production logic, and no patch-per-symptom. The corrective is limited to the residual defect family exposed by the real BAP export:

1. actor canonicalization / false-actor propagation;
2. entity deduplication and conservative OCR alias resolution;
3. BAP/procedural timeline extraction and procedural-event priority;
4. supporting-domain material-nexus admission;
5. downstream propagation paths that could reintroduce rejected actors/domains.

## Pre-coding root-cause registry

- Role words were retained as actors based on mention alone and could propagate into lawyer-facing matrices.
- Person capture could consume structural tokens such as `Tahun`, `Jabatan`, or document labels.
- PERSON aliasing handled substring variants but not a conservative one-edit OCR variant.
- ORGANIZATION identity was effectively exact-key based; close OCR variants and an explicitly stated current-name relationship remained separate.
- BAP `Nama` / `Nama lengkap` / `Jabatan` structure did not reliably bind the role to the named person.
- Numeric dates such as `21-05-2026` were absent from the canonical date extractor.
- `Surat Perintah Penyidikan` and `Surat Penetapan Tersangka` dates were not classified as procedural events.
- BAP chronology had no canonical procedural-event priority before older substantive/regulatory dates.
- Secondary legal domains were admitted from lexical score without requiring the existing issue-materiality logic.
- `multi_path_diagnosis` independently consumed raw domain scores and could resurrect a domain rejected by the canonical supporting-domain gate.
- Integration-matrix/summary paths still consumed raw actors after actor_matrix was canonicalized.

## Corrective implementation

- Tightened existing person plausibility/capture boundaries; structural/document tokens stop name capture.
- Extended existing alias resolution conservatively: one-token OCR edit only for multi-token PERSON aliases with role/page safeguards; organization OCR aliases are separately constrained.
- Explicit current-name wording (`sekarang bernama` / equivalent) can consolidate organization identity without generic prefix merging.
- BAP name/job and examined-as-role patterns bind roles back to the concrete person.
- Lawyer-facing actor_matrix and integration matrix use the same material-role gate; raw ROLE extraction remains available internally for compatibility.
- Added guarded numeric-date extraction; document-number fragments are excluded.
- Procedural investigation documents classify their dates as `PROCEDURAL_EVENT`.
- BAP canonical timeline prioritizes procedural events and sorts those events chronologically.
- Supporting-domain admission requires material nexus through existing ontology issue-materiality gates.
- `employment-rights` and `formal-status` materiality gates were tightened against generic credit/corporate vocabulary while preserving real disputes.
- `multi_path_diagnosis` now consumes canonical admitted domains rather than raw score candidates.
- Regime reconciliation no longer reintroduces a displaced raw primary that explicitly failed material nexus.

## Payload

30 project files differ from the original LEXY FINAL baseline and are included in this cumulative overlay, plus this manifest, verification report, diff, and payload checksums.
