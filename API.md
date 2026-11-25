# API — Lari Koin Online Backend

Base URL lokal: `http://localhost:3000` (produksi: URL Render).
Semua respons JSON. Error selalu: `{ "ok": false, "error": "..." }`.

## Auth

- **Pemain:** token stateless `${id}.${HMAC-SHA256(OWNER_SECRET, id)}`.
  Kirim lewat header `Authorization: Bearer <token>`. Login/register juga
  men-set cookie `token` (httpOnly), tapi auth **tidak** mengandalkan cookie.
- **Admin:** token `admin.<HMAC-SHA256(secret, "admin")>` dari
  `POST /api/admin/login`, dikirim dengan header Bearer yang sama.
- PIN pemain & PIN admin disimpan sebagai hash **scrypt** (salt acak),
  bukan plaintext.

## Ekonomi (dikunci)

- **1.000 koin = Rp15** — `koin = Rp × 1000/15` (dibulatkan), `Rp = koin × 15/1000`.
- Bonus daftar baru: **500 koin**.
- Iklan rewarded: **+1.000 koin**, cooldown **5 menit**, maks **10x/hari**.
- Penarikan: **Rp1.000 / 5.000 / 10.000 / 50.000** ke DANA/GoPay/OVO/ShopeePay.
  Status: `Menunggu → Diproses → Selesai` (diproses pemilik).
- Check-in 7 hari: hadiah Rp `[50, 50, 100, 150, 200, 500, 1000]`;
  kelewat sehari → streak reset ke 1.
- Bonus selesai level: `100 + 15×level` koin; level bos (kelipatan 10) **5×**.
  Tiap koin di arena = **10 koin**.
- Kode hadiah (sekali pakai per akun): `LARIKOIN`=1000, `JOLLYGAS`=2500,
  `RANSGACOR`=5000, `HOKI777`=7777 koin.
- Undang teman: **Rp5.000 = 333.333 koin**, cair kalau teman (daftar dengan
  `referrer` = nama pengundang) sudah nonton **≥1 iklan DAN** menyelesaikan **level 3**.
- Mediasi 13 network (eCPM USD): AdMob 19.44, Unity Ads 13.41,
  AppLovin MAX 11.20, ironSource 9.80, Meta Audience Network 14.50,
  Pangle 12.50, Mintegral 8.30, Liftoff 7.60, InMobi 6.90, Chartboost 5.40,
  Fyber 4.80, Nusantara Ads 3.20, IklanKita 2.90.
  Estimasi pendapatan Rp = `tayangan × eCPM/1000 × 16000`.
- Offerwall: 7 penyedia (AdGem, Tapjoy, AdscendMedia, ayeT-Studios, RevU,
  Torox, adjoe), 14 misi contoh (2 per penyedia), partnerRp Rp3.000–50.000.
  Pemain terima **tepat 50%** nilai misi
  (`koin = partnerRp × 0,5 × 1000/15`).
- Misi harian: 3 per hari, rotasi dari pool 6 misi.
- Prestasi: 8 (level 1/10/30/60, total koin 100.000, streak 7 hari,
  undang 1 teman, klaim 10 iklan), reward 500–10.000 koin.

## Endpoint

