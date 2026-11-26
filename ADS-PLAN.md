# ADS-PLAN — Integrasi Iklan Beneran untuk Runner Coin

> Dokumen riset + rencana. Dibuat 2026-11-26. TIDAK ada kode yang diubah untuk rencana ini.
> Status saat dokumen ini ditulis: **semua iklan di game masih SIMULASI**. Tidak ada satu rupiah pun
> penghasilan iklan beneran sampai salah satu rute di bawah ini diintegrasikan + diverifikasi live.

## 0. Ringkasan putusan

| Rute | Uang beneran? | Butuh rebuild APK? | Butuh apa dari Rans | Kecepatan |
|---|---|---|---|---|
| **A. AdGem offerwall (web)** | Ya — per install/aksi, payout USD | **Tidak** (link web saja) | Daftar AdGem, App ID + Postback Key | **Tercepat — rute pertama** |
| **B. AdSense H5 Games Ads** | Ya — interstitial web | **Tidak** (tag di halaman web) | Akun AdSense disetujui + daftar program H5 + situs game disetujui | Menengah (antre persetujuan) |
| **C. AdMob native (SDK Android)** | Ya — interstitial/rewarded native | **Ya — wrapper baru (WebView), BUKAN TWA murni** | Jenis unit AdMob + rebuild APK | Paling lama + paling berisiko |

**Verdict: AdGem offerwall dulu.** Satu-satunya rute yang (1) tidak butuh rebuild APK,
(2) dirancang khusus untuk reward berupa mata uang virtual, dan (3) punya postback server-to-server
yang nyambung langsung ke sistem offerwall yang SUDAH ada di `server.js`.

**Peringatan kebijakan paling penting (baca dulu sebelum apa pun):**
Google MELARANG hadiah berupa uang tunai / setara uang tunai dari iklan rewarded — AdMob maupun
AdSense H5. Koin Runner Coin bisa dicairkan jadi Rp (DANA/GoPay/OVO/ShopeePay), jadi koin itu
secara kebijakan = hadiah moneter. Artinya **iklan rewarded (nonton iklan → dapat koin) TIDAK BOLEH
pakai AdMob/AdSense H5 apa adanya**. Yang boleh: interstitial TANPA hadiah, atau rewarded yang
hadiahnya item non-uang (nyawa ekstra, skin, power-up — bukan koin yang bisa dicairkan).
Detail di §5. AdGem tidak kena larangan ini karena modelnya memang offerwall → mata uang virtual
publisher (dan pencairan Rp adalah ekonomi publisher sendiri, bukan hadiah Google).

---

## 1. Peta iklan simulasi saat ini (hasil audit kode, 2026-11-26)

### 1.1 Client — `public/app.js`

| # | Lokasi | Fungsi / pemicu | Yang terjadi sekarang (simulasi) |
|---|---|---|---|
| 1 | `app.js:1260-1276` | `tampilIklanSelingan(cb)` — **satu-satunya choke point semua iklan interstitial/skill/nyawa** | Kalau game sedang jalan → `jedaGame()` (`jedaKarenaIklan=true`). Tampilkan `#modalIklan` (index.html:310-316) dengan hitung mundur 5 detik, nama jaringan acak dari `networks`. Kirim `POST /api/ads/impression {network, format:'interstitial'}`. Saat tombol Tutup ditekan → tutup modal, `lanjutGame()` kalau tadi dijeda, lalu panggil `cb()`. |
| 2 | `app.js:731-760` | Banner + tombol `▶ Nonton Iklan +1.000 koin` (`#btnNontonIklan`, index.html:272) | `muatNetworks()` → `GET /api/ads/networks`; `tampilBanner()` ganti teks `#bannerNama` tiap 15 detik + `POST /api/ads/impression {format:'banner'}`. `updateIklanBtn()` menegakkan batas 10/hari + cooldown 5 menit (cek tiap 1 detik). Klik tombol → toast → `POST /api/claim-ad-reward` → +1.000 koin. |
| 3 | `app.js:1075-1086` | Skill iklan — 3 tombol `[data-skill]` (cepat / magnet / perisai), di Beranda + `#skillHud` di dalam game (index.html:143) | Klik → tombol jadi `⏳ Memutar iklan…` → `tampilIklanSelingan(cb)` → `skillIklan[nama]=true` (aktif 1x lari). `resetSkillIklan()` dipanggil saat game over (`app.js:1175`) dan saat level selesai (`app.js:1189`). Efek dipakai di `resetGame()` (app.js:1091-1096). |
| 4 | `app.js:1191-1207` | `selesaiLevel()` — interstitial antar level | Setelah level tamat (`game.running=false`) → `tampilIklanSelingan(cb)` → di dalam `cb`: `POST /api/finish-level` (simpan koin + bonus + skin/karakter baru), tampilkan panel hasil + auto-lanjut level berikut. |
| 5 | `app.js:1444-1451` | Tombol `📺 +1 Nyawa` (`#btnNyawaIklan`, index.html:126, muncul saat cooldown nyawa) | Klik → `tampilIklanSelingan(cb)` → `POST /api/lives/ad` → +1 nyawa (maks 15). |
| 6 | `app.js:1243-1257` | `jedaGame()` / `lanjutGame()` / `toggleJeda()` | Jeda = `game.paused=true`, loop 2D + 3D membeku di frame terakhir. Dipakai oleh `tampilIklanSelingan` (iklan buka → jeda; iklan tutup → lanjut hanya kalau tadi sedang lari). |

