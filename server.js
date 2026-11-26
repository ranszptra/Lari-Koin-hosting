// server.js — Backend Runner Coin
// Node.js + Express + SQLite (node:sqlite bawaan Node 24) atau Postgres
// (Supabase) bila env DATABASE_URL diset — lihat db.js.
// Start: `npm start` (PORT env, default 3000). Serve statis dari ./public/.
//
// Auth pemain: token stateless `${id}.${HMAC-SHA256(secret, id)}` lewat
// header `Authorization: Bearer <token>` (cookie juga di-set saat login,
// tapi TIDAK diandalkan untuk auth). Secret dari env OWNER_SECRET.
// PIN pemain & PIN admin di-hash scrypt — tidak pernah disimpan plaintext.

const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const {
  db, initDb, hashPin, verifyPin, makeToken, verifyToken,
  todayStr, yesterdayStr, nowIso,
  rpToCoins, coinsToRp,
  AD_REWARD_COINS, AD_COOLDOWN_MS, AD_MAX_PER_DAY,
  CHECKIN_RP, WITHDRAW_AMOUNTS, WITHDRAW_METHODS,
  GIFT_CODES, INVITE_TIERS,
  NETWORKS, estRevenueRp,
  CHARACTERS, SKINS, POWERUPS,
  LEVEL_CHARACTERS, levelCharactersBaru, LEVEL_SKINS, FULLSET_COINS,
  MISSION_POOL, ACHIEVEMENTS,
  publicPlayer, parseJson,
  getDailyState, todaysMissions, ensureMissionRows, addMissionProgress,
  achievementUnlocked, referralReady,
} = require('./db');

const app = express();
app.set('trust proxy', true); // Railway: IP asli pemain ada di X-Forwarded-For
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  let ip = (typeof xff === 'string' && xff.trim() ? xff.split(',')[0].trim() : (req.ip || '')).replace(/^::ffff:/, '');
  return (ip || '').slice(0, 45) || null;
}
const PORT = process.env.PORT || 3000;

// --- Tapjoy Offerwall (Web, self-managed currency) ------------------------
// Jalur web resmi Tapjoy (tanpa native SDK): deep link
//   https://rewards.unity.com/owp/web/link/<SDK_KEY>/u/<USER_ID>
// Dokumen: docs.unity.com/en-us/grow/offerwall/web/displaying-offerwall/deep-linking-implementation
// Callback default Tapjoy = HTTP GET + verifier MD5:
//   verifier = MD5(id + ':' + snuid + ':' + currency + ':' + secret_key)
// Dokumen: docs.unity.com/en-us/grow/offerwall/monetization/virtual-currency/self-managed-currency
// (Varian POST + HMAC-SHA256 hanya tersedia lewat Tapjoy Support — belum
//  diaktifkan; endpoint di bawah memakai varian default yang didokumentasikan.)
// Env yang dibutuhkan (di Railway, JANGAN di repo):
//   TAPJOY_SDK_KEY    — Application SDK Key Tapjoy (tampil di deep link)
//   TAPJOY_SECRET_KEY — Virtual currency secret key (verifikasi callback)
const TAPJOY_SDK_KEY = process.env.TAPJOY_SDK_KEY || '';
const TAPJOY_SECRET_KEY = process.env.TAPJOY_SECRET_KEY || '';
// Batas sanity per callback: $200 pada kurs $1 = 500.000 Koin (offer Tapjoy
// membayar $0,20–$100 per event; di atas $200 dianggap tidak wajar → tolak).
const TAPJOY_MAX_COINS_PER_CALLBACK = 100000000;

// --- AdMob (wrapper WebView, tahap 2) -------------------------------------
// Unit ID diambil wrapper saat runtime dari GET /api/ads/config — JANGAN
// hardcode di kode Android kecuali sebagai fallback (lihat wrapper/).
// Nilai default = ID beneran yang sudah dibuat di AdMob (2026-11-26).
// Bisa di-override lewat env Railway tanpa rebuild APK:
//   ADMOB_APP_ID, ADMOB_REWARDED_UNIT_ID, ADMOB_INTERSTITIAL_UNIT_ID
const ADMOB_APP_ID = process.env.ADMOB_APP_ID || 'ca-app-pub-3929807789448089~9100558334';
const ADMOB_REWARDED_UNIT_ID = process.env.ADMOB_REWARDED_UNIT_ID || 'ca-app-pub-3929807789448089/9615563652';
const ADMOB_INTERSTITIAL_UNIT_ID = process.env.ADMOB_INTERSTITIAL_UNIT_ID || 'ca-app-pub-3929807789448089/1088180253';

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

const err = (res, status, msg) => res.status(status).json({ ok: false, error: msg });
const fail = (res, msg) => err(res, 400, msg);
// Express 4 tidak menangkap rejection dari handler async — bungkus semua
// handler/middleware async dengan ini agar error masuk ke error-handler.
const ah = (fn) => (req, res, next) => { Promise.resolve(fn(req, res, next)).catch(next); };

// --- Auth ---------------------------------------------------------------
function bearerId(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  return verifyToken(h.slice(7).trim());
}
async function requirePlayer(req, res, next) {
  const id = bearerId(req);
  if (!id || id === 'admin') return err(res, 401, 'Token tidak valid / belum login');
  const row = await db.prepare('SELECT * FROM players WHERE id=?').get(Number(id));
  if (!row) return err(res, 401, 'Pemain tidak ditemukan');
  req.player = row;
  if (row.banned) return err(res, 403, 'Akun diblokir: ' + (row.bannedReason || 'hubungi admin'));
  await db.prepare('UPDATE players SET lastActive=?, lastIp=? WHERE id=?').run(nowIso(), clientIp(req), row.id);
  next();
}
function requireAdmin(req, res, next) {
  const id = bearerId(req);
  if (id !== 'admin') return err(res, 401, 'Token admin tidak valid');
  next();
}
async function optionalPlayerId(req) {
  const id = bearerId(req);
  if (!id || id === 'admin') return null;
  const row = await db.prepare('SELECT * FROM players WHERE id=?').get(Number(id));
  return row ? row.id : null;
}
async function touchCoins(playerId, delta) {
  await db.prepare('UPDATE players SET coins = coins + ? WHERE id=?').run(delta, playerId);
  if (delta > 0) await db.prepare('UPDATE players SET totalEarned = totalEarned + ? WHERE id=?').run(delta, playerId);
}
async function freshPlayer(id) {
  return db.prepare('SELECT * FROM players WHERE id=?').get(id);
}

// --- Health ---------------------------------------------------------------
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'runner-coin', time: nowIso() }));

