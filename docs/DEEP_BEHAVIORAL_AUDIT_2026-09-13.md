# LexiCore Deep Behavioral Audit — 2026-09-13

## Scope
Audit ini memeriksa kontrak perilaku end-to-end pada frontend aktif `index.html` dan API server: click/event → payload → endpoint → persistence → response shape → history/reload → edit/update → export/error path. Audit ini mempertahankan arsitektur 8 modul dan tidak melakukan refactor frontend.

## Corrective findings implemented

1. **Frontend error parser** sebelumnya dapat kehilangan detail error non-JSON. Parser sekarang membaca body sekali sebagai text, lalu parse JSON bila valid. Ini mencegah error `body stream already read` dan mempertahankan pesan API yang sebenarnya.
2. **Manual Draft Save** memiliki jalur frontend `POST /api/drafts` tanpa route backend. Route create draft sekarang tersedia dan menyimpan `template_key` terpisah dari display title.
3. **Draft template identity** sebelumnya bercampur antara `doc_type`, display title dan internal classification. `template_key` kini menjadi canonical internal identity sehingga draft dari history dapat mengembalikan template/field yang benar tanpa mencetak klasifikasi ke output.
4. **History detail contract** dilengkapi dengan `GET /api/history/:kind/:id` untuk Draft, Contract Review, Research, Compliance, Client Communication dan Case Analysis.
5. **Client document persistence** sebelumnya selalu POST sehingga Save berulang atau edit hasil history dapat membuat record duplikat. Sekarang record memiliki current ID, `PUT /api/communications/:id`, dan dirty-state tracking. Edit setelah save menandai perubahan belum disimpan; Save berikutnya meng-update record yang sama.
6. **Client history hydration** sekarang memulihkan email, alamat/domisili, matter/case reference, subject, message, dan ID record.
7. **Research history hydration** sekarang memulihkan `source_text`/`content`, bukan hanya ringkasan.
8. **Compliance scoring** sebelumnya dapat menghitung pertanyaan kosong sebagai risiko default. Preview sekarang mengecualikan pertanyaan `UNANSWERED` dari scoring, menampilkan completion, dan final assessment ditolak bila pertanyaan sistem belum lengkap.
9. **Compliance metadata** sekarang mencakup `answered_count`, `missing_count`, `completion_percentage`, system/custom question counts, dan professional verification.
10. **API error boundary** sekarang mengubah error body-parser/multer menjadi JSON, termasuk file >50 MB dan `entity.too.large`. UI tidak lagi menerima halaman HTML stack trace dari API.
11. **PORT** sekarang dapat dioverride melalui `process.env.PORT`; default tetap 3000.
12. **Deep contract regression guard** ditambahkan melalui `npm run audit:deep`. Guard memeriksa 8 panel, route↔frontend binding, canonical IDs, history hydration, compliance completeness, API JSON error boundary, template display title, dan katalog drafting enriched.

## Validation completed

- `npm run lint` → PASS (`tsc --noEmit`)
- `npm run audit:deep` → baseline 54/54 PASS + deep-contract 46/46 PASS
- Active inline JavaScript syntax → PASS
- Legal Drafting catalog → 336 templates; display titles do not expose internal `|` classification chain

## Known architectural risks intentionally not refactored

- Working data remains in-memory and is lost when the Node process restarts.
- The active desktop UI is still the monolithic inline `index.html`; React source trees remain parallel/inactive. They were not removed in this corrective patch to avoid an architectural refactor.
- Official-source reachability is not the same as substantive legal verification; source provenance remains deliberately conservative.

## Regression policy

Patch berikutnya tidak boleh dinyatakan stable hanya karena build sukses. Minimum acceptance sequence:

`npm run audit:deep` → `npm run lint` → `npm run build` → runtime smoke test of all eight modules → history reopen/edit test → PDF/DOCX export test → negative/error-path test.
