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
- **Untuk produksi, pindah ke Supabase Postgres:**
  1. Buat project di Supabase → ambil connection string Postgres.
  2. Buat ulang tabel di Supabase dari skema di `db.js` (tipe data:
     `INTEGER → integer/bigint`, `TEXT → text`, `REAL → numeric`,
     `AUTOINCREMENT → GENERATED ALWAYS AS IDENTITY`,
     kolom JSON `TEXT` → `jsonb`).
  3. Ganti layer `db.js` dengan client `pg` (`npm i pg`) — semua query
     di `server.js` memakai SQL standar dengan placeholder `?` yang
     tinggal diubah ke `$1, $2, ...`. Endpoint dan respons API
     **tidak perlu berubah**.
  4. Set env `DATABASE_URL` di Render dan hapus ketergantungan pada file `.db`.

## Menjalankan lokal

```bash
npm install
npm start          # server di http://localhost:3000
```

File `lari-koin.db` dibuat otomatis di folder proyek saat pertama jalan
(sudah masuk `.gitignore`, jangan di-commit).
