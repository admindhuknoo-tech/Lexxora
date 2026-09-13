# LEXICORA Analysis Lifecycle V1 — FROZEN

Status: behavioral baseline / regression contract.

Empat artefak referensi (`style.css`, `index.tsx`, `analys function.ts`, `analys report.tsx`) menetapkan kualitas dan struktur minimum keluaran analisis LEXICORA. Implementasi boleh memperkaya hasil melalui SAL, evidence admission, tempus, positive-law verification, Candidate Law Governor, retrieval, canonical reasoning, dan Living Law, tetapi tidak boleh menghilangkan atau menurunkan elemen berikut:

1. Ringkasan analisis (`summary`)
2. Fakta material (`facts`)
3. Isu hukum beserta analisis/subsumsi (`legal_issues`)
4. Dasar hukum relevan (`applicable_law`)
5. Argumen yang menguatkan (`arguments_for`)
6. Argumen lawan/kelemahan (`arguments_against`)
7. Matriks risiko terstruktur: pokok risiko, level, temuan, mitigasi (`risk_matrix`)
8. Skor risiko 0–100 (`overall_risk_score`)
9. Skenario terbaik (`best_case`)
10. Skenario terburuk (`worst_case`)
11. Rekomendasi tindakan (`recommendations`)
12. Catatan verifikasi profesional (`verification_note`)

## Lifecycle

Input perkara/dokumen → structured legal analysis → LEXICORA core validation/enrichment → final working paper.

Core reasoning tidak diganti oleh kontrak ini. Core bertugas memvalidasi dan memperkaya structured analysis. Perubahan berikutnya dianggap regression apabila menghilangkan field wajib, mengurangi kedalaman isu hukum secara material, menghilangkan adverse argument/risk mitigation, atau menjadikan rujukan hukum lebih pasti daripada bukti verifikasinya.

## Golden regression principle

Contoh hasil analisis sengketa jual-beli tanah yang disepakati menjadi referensi kualitas. Pengujian patch berikutnya harus memastikan hasil sekurang-kurangnya tetap memiliki struktur, keseimbangan pro-kontra, mitigasi risiko, skenario, dan rekomendasi operasional setara, sambil tetap tunduk pada evidence admission dan positive-law verification LEXICORA.
