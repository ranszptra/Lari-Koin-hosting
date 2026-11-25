// db.js — Skema + seed + helper bersama untuk Nailong Runner.
//
// DUA BACKEND (dipilih otomatis):
//   - Jika env DATABASE_URL diset (Supabase Postgres) → pakai `pg` (Pool).
//     Data pemain tersimpan di Postgres sehingga selamat dari restart /
//     redeploy Railway. Skema ada di `supabase-schema.sql` (dijalankan
//     otomatis saat init).
//   - Jika tidak diset → pakai `node:sqlite` bawaan Node 24 (DatabaseSync),
//     file env DB_PATH atau ./lari-koin.db. Dipakai untuk dev lokal & tes.
//
// Kedua backend diekspos lewat SATU antarmuka `db` yang sama:
//   db.prepare(sql).get(...params)  -> baris pertama / undefined
//   db.prepare(sql).all(...params)  -> array baris
//   db.prepare(sql).run(...params)  -> { changes, lastInsertRowid }
// Semua metode ini ASYNC (mengembalikan Promise) di kedua backend, supaya
// server.js cukup `await` tanpa peduli backend mana yang aktif.
//
// Perbedaan SQLite vs Postgres yang ditangani di adapter (mode pg):
//   - Placeholder `?`          -> `$1, $2, ...` (berurutan)
//   - `INSERT OR IGNORE`       -> `INSERT ... ON CONFLICT DO NOTHING`
//   - `name=? COLLATE NOCASE`  -> `LOWER(name) = LOWER(?)`
//   - `INSERT INTO players|withdrawals` -> ditambah `RETURNING id` agar
//     `lastInsertRowid` tetap tersedia seperti di SQLite
//   - Postgres melipat nama kolom tak-ber-quote ke huruf kecil
//     (playerId -> playerid) -> kunci baris dipetakan balik ke camelCase
//   - Kolom jsonb dibaca pg sebagai objek JS -> parseJson() menerimanya
//   - pg mengembalikan bigint/numeric sebagai string -> di-parse ke Number
//     (aman: nilai koin di game jauh di bawah batas aman Number)
//   - Kolom `key`/`value` di admin_settings: keduanya kata non-reserved di
//     Postgres, jadi boleh dipakai tanpa quote seperti di SQLite.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const USE_PG = !!process.env.DATABASE_URL;

// --- pg: parse bigint (int8) & numeric sebagai Number ----------------------
let pgPool = null;
if (USE_PG) {
  const pg = require('pg');
  // int8 (oid 20) -> Number; numeric (oid 1700) -> parseFloat
  pg.types.setTypeParser(20, (v) => parseInt(v, 10));
  pg.types.setTypeParser(1700, (v) => parseFloat(v));
  pgPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Supabase (pooler & direct) mewajibkan SSL.
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
  pgPool.on('error', (e) => console.error('[pg] pool error:', e.message));
}

// --- SQLite (fallback lokal) ------------------------------------------------
let sqliteDb = null;
if (!USE_PG) {
  const { DatabaseSync } = require('node:sqlite');
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'lari-koin.db');
  sqliteDb = new DatabaseSync(DB_PATH);
}

// ---------------------------------------------------------------------------
// Konstanta ekonomi (DIKUNCI — jangan diubah tanpa persetujuan pemilik)
// ---------------------------------------------------------------------------
const COINS_PER_RUPIAH = 1000 / 15; // 1.000 koin = Rp15
const rpToCoins = (rp) => Math.round(rp * COINS_PER_RUPIAH);
const coinsToRp = (coins) => Math.round((coins * 15) / 1000);

const AD_REWARD_COINS = 1000;
const AD_COOLDOWN_MS = 5 * 60 * 1000; // 5 menit
const AD_MAX_PER_DAY = 10;

const CHECKIN_RP = [50, 50, 100, 150, 200, 500, 1000]; // hari ke-1..7
const WITHDRAW_AMOUNTS = [1000, 5000, 10000, 50000];
const WITHDRAW_METHODS = ['DANA', 'GoPay', 'OVO', 'ShopeePay'];

