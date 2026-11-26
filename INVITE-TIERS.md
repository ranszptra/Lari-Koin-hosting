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

## v25 — Toko karakter Xbot dihapus (2026-11-26, perintah Rans "hps aja yg itu")

Lanjutan penghapusan toko skin di v24: toko karakter lama (Xbot + Xbot Hijau/kiko
50.000 koin + Xbot Pink/momo 100.000 + Xbot Api/rex 200.000) juga dihapus karena
tidak kepakai — sejak pivot hewan v21 karakter lari adalah hewan level
(char-01..12); `karakterAktif()` hanya mengenal LEVEL_CHARACTERS, jadi pemain
yang membeli Xbot buang-buang koin (game fallback ke foto rubah).

- Client: entri `KATALOG.character` + pemanggilan `renderTokoBagian('character')`
  + wadah `#tokoKarakter` dihapus; nama karakter lama hanya tersisa sebagai
  label fallback di `namaKarakterSkinAktif()` (pemain lama yang masih memakai
  karakter toko tetap tampil namanya, tapi larinya tetap hewan).
- Server: `CHARACTERS` di `db.js` dikosongkan; `POST /api/buy` dan
  `POST /api/equip` menolak `kind: 'character'` dengan pesan jelas
  ("Toko karakter sudah dihapus — karakter sekarang hewan yang terbuka tiap
  naik 5 level").
- TIDAK disentuh: grid karakter level 12 hewan (`#tokoKarakterLevel`,
  `/api/character/select`), skin level gratis + klaim set lengkap Rp100.000,
  tangga invite v24, Tapjoy, AdMob.
- Tes: `tests/test-hapus-toko-karakter.mjs`; cache service worker naik ke v25.

## v26 — Skin Level dihapus (2026-11-26, perintah Rans "toko xbot, skin level — hps")

Pembalikan keputusan 10:53: Rans semula membatalkan penghapusan Skin Level
("jangan", "yg 12 sekin tetep"), lalu ~10:55 memutuskan hapus keduanya —
"toko xbot, skin level", "skin karakter juga xbot, udah ga guna". Skin Level
(Es/Sakura/Laut/Hutan/Senja/Salju/Lava/Galaksi/Madu/Mint/Komet/Legenda) memang
skin Xbot juga, dan sejak pivot hewan v21 tidak nempel ke hewan.

- Client: `LEVEL_SKINS` + `renderSkinLevel()` + wadah `#tokoSkin` + judul
  "Skin Level — Gratis tiap naik 5 level" + panel tukar set lengkap dihapus;
  label Beranda "Skin aktif" jadi "Karakter aktif" (`namaKarakterAktif()`,
  tanpa suffix skin); pesan "Skin baru terbuka" di layar finish dihapus.
- Server: `LEVEL_SKINS` di `db.js` dikosongkan; `grantLevelSkins()` dihapus
  (tidak lagi dipanggil dari `/api/profile` maupun `/api/finish-level`,
  dan respons finish-level tidak lagi berisi `skinsBaru`); `POST /api/buy`
  dan `POST /api/equip` menolak `kind: 'skin'` dengan pesan jelas
  ("Skin Level sudah dihapus — karakter sekarang hewan yang terbuka tiap
  naik 5 level"); `POST /api/skins/fullset-claim` dipertahankan sebagai route
  yang hanya menolak ("Skin Level sudah dihapus — hadiah tukar set lengkap
  tidak tersedia lagi"). Hadiah tukar 12 skin jadi Rp100.000 ikut hilang.
- TIDAK disentuh: grid karakter level 12 hewan (`#tokoKarakterLevel`,
  `/api/character/select`), tangga invite v24, Tapjoy, AdMob.
- Tes: `tests/test-hapus-skin-level.mjs`; cache service worker naik ke v26.

## v27 — Musik latar DJ (2026-11-26 ~11:01, perintah Rans "gas")
- Musik game diganti dari melodi prosedural sederhana menjadi sequencer gaya
  DJ remix Indo/TikTok (`public/app.js`, fungsi `dj*`): 130 BPM, kick
  four-on-the-floor (jedag-jedug), bass offbeat, hi-hat, clap di ketukan
  2 & 4, lead synth orisinal + riser; struktur 8 bar berulang
  (intro 2 -> build 2 -> drop 4); scheduler lookahead 0,5 dtk / interval
  100 ms (loop mulus). Level >= 10: layer ekstra (hat 16th + lead lebih
  keras).
- 100% sintesis WebAudio — tanpa file MP3, tanpa lagu TikTok asli (bebas
  copyright; lagu orang berisiko klaim di game penghasil iklan).
- Perilaku lama dipertahankan: musik mulai setelah interaksi pengguna,
  tombol Musik/Suara + localStorage `nr_musik`/`nr_suara`, SFX (`beep`)
  terpisah dari musik.
- Tes: `tests/test-musik-dj.mjs` (27 cek); cache service worker naik ke v27.
