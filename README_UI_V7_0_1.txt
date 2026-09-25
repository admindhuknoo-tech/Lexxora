LEXICORE V7.0.1 — COMPLETE UI PACKAGE
=====================================

Isi paket:
- index.html
- public/lexicore.v6122.css      : base/premium UI stylesheet
- public/lexicore.v7.ui.css      : V7.0.1 responsive architecture + final UI overrides
- public/lexicore.v6122.js       : current UI runtime JS (included for completeness; logic tidak diubah oleh layout patch)

Ruang lingkup integrasi UI:
1. Visual hierarchy / premium feel
2. Typography hierarchy
3. Sidebar aesthetics + responsive sizing
4. Focus / keyboard accessibility
5. Stepper / workflow clarity
6. Dashboard KPI aesthetics
7. License / Commercial presentation
8. Scroll ownership / empty-scroll prevention
9. Consistent design tokens/system
10. Wide desktop / compact desktop / portrait / short-height / mobile responsive architecture
11. prefers-reduced-motion support

Tidak dimaksudkan mengubah:
- reasoning core
- API/backend
- licensing semantics
- Case Analysis workflow logic
- Electron runtime

Integrasi:
Ekstrak ke root project dan pertahankan struktur path di atas, lalu rebuild aplikasi.

MOBILE CORRECTIVE INTEGRATION
- Removes legacy 4x2 frozen mobile module grid from the V7 final cascade.
- Uses one brand row + one horizontal scroll-snap module rail.
- Disables legacy fixed workspace stack on <=720px.
- Restores full-width page title and compact second-row statuses.
- Makes workflow stepper a non-clipping horizontal rail.
- Forces true single-column mobile forms with 44px touch targets.
- Returns Client primary CTA to normal document flow so it cannot cover fields.
- Keeps body locked and gives scrolling ownership to .main.

Theme toggle corrective (2026-09-18):
- Dropdown System/Light/Dark removed.
- Single Light/Dark toggle integrated into top-status area.
- First launch follows OS color scheme; explicit user toggle is persisted.
- Keyboard focus and ARIA pressed state retained.


Navigation Completeness Corrective
----------------------------------
- 481–720 px: all 8 lifecycle menus are shown simultaneously in an 8-column compact grid.
- <=480 px: horizontal rail remains scrollable and hidden active/focused modules auto-scroll into view.
- Norm Conflict Analysis is explicitly verified as menu #8.
- See INTERNAL_TEST_REPORT_NAV8.txt for static + Playwright/Chromium QA results.
