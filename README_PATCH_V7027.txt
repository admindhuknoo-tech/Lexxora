LEXICORE V7.0.2.7 - OFFICIAL AGGREGATOR FALLBACK CORRECTIVE

Tujuan:
Memperkuat OFFICIAL_AUTHORITY_RETRIEVAL tanpa refactor besar dan tanpa hardcode kasus tertentu.

Dipilih dan diterapkan:
1. JDIHN topical discovery sebagai official fallback pertama setelah direct MA blocked/empty.
2. JDIHN result tetap melewati judicial identity parser, material-nexus gate, tempus handling, dan professional verification.
3. JDIHN diberi source_tier SECONDARY_OFFICIAL; direct MA tetap PRIMARY_OFFICIAL.
4. Positive discovery cache in-memory 24 jam; hanya URL .go.id, tidak ada negative cache.
5. Public-search compatibility profile untuk DDG/Bing; official MA endpoint tetap memakai identitas client LexiCore, tidak disamarkan.
6. DDG Lite -> DDG HTML -> Bing dipertahankan hanya sebagai last-resort locator.
7. Connectivity probe hanya PASS bila detail official .go.id yang ditemukan memuat judicial identity yang dapat diparse.

Sengaja TIDAK diterapkan:
- session-cookie trick untuk melewati 403;
- Playwright/headless browser;
- paid Google/Bing/Brave API;
- URL guessing/pattern construction;
- sitemap crawl.
Alasan: belum dibutuhkan, menambah kompleksitas/dependency, atau berisiko menjadi bypass yang rapuh.

Apply:
Extract isi ZIP langsung ke root LEXY dan overwrite file yang sama.
Lalu jalankan VERIFY_V7027.bat.