### 1.2 Server — `server.js` / `db.js`

| Endpoint / data | Lokasi | Keterangan |
|---|---|---|
| `GET /api/ads/networks` | `server.js:659` | Mengembalikan tabel `NETWORKS` (demo). |
| `POST /api/ads/impression` | `server.js:662-670` | Mencatat impression ke tabel `ad_impressions` (network, format, eCPM demo). Format valid: `banner \| interstitial \| rewarded`. Dipakai admin dashboard untuk estimasi pendapatan (simulasi). |
| `POST /api/claim-ad-reward` | `server.js:372-389` | Rewarded "nonton iklan": cek `AD_MAX_PER_DAY = 10`, `AD_COOLDOWN_MS = 5 menit`, lalu +`AD_REWARD_COINS = 1000` koin (`db.js:69-71`). **Tidak ada verifikasi iklan beneran — siapa pun yang login bisa klaim.** |
| `POST /api/lives/ad` | `server.js:~360-368` | +1 nyawa (maks 15/hari), `totalAds+1`. Juga tanpa verifikasi iklan. |
| `GET /api/offers`, `POST /api/offers/start` | `server.js:583-612` | Daftar 14 misi demo + mulai misi (menerbitkan token rahasia per misi, `offer.secret`, disimpan di `offer_progress`). |
| `POST /api/offer-postback` | `server.js:624-633` | Endpoint postback provider (tanpa auth, hanya cek token `offer.secret` via `verifyOfferPostback()`). **Ini endpoint yang akan dipakai AdGem — tapi verifikasinya HARUS diganti ke HMAC-SHA256 AdGem (§3.4).** |
| `POST /api/offers/demo-verify` | `server.js:635-643` | **DEMO ONLY — memverifikasi misi sendiri tanpa provider.** WAJIB dimatikan/dihapus sebelum integrasi beneran (kalau tidak, pemain bisa klaim semua misi gratis). |
| `POST /api/offers/claim` | `server.js:644-657` | Klaim hadiah misi yang statusnya `terverifikasi` → +`rewardCoins`. |
| `GET /api/admin/dashboard` | `server.js:692-720` | Statistik mediasi (`ad_impressions`) + offerwall per provider. |
| `NETWORKS` (13 jaringan, eCPM demo USD tier-1) | `db.js:81-95` | AdMob 19.44, Unity Ads 13.41, AppLovin MAX 11.20, ironSource 9.80, Meta AN 14.50, Pangle 12.50, Mintegral 8.30, Liftoff 7.60, InMobi 6.90, Chartboost 5.40, Fyber 4.80, Nusantara Ads 3.20, IklanKita 2.90. **Demo — JANGAN dipakai untuk proyeksi.** eCPM Indonesia beneran jauh lebih rendah (AdMob rewarded ~$0,82 / interstitial ~$0,53 per 1.000 tayang — sudah disampaikan ke Rans sebelumnya). |
| Seed offers (14 misi demo, 2 berlabel AdGem) | `db.js:404-441` | `AdGem / Instal Aplikasi DanaKita` (15.000 koin), `AdGem / Main Game Puzzle ke Level 10` (25.000 koin) + 12 misi provider lain. **Ini baris demo di DB lokal, BUKAN kampanye AdGem beneran.** |
| `estRevenueRp` | `db.js:97` | `impressions × eCPM / 1000 × Rp16.000` — estimasi demo saja. |

**Tidak ada** kode AdMob SDK, AdGem SDK, atau AdSense di repo saat ini (grep `admob|adgem|adsbygoogle` di `public/` + `server.js` = kosong).

---

## 2. Yang harus dikirim Rans dulu (blocker untuk semua rute)

1. **Jenis unit AdMob pertama** — unit `ca-app-pub-3929807789448089/9615563652` itu tipe apa:
   rewarded, interstitial, atau banner? Game butuh **1 rewarded + 1 interstitial**.
   (App ID sudah ada: `ca-app-pub-3929807789448089~9100558334`.)
2. **AdGem: daftar + kirim App ID (Property ID) + Postback Key** — daftar di AdGem
   (butuh KTP / telepon / bank — data Rans sendiri), buat Property platform **Desktop/Web**,
   kirim App ID dan Postback Key. JANGAN kirim Postback Key lewat chat biasa kalau bisa —
   itu kunci verifikasi (lihat §3.4).