### Publik

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/health` | `{ok, service, time}` |
| POST | `/api/register` | `{name, pin, referrer?}` → `{ok, token, player}` |
| POST | `/api/login` | `{name, pin}` → `{ok, token, player}` |
| GET | `/api/leaderboard` | `{ok, rows:[{name, coins, level}]}` (top 20) |
| GET | `/api/ads/networks` | `{ok, networks:[{name, ecpm}]}` |
| POST | `/api/ads/impression` | `{network, format}` format: `banner\|interstitial\|rewarded` → `{ok, ecpm}` |
| POST | `/api/offer-postback` | `{offerId, playerId, token}` — dipanggil server provider, **bukan** pemain |

### Pemain (Bearer)

| Method | Endpoint | Body / Keterangan |
|---|---|---|
| GET | `/api/profile` | Profil lengkap: coins, coinsRp, maxLevel, streak, lastCheckin, characters, skins, equipped, powerups, missions, achievements, wheelLeft, chestLeft, adsToday, referrals, withdrawals |
| POST | `/api/finish-level` | `{level, coins}` → `{ok, coinsEarned, bonus, isBoss, newMaxLevel, coins}`. `coins` = koin persis yang dikumpulkan saat lari. Bentuk lama `{level, coinsCollected}` (jumlah pickup, tiap pickup = 10 koin) tetap didukung. Level harus sudah terbuka (`level ≤ maxLevel`), maks 60 |
| POST | `/api/bank-run-coins` | `{coins}` → `{ok, coins, totalCoins}`. Menyimpan koin dari lari yang **gagal** (kena halangan) tanpa bonus level dan tanpa membuka level baru |
| POST | `/api/claim-ad-reward` | `{}` → `{ok, coins, totalCoins, adsToday}`. Tolak jika cooldown 5 menit / limit 10x/hari |
| POST | `/api/checkin` | `{}` → `{ok, day, streak, rewardRp, coins, totalCoins}` |
| POST | `/api/missions/claim` | `{missionId}` → `{ok, coins, totalCoins}` |
| POST | `/api/achievements/claim` | `{id}` → `{ok, coins, totalCoins}` |
| POST | `/api/redeem` | `{code}` → `{ok, coins, totalCoins}` |
| POST | `/api/referral/claim` | `{friendId}` → `{ok, coins, totalCoins}` |
| POST | `/api/withdraw` | `{amount, method, number}` → `{ok, withdrawal:{id, amount, method, number, status:'Menunggu'}, coins, costCoins}` |
| POST | `/api/spin-wheel` | `{}` → `{ok, prize, totalCoins}`. Hadiah acak 100–2000 koin, 1x gratis/hari |
| POST | `/api/open-chest` | `{}` → `{ok, prize, totalCoins}`. Hadiah acak 100–5000 koin, 1x/hari |
| POST | `/api/buy` | `{kind, id}` kind: `character\|skin\|powerup` → `{ok, item, coins}` (powerup mengembalikan `count`) |
| POST | `/api/equip` | `{kind, id}` → `{ok, equipped}` |
| GET | `/api/offers` | `{ok, offers:[{id, provider, title, desc, partnerRp, rewardCoins, status}]}`. Status: `tersedia / dimulai / menunggu_verifikasi / terverifikasi / selesai` |
| POST | `/api/offers/start` | `{offerId}` → `{ok, token, status}` |
| POST | `/api/offers/claim` | `{offerId}` → `{ok, coins, totalCoins}` (hanya jika `terverifikasi`) |
| POST | `/api/offers/demo-verify` | `{offerId}` → `{ok, demo:true, note}` — **simulasi demo**, memanggil postback internal |

### Toko

- Karakter: `jolly` gratis (default), `kiko` 50000, `momo` 100000, `rex` 200000 koin.
- Skin: `emas` 25000, `ninja` 50000, `astronot` 75000, `pelangi` 100000, `shadow` 150000 koin.
- Power-up (consumable, disimpan sebagai jumlah): `magnet` 2000, `perisai` 2000, `koinx2` 3000 koin.

### Admin (Bearer admin)

| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/api/admin/login` | `{pin}` → `{ok, adminToken}`. PIN awal: `246810` (segera ganti!) |
| GET | `/api/admin/dashboard` | `{ok, totals:{players, newToday, coinsCirculating, coinsCirculatingRp}, withdrawals:{Menunggu, Diproses, Selesai}, players, mediation:[{network, impressions, estRevenueRp}], offerwall:[{provider, started, verified, paid}]}`. Setiap item penarikan menyertakan `playerName` |
| POST | `/api/admin/withdrawal` | `{id, status}` status: `Diproses \| Selesai` |
| POST | `/api/admin/change-pin` | `{oldPin, newPin}` |