// --- Register / Login -----------------------------------------------------
// --- Login sosial (Google, sekali ketuk) --------------------------------------
// Butuh env: GOOGLE_CLIENT_ID. Kalau belum diset, tombol sosial disembunyikan
// (lihat /api/auth/social-config). Akun sosial tersimpan di server
// (provider + providerId) — hapus aplikasi pun akun & koin tetap ada,
// tinggal ketuk Google lagi. (Login Facebook DIHAPUS atas keputusan Rans.)
app.get('/api/auth/social-config', (req, res) => {
  res.json({
    ok: true,
    google: Boolean(process.env.GOOGLE_CLIENT_ID),
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  });
});
async function verifyGoogleToken(idToken) {
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
  if (!r.ok) return null;
  const d = await r.json();
  if (!d || d.aud !== process.env.GOOGLE_CLIENT_ID || d.email_verified !== 'true' || !d.sub) return null;
  return { providerId: d.sub, name: d.name || String(d.email || '').split('@')[0] };
}
app.post('/api/auth/social', ah(async (req, res) => {
  const provider = String(req.body?.provider || '');
  const token = String(req.body?.token || '');
  const referrer = req.body?.referrer ? String(req.body.referrer).trim() : null;
  if (provider !== 'google' || !token) return fail(res, 'Provider/token tidak valid');
  const verified = await verifyGoogleToken(token);
  if (!verified) return fail(res, 'Verifikasi ' + provider + ' gagal — coba lagi');
  const ip = clientIp(req);
  let row = await db.prepare('SELECT * FROM players WHERE provider=? AND providerId=?').get(provider, verified.providerId);
  if (!row) {
    let banned = 0, bannedReason = null;
    if (ip) {
      const dupe = await db.prepare('SELECT name FROM players WHERE ip=? ORDER BY createdAt').all(ip);
      if (dupe.length) { banned = 1; bannedReason = 'IP sama dengan akun: ' + dupe.map((x) => x.name).join(', '); }
    }
    let name = String(verified.name || '').trim().slice(0, 30) || 'Pemain Google';
    const taken = await db.prepare('SELECT id FROM players WHERE name=? COLLATE NOCASE').get(name);
    if (taken) name = (name.slice(0, 24) + '-' + Math.floor(1000 + Math.random() * 9000)).slice(0, 30);
    let referrerRow = null;
    if (referrer) {
      referrerRow = await db.prepare('SELECT * FROM players WHERE name=? COLLATE NOCASE').get(referrer);
      if (!referrerRow) return fail(res, 'Pengundang tidak ditemukan');
      if (referrerRow.name.toLowerCase() === name.toLowerCase()) return fail(res, 'Tidak bisa mengundang diri sendiri');
    }
    const { salt, hash } = hashPin(crypto.randomBytes(32).toString('hex'));
    const now = nowIso();
    const info = await db.prepare(
      `INSERT INTO players(name,pinHash,pinSalt,coins,maxLevel,characters,skins,levelChars,equipped,powerups,
       streak,lastCheckin,referrer,totalEarned,totalAds,totalLevels,createdAt,lastActive,ip,lastIp,provider,providerId,banned,bannedReason)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(name, hash, salt, 500, 1, '["jolly"]', '[]', '["char-01"]', '{"character":"char-01","skin":null}', '{}',
      0, null, referrerRow ? referrerRow.name : null, 0, 0, 0, now, now, ip, ip, provider, verified.providerId, banned, bannedReason);
    if (referrerRow) {
      await db.prepare('INSERT OR IGNORE INTO referrals(referrerId,friendId,status,createdAt) VALUES(?,?,?,?)')
        .run(referrerRow.id, info.lastInsertRowid, 'pending', now);
    }
    row = await freshPlayer(info.lastInsertRowid);
  } else {
    await db.prepare('UPDATE players SET lastActive=?, lastIp=? WHERE id=?').run(nowIso(), ip, row.id);
    row = await freshPlayer(row.id);
  }
  const outToken = makeToken(row.id);
  res.cookie('token', outToken, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, path: '/' });
  res.json({ ok: true, token: outToken, player: publicPlayer(row) });
}));

// --- Profile ---------------------------------------------------------------
// Skin level: beri semua skin yang levelnya sudah dicapai pemain (idempotent).
async function grantLevelSkins(p) {
  const owned = new Set(parseJson(p.skins, []));
  const baru = LEVEL_SKINS.filter((s) => p.maxLevel >= s.level && !owned.has(s.id));
  if (!baru.length) return [];
  const all = [...owned, ...baru.map((s) => s.id)];
  await db.prepare('UPDATE players SET skins=? WHERE id=?').run(JSON.stringify(all), p.id);
  return baru;
}

// Karakter level: beri semua karakter yang levelnya sudah dicapai pemain (idempotent).
async function grantLevelCharacters(p) {
  const owned = parseJson(p.levelChars, []);
  const baru = levelCharactersBaru(p.maxLevel, owned);
  if (!baru.length) return [];
  const all = [...owned, ...baru.map((c) => c.id)];
  await db.prepare('UPDATE players SET levelChars=? WHERE id=?').run(JSON.stringify(all), p.id);
  return baru;
}

app.get('/api/profile', ah(requirePlayer), ah(async (req, res) => {
  let p = await freshPlayer(req.player.id);
  // Skin level: beri otomatis semua skin yang levelnya sudah dicapai (idempotent).
  if ((await grantLevelSkins(p)).length) p = await freshPlayer(p.id);
  // Karakter level: beri otomatis semua karakter yang levelnya sudah dicapai.
  if ((await grantLevelCharacters(p)).length) p = await freshPlayer(p.id);
  // Migrasi default: pemain lama yang masih pakai karakter default 'jolly'
  // (tidak pernah beli/pakai karakter toko) ikut ke flagship baru char-01 "Rex".
  {
    const eq = parseJson(p.equipped, { character: 'jolly', skin: null });
    const ownedLc = parseJson(p.levelChars, []);
    if (eq.character === 'jolly' && ownedLc.includes('char-01')) {
      eq.character = 'char-01';
      await db.prepare('UPDATE players SET equipped=? WHERE id=?').run(JSON.stringify(eq), p.id);
      p = await freshPlayer(p.id);
    }
  }
  // Nyawa: reset harian otomatis kalau hari sudah berganti.
  await getLives(p);
  p = await freshPlayer(p.id);
  const today = todayStr();
  const daily = await getDailyState(p.id, today);
  await ensureMissionRows(p.id, today);
  const missions = [];
  for (const m of todaysMissions(today)) {
    const row = await db.prepare('SELECT progress,claimed FROM mission_progress WHERE playerId=? AND missionId=? AND date=?').get(p.id, m.id, today);
    missions.push({ id: m.id, title: m.title, desc: m.desc, progress: row?.progress || 0, target: m.target, reward: m.reward, claimed: Boolean(row?.claimed) });
  }
  const claimedAch = new Set((await db.prepare('SELECT achievementId FROM achievement_claims WHERE playerId=?').all(p.id)).map((r) => r.achievementId));
  const achievements = [];
  for (const a of ACHIEVEMENTS) {
    achievements.push({
      id: a.id, title: a.title, desc: a.desc, reward: a.reward,
      unlocked: await achievementUnlocked(a, p), claimed: claimedAch.has(a.id),
    });
  }
  const refs = (await db.prepare(
    `SELECT r.friendId, r.status, f.name AS friendName, f.totalAds, f.maxLevel
     FROM referrals r JOIN players f ON f.id=r.friendId WHERE r.referrerId=? ORDER BY r.createdAt DESC`
  ).all(p.id)).map((r) => ({
    friendId: r.friendId,
    friendName: r.friendName,
    status: r.status === 'claimed' ? 'claimed' : (referralReady({ totalAds: r.totalAds, maxLevel: r.maxLevel }) ? 'ready' : 'pending'),
  }));
  // Tangga invite v24: teman terkualifikasi = status 'ready' (syarat 10 iklan +
  // level 5 terpenuhi) atau 'claimed' (diklaim di sistem lama — keputusan
  // disengaja: teman lama yang sudah diklaim tetap dihitung ke jumlah ini).
  const qualifiedReferrals = refs.filter((r) => r.status === 'ready' || r.status === 'claimed').length;
  const claimedInviteTiers = (await db.prepare('SELECT tier FROM invite_tier_claims WHERE playerId=?').all(p.id)).map((r) => r.tier);
  const withdrawals = await db.prepare('SELECT id,amountRp,method,number,status,createdAt FROM withdrawals WHERE playerId=? ORDER BY createdAt DESC LIMIT 20').all(p.id);
  res.json({
    ok: true,
    player: {
      ...publicPlayer(p),
      coinsRp: coinsToRp(p.coins),
      streak: p.streak,
      lastCheckin: p.lastCheckin,
      missions, achievements,
      wheelLeft: daily.wheelLeft,
      chestLeft: daily.chestLeft,
      adsToday: daily.adsToday,
      referrals: refs,
      inviteTiers: { qualified: qualifiedReferrals, claimed: claimedInviteTiers, tiers: INVITE_TIERS },
      withdrawals,
    },
  });
}));

// --- Validasi lari (anti-cheat) -------------------------------------------------
// Server tidak lagi percaya mentah angka koin dari HP: koin harus cocok dengan
// jumlah pickup, jarak, dan durasi lari. Batas koin lari: 30.000/hari/pemain.
const RUN_COINS_HARIAN_MAX = 30000;
const RUN_JEDA_MIN_MS = 15000; // jeda minimal antar klaim level (1 lari valid ≥ ~20 detik)
const lastFinishAt = new Map(); // playerId -> timestamp ms (rate limit, in-memory)
function hitungTarget(level) { return ((level % 10 === 0 ? 700 : 450) + level * 30); }
function kecepatanMax(level) { return (4 + level * 0.18) * 1.5; } // + skill Lari Cepat x1,5
function validasiLari({ level, coins, coinCount, distance, durationMs, harusSelesai }) {
  // Klien lama (tanpa bukti lari): batasi 1.000 koin/klaim — lari valid maksimal ~1.000.
  if (coinCount == null || distance == null || durationMs == null) {
    if (coins > 1000) return 'Koin lari tidak valid (melebihi batas tanpa bukti lari)';
    return null;
  }
  if (!Number.isInteger(coinCount) || coinCount < 0 || coinCount > 1000) return 'Jumlah pickup koin tidak valid';
  if (!Number.isInteger(distance) || distance < 0 || distance > 10000) return 'Jarak lari tidak valid';
  if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 3600000) return 'Durasi lari tidak valid';
  if (coins % 10 !== 0) return 'Koin lari harus kelipatan 10';
  if (coins > coinCount * 20) return 'Koin melebihi jumlah pickup (maks 20/pickup)';
  if (harusSelesai && distance < hitungTarget(level)) return 'Level belum selesai (jarak kurang)';
  // Durasi minimal: target / kecepatan maks (toleransi 20%).
  const durMinMs = (hitungTarget(level) / (kecepatanMax(level) * 3.6)) * 1000 * 0.8;
  if (harusSelesai && durationMs < durMinMs) return 'Lari terlalu cepat — tidak valid';
  // Koin maksimal dari spawn: 1 spawn tiap max(28, 75-lv*1,6) frame @60fps, maks 20 koin/spawn, +30% toleransi.
  const interval = Math.max(28, 75 - level * 1.6);
  const maxSpawn = Math.ceil((durationMs / 1000) * 60 / interval) + 2;
  if (coinCount > Math.ceil(maxSpawn * 1.3)) return 'Pickup koin melebihi yang mungkin muncul';
  // Jarak maksimal dari durasi (toleransi 30%).
  const jarakMax = (durationMs / 1000) * 60 * kecepatanMax(level) * 0.06 * 1.3;
  if (distance > jarakMax) return 'Jarak melebihi yang mungkin ditempuh';
  return null;
}

// --- Finish level -----------------------------------------------------------
app.post('/api/finish-level', ah(requirePlayer), ah(async (req, res) => {
  const level = Number(req.body?.level);
  if (!Number.isInteger(level) || level < 1 || level > 60) return fail(res, 'Level harus 1–60');
  // `coins` = koin persis (satuan koin) yang dikumpulkan saat lari.
  // `coinsCollected` (jumlah pickup, tiap pickup = 10 koin) tetap diterima
  // untuk kompatibilitas lama.
  let runCoins = Number(req.body?.coins);
  if (!Number.isInteger(runCoins)) {
    const count = Number(req.body?.coinsCollected || 0);
    if (!Number.isInteger(count) || count < 0 || count > 10000) return fail(res, 'coinsCollected tidak valid');
    runCoins = count * 10;
  }
  if (runCoins < 0 || runCoins > 10000) return fail(res, 'coins tidak valid');
  const p = await freshPlayer(req.player.id);
  if (level > p.maxLevel) return fail(res, 'Level belum terbuka');
  const errValid = validasiLari({ level, coins: runCoins, coinCount: req.body?.coinCount, distance: req.body?.distance, durationMs: req.body?.durationMs, harusSelesai: true });
  if (errValid) return fail(res, errValid);
  const isBoss = level % 10 === 0;
  const bonus = (100 + 15 * level) * (isBoss ? 5 : 1);
  const coinsEarned = runCoins + bonus;
  // Jeda antar klaim + batas harian (anti-farm).
  const nowMs = Date.now();
  const lastMs = lastFinishAt.get(p.id) || 0;
  if (nowMs - lastMs < RUN_JEDA_MIN_MS) return fail(res, 'Terlalu cepat — tunggu sebentar sebelum klaim lagi');
  const today = todayStr();
  const ds = await getDailyState(p.id, today);
  if ((ds.runCoinsToday || 0) + coinsEarned > RUN_COINS_HARIAN_MAX) return fail(res, 'Batas koin lari harian tercapai (30.000)');
  const newMaxLevel = Math.max(p.maxLevel, level + 1);
  await db.prepare('UPDATE players SET coins=coins+?, totalEarned=totalEarned+?, totalLevels=totalLevels+1, maxLevel=?, lastActive=? WHERE id=?')
    .run(coinsEarned, coinsEarned, newMaxLevel, nowIso(), p.id);
  await db.prepare('UPDATE daily_state SET runCoinsToday=runCoinsToday+? WHERE playerId=? AND date=?').run(coinsEarned, p.id, today);
  lastFinishAt.set(p.id, nowMs);
  const skinsBaru = await grantLevelSkins(await freshPlayer(p.id));
  const charsBaru = await grantLevelCharacters(await freshPlayer(p.id));
  await addMissionProgress(p.id, 'm_level3', 1, today);
  await addMissionProgress(p.id, 'm_coins500', coinsEarned, today);
  if (isBoss) await addMissionProgress(p.id, 'm_boss', 1, today);
  res.json({ ok: true, coinsEarned, bonus, isBoss, newMaxLevel, skinsBaru: skinsBaru.map((s) => s.nama), charsBaru: charsBaru.map((c) => c.nama), coins: (await freshPlayer(p.id)).coins });
}));

// --- Bank koin lari yang gagal (tanpa bonus level / buka level) -------------
app.post('/api/bank-run-coins', ah(requirePlayer), ah(async (req, res) => {
  const coins = Number(req.body?.coins);
  if (!Number.isInteger(coins) || coins < 0 || coins > 10000) return fail(res, 'coins tidak valid');
  const levelBank = Number(req.body?.level) || 1;
  const errBank = validasiLari({ level: levelBank, coins, coinCount: req.body?.coinCount, distance: req.body?.distance, durationMs: req.body?.durationMs, harusSelesai: false });
  if (errBank) return fail(res, errBank);
  if (coins > 0) {
    const todayBank = todayStr();
    const dsBank = await getDailyState(req.player.id, todayBank);
    if ((dsBank.runCoinsToday || 0) + coins > RUN_COINS_HARIAN_MAX) return fail(res, 'Batas koin lari harian tercapai (30.000)');
    await touchCoins(req.player.id, coins);
    await db.prepare('UPDATE daily_state SET runCoinsToday=runCoinsToday+? WHERE playerId=? AND date=?').run(coins, req.player.id, todayBank);
    await addMissionProgress(req.player.id, 'm_coins500', coins, todayBank);
  }
  res.json({ ok: true, coins, totalCoins: (await freshPlayer(req.player.id)).coins });
}));

// --- Nyawa: 15/hari, cooldown 15 menit kalau habis, +1 nyawa per iklan --------
const LIVES_PER_DAY = 15;
const LIVES_COOLDOWN_MS = 15 * 60 * 1000;
async function getLives(p) {
  const today = todayStr();
  if (p.livesDay !== today) {
    await db.prepare('UPDATE players SET lives=?, livesDay=?, livesCooldownUntil=NULL WHERE id=?').run(LIVES_PER_DAY, today, p.id);
    return { lives: LIVES_PER_DAY, cooldownUntil: null };
  }
  return { lives: p.lives == null ? LIVES_PER_DAY : p.lives, cooldownUntil: p.livesCooldownUntil || null };
}
app.post('/api/run-start', ah(requirePlayer), ah(async (req, res) => {
  let p = await freshPlayer(req.player.id);
  let { lives, cooldownUntil } = await getLives(p);
  if (lives <= 0) {
    if (cooldownUntil && new Date(cooldownUntil).getTime() > Date.now()) {
      return fail(res, 'Nyawa habis — tunggu cooldown selesai atau nonton iklan buat +1 nyawa');
    }
    // Cooldown selesai: isi ulang 15 nyawa.
    await db.prepare('UPDATE players SET lives=?, livesDay=?, livesCooldownUntil=NULL WHERE id=?').run(LIVES_PER_DAY, todayStr(), p.id);
    lives = LIVES_PER_DAY; cooldownUntil = null;
  }
  lives -= 1;
  let cd = null;
  if (lives === 0) cd = new Date(Date.now() + LIVES_COOLDOWN_MS).toISOString();
  await db.prepare('UPDATE players SET lives=?, livesCooldownUntil=? WHERE id=?').run(lives, cd, p.id);
  res.json({ ok: true, lives, cooldownUntil: cd });
}));
app.post('/api/lives/ad', ah(requirePlayer), ah(async (req, res) => {
  const p = await freshPlayer(req.player.id);
  const { lives } = await getLives(p);
  if (lives >= LIVES_PER_DAY) return fail(res, 'Nyawa sudah penuh (' + LIVES_PER_DAY + '/' + LIVES_PER_DAY + ')');
  const baru = Math.min(LIVES_PER_DAY, lives + 1);
  await db.prepare('UPDATE players SET lives=?, livesCooldownUntil=NULL, totalAds=totalAds+1 WHERE id=?').run(baru, p.id);
  res.json({ ok: true, lives: baru });
}));

// --- Verifikasi rewarded AdMob (wrapper WebView, tahap 2) -------------------
// KEBIJAKAN (Google, support.google.com/admob/answer/7313578): hadiah
// moneter (uang tunai / kripto / gift card) DILARANG untuk rewarded ads.
// Koin Runner Coin bisa dicairkan jadi Rp → koin = hadiah moneter.
// Maka endpoint ini HANYA memberi hadiah non-uang: +1 nyawa.
// 'coins' TIDAK PERNAH ada di whitelist ini — jangan ditambahkan.
// Verifikasi berlapis (client-asserted, BUKAN Server-Side Verification
// Google — lihat wrapper/WRAPPER-README.md § "Celah yang tersisa"):
//   1. Auth pemain (Bearer token) — klaim tanpa login ditolak.
//   2. Nonce unik per klaim (UUID dari wrapper) — dedup atomik via
//      PRIMARY KEY admob_rewards.nonce; replay nonce sama → 403.
//   3. Batas 10 klaim/hari per pemain + nyawa maks 15 (seperti /api/lives/ad).
// SSV resmi Google (callback server-to-server bertanda tangan) BELUM
// diaktifkan — butuh setup di dashboard AdMob (lihat README).
const ADMOB_REWARDED_TYPES = ['life'];
app.post('/api/ads/rewarded-verify', ah(requirePlayer), ah(async (req, res) => {
  const rewardType = String(req.body?.rewardType || '');
  const nonce = String(req.body?.nonce || '');
  if (!ADMOB_REWARDED_TYPES.includes(rewardType)) return err(res, 400, 'rewardType tidak diizinkan (hanya life)');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(nonce)) return err(res, 400, 'nonce tidak valid');
  const p = await freshPlayer(req.player.id);
  const { lives } = await getLives(p);
  if (lives >= LIVES_PER_DAY) return fail(res, 'Nyawa sudah penuh (' + LIVES_PER_DAY + '/' + LIVES_PER_DAY + ')');
  const today = todayStr();
  const klaimHariIni = await db.prepare("SELECT COUNT(*) AS c FROM admob_rewards WHERE playerId=? AND substr(createdAt,1,10)=?").get(p.id, today);
  if ((klaimHariIni?.c || 0) >= AD_MAX_PER_DAY) return fail(res, `Batas reward iklan harian tercapai (${AD_MAX_PER_DAY}x/hari)`);
  const ins = await db.prepare('INSERT OR IGNORE INTO admob_rewards(nonce,playerId,rewardType,createdAt) VALUES(?,?,?,?)').run(nonce, p.id, rewardType, nowIso());
  if (!ins.changes) return err(res, 403, 'Reward sudah diklaim (nonce dipakai ulang)');
  const baru = Math.min(LIVES_PER_DAY, lives + 1);
  await db.prepare('UPDATE players SET lives=?, livesCooldownUntil=NULL, totalAds=totalAds+1 WHERE id=?').run(baru, p.id);
  res.json({ ok: true, rewardType, lives: baru });
}));

// --- Iklan rewarded ---------------------------------------------------------
app.post('/api/claim-ad-reward', ah(requirePlayer), ah(async (req, res) => {
  const p = await freshPlayer(req.player.id);
  const today = todayStr();
  const daily = await getDailyState(p.id, today);
  if (daily.adsToday >= AD_MAX_PER_DAY) return fail(res, `Batas iklan harian tercapai (${AD_MAX_PER_DAY}x/hari)`);
  if (daily.lastAdAt && Date.now() - daily.lastAdAt < AD_COOLDOWN_MS) {
    const waitSec = Math.ceil((AD_COOLDOWN_MS - (Date.now() - daily.lastAdAt)) / 1000);
    return fail(res, `Cooldown iklan — tunggu ${waitSec} detik lagi`);
  }
  await db.prepare('UPDATE daily_state SET adsToday=adsToday+1, lastAdAt=? WHERE playerId=? AND date=?').run(Date.now(), p.id, today);
  await db.prepare('UPDATE players SET totalAds=totalAds+1 WHERE id=?').run(p.id);
  await touchCoins(p.id, AD_REWARD_COINS);
  await addMissionProgress(p.id, 'm_ads3', 1, today);
  const after = await freshPlayer(p.id);
  res.json({ ok: true, coins: AD_REWARD_COINS, totalCoins: after.coins, adsToday: daily.adsToday + 1 });
}));

// --- Check-in ---------------------------------------------------------------
app.post('/api/checkin', ah(requirePlayer), ah(async (req, res) => {
  const p = await freshPlayer(req.player.id);
  const today = todayStr();
  if (p.lastCheckin === today) return fail(res, 'Sudah check-in hari ini');
  const streak = p.lastCheckin === yesterdayStr() ? p.streak + 1 : 1;
  const day = ((streak - 1) % 7) + 1; // hari ke-1..7 dalam siklus
  const rewardRp = CHECKIN_RP[day - 1];
  const coins = rpToCoins(rewardRp);
  await db.prepare('UPDATE players SET streak=?, lastCheckin=?, lastActive=? WHERE id=?').run(streak, today, nowIso(), p.id);
  await touchCoins(p.id, coins);
  res.json({ ok: true, day, streak, rewardRp, coins, totalCoins: (await freshPlayer(p.id)).coins });
}));

// --- Misi harian -------------------------------------------------------------
app.post('/api/missions/claim', ah(requirePlayer), ah(async (req, res) => {
  const missionId = String(req.body?.missionId || '');
  const def = MISSION_POOL.find((m) => m.id === missionId);
  if (!def) return fail(res, 'Misi tidak dikenal');
  const today = todayStr();
  await ensureMissionRows(req.player.id, today);
  const row = await db.prepare('SELECT * FROM mission_progress WHERE playerId=? AND missionId=? AND date=?').get(req.player.id, missionId, today);
  if (!row) return fail(res, 'Misi tidak aktif hari ini');
  if (row.claimed) return fail(res, 'Hadiah misi sudah diklaim');
  if (row.progress < def.target) return fail(res, `Misi belum selesai (${row.progress}/${def.target})`);
  await db.prepare('UPDATE mission_progress SET claimed=1 WHERE playerId=? AND missionId=? AND date=?').run(req.player.id, missionId, today);
  await touchCoins(req.player.id, def.reward);
  res.json({ ok: true, coins: def.reward, totalCoins: (await freshPlayer(req.player.id)).coins });
}));

// --- Prestasi ---------------------------------------------------------------
app.post('/api/achievements/claim', ah(requirePlayer), ah(async (req, res) => {
  const id = String(req.body?.id || '');
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return fail(res, 'Prestasi tidak dikenal');
  const p = await freshPlayer(req.player.id);
  if (!(await achievementUnlocked(def, p))) return fail(res, 'Prestasi belum terbuka');
  const already = await db.prepare('SELECT 1 FROM achievement_claims WHERE playerId=? AND achievementId=?').get(p.id, id);
  if (already) return fail(res, 'Hadiah prestasi sudah diklaim');
  await db.prepare('INSERT INTO achievement_claims(playerId,achievementId) VALUES(?,?)').run(p.id, id);
  await touchCoins(p.id, def.reward);
  res.json({ ok: true, coins: def.reward, totalCoins: (await freshPlayer(p.id)).coins });
}));

// --- Kode hadiah -------------------------------------------------------------
app.post('/api/redeem', ah(requirePlayer), ah(async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!GIFT_CODES[code]) return fail(res, 'Kode hadiah tidak valid');
  const used = await db.prepare('SELECT 1 FROM gift_redemptions WHERE playerId=? AND code=?').get(req.player.id, code);
  if (used) return fail(res, 'Kode sudah pernah dipakai akun ini');
  await db.prepare('INSERT INTO gift_redemptions(playerId,code) VALUES(?,?)').run(req.player.id, code);
  await touchCoins(req.player.id, GIFT_CODES[code]);
  res.json({ ok: true, coins: GIFT_CODES[code], totalCoins: (await freshPlayer(req.player.id)).coins });
}));

// --- Referral (sistem lama DINONAKTIFKAN v24) ---------------------------------
// Bonus per teman Rp5.000 diganti tangga hadiah invite (milestone sekali-klaim).
// Rute ini dipertahankan supaya klien lama dapat pesan yang jelas, bukan 404.
app.post('/api/referral/claim', ah(requirePlayer), ah(async (req, res) => {
  return fail(res, 'Bonus per teman sudah diganti sistem tingkat invite — klaim hadiah milestone di tab Undang Teman (3/5/10/20/50/100 teman terkualifikasi; teman dihitung kalau sudah nonton 10 iklan dan mencapai level 5)');
}));

// --- Tangga hadiah invite (v24) ----------------------------------------------
// Teman terkualifikasi = teman referral yang memenuhi referralReady (10 iklan +
// level 5) ATAU sudah pernah diklaim di sistem lama (status 'claimed') —
// keputusan disengaja: teman lama yang sudah diklaim tetap dihitung.
async function hitungTemanTerkualifikasi(referrerId) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS c FROM referrals r JOIN players f ON f.id=r.friendId
     WHERE r.referrerId=? AND (r.status='claimed' OR (f.totalAds>=10 AND f.maxLevel>=5))`
  ).get(referrerId);
  return row ? row.c : 0;
}
app.post('/api/referral/tier-claim', ah(requirePlayer), ah(async (req, res) => {
  const tier = Number(req.body?.tier);
  const def = INVITE_TIERS.find((t) => t.tier === tier);
  if (!def) return fail(res, 'Tingkat tidak dikenal — pilih 3, 5, 10, 20, 50, atau 100 teman');
  const qualified = await hitungTemanTerkualifikasi(req.player.id);
  if (qualified < tier) return fail(res, `Belum mencapai ${tier} teman terkualifikasi (baru ${qualified}) — teman dihitung kalau sudah nonton 10 iklan dan mencapai level 5`);
  // Dedup atomik via PRIMARY KEY: INSERT OR IGNORE — changes=0 berarti tingkat
  // ini sudah diklaim (pola yang sama seperti dedup Tapjoy/admob).
  const ins = await db.prepare('INSERT OR IGNORE INTO invite_tier_claims(playerId,tier,coins,createdAt) VALUES(?,?,?,?)')
    .run(req.player.id, tier, def.coins, nowIso());
  if (!ins.changes) return fail(res, `Hadiah tingkat ${tier} teman sudah diklaim`);
  await touchCoins(req.player.id, def.coins);
  res.json({ ok: true, tier, coins: def.coins, rupiah: def.rp, totalCoins: (await freshPlayer(req.player.id)).coins });
}));

// --- Penarikan ---------------------------------------------------------------
app.post('/api/withdraw', ah(requirePlayer), ah(async (req, res) => {
  const amount = Number(req.body?.amount);
  const method = String(req.body?.method || '');
  const number = String(req.body?.number || '').trim();
  if (!WITHDRAW_AMOUNTS.includes(amount)) return fail(res, 'Nominal penarikan harus Rp1.000 / Rp5.000 / Rp10.000 / Rp50.000');
  if (!WITHDRAW_METHODS.includes(method)) return fail(res, 'Metode harus DANA / GoPay / OVO / ShopeePay');
  if (!number || number.length < 6) return fail(res, 'Nomor e-wallet tidak valid');
  const costCoins = rpToCoins(amount);
  const p = await freshPlayer(req.player.id);
  if (p.coins < costCoins) return fail(res, `Koin tidak cukup — butuh ${costCoins} koin untuk Rp${amount.toLocaleString('id-ID')}`);
  await db.prepare('UPDATE players SET coins=coins-? WHERE id=?').run(costCoins, p.id);
  const info = await db.prepare('INSERT INTO withdrawals(playerId,amountRp,method,number,status,createdAt) VALUES(?,?,?,?,?,?)')
    .run(p.id, amount, method, number, 'Menunggu', nowIso());
  res.json({ ok: true, withdrawal: { id: info.lastInsertRowid, amount, method, number, status: 'Menunggu' }, coins: (await freshPlayer(p.id)).coins, costCoins });
}));

// --- Leaderboard ---------------------------------------------------------------
app.get('/api/leaderboard', ah(async (req, res) => {
  const rows = await db.prepare('SELECT name, coins, maxLevel AS level FROM players ORDER BY coins DESC, totalLevels DESC LIMIT 20').all();
  res.json({ ok: true, rows });
}));

// --- Roda hadiah & peti -------------------------------------------------------
app.post('/api/spin-wheel', ah(requirePlayer), ah(async (req, res) => {
  const today = todayStr();
  const daily = await getDailyState(req.player.id, today);
  if (daily.wheelLeft <= 0) return fail(res, 'Putaran gratis hari ini sudah habis');
  const prize = crypto.randomInt(100, 2001); // 100–2000 koin
  await db.prepare('UPDATE daily_state SET wheelLeft=wheelLeft-1 WHERE playerId=? AND date=?').run(req.player.id, today);
  await touchCoins(req.player.id, prize);
  await addMissionProgress(req.player.id, 'm_wheel', 1, today);
  res.json({ ok: true, prize, totalCoins: (await freshPlayer(req.player.id)).coins });
}));
app.post('/api/open-chest', ah(requirePlayer), ah(async (req, res) => {
  const today = todayStr();
  const daily = await getDailyState(req.player.id, today);
  if (daily.chestLeft <= 0) return fail(res, 'Peti misteri hari ini sudah dibuka');
  const prize = crypto.randomInt(100, 5001); // 100–5000 koin
  await db.prepare('UPDATE daily_state SET chestLeft=chestLeft-1 WHERE playerId=? AND date=?').run(req.player.id, today);
  await touchCoins(req.player.id, prize);
  await addMissionProgress(req.player.id, 'm_chest', 1, today);
  res.json({ ok: true, prize, totalCoins: (await freshPlayer(req.player.id)).coins });
}));

// --- Toko: beli & pakai -------------------------------------------------------
function shopCatalog(kind) {
  if (kind === 'character') return CHARACTERS;
  if (kind === 'skin') return SKINS;
  if (kind === 'powerup') return POWERUPS;
  return null;
}
app.post('/api/buy', ah(requirePlayer), ah(async (req, res) => {
  const kind = String(req.body?.kind || '');
  const id = String(req.body?.id || '');
  // v24: toko skin dihapus — tidak ada lagi skin toko yang bisa dibeli.
  if (kind === 'skin') return fail(res, 'Toko skin sudah dihapus — diganti tangga hadiah undang teman di tab Undang');
  const catalog = shopCatalog(kind);
  if (!catalog || catalog[id] === undefined) return fail(res, 'Item tidak dikenal');
  const price = catalog[id];
  const p = await freshPlayer(req.player.id);
  if (kind === 'powerup') {
    if (p.coins < price) return fail(res, `Koin tidak cukup (butuh ${price})`);
    const powerups = parseJson(p.powerups, {});
    powerups[id] = (powerups[id] || 0) + 1;
    await db.prepare('UPDATE players SET coins=coins-?, powerups=? WHERE id=?').run(price, JSON.stringify(powerups), p.id);
    return res.json({ ok: true, item: id, count: powerups[id], coins: (await freshPlayer(p.id)).coins });
  }
  const owned = parseJson(kind === 'character' ? p.characters : p.skins, []);
  if (owned.includes(id)) return fail(res, 'Item sudah dimiliki');
  if (p.coins < price) return fail(res, `Koin tidak cukup (butuh ${price})`);
  owned.push(id);
  const col = kind === 'character' ? 'characters' : 'skins';
  await db.prepare(`UPDATE players SET coins=coins-?, ${col}=? WHERE id=?`).run(price, JSON.stringify(owned), p.id);
  res.json({ ok: true, item: id, coins: (await freshPlayer(p.id)).coins });
}));
app.post('/api/equip', ah(requirePlayer), ah(async (req, res) => {
  const kind = String(req.body?.kind || '');
  const id = String(req.body?.id || '');
  const catalog = shopCatalog(kind);
  const isLevelSkin = kind === 'skin' && LEVEL_SKINS.some((s) => s.id === id);
  // v24: toko skin dihapus — hanya skin level gratis yang masih bisa dipakai.
  if (kind === 'skin' && !isLevelSkin) return fail(res, 'Toko skin sudah dihapus — diganti tangga hadiah undang teman di tab Undang');
  if (!catalog || (catalog[id] === undefined && !isLevelSkin)) return fail(res, 'Item tidak dikenal');
  const p = await freshPlayer(req.player.id);
  const equipped = parseJson(p.equipped, { character: 'jolly', skin: null });
  if (kind === 'powerup') {
    const powerups = parseJson(p.powerups, {});
    if (!(powerups[id] > 0)) return fail(res, 'Power-up belum dimiliki — beli dulu');
    equipped.powerup = id;
  } else if (kind === 'character') {
    if (!parseJson(p.characters, []).includes(id)) return fail(res, 'Karakter belum dimiliki — beli dulu');
    equipped.character = id;
  } else {
    if (!parseJson(p.skins, []).includes(id)) return fail(res, 'Skin belum dimiliki — beli dulu');
    equipped.skin = id;
  }
  await db.prepare('UPDATE players SET equipped=? WHERE id=?').run(JSON.stringify(equipped), p.id);
  res.json({ ok: true, equipped });
}));

// --- Pilih karakter level (roster 12 karakter) --------------------------------
// Karakter toko lama (jolly/kiko/momo/rex, beli pakai koin) tetap lewat /api/equip.
app.post('/api/character/select', ah(requirePlayer), ah(async (req, res) => {
  const id = String(req.body?.id || '');
  const def = LEVEL_CHARACTERS.find((c) => c.id === id);
  if (!def) return fail(res, 'Karakter tidak dikenal');
  const p = await freshPlayer(req.player.id);
  const owned = parseJson(p.levelChars, []);
  if (!owned.includes(id)) return fail(res, `Karakter ${def.nama} belum terbuka — capai Lv ${def.level} dulu`);
  const equipped = parseJson(p.equipped, { character: 'jolly', skin: null });
  equipped.character = id;
  await db.prepare('UPDATE players SET equipped=? WHERE id=?').run(JSON.stringify(equipped), p.id);
  res.json({ ok: true, equipped, character: def });
}));

// --- Tukar set lengkap skin level → Rp100.000 (sekali saja) ---------------------
app.post('/api/skins/fullset-claim', ah(requirePlayer), ah(async (req, res) => {
  const p = await freshPlayer(req.player.id);
  if (p.fullset_claimed) return fail(res, 'Set lengkap sudah ditukar');
  const owned = new Set(parseJson(p.skins, []));
  const kurang = LEVEL_SKINS.filter((s) => !owned.has(s.id));
  if (kurang.length) return fail(res, `Belum lengkap — kurang ${kurang.length} skin level`);
  await db.prepare('UPDATE players SET coins=coins+?, totalEarned=totalEarned+?, fullset_claimed=1 WHERE id=?').run(FULLSET_COINS, FULLSET_COINS, p.id);
  res.json({ ok: true, coins: (await freshPlayer(p.id)).coins, rupiah: 100000 });
}));

// --- Tapjoy Offerwall (web) -------------------------------------------------
// Config untuk client: apakah offerwall aktif + SDK key untuk deep link.
// SDK key memang diekspos ke client (sama seperti di aplikasi native —
// kuncinya tertanam di URL deep link, bukan rahasia server).
app.get('/api/tapjoy/config', (req, res) => {
  res.json({ ok: true, enabled: Boolean(TAPJOY_SDK_KEY), sdkKey: TAPJOY_SDK_KEY || null });
});
// Callback reward Tapjoy (server-to-server). Tapjoy mengirim HTTP GET:
//   /api/tapjoy/callback?snuid=<id_pemain>&currency=<koin>&mac_address=<mac>&id=<reward_id>&verifier=<md5>
// snuid = id numerik pemain game (sama dengan USER_ID di deep link).
// Respons HANYA 200 (koin dikredit) atau 403 (tolak, tanpa retry).
// Respons lain / lambat >5 detik = Tapjoy retry tiap 5 menit s/d 4 hari,
// jadi jangan pernah kredit koin kalau responsnya bukan 200.
app.get('/api/tapjoy/callback', ah(async (req, res) => {
  // Fail-closed: tanpa secret key, tidak ada callback yang bisa diverifikasi.
  if (!TAPJOY_SECRET_KEY) return err(res, 403, 'Tapjoy belum dikonfigurasi di server');
  // Pakai string mentah dari query untuk verifikasi (bukan hasil parse) —
  // Tapjoy menandatangani string persis yang dikirimnya.
  const snuidRaw = String(req.query.snuid || '');
  const currencyRaw = String(req.query.currency || '');
  const idRaw = String(req.query.id || '');
  const verifierRaw = String(req.query.verifier || '');
  // snuid harus id pemain numerik, tanpa leading zero ('001234' != '1234'
  // menurut dokumen Tapjoy — tolak bentuk itu sekalian).
  if (!/^\d+$/.test(snuidRaw) || String(Number(snuidRaw)) !== snuidRaw) return err(res, 403, 'snuid tidak valid');
  const playerId = Number(snuidRaw);
  if (!Number.isSafeInteger(playerId) || playerId <= 0) return err(res, 403, 'snuid tidak valid');
  if (!/^\d+$/.test(currencyRaw)) return err(res, 403, 'currency tidak valid');
  const coins = Number(currencyRaw);
  if (!Number.isSafeInteger(coins) || coins <= 0 || coins > TAPJOY_MAX_COINS_PER_CALLBACK) return err(res, 403, 'currency di luar batas wajar');
  if (!idRaw || idRaw.length > 190) return err(res, 403, 'id tidak valid');
  if (!verifierRaw) return err(res, 403, 'verifier tidak ada');
  const expected = crypto.createHash('md5').update(`${idRaw}:${snuidRaw}:${currencyRaw}:${TAPJOY_SECRET_KEY}`, 'utf8').digest('hex');
  let cocok = false;
  try {
    cocok = verifierRaw.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(verifierRaw.toLowerCase(), 'utf8'), Buffer.from(expected, 'utf8'));
  } catch { cocok = false; }
  if (!cocok) return err(res, 403, 'verifier tidak cocok — ditolak');
  const player = await db.prepare('SELECT id, banned FROM players WHERE id=?').get(playerId);
  if (!player) return err(res, 403, 'Pemain tidak ditemukan');
  if (player.banned) return err(res, 403, 'Akun pemain diblokir');
  // Dedup atomik via PRIMARY KEY: INSERT OR IGNORE — changes=0 berarti id
  // reward ini sudah diproses (replay/fraud) → tolak tanpa kredit ganda.
  const ins = await db.prepare('INSERT OR IGNORE INTO tapjoy_rewards(id,playerId,coins,createdAt) VALUES(?,?,?,?)')
    .run(idRaw, playerId, coins, nowIso());
  if (!ins.changes) return err(res, 403, 'Reward id sudah diproses');
  await touchCoins(playerId, coins);
  res.json({ ok: true, credited: coins, playerId });
}));

// --- Offerwall ---------------------------------------------------------------
app.get('/api/offers', ah(async (req, res) => {
  const playerId = await optionalPlayerId(req);
  const offers = await db.prepare('SELECT id,provider,title,"desc",partnerRp,rewardCoins FROM offers ORDER BY id').all();
  const rows = [];
  for (const o of offers) {
    let status = 'tersedia';
    if (playerId) {
      const prog = await db.prepare('SELECT status FROM offer_progress WHERE playerId=? AND offerId=?').get(playerId, o.id);
      if (prog) status = prog.status; // dimulai | menunggu_verifikasi | terverifikasi | selesai
    }
    rows.push({ ...o, status });
  }
  res.json({ ok: true, offers: rows });
}));
app.post('/api/offers/start', ah(requirePlayer), ah(async (req, res) => {
  const offerId = String(req.body?.offerId || '');
  const offer = await db.prepare('SELECT * FROM offers WHERE id=?').get(offerId);
  if (!offer) return fail(res, 'Misi offerwall tidak ditemukan');
  const existing = await db.prepare('SELECT * FROM offer_progress WHERE playerId=? AND offerId=?').get(req.player.id, offerId);
  if (existing) {
    if (existing.status === 'selesai') return fail(res, 'Misi sudah selesai');
    return res.json({ ok: true, token: existing.token, status: existing.status });
  }
  // Token rahasia per misi diterbitkan saat start; postback provider wajib
  // mengirim token ini kembali agar klaim dianggap terverifikasi.
  await db.prepare('INSERT INTO offer_progress(playerId,offerId,status,token,createdAt) VALUES(?,?,?,?,?)')
    .run(req.player.id, offerId, 'dimulai', offer.secret, nowIso());
  res.json({ ok: true, token: offer.secret, status: 'dimulai' });
}));
async function verifyOfferPostback(offerId, playerId, token) {
  const offer = await db.prepare('SELECT * FROM offers WHERE id=?').get(offerId);
  if (!offer) return { ok: false, status: 404, error: 'Misi offerwall tidak ditemukan' };
  if (!token || token !== offer.secret) return { ok: false, status: 403, error: 'Token postback salah — ditolak' };
  const prog = await db.prepare('SELECT * FROM offer_progress WHERE playerId=? AND offerId=?').get(playerId, offerId);
  if (!prog) return { ok: false, status: 400, error: 'Misi belum dimulai pemain ini' };
  if (prog.status === 'selesai') return { ok: false, status: 400, error: 'Misi sudah selesai/dibayar' };
  if (prog.status === 'terverifikasi') return { ok: true, already: true };
  await db.prepare("UPDATE offer_progress SET status='terverifikasi' WHERE id=?").run(prog.id);
  return { ok: true };
}
app.post('/api/offer-postback', ah(async (req, res) => {
  // Endpoint ini dipanggil SERVER provider offerwall (bukan pemain).
  // Di produksi, ganti/ lengkapi dengan verifikasi signature/API key resmi
  // tiap provider — token rahasia per misi di sini adalah verifikasi
  // minimal agar klaim tidak bisa dipalsukan dari client.
  const { offerId, playerId, token } = req.body || {};
  const r = await verifyOfferPostback(String(offerId || ''), Number(playerId), String(token || ''));
  if (!r.ok) return err(res, r.status, r.error);
  res.json({ ok: true, verified: true });
}));
app.post('/api/offers/demo-verify', ah(async (req, res) => {
  // DIMATIKAN 2026-11-26 (integrasi Tapjoy beneran): verifikasi misi hanya
  // lewat postback provider terverifikasi. Route dipertahankan supaya
  // client lama mendapat pesan jelas (410), bukan 404.
  return err(res, 410, 'Demo-verify sudah dimatikan — misi hanya bisa terverifikasi lewat postback provider (Tapjoy).');
}));
app.post('/api/offers/claim', ah(requirePlayer), ah(async (req, res) => {
  const offerId = String(req.body?.offerId || '');
  const offer = await db.prepare('SELECT * FROM offers WHERE id=?').get(offerId);
  if (!offer) return fail(res, 'Misi offerwall tidak ditemukan');
  const prog = await db.prepare('SELECT * FROM offer_progress WHERE playerId=? AND offerId=?').get(req.player.id, offerId);
  if (!prog) return fail(res, 'Misi belum dimulai');
  if (prog.status === 'selesai') return fail(res, 'Hadiah misi sudah diklaim');
  if (prog.status !== 'terverifikasi') return fail(res, 'Misi belum terverifikasi — selesaikan misi dan tunggu postback provider.');
  await db.prepare("UPDATE offer_progress SET status='selesai' WHERE id=?").run(prog.id);
  await touchCoins(req.player.id, offer.rewardCoins);
  res.json({ ok: true, coins: offer.rewardCoins, totalCoins: (await freshPlayer(req.player.id)).coins });
}));

// --- Mediasi iklan ---------------------------------------------------------------
// Konfigurasi AdMob untuk wrapper WebView (tahap 2): unit ID dibaca wrapper
// saat runtime — ganti unit cukup lewat env Railway, tanpa rebuild APK.
app.get('/api/ads/config', (req, res) => {
  res.json({ ok: true, admobAppId: ADMOB_APP_ID, rewardedUnitId: ADMOB_REWARDED_UNIT_ID, interstitialUnitId: ADMOB_INTERSTITIAL_UNIT_ID });
});
app.get('/api/ads/networks', (req, res) => {
  res.json({ ok: true, networks: NETWORKS });
});
app.post('/api/ads/impression', ah(async (req, res) => {
  const network = String(req.body?.network || '');
  const format = String(req.body?.format || '');
  const net = NETWORKS.find((n) => n.name === network);
  if (!net) return fail(res, 'Network tidak dikenal');
  if (!['banner', 'interstitial', 'rewarded'].includes(format)) return fail(res, 'Format harus banner | interstitial | rewarded');
  await db.prepare('INSERT INTO ad_impressions(network,format,ecpm,createdAt) VALUES(?,?,?,?)').run(network, format, net.ecpm, nowIso());
  res.json({ ok: true, network, format, ecpm: net.ecpm, estRevenueRp: estRevenueRp(1, net.ecpm) });
}));

// --- Admin ---------------------------------------------------------------
app.post('/api/admin/login', ah(async (req, res) => {
  const pin = String(req.body?.pin || '');
  const hashRow = await db.prepare("SELECT value FROM admin_settings WHERE key='adminPinHash'").get();
  const saltRow = await db.prepare("SELECT value FROM admin_settings WHERE key='adminPinSalt'").get();
  if (!hashRow || !saltRow) return err(res, 500, 'PIN admin belum di-seed');
  let okPin = false;
  try { okPin = verifyPin(pin, saltRow.value, hashRow.value); } catch { okPin = false; }
  if (!okPin) return err(res, 401, 'PIN admin salah');
  res.json({ ok: true, adminToken: makeToken('admin') });
}));
app.get('/api/admin/dashboard', requireAdmin, ah(async (req, res) => {
  const today = todayStr();
  const playersCount = (await db.prepare('SELECT COUNT(*) AS c FROM players').get()).c;
  const newToday = (await db.prepare("SELECT COUNT(*) AS c FROM players WHERE substr(createdAt,1,10)=?").get(today)).c;
  const coinsSum = (await db.prepare('SELECT COALESCE(SUM(coins),0) AS s FROM players').get()).s;
  const withdrawals = await db.prepare('SELECT w.id,w.playerId,w.amountRp,w.method,w.number,w.status,w.createdAt,p.name AS playerName FROM withdrawals w JOIN players p ON p.id=w.playerId ORDER BY w.createdAt DESC').all();
  const grouped = { Menunggu: [], Diproses: [], Selesai: [] };
  withdrawals.forEach((w) => { if (grouped[w.status]) grouped[w.status].push(w); });
  const players = await db.prepare('SELECT id,name,coins,maxLevel AS level,lastActive,ip,lastIp,banned FROM players ORDER BY lastActive DESC LIMIT 100').all();
  const sameIpRows = await db.prepare("SELECT ip, COUNT(*) AS c FROM players WHERE ip IS NOT NULL AND ip <> '' GROUP BY ip HAVING COUNT(*) > 1 ORDER BY c DESC").all();
  const sameIp = [];
  for (const g of sameIpRows) {
    const ps = await db.prepare('SELECT id,name,coins,createdAt FROM players WHERE ip=? ORDER BY createdAt').all(g.ip);
    sameIp.push({ ip: g.ip, count: g.c, players: ps });
  }
  const mediation = (await db.prepare('SELECT network, COUNT(*) AS impressions FROM ad_impressions GROUP BY network').all())
    .map((r) => {
      const net = NETWORKS.find((n) => n.name === r.network);
      return { network: r.network, impressions: r.impressions, estRevenueRp: estRevenueRp(r.impressions, net ? net.ecpm : 0) };
    });
  const offerwall = await db.prepare(
    `SELECT o.provider,
       COUNT(op.id) AS started,
       SUM(CASE WHEN op.status IN ('terverifikasi','selesai') THEN 1 ELSE 0 END) AS verified,
       SUM(CASE WHEN op.status='selesai' THEN 1 ELSE 0 END) AS paid
     FROM offers o LEFT JOIN offer_progress op ON op.offerId=o.id GROUP BY o.provider`
  ).all();
  const tapjoy = await db.prepare('SELECT COUNT(*) AS rewards, COALESCE(SUM(coins),0) AS coins FROM tapjoy_rewards').get();
  res.json({
    ok: true,
    totals: { players: playersCount, newToday, coinsCirculating: coinsSum, coinsCirculatingRp: coinsToRp(coinsSum) },
    withdrawals: grouped,
    players,
    sameIp,
    mediation,
    offerwall,
    tapjoy,
  });
}));
app.post('/api/admin/withdrawal', requireAdmin, ah(async (req, res) => {
  const id = Number(req.body?.id);
  const status = String(req.body?.status || '');
  if (!['Diproses', 'Selesai'].includes(status)) return fail(res, 'Status harus Diproses atau Selesai');
  const row = await db.prepare('SELECT * FROM withdrawals WHERE id=?').get(id);
  if (!row) return fail(res, 'Penarikan tidak ditemukan');
  await db.prepare('UPDATE withdrawals SET status=? WHERE id=?').run(status, id);
  res.json({ ok: true, withdrawal: { ...row, status } });
}));
app.post('/api/admin/unban', requireAdmin, ah(async (req, res) => {
  const id = Number(req.body?.id);
  if (!id) return fail(res, 'ID pemain tidak valid');
  const row = await db.prepare('SELECT * FROM players WHERE id=?').get(id);
  if (!row) return fail(res, 'Pemain tidak ditemukan');
  await db.prepare('UPDATE players SET banned=0, bannedReason=NULL WHERE id=?').run(id);
  res.json({ ok: true, id });
}));
app.post('/api/admin/change-pin', requireAdmin, ah(async (req, res) => {
  const oldPin = String(req.body?.oldPin || '');
  const newPin = String(req.body?.newPin || '');
  if (newPin.length < 4 || newPin.length > 12) return fail(res, 'PIN baru harus 4–12 karakter');
  const hashRow = await db.prepare("SELECT value FROM admin_settings WHERE key='adminPinHash'").get();
  const saltRow = await db.prepare("SELECT value FROM admin_settings WHERE key='adminPinSalt'").get();
  let okPin = false;
  try { okPin = verifyPin(oldPin, saltRow.value, hashRow.value); } catch { okPin = false; }
  if (!okPin) return fail(res, 'PIN lama salah');
  const { salt, hash } = hashPin(newPin);
  await db.prepare("UPDATE admin_settings SET value=? WHERE key='adminPinHash'").run(hash);
  await db.prepare("UPDATE admin_settings SET value=? WHERE key='adminPinSalt'").run(salt);
  res.json({ ok: true });
}));

// --- 404 & error ---------------------------------------------------------------
app.use((req, res) => res.status(404).json({ ok: false, error: 'Endpoint tidak ditemukan' }));
app.use((e, req, res, next) => {
  console.error(e);
  res.status(500).json({ ok: false, error: 'Kesalahan server' });
});

// Skema + seed (SQLite lokal atau Postgres) harus siap sebelum listen.
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Runner Coin backend jalan di port ${PORT}`);
    if (!process.env.OWNER_SECRET) console.warn('[PERINGATAN] OWNER_SECRET memakai default DEV — set di environment sebelum produksi!');
  });
}).catch((e) => {
  console.error('[FATAL] initDb gagal:', e);
  process.exit(1);
});