3. **Keputusan hadiah rewarded (§5)** — karena koin = uang tunai, rewarded Google tidak boleh
   memberi koin. Pilih: (a) rewarded Google hanya untuk nyawa/skin/power-up (bukan koin), atau
   (b) tidak pakai rewarded Google sama sekali; koin dari iklan tetap dari AdGem offerwall.

Tanpa poin 1–2, tidak ada integrasi beneran yang bisa dimulai.

---

## 3. Rute A — AdGem offerwall (web) — DIDAHULUKAN

### 3.1 Kenapa rute ini
- AdGem punya **Web Offerwall resmi: tanpa SDK**, cukup URL — cocok 100% untuk game web di dalam TWA.
  Sumber: https://docs.adgem.com/docs/integrate/offer-delivery/pre-built/web-offerwall
- Tidak butuh rebuild APK, tidak butuh ubah wrapper, tidak butuh Play Store.
- Modelnya memang "selesaikan offer → dapat mata uang virtual" — sama persis dengan sistem
  offerwall + postback yang sudah ada di `server.js:583-657`.

### 3.2 Langkah pendaftaran (Rans)
1. Buat akun publisher AdGem, lengkapi data diri + pajak + pembayaran.
2. Dashboard → **Properties & Apps** → **New Property** → Platform: **Desktop/Web** →
   isi form (nama Runner Coin, URL `https://lari-koin-hosting-production.up.railway.app/`).
   Satu Property/App ID unik per website.
