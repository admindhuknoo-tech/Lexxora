# LexiCore Legal Drafting — Official Source Enrichment

Date: 2026-09-13

## Scope

This change only enriches the Legal Drafting / Authority module. It does not refactor the Case Analysis engine, the eight-module navigation, or other workspace modules.

## Catalog result

- 301 unique drafting items parsed from the supplied catalog.
- 336 total templates after preserving and enriching LexiCore legacy templates.
- 61 classifications/subclassifications.
- 9 drafting ecosystems: PIDANA, PERDATA, PENGADILAN AGAMA, PTUN, PENGADILAN PAJAK, PHI, PRAPERADILAN, EKSEKUSI, ADMINISTRASI KANTOR HUKUM.

## Provenance policy

LexiCore differentiates three source grades:

1. `OFFICIAL_FORMAT_REFERENCE`: an official institution publicly publishes a format/example/form family.
2. `OFFICIAL_PROCEDURAL_REFERENCE`: the official source publishes required procedure/administrative elements but not necessarily the exact document text.
3. `OFFICIAL_LEGAL_REQUIREMENT`: legislation/circulars establish legal requirements but are not presented as an official blank form.

A draft generated from category 2 or 3 MUST NOT be described as an official government/court form.

## Official source registry injected

- Mahkamah Agung RI JDIH: SEMA 6/1994 and SEMA 1/1971 (Surat Kuasa Khusus)
- UU 20/2025 KUHAP (BPK regulation database)
- Pengadilan Negeri Jakarta Selatan: civil filing procedure
- MA JDIH: PERMA 4/2019 (gugatan sederhana)
- Pengadilan Agama Surabaya: official application/lawsuit form page
- Pengadilan Agama Jakarta Selatan: official gugatan/permohonan formats
- UU Peradilan Agama and amendments
- PTUN Surabaya: official example formats for power of attorney, lawsuit, answer, intervention, etc.
- UU PTUN and amendments
- Sekretariat Pengadilan Pajak: official formats/forms
- UU Pengadilan Pajak
- Kemnaker JDIH: PER.31/MEN/XII/2008 with bipartite appendix formats
- UU 2/2004 PPHI
- MA/Badilum execution procedure references
- UU 18/2003 Advokat

## Generator behavior

The Legal Draft generator is template-aware. It no longer applies a contract-only structure to every document. Each template includes:

- family
- classification
- party labels
- drafting prompt
- expected structure
- required elements/checklist
- official source provenance
- source grade

Official-source references are injected into the AI drafting prompt as structure/procedure references. The generator is instructed not to invent facts, case numbers, dates, officials, article numbers, or legal status.

## UI behavior

Draft Builder now supports:

- classification filter
- template search
- grouped template selection
- provenance/source grade note
- links to official reference pages

## Refresh script

`npm run drafting:sources:sync`

This checks current reachability and page titles for all official source URLs and writes a status snapshot to `src/data/official-drafting-source-status.json`. Reachability does not itself mean substantive legal verification.

## Regression validation

`npm run audit:baseline` -> 43/43 PASS

`npm run lint` -> PASS

Full build in the Linux audit sandbox is blocked by a platform-specific optional Rollup binary inherited from the Windows node_modules snapshot. Re-run `npm install` then `npm run build` on the Windows project environment.
