# LexiCore — Peta Jalan V7: Desktop vs Web

## 1. Pohon versi

```
V6.12.2  (FROZEN — baseline, git tag: v6.12.2-baseline)
   │
   ├──▶ branch: track/desktop
   │       V7 Commercial      (licensing/desktop — key aktivasi offline per-device)
   │       V7 Demo Commercial (sama, tapi payload edition="demo" + expiresAt)
   │
   └──▶ branch: track/web
           V7.1 Commercial      (licensing/web — langganan berbasis waktu, IDR)
           V7.1 Demo Commercial (sama, tapi edition="demo", trial otomatis)
```

`main` **tidak lagi menerima fitur baru** setelah tag `v6.12.2-baseline` dibuat —
hanya cherry-pick perbaikan bug kritikal yang perlu ada di kedua track. Semua
pengembangan Desktop dan Web berjalan paralel di branch masing-masing supaya
kode licensing tidak saling tercampur (device-key vs subscription adalah dua
model data yang berbeda).

Perintah yang sudah dijalankan di repo ini (lihat `scripts/freeze-baseline.sh`):

```bash
git tag -a v6.12.2-baseline -m "Frozen core baseline before V7 split"
git checkout -b track/desktop
git checkout main
git checkout -b track/web
```

## 2. Modul yang ditambahkan

```
licensing/
  core/
    types.ts        # tipe bersama: DesktopLicensePayload, WebSubscription, dll.
    crypto.ts        # Ed25519 sign/verify, tanpa dependency tambahan
  desktop/
    fingerprint.ts   # menghasilkan Device ID (LXC7-XXXX-XXXX-XXXX-XXXX)
    publicKey.ts      # kunci publik (aman di-ship di installer)
    license.ts        # verifikasi key + baca/tulis license.key lokal
    middleware.ts      # Express middleware requireDesktopLicense() + routes
  web/
    plans.ts          # harga DAY/WEEK/MONTH dalam Rupiah
    subscriptionStore.ts # penyimpanan langganan (file JSON — lihat §5)
    middleware.ts      # Express middleware requireActiveSubscription() + routes
    adminApi.ts        # endpoint admin untuk grant/revoke manual
  admin-tools/
    generate-keypair.ts # dijalankan SEKALI, offline, oleh admin
    activate.ts          # admin mengubah Device ID pelanggan → activation key
```

Modul ini **tidak mengubah** `server.ts` yang sudah ada — tinggal di-mount di
branch masing-masing (lihat §3 dan §4). Ini sengaja: baseline v6.12.2 tetap
utuh, dan diff licensing mudah di-review terpisah dari logika bisnis LexiCore.

## 3. Alur Desktop (V7 Commercial / V7 Demo Commercial)

```
[Instalasi]
   pengguna install LexiCore Desktop
        │
        ▼
[App generate Installation ID]  ← licensing/desktop/fingerprint.ts
   ditampilkan di modal aktivasi (sudah ada di index.html), contoh:
   LXC7-8F2A-91BD-4C0E-77A1
        │  (dikirim manual: WA / email / dsb — TIDAK ada koneksi server)
        ▼
[Admin]
   npx tsx licensing/admin-tools/activate.ts commercial LXC7-... "Nama Pelanggan"
        │  → menulis file licensing/admin-tools/issued-licenses/<id>.lic.json
        │    (JSON berisi {payload, signature}, ditandatangani Ed25519)
        │  (file ini dikirim balik manual ke pengguna sebagai lampiran)
        ▼
[Pengguna upload file .lic.json di modal aktivasi]
   POST /api/license/install { license: <isi file> }
        │  licensing/desktop/license.ts → verifyLicenseEnvelope():
        │    1. verifikasi tanda tangan pakai public key
        │    2. cek deviceId di payload == Installation ID mesin ini
        │    3. cek expiresAt (null = permanen / commercial; ada nilai = demo)
        │    4. simpan ke ~/.lexicore/license.json (Linux/Mac) atau
        │       %APPDATA%\LexiCore\license.json (Windows)
        ▼
[App unlocked — 100% offline setelahnya]
```

**Integrasi di `server.ts` (branch `track/desktop`, sudah diterapkan):**

```ts
import { getLicenseStatus, installLicense, removeLicense } from './licensing/desktop/license';
import { requireDesktopLicense } from './licensing/desktop/middleware';

app.get('/api/license/status', ...);   // pakai getLicenseStatus()
app.post('/api/license/install', ...); // pakai installLicense(req.body.license)
app.post('/api/license/remove', ...);  // pakai removeLicense()
app.use('/api', requireDesktopLicense());  // gate semua endpoint lain
```

