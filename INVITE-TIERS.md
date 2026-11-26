# Hadiah Undang Teman Bertingkat (v24)

Diputuskan Rans 2026-11-26. **Menggantikan** toko skin + bonus lama Rp5.000/teman.

## Kenapa diganti

Toko skin (Emas / Ninja / Astronot / Pelangi / Shadow) dihapus dari game: skin
tidak nempel ke hewan (fungsi `applySkin` di `run3d.js` sengaja no-op supaya
hewan tetap sama seperti fotonya), jadi fitur itu tidak kepakai. Sebagai
gantinya, bonus undang teman jadi sistem milestone bertingkat.

## Tangga hadiah (bonus sekali-klaim per tingkat)

| Teman terkualifikasi | Hadiah Rp | Hadiah koin |
|---|---:|---:|
| 3 teman | Rp5.000 | 333.333 |
| 5 teman | Rp10.000 | 666.667 |
| 10 teman | Rp30.000 | 2.000.000 |
| 20 teman | Rp50.000 | 3.333.333 |
| 50 teman | Rp150.000 | 10.000.000 |
| 100 teman | Rp250.000 | 16.666.667 |

Ekonomi: 1.000 koin = Rp15. Koin dihitung server via `rpToCoins` (`db.js`).

## Syarat teman terkualifikasi

Teman yang diundang dihitung kalau sudah **nonton >= 10 iklan DAN mencapai
level 5** (`referralReady` di `db.js`: `totalAds >= 10 && maxLevel >= 5`).
Syarat lama (>= 1 iklan + maxLevel >= 4) tidak berlaku lagi.

**Keputusan disengaja:** teman yang sudah pernah diklaim di sistem lama
(status `claimed` di tabel `referrals`) **tetap dihitung** ke jumlah
terkualifikasi, walau klaim lamanya memakai syarat lama.

## Endpoint

- `POST /api/referral/tier-claim { tier }` (auth) — klaim hadiah satu tingkat.
  Tolak kalau: tingkat tidak dikenal, jumlah teman terkualifikasi belum mencapai
  ambang, atau tingkat itu sudah pernah diklaim. Dedup atomik via
  `INSERT OR IGNORE INTO invite_tier_claims` (PRIMARY KEY `playerId, tier`);
  `changes = 0` berarti sudah diklaim. Kredit koin via `touchCoins`.
- `POST /api/referral/claim` (lama, per teman) — **DINONAKTIFKAN**. Rute
  dipertahankan dan mengembalikan pesan jelas bahwa bonus per teman sudah
  diganti sistem tingkat invite (bukan 404 diam-diam).
- `GET /api/profile` — `player.inviteTiers = { qualified, claimed, tiers }`
  untuk render progres di client.

## Client

- Tab **Undang Teman**: tangga 6 tingkat (`#tanggaInvite`, `renderInviteTiers`
  di `public/app.js`) — progres teman terkualifikasi, tombol Klaim per tingkat,
  status Diklaim/Siap/Butuh N teman lagi. Daftar teman (`renderTeman`) tidak
  lagi punya tombol klaim per teman; statusnya "Terkualifikasi" / "Menunggu
  syarat (10 iklan + level 5)".
- **Toko skin dihapus**: `#tokoSkin` di `index.html` kini hanya diisi skin level
  gratis (`renderSkinLevel`); array `KATALOG.skin` dihapus dari `app.js`;
  `POST /api/buy` kind `skin` dan `POST /api/equip` skin toko ditolak dengan
  pesan jelas.

## Yang TIDAK dihapus (fitur terpisah)

- Skin level gratis 12 (`LEVEL_SKINS`, terbuka tiap naik 5 level) + klaim set
  lengkap Rp100.000 (`POST /api/skins/fullset-claim`).
- Tapjoy, AdMob, sistem nyawa/koin lari, anti-cheat lain.

## Tes

`tests/test-invite-tiers.mjs` — kualifikasi (level 4 tidak kehitung, level 5 +
10 iklan kehitung, teman lama yang sudah diklaim tetap kehitung), ambang tiap
tingkat, klaim ganda ditolak, klaim sebelum ambang ditolak, endpoint lama
menolak dengan pesan jelas, beli/pakai skin toko ditolak, `node --check` +
`test-appjs-load` (app.js tidak TDZ).
