-- supabase-schema.sql — Skema Postgres (Supabase) untuk Nailong Runner.
--
-- CARA PAKAI (pilih satu):
--   1. Supabase Dashboard → SQL Editor → tempel seluruh file ini → Run.
--   2. Otomatis: server (db.js) menjalankan file ini sendiri saat start
--      jika env DATABASE_URL diset.
--
-- File ini idempotent: aman dijalankan berulang (CREATE TABLE IF NOT EXISTS
-- + INSERT ... ON CONFLICT DO NOTHING).
--
-- Konversi dari skema SQLite di db.js:
--   INTEGER (id)        -> bigint GENERATED ALWAYS AS IDENTITY
--   INTEGER (koin/uang) -> bigint (koin & total bisa tumbuh besar)
--   INTEGER (counter)   -> integer
--   TEXT                -> text
--   REAL (ecpm)         -> numeric
--   kolom JSON TEXT     -> jsonb (characters, skins, equipped, powerups)
--   lastAdAt (ms epoch) -> bigint
--   createdAt/lastCheckin (ISO string) -> text (dipertahankan agar query
--   substr(createdAt,1,10) dan ORDER BY createdAt tetap sama persis)
--
-- CATATAN: PIN admin awal (246810) TIDAK di-seed di sini — hash scrypt-nya
-- dibuat aplikasi (db.js, fungsi seed()) saat pertama jalan, sama seperti
-- di SQLite. Jangan pernah menulis PIN plaintext ke file ini.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS players (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text UNIQUE NOT NULL,
  pinHash text NOT NULL,
  pinSalt text NOT NULL,
  coins bigint NOT NULL DEFAULT 500,
  maxLevel integer NOT NULL DEFAULT 1,
  characters jsonb NOT NULL DEFAULT '["jolly"]'::jsonb,
  skins jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipped jsonb NOT NULL DEFAULT '{"character":"jolly","skin":null}'::jsonb,
  powerups jsonb NOT NULL DEFAULT '{}'::jsonb,
  streak integer NOT NULL DEFAULT 0,
  lastCheckin text,
  referrer text,
  totalEarned bigint NOT NULL DEFAULT 0,
  totalAds integer NOT NULL DEFAULT 0,
  totalLevels integer NOT NULL DEFAULT 0,
  createdAt text NOT NULL,
  lastActive text NOT NULL,
  ip text,
  lastIp text,
  provider text,
  providerId text,
  banned integer NOT NULL DEFAULT 0,
  bannedReason text,
  fullset_claimed integer NOT NULL DEFAULT 0,
  lives integer NOT NULL DEFAULT 15,
  livesDay text,
  livesCooldownUntil text
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  playerId bigint NOT NULL REFERENCES players(id),
  amountRp bigint NOT NULL,
  method text NOT NULL,
  number text NOT NULL,
  status text NOT NULL DEFAULT 'Menunggu',
  createdAt text NOT NULL
);

CREATE TABLE IF NOT EXISTS offers (
  id text PRIMARY KEY,
  provider text NOT NULL,
  title text NOT NULL,
  "desc" text NOT NULL,
  partnerRp bigint NOT NULL,
  rewardCoins bigint NOT NULL,
  secret text NOT NULL
);

CREATE TABLE IF NOT EXISTS offer_progress (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  playerId bigint NOT NULL REFERENCES players(id),
  offerId text NOT NULL REFERENCES offers(id),
  status text NOT NULL DEFAULT 'dimulai',
  token text NOT NULL,
  createdAt text NOT NULL,
  UNIQUE (playerId, offerId)
);

CREATE TABLE IF NOT EXISTS ad_impressions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  network text NOT NULL,
  format text NOT NULL,
  ecpm numeric NOT NULL,
  createdAt text NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS mission_progress (
  playerId bigint NOT NULL REFERENCES players(id),
  missionId text NOT NULL,
  date text NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  claimed integer NOT NULL DEFAULT 0,
  PRIMARY KEY (playerId, missionId, date)
);

CREATE TABLE IF NOT EXISTS achievement_claims (
  playerId bigint NOT NULL REFERENCES players(id),
  achievementId text NOT NULL,
  PRIMARY KEY (playerId, achievementId)
);

CREATE TABLE IF NOT EXISTS daily_state (
  playerId bigint NOT NULL REFERENCES players(id),
  date text NOT NULL,
  adsToday integer NOT NULL DEFAULT 0,
  lastAdAt bigint,
  wheelLeft integer NOT NULL DEFAULT 1,
  chestLeft integer NOT NULL DEFAULT 1,
  runCoinsToday integer NOT NULL DEFAULT 0,
  PRIMARY KEY (playerId, date)
);