## Offerwall — alur verifikasi

1. Pemain: `POST /api/offers/start` → terima `token` rahasia misi itu.
2. Pemain menyelesaikan misi di aplikasi/website provider.
3. Provider mengirim **postback server-ke-server**:
   `POST /api/offer-postback {offerId, playerId, token}`.
   Token salah → **403 ditolak**. Misi belum dimulai → ditolak.
4. Pemain: `POST /api/offers/claim` → koin cair, status `selesai`.

> **Demo:** `POST /api/offers/demo-verify` mensimulasikan langkah 3 dengan
> token yang benar. Kampanye beneran butuh API key + postback asli dari
> pemilik ke tiap provider (AdGem, Tapjoy, AdscendMedia, ayeT-Studios,
> RevU, Torox, adjoe) — demo ini **bukan** pengganti integrasi itu.

## Contoh curl

```bash
BASE=http://localhost:3000

# Register (dengan referrer opsional) + login
curl -s -X POST $BASE/api/register -H 'Content-Type: application/json' \
  -d '{"name":"rans","pin":"1234"}'
curl -s -X POST $BASE/api/login -H 'Content-Type: application/json' \
  -d '{"name":"rans","pin":"1234"}'

TOKEN="<token dari login>"

# Profil
curl -s $BASE/api/profile -H "Authorization: Bearer $TOKEN"

# Selesaikan level 1, kumpulkan 120 koin di arena (12 pickup x 10 koin)
curl -s -X POST $BASE/api/finish-level -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"level":1,"coins":120}'

# Lari gagal (kena halangan): koin tetap disimpan tanpa bonus level
curl -s -X POST $BASE/api/bank-run-coins -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"coins":80}'

# Klaim iklan, check-in, roda, peti
curl -s -X POST $BASE/api/claim-ad-reward -H "Authorization: Bearer $TOKEN" -d '{}'
curl -s -X POST $BASE/api/checkin -H "Authorization: Bearer $TOKEN" -d '{}'
curl -s -X POST $BASE/api/spin-wheel -H "Authorization: Bearer $TOKEN" -d '{}'
curl -s -X POST $BASE/api/open-chest -H "Authorization: Bearer $TOKEN" -d '{}'

# Kode hadiah + penarikan Rp1.000 (butuh 66.667 koin)
curl -s -X POST $BASE/api/redeem -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"code":"LARIKOIN"}'
curl -s -X POST $BASE/api/withdraw -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"amount":1000,"method":"DANA","number":"081234567890"}'

# Offerwall: start -> demo-verify -> claim
curl -s $BASE/api/offers -H "Authorization: Bearer $TOKEN"
curl -s -X POST $BASE/api/offers/start -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"offerId":"offer_01"}'
curl -s -X POST $BASE/api/offers/demo-verify -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"offerId":"offer_01"}'
curl -s -X POST $BASE/api/offers/claim -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"offerId":"offer_01"}'

# Postback token salah -> harus 403
curl -s -X POST $BASE/api/offer-postback -H 'Content-Type: application/json' \
  -d '{"offerId":"offer_01","playerId":1,"token":"salah"}'

# Admin
curl -s -X POST $BASE/api/admin/login -H 'Content-Type: application/json' -d '{"pin":"246810"}'
curl -s $BASE/api/admin/dashboard -H "Authorization: Bearer <adminToken>"
```

## Catatan

- Reset harian (iklan, roda, peti, misi) mengikuti tanggal **WIB (Asia/Jakarta)**.
- `GET /api/offers` tanpa token mengembalikan semua misi berstatus `tersedia`.
- `GET /` menyajikan `public/index.html` (halaman pemain); `GET /admin.html` adalah halaman Panel Pemilik yang terpisah (login PIN, tanpa tautan dari halaman pemain).