const GIFT_CODES = { NAILONG: 1000, NAILONGGAS: 2500, RANSGACOR: 5000, HOKI777: 7777 };

const REFERRAL_REWARD_COINS = rpToCoins(5000); // 333.333 koin

const NETWORKS = [
  { name: 'AdMob', ecpm: 19.44 },
  { name: 'Unity Ads', ecpm: 13.41 },
  { name: 'AppLovin MAX', ecpm: 11.2 },
  { name: 'ironSource', ecpm: 9.8 },
  { name: 'Meta Audience Network', ecpm: 14.5 },
  { name: 'Pangle', ecpm: 12.5 },
  { name: 'Mintegral', ecpm: 8.3 },
  { name: 'Liftoff', ecpm: 7.6 },
  { name: 'InMobi', ecpm: 6.9 },
  { name: 'Chartboost', ecpm: 5.4 },
  { name: 'Fyber', ecpm: 4.8 },
  { name: 'Nusantara Ads', ecpm: 3.2 },
  { name: 'IklanKita', ecpm: 2.9 },
];
const IDR_PER_USD = 16000;
const estRevenueRp = (impressions, ecpm) => Math.round((impressions * ecpm) / 1000 * IDR_PER_USD);

// Katalog toko (harga dalam koin)
const CHARACTERS = { jolly: 0, kiko: 50000, momo: 100000, rex: 200000 };
const SKINS = { emas: 25000, ninja: 50000, astronot: 75000, pelangi: 100000, shadow: 150000 };
const POWERUPS = { magnet: 2000, perisai: 2000, koinx2: 3000 };

// Skin level — GRATIS, terbuka otomatis tiap naik 5 level (Lv 5 s.d. Lv 60 = 12 skin).
const LEVEL_SKINS = [
  { id: 'es', level: 5, nama: 'Es', ikon: '❄️' },
  { id: 'sakura', level: 10, nama: 'Sakura', ikon: '🌸' },
  { id: 'laut', level: 15, nama: 'Laut', ikon: '🌊' },
  { id: 'hutan', level: 20, nama: 'Hutan', ikon: '🌿' },
  { id: 'senja', level: 25, nama: 'Senja', ikon: '🌇' },
  { id: 'salju', level: 30, nama: 'Salju', ikon: '⛄' },
  { id: 'lava', level: 35, nama: 'Lava', ikon: '🌋' },
  { id: 'galaksi', level: 40, nama: 'Galaksi', ikon: '🌌' },
  { id: 'madu', level: 45, nama: 'Madu', ikon: '🍯' },
  { id: 'mint', level: 50, nama: 'Mint', ikon: '🍃' },
  { id: 'komet', level: 55, nama: 'Komet', ikon: '☄️' },
  { id: 'legenda', level: 60, nama: 'Legenda', ikon: '👑' },
];
// Hadiah tukar set lengkap 12 skin level = Rp100.000 → 6.666.667 koin (1.000 koin = Rp15).
const FULLSET_COINS = 6666667;

// Misi harian — pool 6 misi, tiap hari diambil 3 secara rotasi.
const MISSION_POOL = [
  { id: 'm_level3', title: 'Selesaikan 3 level', desc: 'Selesaikan 3 level apa saja hari ini.', target: 3, reward: 1000 },
  { id: 'm_coins500', title: 'Kumpulkan 500 koin', desc: 'Kumpulkan 500 koin dari berlari hari ini.', target: 500, reward: 500 },
  { id: 'm_ads3', title: 'Tonton 3 iklan', desc: 'Tonton 3 iklan rewarded hari ini.', target: 3, reward: 1500 },
  { id: 'm_chest', title: 'Buka peti misteri', desc: 'Buka peti misteri harian.', target: 1, reward: 500 },
  { id: 'm_wheel', title: 'Putar roda hadiah', desc: 'Putar roda hadiah harian.', target: 1, reward: 500 },
  { id: 'm_boss', title: 'Selesaikan 1 level bos', desc: 'Kalahkan 1 level bos (kelipatan 10).', target: 1, reward: 3000 },
];

