// Tes hapus Skin Level (v26) — lanjutan penghapusan toko karakter Xbot di v25.
// Perintah Rans 2026-11-26 ~10:55 (membalikkan keputusan 10:53): hapus toko Xbot
// DAN Skin Level — "skin karakter juga xbot, udah ga guna".
// Memastikan: renderSkinLevel + #tokoSkin + panel tukar set lengkap hilang dari UI,
// LEVEL_SKINS dikosongkan, beli/pakai skin + klaim fullset ditolak 400 dengan
// pesan jelas, sementara karakter level (12 hewan) + power-up + tangga invite
// tetap jalan, dan skin tidak lagi diberikan otomatis saat naik level.
//
// Jalankan: node tests/test-hapus-skin-level.mjs
// (Menyalakan server lokal di port tes dengan DB SQLite temp — file DB temp
//  dihapus lagi setelah tes; TIDAK menyentuh lari-koin.db asli / Railway.)
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const serverJs = baca('server.js');
const dbJs = baca('db.js');
const app = baca('public/app.js');
const html = baca('public/index.html');
const sw = baca('public/sw.js');
const css = baca('public/style.css');

let lolos = 0, gagal = 0;
function cek(nama, ok, ekstra) {
  if (ok) { lolos++; console.log('  PASS ', nama); }
  else { gagal++; console.log('  GAGAL', nama, ekstra ? '— ' + ekstra : ''); }
}

// ---------- (1) Cek statis ----------
cek('(s1) app.js: renderSkinLevel sudah dihapus', !app.includes('function renderSkinLevel'));
cek('(s2) app.js: tidak ada lagi entri skin level (es..legenda)',
  !app.includes("id: 'es'") && !app.includes("id: 'sakura'") && !app.includes("id: 'legenda'") && !app.includes('LEVEL_SKINS = ['));
cek('(s3) app.js: klien tidak lagi memanggil /api/skins/fullset-claim', !app.includes('/api/skins/fullset-claim'));
cek('(s4) app.js: tidak ada lagi referensi tokoSkin / skinAktifNama',
  !app.includes('tokoSkin') && !app.includes('skinAktifNama') && !app.includes('namaKarakterSkinAktif'));
cek('(s5) app.js: label karakter aktif baru ada (namaKarakterAktif / karakterAktifNama)',
  app.includes('function namaKarakterAktif') && app.includes('karakterAktifNama'));
cek('(s6) index.html: wadah #tokoSkin + span skinAktifNama dihapus, grid hewan tetap',
  !html.includes('id="tokoSkin"') && !html.includes('skinAktifNama') && html.includes('id="karakterAktifNama"') && html.includes('id="tokoKarakterLevel"'));
cek('(s7) db.js: LEVEL_SKINS dikosongkan', /const LEVEL_SKINS = \[\];/.test(dbJs));
cek('(s8) server.js: grantLevelSkins sudah dihapus', !serverJs.includes('grantLevelSkins'));
cek('(s9) server.js: fullset-claim hanya menolak (tanpa FULLSET_COINS)',
  serverJs.includes("app.post('/api/skins/fullset-claim'") && serverJs.includes('hadiah tukar set lengkap tidak tersedia lagi') && !serverJs.includes('FULLSET_COINS'));
cek('(s10) server.js: penolakan "Skin Level sudah dihapus" ada di buy, equip, dan fullset',
  (serverJs.match(/Skin Level sudah dihapus/g) || []).length >= 3);
cek('(s11) sw.js: cache naik ke v27', sw.includes("CACHE = 'lari-koin-v27'"));
cek('(s12) style.css: .fullset-panel + #tokoSkin dihapus', !css.includes('.fullset-panel') && !css.includes('#tokoSkin'));
cek('(s13) app.js: tidak ada lagi skinsBaru (finish screen)', !app.includes('skinsBaru'));
cek('(s14) server.js: respons finish-level tidak lagi berisi skinsBaru', !serverJs.includes('skinsBaru'));
cek('(s15) app.js: karakter level + character/select + tangga invite tetap ada',
  app.includes('function renderKarakterLevel') && app.includes("api('/api/character/select'") && app.includes('INVITE_TIERS'));