3. Tunggu **approval aplikasi** — sebelum disetujui, offerwall tidak menampilkan offer apa pun.
   (Dokumen AdGem: "By default, your app will not have access to AdGem's offers until you
   complete the initial integration steps and your app is approved.")
4. Di halaman Offerwall property tersebut, salin **Web Offerwall Direct Link** dan/atau
   **Full Screen iFrame Code**.

### 3.3 Integrasi web (kode — dikerjakan nanti, bukan di dokumen ini)
- **URL offerwall** (dari dokumen resmi AdGem):
  `https://api.adgem.com/v1/wall?appid=YOUR_APP_ID&player_id=USER_ID`
  - Direct Link: buka di tab baru (`target="_blank"`).
  - iFrame: sematkan `<iframe src="…sama…" width="100%" height="600">` di halaman Misi/Tugas.
  - Rekomendasi untuk game ini: **Direct Link** dulu (paling simpel, tidak ada risiko iframe
    merusak layout game); iFrame belakangan kalau mau tampilan menyatu.
- **`player_id` (WAJIB, dari dokumen resmi):**
  - Harus unik + konstan per pemain, huruf kecil saja, karakter alfanumerik + `-` + `_`,
    maks **255 karakter**. Tanpa `player_id` → redirect ke halaman 404 AdGem.
  - Pemetaan dari game ini: pemain di DB punya `id` numerik. Pakai format `player-<id>`
    (contoh: pemain id 42 → `player-42`). Postback AdGem mengembalikan `player_id` yang sama,
    jadi server tinggal parse angka di belakang `player-` untuk kredit koin.
  - Parameter opsional yang berguna: `player_level` (level pemain), `app_version` (mis. `1.2.0`),
    `c1`–`c5` (custom, dikembalikan di postback — bisa dipakai untuk menandai misi internal).
  - Catatan: GAID (Google Advertising ID) hanya bisa dibaca kode native — browser/WebView
    tidak bisa. Untuk integrasi web, atribusi install mengandalkan fingerprint (kurang akurat
    dibanding GAID, tapi itu batasan resmi AdGem untuk web — jangan dijanjikan 100% ke pemain).
- **Titik sisip di kode (dari peta §1):**
  - Ganti daftar misi demo di Tugas/Offerwall (`app.js` `muatOffer()` / `#daftarOffer`) dengan
    tombol **"🎁 Buka Offerwall"** → Direct Link AdGem dengan `player_id` pemain yang login.
    Baris misi demo (`db.js` seed 14 misi) tetap ada sampai wall live, lalu nonaktifkan.
  - `POST /api/offers/start` + `demo-verify` tidak dipakai lagi untuk AdGem (wall AdGem yang
    melacak progres; server kita hanya menerima postback).
- **Syarat platform (dokumen resmi):** browser modern + JavaScript, HTTPS (sudah — Railway),
  endpoint postback server-side (sudah ada, tinggal diperkuat §3.4). Android 9.0+ / iOS 15.8+.

### 3.4 Postback server-to-server (v3, yang direkomendasikan AdGem)
- **Aktifkan:** Dashboard → Properties & Apps → Edit → Postback Options → **Server Postback**.
  Isi **Postback Key** (disalin sekali saja — simpan di env Railway, JANGAN di repo) dan
  **Postback URL**: `https://lari-koin-hosting-production.up.railway.app/api/offer-postback`
  (endpoint sudah ada di `server.js:624` — perlu ditulis ulang verifikasinya, lihat bawah).
- **Format v3 (POST, JSON, dari dokumen resmi https://docs.adgem.com/publisher-support/ios-postback-setup/):**
  - Top-level: `request_id` (UUID unik), `timestamp` (unix detik).
  - `data`: `app_id`, `campaign_id`, `player_id`, `amount` (jumlah mata uang virtual untuk
    pemain), `payout` (pendapatan USD publisher), `conversion_id` (ID unik konversi),
    `app_version`, `ad_type` (mis. `"offerwall"`), `country`, `c1`–`c5`, `gaid`, `idfa`, `ip`,
    `os_version`, `platform`, `state`, `click_datetime`, `conversion_datetime`, `goal_name`,
    `goal_id`, `offer_name`, `tracking_type` (CPI/CPE/CPA), `allow_multiple_conversions`,
    `store_id`, `offer_id`, `conversion_type` (`"reward"` atau `"install"`).
  - Install postback defaultnya MATI — minta ke Publisher Support Advocate kalau mau diaktifkan.
- **Verifikasi (wajib, dari dokumen resmi):**
  1. Hitung `HMAC-SHA256(raw_request_body, POSTBACK_KEY)`, bandingkan dengan header `Signature`
     (perbandingan timing-safe). Tidak cocok → tolak 401, JANGAN kredit koin.
  2. IP whitelist: postback datang dari IP statis AdGem — minta IP-nya ke support advocate,
     tolak IP lain (lapis kedua).
  3. **Dedup pakai `conversion_id`**: simpan `conversion_id` yang sudah diproses; tolak duplikat
     (AdGem retry sampai 3x: percobaan ke-2 1 detik setelah gagal, ke-3 2 detik setelahnya,
     timeout 20 detik/percobaan, sukses = respons `2xx` apa pun).
  4. Kredit `data.amount` koin ke pemain dari `player_id` (`player-<id>`). Sanity check:
     `amount > 0`, ada batas atas wajar, `app_id` = App ID kita, `conversion_type = "reward"`.
     Jangan pernah percaya `amount` dari client — hanya dari postback terverifikasi.
  5. **HAPUS/NONAKTIFKAN `POST /api/offers/demo-verify`** sebelum go-live (kalau tidak,
     pemain bisa verifikasi misi sendiri tanpa menyelesaikan offer).
  6. Token rahasia per-misi (`offer.secret`) yang lama tidak dipakai untuk AdGem — ganti
     dengan verifikasi HMAC di atas. (Sistem token lama tetap boleh dipakai untuk misi
     internal/demo lain, tapi bukan untuk AdGem.)
- **Mata uang virtual di dashboard AdGem:** atur nama mata uang = "Koin" + nilai tukarnya di
  dashboard AdGem (berapa koin per 1 USD payout) — angka ini yang menentukan `amount` di
  postback. Tentukan sebelum live: contoh kasar — kalau 1 offer membayar $1,50 dan Rans mau
  pemain dapat 15.000 koin, maka 1 USD = 10.000 koin di pengaturan AdGem. (Angka final
  diputuskan Rans; patokan ekonomi game: 1.000 koin = Rp15.)

### 3.5 Pembayaran AdGem ke Rans — BELUM TERVERIFIKASI
- **Tidak ditemukan** ketentuan payout publisher resmi AdGem yang bisa dikutip (metode,
  minimum, jadwal). Perbandingan pihak ketiga (Perkox, 2026) menyebut payment terms AdGem
  "not publicly confirmed, likely Net-30+". Direktori Post Affiliate Pro menyebut program
  *afiliasi* AdGem (bukan publisher): minimum $100, bulanan, PayPal — **jangan jadikan patokan
  untuk payout publisher**.
- Yang pasti dari Terms AdGem (https://adgem.com/terms-and-conditions/, update 6 Okt 2026):
  publisher wajib memberi info akun/bisnis/pajak/pembayaran yang akurat.
- **Tindakan:** tanyakan metode + minimum + jadwal payout ke Publisher Support Advocate saat
  pendaftaran; catat jawabannya di sini sebelum go-live.

---

## 4. Rute B — AdSense H5 Games Ads (iklan web di dalam game)

### 4.1 Kenapa rute ini
- Program resmi Google untuk game HTML5: interstitial + rewarded, format display + video
  (TrueView/Bumper). Bekerja di browser DAN di dalam TWA — Google sendiri mencantumkan
  "Chrome Custom Tabs and Trusted Web Activities" sebagai viewing frame yang didukung untuk
  iklan web (AdSense/Ad Manager).
  Sumber: https://support.google.com/adsense/answer/9955214 (cara pasang kode) dan
  https://developers.google.cn/ad-placement/docs/example (contoh Ad Placement API).
- Tidak butuh rebuild APK — cukup tambah tag di `public/index.html`.

### 4.2 Syarat (bertahap, antre)
1. **Akun AdSense disetujui.** Akun Rans (pub-3929807789448089) saat ini masih "Sedang
   disiapkan" (per 2026-11-24) untuk situs blogspot. H5 Games Ads butuh akun AdSense yang
   sudah disetujui.
2. **Daftar ke program H5 Games Ads** (by-application — isi formulir, persetujuan tidak
   dijamin, tergantung kelayakan partner).
3. **Situs game disetujui di AdSense.** Situs yang host game
   (`lari-koin-hosting-production.up.railway.app`) harus ditambahkan ke daftar Sites AdSense
   dan berstatus "Ready". **Risiko (belum terverifikasi):** subdomain Railway
   (`*.up.railway.app`) mungkin sulit/tidak bisa disetujui sebagai situs AdSense — kalau
   ditolak, opsi adalah domain sendiri (mis. `runnercoin.id`) yang diarahkan ke Railway.
4. Kode `ads.txt` harus ada (saat ini AdSense blogspot mencatat "Tidak ditemukan").

### 4.3 Integrasi (kode — dikerjakan nanti)
- Tambah di `<head>` `public/index.html` (dari dokumen resmi Google):
  ```html
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3929807789448089" crossorigin="anonymous"></script>
  <script>window.adsbygoogle = window.adsbygoogle || []; var adBreak = adConfig = function(o) {adsbygoogle.push(o);}</script>
  ```
  (Ganti `ca-pub-…` dengan publisher ID Rans. Tanpa shim `adBreak/adConfig`, iklan tidak jalan.)
- Ganti isi `tampilIklanSelingan()` (app.js:1260) — panggil `adBreak()` dengan placement yang
  sesuai, dan manfaatkan callback bawaannya untuk jeda/lanjut game:
  - Antar level / selesai level → `adBreak({type:'next', name:'level-selesai', beforeAd: jedaGame, afterAd: lanjutGame, adBreakDone: cb})`
  - Skill / nyawa (opt-in) → `adBreak({type:'reward', …})` — lihat §5 soal hadiah.
  - `adConfig({sound:'on'/'off', preloadAdBreaks:'on'})` — panggil saat game dimuat + saat
    pemain mute/unmute (header 🔊).
  - Mode tes: tambah `data-adbreak-test="on"` di tag AdSense saat pengembangan.
- **Peta placement → kode:** `beforeAd` = jeda game (sudah ada `jedaGame()`), `afterAd` =
  lanjut (`lanjutGame()`), `adBreakDone` = lanjutkan alur (tutup modal / beri hadiah).
  Modal simulasi `#modalIklan` diganti pemanggilan API ini; jangan tampilkan modal simulasi
  dan iklan beneran bersamaan.
- Untuk game di dalam aplikasi mobile, Google menyediakan parameter
  `data-admob-interstitial-slot` / `data-admob-rewarded-slot` + registrasi WebView ke
  Mobile Ads SDK — **itu jalur WebView (lihat §6), bukan TWA**.
- **Kebijakan penempatan (dari panduan resmi H5):** iklan full-screen HANYA di jeda alami
  (antar level, pause, browse) — dilarang setelah tiap interaksi, saat gameplay berjalan,
  langsung setelah iklan full-screen lain, atau yang bisa dikira bagian dari startup.

### 4.4 Batasan
- Butuh traffic + persetujuan — bukan uang instan. eCPM interstitial Indonesia rendah
  (~$0,53/1.000 tayang, sudah disampaikan ke Rans).
- Hadiah rewarded tunduk §5 (tidak boleh koin yang bisa dicairkan).

---

## 5. ⚠️ Kebijakan hadiah (berlaku untuk AdMob + AdSense H5) — WAJIB DIBACA

Sumber resmi: https://support.google.com/admob/answer/7313578
("Policies for ad units that offer rewards") dan panduan H5 Games Ads.

- **"Direct monetary items may not be offered as rewards under any circumstance."**
  Yang termasuk: uang tunai, cryptocurrency, gift card.
- Item indirect/non-moneter BOLEH, **asal**: hanya bisa dipakai di dalam platform/website/app
  publisher, **non-transferable** (tidak bisa dipindah ke orang lain / tidak bisa dikonversi
  jadi uang tunai), dan diskon/voucher fisik maks 25% dari nilai barang.
- Panduan H5: hadiah "must not have value outside your game, must not have or be easily
  exchanged for monetary value, must not be saleable or exchangeable for goods and services".

**Dampak ke Runner Coin (fakta desain game):**
- Koin bisa ditukar jadi Rp via penarikan DANA/GoPay/OVO/ShopeePay → koin = hadiah moneter.
- Maka **iklan rewarded Google (AdMob rewarded / H5 `type:'reward'`) TIDAK BOLEH memberi koin.**
- Yang aman:
  - Interstitial (antar level, tanpa hadiah) → boleh, pakai AdMob interstitial / H5 `type:'next'`.
  - Rewarded Google → hadiahnya HANYA item non-uang: +1 nyawa, skin, power-up sekali pakai
    (bukan koin). Atau: jangan pakai rewarded Google sama sekali.
  - Koin dari "nonton iklan" (`#btnNontonIklan`, `POST /api/claim-ad-reward` +1.000 koin)
    hanya boleh dipertahankan kalau sumber iklannya BUKAN Google rewarded — mis. AdGem
    offerwall (model offerwall memang memberi mata uang virtual publisher; pencairan Rp adalah
    ekonomi publisher, bukan hadiah Google). **Keputusan final soal ini ada di Rans — tapi
    jangan klaim ke pemain bahwa koin dari iklan Google itu aman.**
- Pelanggaran kebijakan = risiko akun AdMob/AdSense dibatasi/ditutup. Jangan coba-coba.

---

## 6. Rute C — AdMob native (SDK Android) — PALING LAMA, OPSIONAL

> **STATUS 2026-11-26: DIBANGUN (lokal), BELUM DIPUBLISH.** Wrapper WebView
> + AdMob SDK v1.4.0 sudah selesai dibangun + dites lokal (83/83 cek,
> `tests/test-wrapper.mjs`; total suite 12/12 lolos, 647 cek + LOAD OK).
> Yang BELUM: (1) build APK di GitHub Actions (`.github/workflows/build-wrapper.yml`),
> (2) verifikasi APK (package, versionCode 5, v1.4.0, sertifikat v2),
> (3) publish + tes di HP Rans — TERUTAMA login Google di dalam WebView
> (kemungkinan diblokir Google, `disallowed_useragent` — lihat
> `wrapper/WRAPPER-README.md` § "Celah yang tersisa"). Jangan janjikan iklan
> beneran sampai APK ini terpasang + review AdMob selesai (app masih
> "Sedang disiapkan"). Detail lengkap: `wrapper/WRAPPER-README.md`.
> Yang SUDAH jalan: proyek native di `wrapper/` (Kotlin, package
> `id.ranszshop.larikoin`, minSdk 24, versionCode 5 / 1.4.0, ikon rubah),
> bridge `window.AdMobBridge` (`showInterstitial()`, `showRewarded('life')`,
> `isInterstitialReady/RewardedReady()`), `GET /api/ads/config` (unit ID dari
> server, bukan hardcode), `POST /api/ads/rewarded-verify` (whitelist HANYA
> `'life'` — koin TIDAK PERNAH — nonce anti-replay, batas 10/hari, nyawa
> penuh → 400), wiring `public/app.js` (`tampilIklanSelingan` →
> `tampilIklanAdMob` kalau bridge ada, fallback simulasi kalau gagal;
> `mintaNyawaRewarded()` untuk +1 nyawa; tombol koin TIDAK memakai rewarded
> AdMob), sw.js v22. **Verifikasi rewarded masih client-asserted, BUKAN
> SSV Google — SSV belum dibangun** (lihat README wrapper).

### 6.1 Fakta teknis (sudah diverifikasi)
- **TWA murni (Bubblewrap) TIDAK BISA menjalankan AdMob SDK.** TWA dirender oleh browser
  Chrome di HP pemain, bukan oleh proses aplikasi — tidak ada WebView milik aplikasi, tidak
  ada JS bridge ke kode native. Bubblewrap tidak punya fitur AdMob.
  Sumber arsitektur: https://developer.chrome.com/docs/android/trusted-web-activity/lay-of-the-land
  (TWA = Custom Tabs tanpa UI browser, konten dirender browser).
- Yang DIDUKUNG Google untuk iklan in-app: **WebView API for Ads** — WebView milik aplikasi
  didaftarkan ke Google Mobile Ads SDK, lalu iklan AdMob (interstitial/rewarded/banner) bisa
  tampil "di samping" WebView. Dan untuk iklan web biasa (AdSense), TWA memang sudah
  didukung sebagai viewing frame.
  Sumber: https://support.google.com/admanager/answer/6310245
  ("Technical requirements for web content viewing frames for apps").

### 6.2 Rute praktis kalau Rans tetap mau AdMob native
✅ **Langkah 1–3 SUDAH DIBANGUN 2026-11-26 (lihat status di atas):**
proyek Android baru di `wrapper/` (Kotlin native — BUKAN berbasis
`android-browser-helper`, bukan framework converter berbayar); dependensi
Google Mobile Ads SDK `play-services-ads:23.6.0`; `APPLICATION_ID`
`ca-app-pub-3929807789448089~9100558334` di `AndroidManifest`; unit
**interstitial** (`.../1088180253`) + **rewarded** (`.../9615563652`) —
diambil runtime dari `GET /api/ads/config`, BUKAN hardcode (fallback ke ID
yang sama hanya kalau fetch config gagal); JS bridge `window.AdMobBridge`
(nama final — bukan `window.NativeAds` seperti draf awal) dipanggil dari
`tampilIklanSelingan()` kalau bridge ada, fallback simulasi kalau tidak ada.
**YANG MASIH BERJALAN:** rebuild APK via GitHub Actions (workflow
`build-wrapper.yml`) dengan keystore v2 yang sama + `versionCode` 5.
Package ID tetap `id.ranszshop.larikoin`.
4. **Risiko Play Store:** aplikasi yang isinya hanya WebView membungkus website berisiko
   ditolak di review "Minimum Functionality" Google Play — wrapper harus punya fungsi native
   yang nyata (AdMob + bridge itu sendiri membantu, tapi bukan jaminan lolos).
5. **Kebijakan hadiah §5 tetap berlaku** untuk rewarded AdMob (tidak boleh koin).

### 6.3 Estimasi (jujur)
- Pekerjaan build-nya SUDAH selesai (26 Nov 2026, lokal + tes 83/83).
  Yang tersisa: build CI (±30 menit kalau workflow jalan mulus) + verifikasi
  APK + tes di HP (login Google di WebView adalah risiko terbesar — kalau
  diblokir, butuh jembatan login Custom Tabs, pekerjaan tambahan) + review
  AdMob (di luar kendali kita).
- Rute A (AdGem) sudah DIGANTI Tapjoy (lihat §10) — AdGem dilewati total
  (Rans 26 Nov 2026). Jadi urutan "AdMob native setelah rute A menghasilkan"
  tidak lagi berlaku persis: Tapjoy sudah live, AdMob native menyusul
  sebagai jalur kedua.

---

## 7. Urutan kerja yang disarankan

1. **Rans kirim:** jenis unit AdMob pertama + daftar AdGem (App ID + Postback Key). (§2)
2. **Rute A — AdGem (1–2 hari kerja setelah App ID ada):**
   - Server: tulis ulang `POST /api/offer-postback` → verifikasi HMAC-SHA256 v3 + IP
     whitelist + dedup `conversion_id`; matikan `demo-verify`; atur mata uang "Koin".
   - Client: tombol "🎁 Buka Offerwall" (Direct Link) di halaman Tugas; sisipkan
     `player_id=player-<id>`.
   - Uji end-to-end dengan postback test AdGem (jangan kredit koin dari test).
   - Live: nonaktifkan misi demo; pantau di admin dashboard (statistik offerwall sudah ada).
3. **Rute B — AdSense H5 (paralel, antre persetujuan):**
   - Kejar persetujuan AdSense dulu (akun masih review); daftarkan situs game; daftar
     program H5. Setelah "Ready", pasang tag + `adBreak()` untuk interstitial antar level.
   - Rewarded H5 HANYA untuk nyawa/skin (bukan koin) — lihat §5.
4. **Rute C — AdMob native (tahap 2, setelah A menghasilkan):**
   - Putuskan wrapper WebView; build APK baru; bridge `window.NativeAds`.
5. **Yang tetap simulasi sampai tiap langkah di atas live:**
   - Banner `#bannerIklan` + `#btnNontonIklan` +1.000 koin, skill ads, iklan antar level,
     +1 nyawa — semuanya simulasi sampai diganti pemanggilan beneran satu per satu.
   - Jangan pernah menampilkan label "Iklan (simulasi)" berdampingan dengan iklan beneran —
     ganti labelnya saat rute live ("Iklan" saja), supaya pemain tidak bingung.

---

## 8. Yang TIDAK terverifikasi (jangan dijadikan janji)

- **Payout AdGem** (metode, minimum, jadwal, Net-30 atau bukan) — tidak ada di dokumen
  publik; tanyakan ke support advocate saat pendaftaran. (§3.5)
- **Apakah situs Railway (`*.up.railway.app`) bisa disetujui AdSense** — belum diuji; kalau
  ditolak, butuh domain sendiri. (§4.2.3)
- **Persetujuan program H5 Games Ads** — by-application, tidak dijamin.
- **Jenis unit AdMob pertama** (`…/9615563652`) — masih menunggu jawaban Rans. (§2.1)
- **eCPM beneran** untuk game ini — angka $0,82/$0,53 adalah patokan pasar Indonesia, bukan
  jaminan; pendapatan beneran baru ketahuan setelah tayang.

## 9. Sumber (dibaca saat riset, 2026-11-26)

- AdGem Web Offerwall: https://docs.adgem.com/docs/integrate/offer-delivery/pre-built/web-offerwall
- AdGem Server-to-Server Postbacks v3: https://docs.adgem.com/publisher-support/ios-postback-setup/
- AdGem Server-to-Server Postbacks v2: https://docs.adgem.com/docs/integrate/reward-mechanism/postbacks-v2
- AdGem Terms & Conditions (6 Okt 2026): https://adgem.com/terms-and-conditions/
- Google AdMob — Policies for ad units that offer rewards: https://support.google.com/admob/answer/7313578
- Google AdSense — Add the AdSense code to your game page (H5): https://support.google.com/adsense/answer/9955214
- Google Ad Placement API — Example implementation: https://developers.google.cn/ad-placement/docs/example
- Google Ad Manager — Technical requirements for web content viewing frames: https://support.google.com/admanager/answer/6310245
- Chrome for Developers — Trusted Web Activities (arsitektur TWA): https://developer.chrome.com/docs/android/trusted-web-activity/lay-of-the-land
- Perkox vs AdGem (payment terms tidak terkonfirmasi publik): https://perkox.com/blog/perkox-vs-adgem-2026-comparison-v2
- Ringkasan H5 Games Ads (akses, adBreak, aturan reward): https://portalready.world/sdk/google-ad-placement-api-adbreak/

## 10. Tapjoy Offerwall — STATUS IMPLEMENTASI (2026-11-26, v15 — BELUM DEPLOY)

**Riset (sumber resmi Unity):** Tapjoy PUNYA Web Offerwall tanpa native SDK —
dua cara: **Deep Linking** (`https://rewards.unity.com/owp/web/link/<SDK_KEY>/u/<USER_ID>`)
dan **Custom JS** (snippet `https://rewards.unity.com/owp/web/sdk/latest`).
Dipakai: **Deep Linking** (paling simpel, buka di tab baru — cocok untuk game
web di dalam TWA). Sumber: docs.unity.com/en-us/grow/offerwall/web/integration/quickstart
dan .../web/displaying-offerwall/deep-linking-implementation.

**Yang sudah dibangun (lokal, belum deploy):**
- Client: kartu "🎁 Offerwall Tapjoy" + tombol `#btnTapjoy` di tab Tugas
  (`public/index.html` + `public/app.js` `bukaTapjoyOfferwall()`), deep link
  dengan `USER_ID` = id numerik pemain; saldo di-refresh otomatis saat pemain
  kembali ke tab game (Tapjoy tidak memberi notifikasi client-side untuk
  self-managed currency). `sw.js` CACHE → `lari-koin-v15`.
- Server: `GET /api/tapjoy/config` (aktif + SDK key) dan
  `GET /api/tapjoy/callback` — verifikasi **MD5**
  `MD5(id:snuid:currency:secret_key)` (timing-safe), dedup atomik via
  `tapjoy_rewards.id` (PRIMARY KEY), batas sanity 100.000.000 koin/callback
  (=$200), respons HANYA 200/403 (sesuai retry Tapjoy: tiap 5 menit s/d 4 hari).
  Tabel `tapjoy_rewards` ditambahkan ke `db.js` (SQLite) + `supabase-schema.sql`
  (Postgres). Statistik Tapjoy masuk `GET /api/admin/dashboard`.
- `POST /api/offers/demo-verify` **DIMATIKAN** (410 Gone); tombol demo-verify
  dihapus dari client; pesan error `/api/offers/claim` diperbarui.
- Tes: `tests/test-tapjoy.mjs` **42/42 lolos** (statis + live: callback valid
  → 200 + kredit, replay → 403 tanpa double-credit, verifier salah / snuid
  tak dikenal / leading-zero / currency invalid / tanpa verifier → 403,
  demo-verify → 410, fail-closed tanpa secret → 403). Suite lama tetap lolos:
  fullscreen-3d 36/36, perbaikan-9 63/63, retarget 20/20, appjs-load OK.

**KOREKSI PENTING vs rencana awal:** callback default Tapjoy BUKAN HMAC —
varian default yang didokumentasikan adalah **GET + verifier MD5** di atas.
Varian POST + HMAC-SHA256 (`X-Tapjoy-Signature`) HANYA tersedia lewat
Tapjoy Support (harus diminta diaktifkan ke account manager) — belum
diimplementasikan; endpoint ini memakai varian default.

**Env var yang dibutuhkan (di Railway, JANGAN di repo):**
- `TAPJOY_SDK_KEY` — Application SDK Key Tapjoy (untuk deep link).
- `TAPJOY_SECRET_KEY` — Virtual currency secret key (verifikasi callback).
- Tanpa `TAPJOY_SECRET_KEY`, callback menolak semua (403, fail-closed);
  tanpa `TAPJOY_SDK_KEY`, tombol offerwall menampilkan "belum aktif".

**Callback URL untuk dashboard Tapjoy** (Virtual Currency "Koin" → ganti
`NO_CALLBACK` dengan ini):
`https://lari-koin-hosting-production.up.railway.app/api/tapjoy/callback`

**Blocker sebelum offerwall benar-benar membayar (di luar kode):**
1. Isi `TAPJOY_SDK_KEY` + `TAPJOY_SECRET_KEY` di env Railway.
2. Isi callback URL di atas di dashboard Tapjoy (currency "Koin").
3. Buat **content card** (setup guide step 3) + placement `#WebOfferwall` di
   dashboard Tapjoy — tanpa content card, deep link tanpa `event_name`
   tidak punya konten untuk ditampilkan (wall bisa kosong).
4. Akun Tapjoy masih "in review" + banner minta store URL (tetap kosong
   karena APK belum di Play Store, sesuai keputusan Rans).
5. Deploy: upload GitHub + deploy manual Railway (Railway tidak auto-deploy).
6. Ekonomi TIDAK diubah: $1 = 500.000 Koin (dashboard) = patokan
   1.000 Koin = Rp15 + bagi 50/50.
