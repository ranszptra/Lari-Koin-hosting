# Lari Koin Online — Proyek Mandiri (Standalone)

Game runner 3 jalur ala Subway Surfers (Jolly lari, hindari halangan, kumpulkan
koin) **dengan akun pemain, dompet, dan Panel Pemilik**, sebagai proyek Node.js
mandiri yang bisa di-host di Render gratis dan nanti dibungkus jadi APK (TWA).

> **Dibangun ulang dari spesifikasi** — bukan salinan dari artifact Muse.
> Versi artifact (yang hanya bisa dibuka pemilik dari Muse) tetap ada secara
> terpisah; proyek ini adalah versi yang bisa di-host publik.

## Ekonomi (dikunci — jangan diubah tanpa persetujuan pemilik)

- **1.000 koin = Rp15** (50-50: pemain 50%, pemilik 50%).
- Iklan rewarded **+1.000 koin**, cooldown **5 menit**, maks **10x/hari**.
- Penarikan **Rp1.000 / Rp5.000 / Rp10.000 / Rp50.000** ke DANA/GoPay/OVO/
  ShopeePay — dicatat sebagai pengajuan, diproses pemilik (status
  `Menunggu → Diproses → Selesai`).
- Check-in 7 hari: Rp `[50, 50, 100, 150, 200, 500, 1000]`; kelewat sehari
  streak reset.
- Undang teman **Rp5.000** (333.333 koin), cair kalau teman sudah nonton ≥1
  iklan DAN menyelesaikan level 3.
- Kode hadiah: `LARIKOIN`, `JOLLYGAS`, `RANSGACOR`, `HOKI777`.

## Fitur yang sudah jadi

- **Game runner (canvas):** 3 jalur, keyboard + swipe/tap, 60 level,
  kesulitan naik tiap level, level 60 tersulit, bos tiap 10 level (hadiah 5x),
  6 dunia (Kota Senja, Hutan Rimba, Gurun Pasir, Salju Abadi, Luar Angkasa,
  Lava Berapi). Jolly digambar di canvas (plush krem, mata hitam mengkilap,
  senyum kecil, pipi pink). Karakter Jolly/Kiko/Momo/Rex + skin
  emas/ninja/astronot/pelangi/shadow + power-up magnet/perisai/koin x2.
  Koin dari lari yang gagal tetap disimpan (tanpa bonus level).
- **Akun pemain:** daftar/masuk nama + PIN (hash scrypt), semua progres
  tersimpan di server (SQLite), token auth stateless (HMAC) di memori —
  **tanpa localStorage** (tahan di iframe sandbox).
- **Dompet & penarikan**, misi harian (3, refresh harian), prestasi (8),
  roda hadiah, peti misteri, leaderboard mingguan, kode hadiah, undang teman.
- **Iklan (simulasi):** mediasi 13 network (AdMob, Unity Ads, AppLovin MAX,
  ironSource, Meta Audience Network, Pangle, Mintegral, Liftoff, InMobi,
  Chartboost, Fyber, Nusantara Ads, IklanKita) tampil **bergiliran (rotasi)**
  di banner/interstitial/rewarded + panel statistik per network.
- **Offerwall (simulasi):** 7 penyedia (AdGem, Tapjoy, AdscendMedia,
  ayeT-Studios, RevU, Torox, adjoe), 14 misi contoh. Hadiah **hanya cair
  setelah install terverifikasi** lewat postback server-to-server bertoken
  (token salah → 403 ditolak); pemain terima tepat 50% nilai misi.
  Ada tombol "Simulasikan verifikasi (demo)" yang berlabel jelas.
- **Panel Pemilik TERPISAH:** `admin.html` — login PIN sendiri, **tidak ada
  tombol/tautan admin di halaman pemain**. Isi: total pemain & pemain baru
  hari ini, koin beredar (+nilai Rp), antrean penarikan per status dengan
  nama/nominal/metode/nomor tujuan + tombol proses/tandai dibayar, daftar
  semua pemain (bisa dicari), statistik mediasi & offerwall, ganti PIN,
  kartu "Pasang di HP". **PIN awal: `246810` — ganti segera setelah deploy.**
- **PWA:** `manifest.json` + ikon Jolly (SVG + PNG 192/512) + service worker,
  siap dipasang ke layar utama HP dan dibungkus jadi APK (TWA) setelah
  hosting publik.

## Struktur proyek