// Prestasi (~8) — reward koin 500–10.000.
const ACHIEVEMENTS = [
  { id: 'a_level1', title: 'Langkah Pertama', desc: 'Selesaikan level 1.', reward: 500 },
  { id: 'a_level10', title: 'Pelari Pemula', desc: 'Selesaikan 10 level.', reward: 2000 },
  { id: 'a_level30', title: 'Pelari Andal', desc: 'Selesaikan 30 level.', reward: 5000 },
  { id: 'a_level60', title: 'Legenda Nailong Runner', desc: 'Selesaikan 60 level.', reward: 10000 },
  { id: 'a_coins100k', title: 'Sultan Koin', desc: 'Kumpulkan total 100.000 koin.', reward: 5000 },
  { id: 'a_streak7', title: 'Rajin Check-in', desc: 'Check-in 7 hari beruntun.', reward: 3000 },
  { id: 'a_invite1', title: 'Ajak Teman', desc: 'Undang 1 teman (teman mendaftar dengan kodemu).', reward: 2000 },
  { id: 'a_ads10', title: 'Penonton Setia', desc: 'Klaim 10 iklan rewarded.', reward: 1500 },
];

// ---------------------------------------------------------------------------
// Skema SQLite (dipakai saat DATABASE_URL tidak diset)
// ---------------------------------------------------------------------------
const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  pinHash TEXT NOT NULL,
  pinSalt TEXT NOT NULL,
  coins INTEGER NOT NULL DEFAULT 500,
  maxLevel INTEGER NOT NULL DEFAULT 1,
  characters TEXT NOT NULL DEFAULT '["jolly"]',
  skins TEXT NOT NULL DEFAULT '[]',
  equipped TEXT NOT NULL DEFAULT '{"character":"jolly","skin":null}',
  powerups TEXT NOT NULL DEFAULT '{}',
  streak INTEGER NOT NULL DEFAULT 0,
  lastCheckin TEXT,
  referrer TEXT,
  totalEarned INTEGER NOT NULL DEFAULT 0,
  totalAds INTEGER NOT NULL DEFAULT 0,
  totalLevels INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  lastActive TEXT NOT NULL,
  ip TEXT,
  lastIp TEXT,
  provider TEXT,
  providerId TEXT,
  banned INTEGER NOT NULL DEFAULT 0,
  bannedReason TEXT,
  fullset_claimed INTEGER NOT NULL DEFAULT 0,
  lives INTEGER NOT NULL DEFAULT 15,
  livesDay TEXT,
  livesCooldownUntil TEXT
);
CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playerId INTEGER NOT NULL REFERENCES players(id),
  amountRp INTEGER NOT NULL,
  method TEXT NOT NULL,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Menunggu',
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  title TEXT NOT NULL,
  "desc" TEXT NOT NULL,
  partnerRp INTEGER NOT NULL,
  rewardCoins INTEGER NOT NULL,
  secret TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offer_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playerId INTEGER NOT NULL REFERENCES players(id),
  offerId TEXT NOT NULL REFERENCES offers(id),
  status TEXT NOT NULL DEFAULT 'dimulai',
  token TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  UNIQUE(playerId, offerId)
);
CREATE TABLE IF NOT EXISTS ad_impressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  network TEXT NOT NULL,
  format TEXT NOT NULL,
  ecpm REAL NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mission_progress (
  playerId INTEGER NOT NULL REFERENCES players(id),
  missionId TEXT NOT NULL,
  date TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  claimed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (playerId, missionId, date)
);
CREATE TABLE IF NOT EXISTS achievement_claims (
  playerId INTEGER NOT NULL REFERENCES players(id),
  achievementId TEXT NOT NULL,
  PRIMARY KEY (playerId, achievementId)
);
CREATE TABLE IF NOT EXISTS daily_state (
  playerId INTEGER NOT NULL REFERENCES players(id),
  date TEXT NOT NULL,
  adsToday INTEGER NOT NULL DEFAULT 0,
  lastAdAt INTEGER,
  wheelLeft INTEGER NOT NULL DEFAULT 1,
  chestLeft INTEGER NOT NULL DEFAULT 1,
  runCoinsToday INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (playerId, date)
);
CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrerId INTEGER NOT NULL REFERENCES players(id),
  friendId INTEGER NOT NULL REFERENCES players(id),
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TEXT NOT NULL,
  UNIQUE(referrerId, friendId)
);
CREATE TABLE IF NOT EXISTS gift_redemptions (
  playerId INTEGER NOT NULL REFERENCES players(id),
  code TEXT NOT NULL,
  PRIMARY KEY (playerId, code)
);
`;

// ---------------------------------------------------------------------------
// Adapter pg: terjemahan SQL SQLite -> Postgres
// ---------------------------------------------------------------------------
// Postgres melipat identifier tak-ber-quote ke huruf kecil, jadi kunci baris
// hasil query dipetakan balik ke camelCase yang dipakai kode.
const PG_KEY_MAP = {
  playerid: 'playerId', pinhash: 'pinHash', pinsalt: 'pinSalt',
  maxlevel: 'maxLevel', lastcheckin: 'lastCheckin', totalearned: 'totalEarned',
  totalads: 'totalAds', totallevels: 'totalLevels', createdat: 'createdAt',
  lastactive: 'lastActive', amountrp: 'amountRp', offerid: 'offerId',
  partnerrp: 'partnerRp', rewardcoins: 'rewardCoins', missionid: 'missionId',
  achievementid: 'achievementId', adstoday: 'adsToday', lastadat: 'lastAdAt',
  wheelleft: 'wheelLeft', chestleft: 'chestLeft', referrerid: 'referrerId',
  friendid: 'friendId', playername: 'playerName', friendname: 'friendName',
};
function mapRow(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[PG_KEY_MAP[k] || k] = v;
  return out;
}

// Ubah SQL bergaya SQLite menjadi SQL Postgres.
// (Di codebase ini '?' hanya muncul sebagai placeholder — tidak ada '?'
//  di dalam literal string SQL — jadi penggantian berurutan ini aman.)
function toPgSql(sql) {
  let s = sql;
  let ignore = false;
  s = s.replace(/INSERT OR IGNORE INTO/i, () => { ignore = true; return 'INSERT INTO'; });
  s = s.replace(/([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*\?\s+COLLATE NOCASE/gi, 'LOWER($1) = LOWER(?)');
  let i = 0;
  s = s.replace(/\?/g, () => '$' + (++i));
  if (ignore) s += ' ON CONFLICT DO NOTHING';
  return s;
}

function pgPrepare(sql) {
  return {
    get: async (...params) => {
      const { rows } = await pgPool.query(toPgSql(sql), params);
      return mapRow(rows[0]);
    },
    all: async (...params) => {
      const { rows } = await pgPool.query(toPgSql(sql), params);
      return rows.map(mapRow);
    },
    run: async (...params) => {
      let q = toPgSql(sql);
      // Hanya INSERT ke players/withdrawals yang butuh id baru (dipakai
      // server.js sebagai lastInsertRowid); INSERT lain tidak punya kolom id.
      const needsId = /^\s*INSERT\s+INTO\s+(players|withdrawals)\b/i.test(sql);
      if (needsId) q += ' RETURNING id';
      const res = await pgPool.query(q, params);
      return {
        changes: res.rowCount,
        lastInsertRowid: needsId && res.rows[0] ? res.rows[0].id : undefined,
      };
    },
  };
}

function sqlitePrepare(sql) {
  const stmt = sqliteDb.prepare(sql);
  return {
    get: (...params) => Promise.resolve(stmt.get(...params)),
    all: (...params) => Promise.resolve(stmt.all(...params)),
    run: (...params) => Promise.resolve(stmt.run(...params)),
  };
}

// Antarmuka DB tunggal — dipakai server.js persis seperti sebelumnya,
// hanya saja get/all/run kini async (await di call site).
const db = {
  prepare: (sql) => (USE_PG ? pgPrepare(sql) : sqlitePrepare(sql)),
};

// ---------------------------------------------------------------------------
// PIN: hash scrypt (jangan pernah simpan plaintext)
// ---------------------------------------------------------------------------
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPin(pin, salt, hash) {
  const check = crypto.scryptSync(pin, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
}

// ---------------------------------------------------------------------------
// Token auth stateless: `${id}.${HMAC-SHA256(secret, id)}`
// ---------------------------------------------------------------------------
const OWNER_SECRET = process.env.OWNER_SECRET || 'dev-secret-change-me';
if (!process.env.OWNER_SECRET) {
  console.warn('[PERINGATAN] OWNER_SECRET tidak diset — memakai secret default DEV. Set env OWNER_SECRET di Render sebelum produksi!');
}
function makeToken(id) {
  const idStr = String(id);
  const sig = crypto.createHmac('sha256', OWNER_SECRET).update(idStr).digest('hex');
  return `${idStr}.${sig}`;
}
function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', OWNER_SECRET).update(id).digest('hex');
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch { return null; }
  return id;
}

// ---------------------------------------------------------------------------
// Tanggal (zona Asia/Jakarta — reset harian mengikuti WIB)
// ---------------------------------------------------------------------------
const fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
function todayStr(date = new Date()) { return fmtDate.format(date); }
function yesterdayStr() { return todayStr(new Date(Date.now() - 24 * 60 * 60 * 1000)); }
function nowIso() { return new Date().toISOString(); }

// ---------------------------------------------------------------------------
// Seed: PIN admin awal + offerwall (14 misi, 2 per penyedia)
// ---------------------------------------------------------------------------
const OFFER_SEED = [
  ['AdGem', 'Instal Aplikasi DanaKita', 'Instal dan daftar akun di aplikasi DanaKita.', 15000],
  ['AdGem', 'Main Game Puzzle ke Level 10', 'Main game puzzle sampai mencapai level 10.', 25000],
  ['Tapjoy', 'Instal Aplikasi Belanja Hemat', 'Instal aplikasi Belanja Hemat dan buka aplikasinya.', 12000],
  ['Tapjoy', 'Capai Level 5 di Game Petualangan', 'Main game petualangan sampai level 5.', 30000],
  ['AdscendMedia', 'Isi Survei 5 Menit', 'Selesaikan satu survei singkat (sekitar 5 menit).', 5000],
  ['AdscendMedia', 'Daftar & Verifikasi Akun', 'Daftar layanan dan verifikasi email kamu.', 20000],
  ['ayeT-Studios', 'Tonton Video & Instal Aplikasi', 'Tonton video lalu instal aplikasi yang ditawarkan.', 8000],
  ['ayeT-Studios', 'Main Game Balap 3 Hari', 'Main game balap selama 3 hari berturut-turut.', 40000],
  ['RevU', 'Daftar Layanan Streaming (Trial)', 'Daftar trial gratis layanan streaming.', 35000],
  ['RevU', 'Instal Aplikasi Keuangan', 'Instal aplikasi keuangan dan buat akun.', 18000],
  ['Torox', 'Instal Game Strategi', 'Instal game strategi dan selesaikan tutorial.', 10000],
  ['Torox', 'Capai Level 15', 'Main sampai mencapai level 15 di game pilihan.', 50000],
  ['adjoe', 'Main Game RPG 30 Menit', 'Main game RPG selama 30 menit.', 3000],
  ['adjoe', 'Instal & Main Game Arcade', 'Instal game arcade dan mainkan 3 ronde.', 7000],
];

async function seed() {
  const adminRow = await db.prepare("SELECT value FROM admin_settings WHERE key='adminPinHash'").get();
  if (!adminRow) {
    const { salt, hash } = hashPin('246810'); // PIN admin awal
    await db.prepare("INSERT INTO admin_settings(key,value) VALUES('adminPinHash',?)").run(hash);
    await db.prepare("INSERT INTO admin_settings(key,value) VALUES('adminPinSalt',?)").run(salt);
    console.log('[seed] PIN admin awal 246810 disimpan ter-hash.');
  }
  const count = (await db.prepare('SELECT COUNT(*) AS c FROM offers').get()).c;
  if (count === 0) {
    for (let i = 0; i < OFFER_SEED.length; i++) {
      const [provider, title, desc, partnerRp] = OFFER_SEED[i];
      const id = `offer_${String(i + 1).padStart(2, '0')}`;
      const rewardCoins = Math.round(partnerRp * 0.5 * COINS_PER_RUPIAH); // pemain terima tepat 50%
      const secret = crypto.randomBytes(16).toString('hex');
      await db.prepare('INSERT INTO offers(id,provider,title,"desc",partnerRp,rewardCoins,secret) VALUES(?,?,?,?,?,?,?)')
        .run(id, provider, title, desc, partnerRp, rewardCoins, secret);
    }
    console.log('[seed] 14 misi offerwall (7 penyedia x 2) dibuat.');
  }
}

// ---------------------------------------------------------------------------
// Init: buat skema (kalau belum ada) + seed. WAJIB dipanggil sebelum server
// listen — server.js memanggil initDb() saat start.
// ---------------------------------------------------------------------------
let initPromise = null;
async function initDb() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (USE_PG) {
      const schema = fs.readFileSync(path.join(__dirname, 'supabase-schema.sql'), 'utf8');
      await pgPool.query(schema);
      console.log('[db] Postgres (DATABASE_URL) aktif — skema supabase-schema.sql diterapkan.');
    } else {
      sqliteDb.exec('PRAGMA journal_mode = WAL;');
      sqliteDb.exec('PRAGMA foreign_keys = ON;');
      sqliteDb.exec(SQLITE_DDL);
      // Migrasi kolom baru untuk DB SQLite lama (aman diulang — gagal = sudah ada).
      for (const col of ['ip TEXT', 'lastIp TEXT', 'provider TEXT', 'providerId TEXT', 'banned INTEGER NOT NULL DEFAULT 0', 'bannedReason TEXT', 'fullset_claimed INTEGER NOT NULL DEFAULT 0', 'lives INTEGER NOT NULL DEFAULT 15', 'livesDay TEXT', 'livesCooldownUntil TEXT']) {
        try { sqliteDb.exec(`ALTER TABLE players ADD COLUMN ${col};`); } catch { /* kolom sudah ada */ }
      }
      try { sqliteDb.exec('ALTER TABLE daily_state ADD COLUMN runCoinsToday INTEGER NOT NULL DEFAULT 0;'); } catch { /* kolom sudah ada */ }
      console.log('[db] SQLite lokal aktif (DATABASE_URL tidak diset).');
    }
    await seed();
  })();
  return initPromise;
}

// ---------------------------------------------------------------------------
// Helper pemain (async — memakai adapter db di atas)
// ---------------------------------------------------------------------------
function parseJson(text, fallback) {
  // Kolom jsonb Postgres dibaca pg sebagai objek JS — terima apa adanya.
  if (text === null || text === undefined) return fallback;
  if (typeof text === 'object') return text;
  try { const v = JSON.parse(text); return v ?? fallback; } catch { return fallback; }
}
function publicPlayer(row) {
  return {
    id: row.id,
    name: row.name,
    coins: row.coins,
    coinsRp: coinsToRp(row.coins),
    level: row.maxLevel,
    maxLevel: row.maxLevel,
    characters: parseJson(row.characters, ['jolly']),
    skins: parseJson(row.skins, []),
    equipped: parseJson(row.equipped, { character: 'jolly', skin: null }),
    powerups: parseJson(row.powerups, {}),
    banned: row.banned ? true : false,
    bannedReason: row.bannedReason || null,
    fullsetClaimed: row.fullset_claimed ? true : false,
    lives: row.lives == null ? 15 : row.lives,
    livesCooldownUntil: row.livesCooldownUntil || null,
  };
}
async function getDailyState(playerId, date) {
  let row = await db.prepare('SELECT * FROM daily_state WHERE playerId=? AND date=?').get(playerId, date);
  if (!row) {
    await db.prepare('INSERT INTO daily_state(playerId,date,adsToday,lastAdAt,wheelLeft,chestLeft,runCoinsToday) VALUES(?,?,?,?,?,?,?)')
      .run(playerId, date, 0, null, 1, 1, 0);
    row = await db.prepare('SELECT * FROM daily_state WHERE playerId=? AND date=?').get(playerId, date);
  }
  return row;
}
function todaysMissions(date) {
  // Rotasi deterministik berdasarkan tanggal (3 misi berurutan dari pool 6).
  const dayIndex = Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
  const start = ((dayIndex % 6) + 6) % 6;
  return [0, 1, 2].map((i) => MISSION_POOL[(start + i) % MISSION_POOL.length]);
}
async function ensureMissionRows(playerId, date) {
  for (const m of todaysMissions(date)) {
    await db.prepare('INSERT OR IGNORE INTO mission_progress(playerId,missionId,date,progress,claimed) VALUES(?,?,?,?,0)')
      .run(playerId, m.id, date, 0);
  }
}
async function addMissionProgress(playerId, missionId, amount, date) {
  await ensureMissionRows(playerId, date);
  const row = await db.prepare('SELECT * FROM mission_progress WHERE playerId=? AND missionId=? AND date=?').get(playerId, missionId, date);
  if (!row) return; // misi tidak aktif hari ini
  const def = MISSION_POOL.find((m) => m.id === missionId);
  const next = Math.min(def.target, row.progress + amount);
  await db.prepare('UPDATE mission_progress SET progress=? WHERE playerId=? AND missionId=? AND date=?').run(next, playerId, missionId, date);
}
async function achievementUnlocked(a, player) {
  const invited = (await db.prepare('SELECT COUNT(*) AS c FROM referrals WHERE referrerId=?').get(player.id)).c;
  switch (a.id) {
    case 'a_level1': return player.totalLevels >= 1;
    case 'a_level10': return player.totalLevels >= 10;
    case 'a_level30': return player.totalLevels >= 30;
    case 'a_level60': return player.totalLevels >= 60;
    case 'a_coins100k': return player.totalEarned >= 100000;
    case 'a_streak7': return player.streak >= 7;
    case 'a_invite1': return invited >= 1;
    case 'a_ads10': return player.totalAds >= 10;
    default: return false;
  }
}
function referralReady(friend) {
  // Syarat cair: teman sudah nonton >=1 iklan DAN menyelesaikan level 3 (maxLevel >= 4).
  return friend.totalAds >= 1 && friend.maxLevel >= 4;
}

module.exports = {
  db, initDb, hashPin, verifyPin, makeToken, verifyToken,
  todayStr, yesterdayStr, nowIso,
  rpToCoins, coinsToRp,
  AD_REWARD_COINS, AD_COOLDOWN_MS, AD_MAX_PER_DAY,
  CHECKIN_RP, WITHDRAW_AMOUNTS, WITHDRAW_METHODS,
  GIFT_CODES, REFERRAL_REWARD_COINS,
  NETWORKS, estRevenueRp,
  CHARACTERS, SKINS, POWERUPS,
  LEVEL_SKINS, FULLSET_COINS,
  MISSION_POOL, ACHIEVEMENTS,
  publicPlayer, parseJson,
  getDailyState, todaysMissions, ensureMissionRows, addMissionProgress,
  achievementUnlocked, referralReady,
};