Bentuk respons `/api/license/status` sengaja mengikuti kontrak yang **sudah
lebih dulu ada** di `public/lexicore.v6122.js` (`renderLicenseState()`, badge
`licenseStatusBadge`, modal upload file) — jadi tidak perlu membangun UI
aktivasi dari nol, tinggal sambungkan backend nyata ke kontrak field yang
sudah dipakai frontend (`allowed`, `status`, `message`, `installation_id`,
`expires_at`). Catatan: di branch `track/web`, badge dan modal yang sama ini
diganti total menjadi UI langganan (lihat §4) — kedua branch menyimpang di
titik ini secara sengaja.

**Setup satu kali (admin, offline):**

```bash
npx tsx licensing/admin-tools/generate-keypair.ts
# → salin PUBLIC KEY ke licensing/desktop/publicKey.ts (aman di-commit)
# → simpan PRIVATE KEY ke licensing/admin-tools/.private-key.pem (JANGAN commit,
#   sudah ada di .gitignore otomatis)
```

**Demo Commercial** memakai script yang sama, mode `demo`, dengan masa
berlaku (default 14 hari):

```bash
npx tsx licensing/admin-tools/activate.ts demo LXC7-... "Trial - Budi" 14
```

Saat masa demo habis, `getLicenseStatus()` mengembalikan `state: 'expired'` —
frontend tinggal menampilkan layar "masa demo berakhir, hubungi admin untuk
upgrade ke Commercial" dan memanggil `/api/license/activate` lagi dengan key
commercial baru (Device ID tidak berubah, jadi tidak perlu request ulang).

**Packaging installer:** repo ini sudah berupa Express + Vite (SPA + API di
satu proses Node) — cocok dibungkus dengan **Electron** atau **Tauri**
(Tauri lebih ringan untuk instalasi single-file .exe/.dmg). Ini item
terpisah dari licensing (licensing berjalan sama persis baik dijalankan
lewat Electron/Tauri maupun `node dist/server.cjs` langsung).

## 4. Alur Web (V7.1 Commercial / V7.1 Demo Commercial)

```
[Pengguna daftar/login di web]
        │
        ▼
[Pilih paket]  DAY / WEEK / MONTH — harga di licensing/web/plans.ts
        │
        ▼
[Pembayaran]  gateway (Midtrans/Xendit/dll — lihat "Open item" di bawah)
        │  webhook terverifikasi → createSubscription(customerId, plan)
        ▼
[Subscription tersimpan]  expiresAt = sekarang + durasi paket
   (kalau masih ada sisa waktu aktif, extend dari situ — bukan dari sekarang,
   supaya perpanjangan lebih awal tidak membuang waktu yang sudah dibayar)
        ▼
[Setiap request ke API]
   requireActiveSubscription() mengecek status LIVE di server
   (bukan token yang di-cache di client — karena berbasis waktu, harus selalu
   real-time, tidak boleh bisa dimundurkan jamnya di sisi klien)
        ▼
[Habis masa aktif] → 402 SUBSCRIPTION_REQUIRED → frontend redirect ke halaman
   perpanjangan, menampilkan daftar paket dari GET /api/license/plans
```

**Integrasi di `server.ts` (branch `track/web`, sudah diterapkan):**

```ts
import { requireActiveSubscription, webLicenseRoutes } from './licensing/web/middleware';
import { webAdminLicenseRoutes } from './licensing/web/adminApi';

app.use('/api/license', webLicenseRoutes());          // status, plans, start-trial, dev-mock-pay
app.use('/api/admin/license', webAdminLicenseRoutes()); // grant/revoke manual (admin)
app.use('/api', requireActiveSubscription());          // gate semua endpoint lain
```

Set `LEXICORE_ADMIN_SECRET` di `.env` sebelum memakai admin API.

**`req.customerId` saat ini** diisi oleh middleware cookie sementara di
`server.ts` (cari komentar "PLACEHOLDER until a real login system exists") —
server memberi setiap pengunjung id acak lewat cookie `lc_cid` (400 hari,
httpOnly) supaya seluruh alur trial/subscription/admin bisa diuji dan
dipakai sekarang juga, walau belum ada sistem akun sungguhan. Saat sistem
login dibangun, cukup ganti middleware ini agar `req.customerId` diisi dari
session/JWT — tidak ada kode licensing lain yang perlu berubah.

**UI langganan di frontend:** modal aktivasi desktop (`licenseModal`) di
`index.html` diganti total menjadi `subscriptionModal` — badge status
(`subscriptionStatusBadge`), daftar paket yang diambil live dari
`GET /api/license/plans` (harga Rupiah tampil apa adanya dari
`licensing/web/plans.ts`, tidak di-hardcode di frontend), tombol "Mulai
Trial Gratis", dan tombol bayar per paket yang saat ini memanggil
`POST /api/license/dev-mock-pay` (lihat catatan payment gateway di bawah).

**Demo Commercial (Web)** = trial otomatis, sekali per akun:

```
POST /api/license/start-trial   (tanpa perlu admin — self-serve)
```

`licensing/web/plans.ts` → `DEMO_DURATION_MS` (default 3 hari) mengatur
lama trial.

