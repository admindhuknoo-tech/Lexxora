# LEXY One Cumulative Corrective — Final Closure + Legal Export Format

Baseline: `LEXY FINAL.zip`.

This ZIP is a **single cumulative overlay**. Apply it directly to a clean `LEXY FINAL` project. Do **not** apply STAGE2, FINAL, or FINAL_CLOSURE first.

## Scope of this addition

The previous FINAL_CLOSURE corrective remains included. This revision changes only the presentation/export layer for `Analisa & Pendapat Hukum` and adds a deterministic exporter regression test.

### Legal export contract

- Times New Roman for the legal opinion export.
- Main title: 14 pt, bold, centered.
- Body paragraphs: 12 pt, regular, justified.
- Line spacing: 1.5.
- After-paragraph spacing: 6 pt.
- A4 legal margins: left 4 cm; right 3 cm; top 3 cm; bottom 3 cm.
- Actor table columns remain `AKTOR | STATUS / HAK-KEWAJIBAN | RUJUKAN SUMBER`.
- Timeline table remains `WAKTU | PERISTIWA | RUJUKAN SUMBER`.
- Embedded export noise such as `### Page N ###`, `Halaman #N`, long OCR separator strings, and highly repetitive OCR garbage tokens is removed **only at export rendering time**. The canonical analysis record is not mutated.
- Line breaks embedded inside narrative fields are normalized into continuous legal prose at export time.
- Footer is `Halaman N`, not `Halaman #N`.
- No names, dates, letter numbers, nominal values, or legal terms are intentionally rewritten by this formatting change.

## Files added/changed specifically for export formatting

- `server/exporters.ts`
- `scripts/audit-export-legal-document-format-v1.ts`

All other payload files are the cumulative FINAL_CLOSURE corrective required when applying this ZIP directly to the `LEXY FINAL` baseline.