CREATE TABLE IF NOT EXISTS referrals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  referrerId bigint NOT NULL REFERENCES players(id),
  friendId bigint NOT NULL REFERENCES players(id),
  status text NOT NULL DEFAULT 'pending',
  createdAt text NOT NULL,
  UNIQUE (referrerId, friendId)
);

CREATE TABLE IF NOT EXISTS gift_redemptions (
  playerId bigint NOT NULL REFERENCES players(id),
  code text NOT NULL,
  PRIMARY KEY (playerId, code)
);

-- ---------------------------------------------------------------------------
-- Seed: 14 misi offerwall (7 penyedia x 2).
-- rewardCoins = 50% dari partnerRp (pemain terima tepat 50%):
--   rewardCoins = ROUND(partnerRp * 0.5 * 1000 / 15)  [1.000 koin = Rp15]
-- secret dibuat acak per instalasi (gen_random_bytes).
-- ---------------------------------------------------------------------------
INSERT INTO offers (id, provider, title, "desc", partnerRp, rewardCoins, secret) VALUES
  ('offer_01', 'AdGem', 'Instal Aplikasi DanaKita', 'Instal dan daftar akun di aplikasi DanaKita.', 15000, 500000, encode(gen_random_bytes(16), 'hex')),
  ('offer_02', 'AdGem', 'Main Game Puzzle ke Level 10', 'Main game puzzle sampai mencapai level 10.', 25000, 833333, encode(gen_random_bytes(16), 'hex')),
  ('offer_03', 'Tapjoy', 'Instal Aplikasi Belanja Hemat', 'Instal aplikasi Belanja Hemat dan buka aplikasinya.', 12000, 400000, encode(gen_random_bytes(16), 'hex')),
  ('offer_04', 'Tapjoy', 'Capai Level 5 di Game Petualangan', 'Main game petualangan sampai level 5.', 30000, 1000000, encode(gen_random_bytes(16), 'hex')),
  ('offer_05', 'AdscendMedia', 'Isi Survei 5 Menit', 'Selesaikan satu survei singkat (sekitar 5 menit).', 5000, 166667, encode(gen_random_bytes(16), 'hex')),
  ('offer_06', 'AdscendMedia', 'Daftar & Verifikasi Akun', 'Daftar layanan dan verifikasi email kamu.', 20000, 666667, encode(gen_random_bytes(16), 'hex')),
  ('offer_07', 'ayeT-Studios', 'Tonton Video & Instal Aplikasi', 'Tonton video lalu instal aplikasi yang ditawarkan.', 8000, 266667, encode(gen_random_bytes(16), 'hex')),
  ('offer_08', 'ayeT-Studios', 'Main Game Balap 3 Hari', 'Main game balap selama 3 hari berturut-turut.', 40000, 1333333, encode(gen_random_bytes(16), 'hex')),
  ('offer_09', 'RevU', 'Daftar Layanan Streaming (Trial)', 'Daftar trial gratis layanan streaming.', 35000, 1166667, encode(gen_random_bytes(16), 'hex')),
  ('offer_10', 'RevU', 'Instal Aplikasi Keuangan', 'Instal aplikasi keuangan dan buat akun.', 18000, 600000, encode(gen_random_bytes(16), 'hex')),
  ('offer_11', 'Torox', 'Instal Game Strategi', 'Instal game strategi dan selesaikan tutorial.', 10000, 333333, encode(gen_random_bytes(16), 'hex')),
  ('offer_12', 'Torox', 'Capai Level 15', 'Main sampai mencapai level 15 di game pilihan.', 50000, 1666667, encode(gen_random_bytes(16), 'hex')),
  ('offer_13', 'adjoe', 'Main Game RPG 30 Menit', 'Main game RPG selama 30 menit.', 3000, 100000, encode(gen_random_bytes(16), 'hex')),
  ('offer_14', 'adjoe', 'Instal & Main Game Arcade', 'Instal game arcade dan mainkan 3 ronde.', 7000, 233333, encode(gen_random_bytes(16), 'hex'))
ON CONFLICT (id) DO NOTHING;

-- Migrasi: kolom IP + login sosial (idempotent, aman diulang tiap boot)
ALTER TABLE players ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS lastIp text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS providerId text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS banned integer NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS bannedReason text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS fullset_claimed integer NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS lives integer NOT NULL DEFAULT 15;
ALTER TABLE players ADD COLUMN IF NOT EXISTS livesDay text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS livesCooldownUntil text;
ALTER TABLE daily_state ADD COLUMN IF NOT EXISTS runCoinsToday integer NOT NULL DEFAULT 0;