**Open item — autentikasi pengguna web sungguhan:** repo saat ini belum
punya sistem akun/login nyata (nama, email, password). Yang sudah berjalan
adalah id anonim per-browser lewat cookie (lihat di atas) — cukup untuk
mengetes dan bahkan menjalankan alur trial/subscription apa adanya, tapi
belum mengikat langganan ke identitas pengguna sungguhan (ganti browser/
hapus cookie = langganan "hilang" dari sudut pandang pengguna, walau tetap
tercatat di `subscriptionStore` by customerId lama). Perlu dibangun sebelum
rilis produksi: sistem akun (email/password atau OAuth) yang mengisi
`req.customerId` dari session/JWT, bukan cookie acak.

**Open item — payment gateway:** `POST /api/license/dev-mock-pay` disediakan
supaya alur bisa diuji end-to-end sekarang juga (nonaktif otomatis kalau
`NODE_ENV=production`). Untuk produksi, ganti dengan webhook resmi dari
payment gateway pilihan (Midtrans, Xendit, DOKU, dll. — semua support
Rupiah, cocok dengan harga di `plans.ts`) yang memanggil `createSubscription()`
setelah pembayaran terverifikasi via signature webhook mereka, bukan
dipanggil langsung dari client.

## 5. Penyimpanan langganan (Web)

Repo ini belum punya database (lihat `server/db.ts` — hanya memuat JSON
referensi statis, sisanya in-memory). `subscriptionStore.ts` sengaja dibuat
berbasis file JSON (`data/subscriptions.json`) sebagai titik awal yang jujur
dan berfungsi, **bukan** solusi produksi akhir.

**Sebelum scale-up nyata:** ganti isi tiga fungsi (`load`/`save`, dan cara
`createSubscription`/`getActiveSubscription` membaca-tulis) di
`subscriptionStore.ts` dengan Postgres/MySQL. Semua modul lain
(`middleware.ts`, `adminApi.ts`) hanya memanggil fungsi-fungsi yang diekspor
file itu, jadi migrasinya terisolasi di satu file.

## 6. Perbedaan model keamanan (kenapa dua sistem berbeda)

| | Desktop | Web |
|---|---|---|
| Model | Key offline, per-device | Subscription server-side, per-waktu |
| Validasi | Sekali di-paste, cached lokal, verifikasi kriptografi lokal | Setiap request, dicek live di server |
| Cocok untuk | Instalasi standalone, pengguna bisa offline | Layanan hosted, butuh kontrol waktu real-time |
| Risiko utama | Key dibagikan ke device lain → dicegah dengan binding Device ID | Jam device dimundurkan → tidak relevan karena expiry dicek di server, bukan di client |
| Pencabutan akses | Sulit (offline) — mitigasi: demo selalu ada expiry, commercial per-device | Mudah — admin `revoke` langsung berlaku di request berikutnya |

## 7. Checklist sebelum rilis masing-masing track

**Desktop (`track/desktop`):**
- [x] Jalankan `generate-keypair.ts`, isi `publicKey.ts`, amankan private key *(alur diuji end-to-end dengan keypair sungguhan; placeholder dikembalikan di repo — admin generate keypair sendiri saat rilis nyata)*
- [x] Mount `requireDesktopLicense()` di `server.ts`, sambungkan ke `/api/license/status`, `/install`, `/remove`
- [x] Layar aktivasi di frontend (badge + modal upload file lisensi) — ternyata sudah ada dari awal di `index.html`/`public/lexicore.v6122.js`, tinggal disambungkan ke backend nyata
- [ ] Bungkus dengan Electron/Tauri → installer .exe/.dmg/.AppImage
- [x] Uji: device baru → unactivated (402 di semua endpoint) → generate lisensi via CLI → upload → aktif (200) → lisensi ditempel/diubah device lain → ditolak

**Web (`track/web`):**
- [ ] Bangun sistem akun/login sungguhan (saat ini `req.customerId` memakai cookie anonim `lc_cid` sebagai placeholder — lihat `server.ts`, cari "PLACEHOLDER until a real login system exists")
- [ ] Pilih & integrasikan payment gateway (ganti `dev-mock-pay`, yang otomatis nonaktif saat `NODE_ENV=production`)
- [ ] Ganti `subscriptionStore.ts` ke database sungguhan (saat ini file JSON `data/subscriptions.json`)
- [x] Mount `requireActiveSubscription()` + `webLicenseRoutes()` + `webAdminLicenseRoutes()` di `server.ts`
- [x] Bangun modal langganan di frontend (badge status, daftar paket IDR live dari API, tombol trial & bayar)
- [x] Uji: akun baru (cookie baru) → 402 di semua endpoint → mulai trial → 200 → trial kedua ditolak → beli paket MONTH → masa aktif diperpanjang dari sisa trial (bukan dari nol) → admin endpoint ditolak tanpa `x-admin-secret`, diterima dengan secret yang benar
