# WRAPPER — Runner Coin WebView + AdMob (tahap 2, v1.4.0)

> Status: **DIBANGUN (lokal), BELUM DIPUBLISH.** APK belum pernah di-build
> (butuh GitHub Actions run) dan belum diuji di HP. Jangan janjikan iklan
> beneran sampai APK ini terpasang + AdMob menyetujui app-nya.

## Kenapa ada wrapper ini

APK lama (v1.3.0) adalah **TWA murni** (Bubblewrap): game dirender Chrome,
bukan WebView milik aplikasi — tidak ada JS bridge, jadi **AdMob SDK TIDAK
BISA jalan di dalamnya**. Wrapper ini menggantikan kulit TWA dengan aplikasi
Android native yang punya WebView sendiri + Google Mobile Ads SDK.

Game yang dimuat TETAP web yang sama (`https://lari-koin-hosting-production.up.railway.app/`)
— tidak ada kode game yang diduplikasi ke native. Kalau WebView/bridge
tidak ada, game jalan dengan simulasi seperti di browser biasa.

## Yang ada di dalam

| Berkas | Isi |
|---|---|
| `app/src/main/java/.../MainActivity.kt` | Satu Activity: WebView + ambil `GET /api/ads/config` + preload iklan |
| `app/src/main/java/.../AdMobBridge.kt` | `window.AdMobBridge` (JS bridge): `showInterstitial()`, `showRewarded('life')`, `isInterstitialReady()`, `isRewardedReady()` |
| `app/src/main/AndroidManifest.xml` | package `id.ranszshop.larikoin`, AdMob `APPLICATION_ID`, izin INTERNET |
| `app/build.gradle` | AGP 8.5.2, Kotlin 1.9.24, `play-services-ads:23.6.0`, minSdk 24, versionCode 5 / 1.4.0, signing keystore v2 |
| `app/src/main/res/mipmap-*/` | Ikon launcher rubah (dari `public/icon-512.png`) |

## Cara kerja bridge (web ↔ native)

1. WebView menyuntikkan `window.AdMobBridge` **sebelum** halaman dimuat +
   menandai user-agent `RunnerCoinWrapper/1.4.0`.
2. `public/app.js` mendeteksi bridge (`adaBridge()`) dan:
   - **Interstitial** — `tampilIklanSelingan()` → `AdMobBridge.showInterstitial()`.
     Native memanggil balik `window.__admobInterstitialClosed()` (lanjut game)
     atau `window.__admobInterstitialFailed()` (JS fallback ke modal simulasi).
     Kalau native diam 60 detik → fallback simulasi juga.
   - **Rewarded (+1 nyawa)** — tombol `📺 +1 Nyawa` → `AdMobBridge.showRewarded('life')`.
     Native hanya meneruskan reward kalau `onUserEarnedReward` jalan (iklan
     selesai ditonton) → `window.__admobRewarded('life', nonce)` → JS
     `POST /api/ads/rewarded-verify` (nonce UUID, anti-replay, maks 10/hari).
     Ditutup tanpa reward / gagal → `window.__admobRewardedFailed()` dan
     **TIDAK ADA hadiah** (sengaja tidak fallback ke nyawa gratis).
3. Unit ID iklan **diambil runtime** dari `GET /api/ads/config` (env Railway
   `ADMOB_APP_ID` / `ADMOB_REWARDED_UNIT_ID` / `ADMOB_INTERSTITIAL_UNIT_ID`,
   default = ID AdMob beneran). Kalau fetch gagal/timeout 6 detik → fallback
   ke ID yang sama yang tertulis di `MainActivity.kt` (identifier publik,
   bukan rahasia). **Ganti unit iklan = ganti env, tanpa rebuild APK.**
   Yang hardcode di manifest hanyalah `APPLICATION_ID` (identifier publik
   yang memang wajib ada di manifest agar SDK bisa init).

## Kebijakan hadiah (WAJIB dibaca sebelum ubah reward)