// ---------- (2) Tes live: server lokal ----------
const TMP = mkdtempSync(join(tmpdir(), 'hapus-skin-level-test-'));
const DB_PATH = join(TMP, 'hapus-skin-level-test.db');
const OWNER_SECRET = 'hapus-skin-level-test-owner-secret';
const PORT = 3784;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProc = null;

function jalankanServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn('node', ['server.js'], {
      cwd: ROOT, stdio: 'ignore',
      env: { ...process.env, PORT: String(PORT), DB_PATH, OWNER_SECRET },
    });
    serverProc.on('error', reject);
    const batas = Date.now() + 15000;
    const tunggu = async () => {
      try { const r = await fetch(BASE + '/api/health'); if (r.ok) return resolve(); } catch {}
      if (Date.now() > batas) return reject(new Error('server tidak naik dalam 15 dtk'));
      setTimeout(tunggu, 250);
    };
    tunggu();
  });
}
function matikanServer() {
  return new Promise((res) => {
    if (!serverProc) return res();
    serverProc.once('exit', () => { serverProc = null; res(); });
    serverProc.kill('SIGTERM');
    setTimeout(() => { try { serverProc && serverProc.kill('SIGKILL'); } catch {} res(); }, 3000);
  });
}
const tokenUntuk = (id) => `${id}.${createHmac('sha256', OWNER_SECRET).update(String(id)).digest('hex')}`;
async function panggil(method, path, id, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokenUntuk(id) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, body: d };
}
async function profil(id) {
  const r = await panggil('GET', '/api/profile', id);
  return r.body.player || null;
}

