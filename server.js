// server.js — Backend Lari Koin Online
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
  GIFT_CODES, REFERRAL_REWARD_COINS,
  NETWORKS, estRevenueRp,
  CHARACTERS, SKINS, POWERUPS,
  MISSION_POOL, ACHIEVEMENTS,
  publicPlayer, parseJson,
  getDailyState, todaysMissions, ensureMissionRows, addMissionProgress,
  achievementUnlocked, referralReady,
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

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
  await db.prepare('UPDATE players SET lastActive=? WHERE id=?').run(nowIso(), row.id);
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
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'lari-koin-online', time: nowIso() }));

// --- Register / Login -----------------------------------------------------
app.post('/api/register', ah(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const pin = String(req.body?.pin || '');
  const referrer = req.body?.referrer ? String(req.body.referrer).trim() : null;
  if (name.length < 2 || name.length > 30) return fail(res, 'Nama harus 2–30 karakter');
  if (pin.length < 4 || pin.length > 12) return fail(res, 'PIN harus 4–12 karakter');
  const exists = await db.prepare('SELECT id FROM players WHERE name=? COLLATE NOCASE').get(name);
  if (exists) return fail(res, 'Nama sudah dipakai, pilih nama lain');
  let referrerRow = null;
  if (referrer) {
    referrerRow = await db.prepare('SELECT * FROM players WHERE name=? COLLATE NOCASE').get(referrer);
    if (!referrerRow) return fail(res, 'Pengundang tidak ditemukan');
    if (referrerRow.name.toLowerCase() === name.toLowerCase()) return fail(res, 'Tidak bisa mengundang diri sendiri');
  }
  const { salt, hash } = hashPin(pin);
  const now = nowIso();
  const info = await db.prepare(
    `INSERT INTO players(name,pinHash,pinSalt,coins,maxLevel,characters,skins,equipped,powerups,
     streak,lastCheckin,referrer,totalEarned,totalAds,totalLevels,createdAt,lastActive)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(name, hash, salt, 500, 1, '["jolly"]', '[]', '{"character":"jolly","skin":null}', '{}',
    0, null, referrerRow ? referrerRow.name : null, 0, 0, 0, now, now);
  const playerId = info.lastInsertRowid;
  if (referrerRow) {
    await db.prepare('INSERT OR IGNORE INTO referrals(referrerId,friendId,status,createdAt) VALUES(?,?,?,?)')
      .run(referrerRow.id, playerId, 'pending', now);
  }
  const token = makeToken(playerId);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, path: '/' });
  res.json({ ok: true, token, player: publicPlayer(await freshPlayer(playerId)) });
}));

app.post('/api/login', ah(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const pin = String(req.body?.pin || '');
  if (!name || !pin) return fail(res, 'Nama dan PIN wajib diisi');
  const row = await db.prepare('SELECT * FROM players WHERE name=? COLLATE NOCASE').get(name);
  if (!row) return fail(res, 'Nama atau PIN salah');
  let okPin = false;
  try { okPin = verifyPin(pin, row.pinSalt, row.pinHash); } catch { okPin = false; }
  if (!okPin) return fail(res, 'Nama atau PIN salah');
  await db.prepare('UPDATE players SET lastActive=? WHERE id=?').run(nowIso(), row.id);
  const token = makeToken(row.id);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, path: '/' });
  res.json({ ok: true, token, player: publicPlayer(await freshPlayer(row.id)) });
}));

// --- Profile ---------------------------------------------------------------
app.get('/api/profile', ah(requirePlayer), ah(async (req, res) => {
  const p = await freshPlayer(req.player.id);
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
      withdrawals,
    },
  });
}));

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
  const isBoss = level % 10 === 0;
  const bonus = (100 + 15 * level) * (isBoss ? 5 : 1);
  const coinsEarned = runCoins + bonus;
  const newMaxLevel = Math.max(p.maxLevel, level + 1);
  await db.prepare('UPDATE players SET coins=coins+?, totalEarned=totalEarned+?, totalLevels=totalLevels+1, maxLevel=?, lastActive=? WHERE id=?')
    .run(coinsEarned, coinsEarned, newMaxLevel, nowIso(), p.id);
  const today = todayStr();
  await addMissionProgress(p.id, 'm_level3', 1, today);
  await addMissionProgress(p.id, 'm_coins500', coinsEarned, today);
  if (isBoss) await addMissionProgress(p.id, 'm_boss', 1, today);
  res.json({ ok: true, coinsEarned, bonus, isBoss, newMaxLevel, coins: (await freshPlayer(p.id)).coins });
}));

// --- Bank koin lari yang gagal (tanpa bonus level / buka level) -------------
app.post('/api/bank-run-coins', ah(requirePlayer), ah(async (req, res) => {
  const coins = Number(req.body?.coins);
  if (!Number.isInteger(coins) || coins < 0 || coins > 10000) return fail(res, 'coins tidak valid');
  if (coins > 0) {
    await touchCoins(req.player.id, coins);
    await addMissionProgress(req.player.id, 'm_coins500', coins, todayStr());
  }
  res.json({ ok: true, coins, totalCoins: (await freshPlayer(req.player.id)).coins });
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

// --- Referral ---------------------------------------------------------------
app.post('/api/referral/claim', ah(requirePlayer), ah(async (req, res) => {
  const friendId = Number(req.body?.friendId);
  if (!Number.isInteger(friendId)) return fail(res, 'friendId tidak valid');
  const row = await db.prepare('SELECT * FROM referrals WHERE referrerId=? AND friendId=?').get(req.player.id, friendId);
  if (!row) return fail(res, 'Teman tidak ditemukan di daftar referral kamu');
  if (row.status === 'claimed') return fail(res, 'Bonus teman ini sudah diklaim');
  const friend = await db.prepare('SELECT * FROM players WHERE id=?').get(friendId);
  if (!friend || !referralReady(friend)) {
    return fail(res, 'Belum memenuhi syarat: teman harus sudah nonton ≥1 iklan DAN menyelesaikan level 3');
  }
  await db.prepare("UPDATE referrals SET status='claimed' WHERE id=?").run(row.id);
  await touchCoins(req.player.id, REFERRAL_REWARD_COINS);
  res.json({ ok: true, coins: REFERRAL_REWARD_COINS, totalCoins: (await freshPlayer(req.player.id)).coins });
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
  if (!catalog || catalog[id] === undefined) return fail(res, 'Item tidak dikenal');
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
app.post('/api/offers/demo-verify', ah(requirePlayer), ah(async (req, res) => {
  // DEMO ONLY — simulasi: memanggil postback secara internal dengan token
  // yang benar, seolah provider mengonfirmasi penyelesaian misi.
  // Kampanye BENARAN butuh API key + postback asli dari pemilik ke tiap
  // provider (AdGem/Tapjoy/dll) — demo ini bukan pengganti integrasi itu.
  const offerId = String(req.body?.offerId || '');
  const secret = (await db.prepare('SELECT secret FROM offers WHERE id=?').get(offerId))?.secret || '';
  const r = await verifyOfferPostback(offerId, req.player.id, secret);
  if (!r.ok) return err(res, r.status, r.error);
  res.json({ ok: true, demo: true, note: 'Simulasi demo — misi ditandai terverifikasi seolah provider mengirim postback.' });
}));
app.post('/api/offers/claim', ah(requirePlayer), ah(async (req, res) => {
  const offerId = String(req.body?.offerId || '');
  const offer = await db.prepare('SELECT * FROM offers WHERE id=?').get(offerId);
  if (!offer) return fail(res, 'Misi offerwall tidak ditemukan');
  const prog = await db.prepare('SELECT * FROM offer_progress WHERE playerId=? AND offerId=?').get(req.player.id, offerId);
  if (!prog) return fail(res, 'Misi belum dimulai');
  if (prog.status === 'selesai') return fail(res, 'Hadiah misi sudah diklaim');
  if (prog.status !== 'terverifikasi') return fail(res, 'Misi belum terverifikasi — selesaikan misi dan tunggu postback provider (atau demo-verify untuk simulasi)');
  await db.prepare("UPDATE offer_progress SET status='selesai' WHERE id=?").run(prog.id);
  await touchCoins(req.player.id, offer.rewardCoins);
  res.json({ ok: true, coins: offer.rewardCoins, totalCoins: (await freshPlayer(req.player.id)).coins });
}));

// --- Mediasi iklan ---------------------------------------------------------------
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
  const players = await db.prepare('SELECT id,name,coins,maxLevel AS level,lastActive FROM players ORDER BY lastActive DESC LIMIT 100').all();
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
  res.json({
    ok: true,
    totals: { players: playersCount, newToday, coinsCirculating: coinsSum, coinsCirculatingRp: coinsToRp(coinsSum) },
    withdrawals: grouped,
    players,
    mediation,
    offerwall,
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
    console.log(`Lari Koin Online backend jalan di port ${PORT}`);
    if (!process.env.OWNER_SECRET) console.warn('[PERINGATAN] OWNER_SECRET memakai default DEV — set di environment sebelum produksi!');
  });
}).catch((e) => {
  console.error('[FATAL] initDb gagal:', e);
  process.exit(1);
});
