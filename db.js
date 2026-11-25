// db.js — Skema SQLite + seed + helper bersama untuk Lari Koin Online.
//
// DATABASE: memakai `node:sqlite` bawaan Node 24 (DatabaseSync).
// Alasan: better-sqlite3 GAGAL diinstal di environment ini — tidak ada
// prebuilt binary untuk Node 24.22.1 dan `node-gyp rebuild` gagal.
// API DatabaseSync (prepare/run/get/all) sengaja dipakai supaya skema dan
// query di file ini mudah dipindah ke Postgres (Supabase) nanti: semua SQL
// ditulis standar, tanpa fitur khusus better-sqlite3.
//
// File DB: env DB_PATH atau ./lari-koin.db (di Render free, disk bersifat
// ephemeral — lihat DEPLOY.md).

const crypto = require('node:crypto');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'lari-koin.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

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

const GIFT_CODES = { LARIKOIN: 1000, JOLLYGAS: 2500, RANSGACOR: 5000, HOKI777: 7777 };

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
  { id: 'a_level60', title: 'Legenda Lari Koin', desc: 'Selesaikan 60 level.', reward: 10000 },
  { id: 'a_coins100k', title: 'Sultan Koin', desc: 'Kumpulkan total 100.000 koin.', reward: 5000 },
  { id: 'a_streak7', title: 'Rajin Check-in', desc: 'Check-in 7 hari beruntun.', reward: 3000 },
  { id: 'a_invite1', title: 'Ajak Teman', desc: 'Undang 1 teman (teman mendaftar dengan kodemu).', reward: 2000 },
  { id: 'a_ads10', title: 'Penonton Setia', desc: 'Klaim 10 iklan rewarded.', reward: 1500 },
];

// ---------------------------------------------------------------------------
// Skema
// ---------------------------------------------------------------------------
db.exec(`
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
  lastActive TEXT NOT NULL
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
  desc TEXT NOT NULL,
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
`);

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

function seed() {
  const adminRow = db.prepare("SELECT value FROM admin_settings WHERE key='adminPinHash'").get();
  if (!adminRow) {
    const { salt, hash } = hashPin('246810'); // PIN admin awal
    db.prepare("INSERT INTO admin_settings(key,value) VALUES('adminPinHash',?)").run(hash);
    db.prepare("INSERT INTO admin_settings(key,value) VALUES('adminPinSalt',?)").run(salt);
    console.log('[seed] PIN admin awal 246810 disimpan ter-hash.');
  }
  const count = db.prepare('SELECT COUNT(*) AS c FROM offers').get().c;
  if (count === 0) {
    const ins = db.prepare('INSERT INTO offers(id,provider,title,desc,partnerRp,rewardCoins,secret) VALUES(?,?,?,?,?,?,?)');
    OFFER_SEED.forEach(([provider, title, desc, partnerRp], i) => {
      const id = `offer_${String(i + 1).padStart(2, '0')}`;
      const rewardCoins = Math.round(partnerRp * 0.5 * COINS_PER_RUPIAH); // pemain terima tepat 50%
      const secret = crypto.randomBytes(16).toString('hex');
      ins.run(id, provider, title, desc, partnerRp, rewardCoins, secret);
    });
    console.log('[seed] 14 misi offerwall (7 penyedia x 2) dibuat.');
  }
}
seed();

// ---------------------------------------------------------------------------
// Helper pemain
// ---------------------------------------------------------------------------
function parseJson(text, fallback) {
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
  };
}
function getDailyState(playerId, date) {
  let row = db.prepare('SELECT * FROM daily_state WHERE playerId=? AND date=?').get(playerId, date);
  if (!row) {
    db.prepare('INSERT INTO daily_state(playerId,date,adsToday,lastAdAt,wheelLeft,chestLeft) VALUES(?,?,?,?,?,?)')
      .run(playerId, date, 0, null, 1, 1);
    row = db.prepare('SELECT * FROM daily_state WHERE playerId=? AND date=?').get(playerId, date);
  }
  return row;
}
function todaysMissions(date) {
  // Rotasi deterministik berdasarkan tanggal (3 misi berurutan dari pool 6).
  const dayIndex = Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
  const start = ((dayIndex % 6) + 6) % 6;
  return [0, 1, 2].map((i) => MISSION_POOL[(start + i) % MISSION_POOL.length]);
}
function ensureMissionRows(playerId, date) {
  const ins = db.prepare('INSERT OR IGNORE INTO mission_progress(playerId,missionId,date,progress,claimed) VALUES(?,?,?,?,0)');
  todaysMissions(date).forEach((m) => ins.run(playerId, m.id, date, 0));
}
function addMissionProgress(playerId, missionId, amount, date) {
  ensureMissionRows(playerId, date);
  const row = db.prepare('SELECT * FROM mission_progress WHERE playerId=? AND missionId=? AND date=?').get(playerId, missionId, date);
  if (!row) return; // misi tidak aktif hari ini
  const def = MISSION_POOL.find((m) => m.id === missionId);
  const next = Math.min(def.target, row.progress + amount);
  db.prepare('UPDATE mission_progress SET progress=? WHERE playerId=? AND missionId=? AND date=?').run(next, playerId, missionId, date);
}
function achievementUnlocked(a, player) {
  const invited = db.prepare('SELECT COUNT(*) AS c FROM referrals WHERE referrerId=?').get(player.id).c;
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
  db, hashPin, verifyPin, makeToken, verifyToken,
  todayStr, yesterdayStr, nowIso,
  rpToCoins, coinsToRp,
  AD_REWARD_COINS, AD_COOLDOWN_MS, AD_MAX_PER_DAY,
  CHECKIN_RP, WITHDRAW_AMOUNTS, WITHDRAW_METHODS,
  GIFT_CODES, REFERRAL_REWARD_COINS,
  NETWORKS, estRevenueRp,
  CHARACTERS, SKINS, POWERUPS,
  MISSION_POOL, ACHIEVEMENTS,
  publicPlayer, parseJson,
  getDailyState, todaysMissions, ensureMissionRows, addMissionProgress,
  achievementUnlocked, referralReady,
};
