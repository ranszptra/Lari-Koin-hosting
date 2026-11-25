# DEPLOY.md — Deploy Lari Koin Online ke Render (gratis)

## Langkah deploy

1. Push folder ini ke repo Git (GitHub/GitLab).
2. Di [dashboard.render.com](https://dashboard.render.com) → **New → Web Service**
   → pilih repo. Atau, karena `render.yaml` sudah ada, pakai
   **New → Blueprint** dan pilih repo — service `lari-koin-online` akan
   dibuat otomatis dari `render.yaml`.
3. Pastikan pengaturan service:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
   - **Environment variables:**
     - `NODE_ENV=production`
     - `OWNER_SECRET=` ← **WAJIB diganti** dengan string acak panjang
       (di Blueprint, nilai ini di-generate otomatis via `generateValue: true`).
       Kalau diganti setelah pemain terdaftar, semua token lama jadi tidak
       valid dan pemain harus login ulang.
     - `PORT` diisi otomatis oleh Render — jangan di-hardcode di kode
       (server sudah membaca `process.env.PORT`, default 3000).
4. Deploy. Setelah live, uji: `https://<nama-service>.onrender.com/api/health`
   harus mengembalikan `{ "ok": true, ... }`.
5. **Segera ganti PIN admin** (awal: `246810`) lewat
   `POST /api/admin/change-pin` dengan `oldPin` + `newPin`.
6. Salin hasil build frontend ke folder `public/` (atau deploy frontend
   terpisah dan arahkan `fetch` ke URL backend ini). CORS sudah dibuka
   (`Access-Control-Allow-Origin: *`).

## Peringatan penting — database SQLite di Render Free

- **Disk Render Free bersifat ephemeral:** file `lari-koin.db` bisa **hilang
  saat service restart / redeploy / sleep**. Semua data pemain, koin,
  penarikan, dan progres offerwall ikut hilang.
- Untuk demo/pengembangan awal ini masih bisa dipakai, tapi **jangan
  jadikan ini penyimpanan produksi**.
- **Untuk produksi, pindah ke Supabase Postgres — SUDAH DIIMPLEMENTASIKAN
  (2026-11-25):**
  1. Buat project di Supabase → ambil connection string Postgres (pakai
     **Transaction pooler** bila ada, format
     `postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`).
  2. Jalankan `supabase-schema.sql` di Supabase Dashboard → SQL Editor
     (atau biarkan server yang menjalankannya otomatis saat pertama start —
     lihat langkah 4; file ini idempotent, aman dijalankan berulang).
  3. Kode sudah dual-backend: `db.js` memakai `pg` bila env `DATABASE_URL`
     diset, dan fallback ke SQLite lokal bila tidak diset. Semua query
     `?` diterjemahkan ke `$1, $2, ...` otomatis di jalur Postgres.
  4. Set env `DATABASE_URL` di Railway (Variables → New Variable).
     Restart service; log akan menampilkan
     `[db] Postgres (DATABASE_URL) aktif`. Data pemain yang sudah ada di
     SQLite **tidak** ikut pindah otomatis — migrasi data lama (bila ada)
     harus dilakukan terpisah sebelum switch.
  5. Endpoint dan respons API **tidak berubah**.

## Menjalankan lokal

```bash
npm install
npm start          # server di http://localhost:3000
```

File `lari-koin.db` dibuat otomatis di folder proyek saat pertama jalan
(sudah masuk `.gitignore`, jangan di-commit).