```
lari-koin-hosting/
├── server.js            # Semua endpoint API + auth + ekonomi
├── db.js                # Skema SQLite, seed, helper (scrypt/HMAC/tanggal WIB)
├── package.json         # express saja; npm start -> node server.js
├── render.yaml          # Deploy Render (free)
├── API.md               # Dokumentasi semua endpoint + contoh curl
├── DEPLOY.md            # Langkah deploy Render + migrasi Supabase
├── README.md            # File ini
├── .gitignore           # node_modules/, *.db, .env
└── public/              # Frontend (disajikan statis oleh server.js)
    ├── index.html       # Halaman pemain (tanpa jejak admin)
    ├── app.js           # Logika pemain + game canvas
    ├── admin.html       # Panel Pemilik (terpisah)
    ├── admin.js         # Logika dashboard pemilik
    ├── style.css
    ├── manifest.json    # PWA
    ├── sw.js            # Service worker
    ├── icon.svg
    ├── icon-192.png
    └── icon-512.png
```

## Menjalankan lokal

```bash
cd lari-koin-hosting
npm install
npm start            # jalan di http://localhost:3000
```

Butuh **Node.js 24+** (database memakai `node:sqlite` bawaan Node 24 —
`better-sqlite3` tidak punya prebuilt binary untuk Node 24, jadi tidak dipakai).
Database `lari-koin.db` dibuat otomatis + seed (PIN admin + 14 misi offerwall)
saat server pertama jalan.

Variabel environment (opsional):

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port server (Render mengisi sendiri) |
| `OWNER_SECRET` | `dev-secret-change-me` | **Wajib diganti di produksi** — semua token auth memakai ini |
| `DB_PATH` | `./lari-koin.db` | Lokasi file SQLite |
| `NODE_ENV` | — | `production` di Render |

## Deploy ke Render gratis

Ringkasan — langkah lengkap ada di [DEPLOY.md](DEPLOY.md):

1. Push proyek ini ke repo GitHub.
2. Di Render: New → Web Service → pilih repo → Runtime Node.
   `render.yaml` sudah berisi semuanya (build `npm install`, start
   `node server.js`, plan free, `OWNER_SECRET` di-generate otomatis).
3. Buka URL Render → daftar pemain → buka `/admin.html` → login PIN
   `246810` → **langsung ganti PIN**.

**Peringatan Render Free:** disk-nya *ephemeral* — file `lari-koin.db`
bisa hilang saat service restart/redeploy (akun & koin pemain ikut hilang).
Untuk produksi, pindah database ke **Supabase Postgres** — skema di `db.js`
ditulis standar agar mudah dipindah; langkahnya ada di `DEPLOY.md`.

## Menjadi APK

Setelah game punya URL publik (Render):

1. Buka URL di Chrome Android → pasang sebagai PWA (Add to Home Screen),
   atau
2. Bungkus dengan **Bubblewrap (TWA)** menjadi file APK yang bisa
   di-download langsung (gratis, tanpa Play Store), atau upload ke Play Store
   (butuh akun developer $25 sekali bayar).

## Yang masih simulasi / belum

- **Iklan & offerwall masih simulasi.** Kampanye beneran butuh akun + API key
  pemilik di tiap network/penyedia (AdMob, Unity Ads, AppLovin, ironSource,
  Meta, Pangle, Mintegral, Liftoff, InMobi, Chartboost, Fyber, AdGem, Tapjoy,
  AdscendMedia, ayeT-Studios, RevU, Torox, adjoe). Struktur mediasi,
  pencatatan tayangan, dan postback verifikasi sudah siap — tinggal
  menyambungkan kredensial asli.
- **Penarikan diproses manual** oleh pemilik dari Panel Pemilik (transfer
  DANA/GoPay/OVO/ShopeePay sendiri, lalu tandai "Sudah Dibayar").
- **Belum dites di Render** (baru dites lokal) dan **belum dibungkus APK**
  (butuh URL publik dulu).
- Data pemain di proyek ini **mulai dari nol** — akun dari versi artifact
  tidak ikut pindah.

## Hasil uji (lokal, 2026-11-25)

Uji end-to-end dengan server sungguhan (DB sementara, dihapus setelah uji):
**62/62 PASS** — register/login (+bonus 500), profil, finish-level format
baru `{level, coins}` dan format lama `{level, coinsCollected}`, bank-run-coins
(game over tanpa buka level), klaim prestasi, roda (`prize`), peti (`prize`),
check-in hari 1 (+3333), kode LARIKOIN, iklan + cooldown, referral lengkap
(budi → iklan + level 1–3 → klaim +333.333), beli/equip Kiko, penarikan
Rp1.000, offerwall (klaim sebelum verifikasi ditolak, postback salah → 403,
demo-verify → klaim +500.000), mediasi 13 network, leaderboard, admin
(PIN salah 401, dashboard + nama pemain di penarikan, ubah status penarikan).
`node --check` lolos semua file JS; `grep` memastikan tanpa localStorage dan
tanpa kata admin/pemilik di `index.html`.