try {
  await jalankanServer();
  const dbTes = new DatabaseSync(DB_PATH);
  dbTes.exec('PRAGMA busy_timeout = 5000;');
  const now = new Date().toISOString();
  // Pemain 1: koin 500.000, Lv 5, sudah punya karakter level char-01 + skin
  // level es (data lama — skin lama tetap tersimpan, tapi tidak bisa dipakai lagi).
  dbTes.prepare(
    'INSERT INTO players(id,name,pinHash,pinSalt,coins,totalAds,maxLevel,createdAt,lastActive) VALUES(?,?,?,?,?,?,?,?,?)'
  ).run(1, 'Pemain1', 'x', 'y', 500000, 0, 5, now, now);
  dbTes.prepare("UPDATE players SET levelChars=?, skins=?, characters=?, equipped=? WHERE id=?")
    .run('["char-01"]', '["es"]', '["jolly"]', '{"character":"char-01","skin":null}', 1);
  // Pemain 2: Lv 10, belum punya skin apa pun (uji: naik level tidak lagi memberi skin).
  dbTes.prepare(
    'INSERT INTO players(id,name,pinHash,pinSalt,coins,totalAds,maxLevel,createdAt,lastActive) VALUES(?,?,?,?,?,?,?,?,?)'
  ).run(2, 'Pemain2', 'x', 'y', 500000, 0, 10, now, now);
  const equippedDb = (id) => JSON.parse(dbTes.prepare('SELECT equipped FROM players WHERE id=?').get(id).equipped);

  // (L1) beli skin level es -> 400 pesan dihapus, koin tetap
  const rB1 = await panggil('POST', '/api/buy', 1, { kind: 'skin', id: 'es' });
  cek('(L1) beli skin es -> 400 Skin Level dihapus', rB1.status === 400 && /Skin Level sudah dihapus/.test(rB1.body.error || ''), 'status=' + rB1.status + ' err=' + rB1.body.error);
  // (L1b) beli skin toko lama astronot -> 400 pesan yang sama
  const rB2 = await panggil('POST', '/api/buy', 1, { kind: 'skin', id: 'astronot' });
  cek('(L1b) beli skin astronot -> 400 Skin Level dihapus', rB2.status === 400 && /Skin Level sudah dihapus/.test(rB2.body.error || ''), 'status=' + rB2.status);
  cek('(L1c) koin tetap 500.000 setelah beli ditolak', (await profil(1)).coins === 500000, 'coins=' + (await profil(1)).coins);

  // (L2) pakai skin level es (masih tersimpan di DB) -> 400 pesan dihapus
  const rEq = await panggil('POST', '/api/equip', 1, { kind: 'skin', id: 'es' });
  cek('(L2) pakai skin es -> 400 Skin Level dihapus', rEq.status === 400 && /Skin Level sudah dihapus/.test(rEq.body.error || ''), 'status=' + rEq.status);
  cek('(L2b) equipped.skin tetap null', equippedDb(1).skin === null, 'equipped=' + JSON.stringify(equippedDb(1)));

  // (L3) klaim fullset (pemain 1, 1 skin) -> 400 pesan fullset tidak tersedia
  const rFs1 = await panggil('POST', '/api/skins/fullset-claim', 1, {});
  cek('(L3) klaim fullset -> 400 tidak tersedia lagi', rFs1.status === 400 && /tidak tersedia lagi/.test(rFs1.body.error || ''), 'status=' + rFs1.status + ' err=' + rFs1.body.error);

  // (L4) klaim fullset pemain 3 (12 skin lengkap, data lama) -> tetap 400, koin tetap
  const SEMUA_SKIN = ['es', 'sakura', 'laut', 'hutan', 'senja', 'salju', 'lava', 'galaksi', 'madu', 'mint', 'komet', 'legenda'];
  dbTes.prepare(
    'INSERT INTO players(id,name,pinHash,pinSalt,coins,totalAds,maxLevel,createdAt,lastActive) VALUES(?,?,?,?,?,?,?,?,?)'
  ).run(3, 'Pemain3', 'x', 'y', 500, 0, 60, now, now);
  dbTes.prepare('UPDATE players SET skins=?, fullset_claimed=0 WHERE id=?').run(JSON.stringify(SEMUA_SKIN), 3);
  const rFs3 = await panggil('POST', '/api/skins/fullset-claim', 3, {});
  cek('(L4) klaim fullset 12 skin -> 400 tidak tersedia lagi', rFs3.status === 400 && /tidak tersedia lagi/.test(rFs3.body.error || ''), 'status=' + rFs3.status);
  cek('(L4b) koin pemain 3 tetap 500 (tidak +6.666.667)', (await profil(3)).coins === 500, 'coins=' + (await profil(3)).coins);

  // (L5) profil pemain 2 (Lv 10): tidak ada skin baru yang diberikan otomatis
  const p2 = await profil(2);
  cek('(L5) profil Lv 10: skins tetap [] (tidak ada grant otomatis)', Array.isArray(p2.skins) && p2.skins.length === 0, 'skins=' + JSON.stringify(p2.skins));
  cek('(L5b) profil Lv 10: karakter level char-02 tetap diberikan', Array.isArray(p2.levelChars) && p2.levelChars.includes('char-02'), 'levelChars=' + JSON.stringify(p2.levelChars));

  // (L6) pilih karakter level char-01 (dimiliki) -> 200 (hewan tetap jalan)
  const rSel = await panggil('POST', '/api/character/select', 1, { id: 'char-01' });
  cek('(L6) pilih karakter level char-01 -> 200', rSel.status === 200 && rSel.body.character && rSel.body.character.id === 'char-01', 'status=' + rSel.status);
  cek('(L6b) equipped.character tetap char-01', equippedDb(1).character === 'char-01');

  // (L7) pilih karakter level char-02 (belum terbuka) -> 400
  const rSel2 = await panggil('POST', '/api/character/select', 1, { id: 'char-02' });
  cek('(L7) pilih karakter level char-02 (belum terbuka) -> 400', rSel2.status === 400 && /belum terbuka/.test(rSel2.body.error || ''), 'status=' + rSel2.status + ' err=' + rSel2.body.error);

  // (L8) beli power-up magnet tetap jalan -> 200, koin 500.000 - 2.000
  const rPw = await panggil('POST', '/api/buy', 1, { kind: 'powerup', id: 'magnet' });
  cek('(L8) beli power-up magnet -> 200', rPw.status === 200 && rPw.body.count === 1, 'status=' + rPw.status);
  cek('(L8b) koin jadi 498.000', (await profil(1)).coins === 498000, 'coins=' + (await profil(1)).coins);

  dbTes.close();
  await matikanServer();
} catch (e) {
  gagal++;
  console.log('  GAGAL', 'tes live error:', e.message);
  try { await matikanServer(); } catch {}
} finally {
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
}

console.log(`\nHapus-skin-level: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
