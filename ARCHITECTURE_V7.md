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
[App generate Device ID]  ← licensing/desktop/fingerprint.ts
   ditampilkan di layar aktivasi, contoh: LXC7-8F2A-91BD-4C0E-77A1
        │  (dikirim manual: WA / email / dsb — TIDAK ada koneksi server)
        ▼
[Admin]
   npx tsx licensing/admin-tools/activate.ts commercial LXC7-... "Nama Pelanggan"
        │  → menghasilkan activation key (ditandatangani Ed25519)
        │  (dikirim balik manual ke pengguna)
        ▼
[Pengguna paste key di app]
   POST /api/license/activate { key }
        │  licensing/desktop/license.ts:
        │    1. verifikasi tanda tangan pakai public key
        │    2. cek deviceId di payload == Device ID mesin ini
        │    3. cek expiresAt (null = permanen / commercial; ada nilai = demo)
        │    4. simpan ke ~/.lexicore/license.key (Linux/Mac) atau
        │       %APPDATA%\LexiCore\license.key (Windows)
        ▼
[App unlocked — 100% offline setelahnya]
```

**Integrasi ke `server.ts` (branch `track/desktop`):**

```ts
import { requireDesktopLicense, desktopLicenseRoutes } from './licensing/desktop/middleware';

app.use('/api/license', desktopLicenseRoutes());   // status, device-id, activate
app.use('/api', requireDesktopLicense());          // gate semua endpoint lain
```

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

**Integrasi ke `server.ts` (branch `track/web`):**

```ts
import { requireActiveSubscription, webLicenseRoutes } from './licensing/web/middleware';
import { webAdminLicenseRoutes } from './licensing/web/adminApi';

app.use('/api/license', webLicenseRoutes());          // status, plans, start-trial
app.use('/api/admin/license', webAdminLicenseRoutes()); // grant/revoke manual (admin)
app.use('/api', requireActiveSubscription());          // gate semua endpoint lain
```

Set `LEXICORE_ADMIN_SECRET` di `.env` sebelum memakai admin API.

**Demo Commercial (Web)** = trial otomatis, sekali per akun:

```
POST /api/license/start-trial   (tanpa perlu admin — self-serve)
```

`licensing/web/plans.ts` → `DEMO_DURATION_MS` (default 3 hari) mengatur
lama trial.

**Open item — autentikasi pengguna web:** repo saat ini belum punya sistem
akun/login. `requireActiveSubscription()` mengasumsikan sesuatu di upstream
sudah mengisi `req.customerId` (misalnya dari session/JWT setelah login).
Ini perlu dibangun di branch `track/web` sebelum subscription bisa dipakai
sungguhan — licensing-nya sendiri sudah siap begitu `customerId` tersedia.

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
- [ ] Jalankan `generate-keypair.ts`, isi `publicKey.ts`, amankan private key
- [ ] Mount `requireDesktopLicense()` + `desktopLicenseRoutes()` di `server.ts`
- [ ] Bangun layar aktivasi di frontend (tampilkan Device ID, form paste key)
- [ ] Bungkus dengan Electron/Tauri → installer .exe/.dmg/.AppImage
- [ ] Uji: device baru → unactivated → paste key salah → paste key device lain → paste key benar → expired (demo)

**Web (`track/web`):**
- [ ] Bangun sistem akun/login (isi `req.customerId`)
- [ ] Pilih & integrasikan payment gateway (ganti `dev-mock-pay`)
- [ ] Ganti `subscriptionStore.ts` ke database sungguhan
- [ ] Mount `requireActiveSubscription()` + routes di `server.ts`
- [ ] Bangun halaman pilih paket (pakai `GET /api/license/plans`) & halaman "masa aktif habis"
- [ ] Uji: akun baru → start-trial → trial habis → beli paket → expired → renew