Google melarang hadiah moneter untuk rewarded ads
(`support.google.com/admob/answer/7313578` — "Direct monetary items may not
be offered as rewards under any circumstance"). Koin Runner Coin bisa
dicairkan jadi Rp → koin = hadiah moneter. Maka:

- **Rewarded AdMob HANYA boleh memberi +1 nyawa** (non-uang). Server
  (`POST /api/ads/rewarded-verify`) menolak `rewardType` apa pun selain
  `'life'` — `'coins'` TIDAK PERNAH ada di whitelist. Native juga menolak
  tipe selain `'life'`.
- Tombol `▶ Nonton Iklan +1.000 koin` **TIDAK** memakai AdMob rewarded —
  tetap simulasi seperti sekarang (koin dari iklan hanya boleh dari
  offerwall seperti Tapjoy, bukan dari Google).
- Interstitial tidak memberi hadiah apa pun — aman.

## Cara build

Build HANYA di GitHub Actions (build lokal di VM tidak bisa — Java TCP
diblokir, sama seperti TWA):

1. Upload folder `wrapper/` + `.github/workflows/build-wrapper.yml` ke repo.
2. Tab Actions → "Build Wrapper APK (Runner Coin WebView + AdMob)" →
   Run workflow (atau otomatis saat file `wrapper/` berubah).
3. Artifact `runner-coin-wrapper-apk` = `app-release.apk` (signed, v2 keystore).
4. Verifikasi APK sebelum publish (seperti TWA): package
   `id.ranszshop.larikoin`, versionCode 5, versionName 1.4.0, fingerprint
   sertifikat = v2 (`95:3C:27:72:…:9A:34`), ikon launcher = rubah.
5. Publish sebagai `public/Nailong-Runner.apk` (nama file dipertahankan
   supaya link download lama tetap jalan) + deploy Railway tidak diperlukan
   untuk APK-nya (game web tidak berubah karena wrapper — kecuali kalau
   server ikut berubah).

## Konfigurasi server (tidak perlu apa-apa untuk jalan pertama)

- `GET /api/ads/config` sudah ada di `server.js` (publik, tanpa auth).
- Env opsional di Railway (tanpa ini pun jalan pakai default):
  `ADMOB_APP_ID`, `ADMOB_REWARDED_UNIT_ID`, `ADMOB_INTERSTITIAL_UNIT_ID`.
- `POST /api/ads/rewarded-verify` sudah ada (butuh auth pemain).
- Tabel `admob_rewards` (nonce PRIMARY KEY) sudah ada di `db.js` (SQLite)
  + `supabase-schema.sql` (Postgres).

## Celah yang tersisa (jujur, jangan ditutup-tutupi)

1. **Verifikasi rewarded masih client-asserted, BUKAN SSV Google.**
   Alur sekarang: native (AdMob SDK) memanggil `onUserEarnedReward` →
   JS POST nonce ke server → server cek auth + dedup nonce + batas harian.
   Pemain yang membongkar APK secara teori bisa memanggil bridge / endpoint
   langsung tanpa menonton iklan. Mitigasi yang sudah ada: auth pemain,
   nonce unik anti-replay, batas 10/hari, hadiah cuma nyawa (bukan koin —
   nilai ekonominya kecil). **Jalur yang benar: AdMob Server-Side
   Verification (SSV)** — Google POST ke callback server dengan data
   bertanda tangan (`POST /api/ads/ssv`, verifikasi signature dengan public
   key Google). SSV butuh setup di dashboard AdMob (custom SSV data +
   callback URL) + app yang sudah disetujui. **Belum dibangun — kerjakan
   sebelum mengandalkan rewarded untuk hadiah bernilai.**
2. **Login Google di WebView kemungkinan diblokir Google.**
   Google menolak OAuth di WebView tertanam (403 `disallowed_useragent`).
   Token login TIDAK tersimpan di localStorage game (hanya musik/suara/
   tour), jadi pemain harus login fresh di dalam WebView — dan itu bisa
   gagal. **Belum terverifikasi — wajib dites di HP.** Kalau diblokir,
   tindak lanjut: jembatan login via Chrome Custom Tabs (buka
   `accounts.google.com` di Custom Tab + kembalikan token ke aplikasi
   lewat deep link), atau pemain login sekali di browser lalu token
   diserahkan ke wrapper. Jangan publish wrapper sebagai pengganti TWA
   sebelum login terbukti jalan di HP.
3. **App AdMob masih "Sedang disiapkan".** Review AdMob harus selesai
   dulu sebelum iklan beneran tayang (unit sudah aktif, tapi penayangan
   dibatasi selama review). `app-ads.txt` sudah live di root situs game.
4. **Risiko review Play Store "Minimum Functionality".** Aplikasi yang
   isinya hanya WebView membungkus website berisiko ditolak Play Store.
   AdMob + bridge adalah fungsi native yang nyata, tapi bukan jaminan
   lolos. (APK saat ini didistribusikan lewat link langsung, bukan Play
   Store — risiko ini baru relevan kalau masuk Play Store.)

## Tes

`tests/test-wrapper.mjs` — cek statis (manifest, gradle, bridge, unit ID
tidak hardcode kecuali fallback, wiring app.js, sw v22) + tes live server
(`/api/ads/config`, `/api/ads/rewarded-verify`: tanpa auth → 401,
rewardType koin → 400, nonce replay → 403, nyawa penuh → 400).
Jalankan: `node tests/test-wrapper.mjs` (butuh server lokal — file ini
menyalakan server sendiri di port tes, DB SQLite temp).
