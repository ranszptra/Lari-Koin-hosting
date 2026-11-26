// Tes hapus toko karakter Xbot lama (v25) — lanjutan penghapusan toko skin di v24.
// Memastikan: beli/pakai karakter toko lama (jolly/kiko/momo/rex) ditolak 400
// dengan pesan jelas, sementara karakter level (12 hewan) + skin level +
// power-up tetap jalan, dan tidak ada referensi toko karakter tersisa.
//
// Jalankan: node tests/test-hapus-toko-karakter.mjs
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

let lolos = 0, gagal = 0;
function cek(nama, ok, ekstra) {
  if (ok) { lolos++; console.log('  PASS ', nama); }
  else { gagal++; console.log('  GAGAL', nama, ekstra ? '— ' + ekstra : ''); }
}

// ---------- (1) Cek statis ----------
cek('(s1) app.js: KATALOG.character sudah dihapus', !app.includes('KATALOG.character'));
cek('(s2) app.js: renderTokoBagian character sudah dihapus', !app.includes("renderTokoBagian('character'"));
cek('(s3) app.js: entri Xbot Hijau/Pink/Api sudah dihapus',
  !app.includes("nama: 'Xbot Hijau'") && !app.includes("nama: 'Xbot Pink'") && !app.includes("nama: 'Xbot Api'"));
cek('(s4) app.js: grid karakter level + /api/character/select tetap ada',
  app.includes('function renderKarakterLevel') && app.includes("api('/api/character/select'"));
cek('(s5) app.js: label fallback nama karakter lama tetap ada', app.includes('NAMA_KARAKTER_LAMA'));
cek('(s6) index.html: wadah #tokoKarakter + judul Karakter dihapus, grid level tetap',
  !html.includes('id="tokoKarakter"') && !html.includes('<h3>Karakter</h3>') && html.includes('id="tokoKarakterLevel"'));
cek('(s7) db.js: CHARACTERS toko dikosongkan', /const CHARACTERS = \{\};/.test(dbJs));
cek('(s8) server.js: /api/buy tolak karakter toko', serverJs.includes("Toko karakter sudah dihapus"));
cek('(s9) server.js: penolakan karakter ada di buy DAN equip',
  (serverJs.match(/Toko karakter sudah dihapus/g) || []).length >= 2);
cek('(s10) server.js: /api/character/select tetap ada', serverJs.includes("app.post('/api/character/select'"));
cek('(s11) sw.js: cache naik ke v25', sw.includes("CACHE = 'lari-koin-v25'"));
cek('(s12) app.js: renderTokoBagian power-up tetap ada', app.includes("renderTokoBagian('powerup'"));
cek('(s13) app.js: skin level + fullset tetap ada (tidak ikut dihapus)',
  app.includes('function renderSkinLevel') && app.includes('/api/skins/fullset-claim'));
cek('(s14) server.js: endpoint fullset-claim tetap ada (tidak ikut dihapus)',
  serverJs.includes("app.post('/api/skins/fullset-claim'") && serverJs.includes('FULLSET_COINS'));
cek('(s15) db.js: LEVEL_SKINS 12 skin level tetap ada',
  dbJs.includes("id: 'es'") && dbJs.includes("id: 'legenda'") && dbJs.includes('const LEVEL_SKINS'));

// ---------- (2) Tes live: server lokal ----------
const TMP = mkdtempSync(join(tmpdir(), 'hapus-toko-karakter-test-'));
const DB_PATH = join(TMP, 'hapus-toko-karakter-test.db');
const OWNER_SECRET = 'hapus-toko-karakter-test-owner-secret';
const PORT = 3783;
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
  // Pemain 1: koin 500.000, sudah punya karakter level char-01 + skin level es
  // + karakter toko lama jolly (simulasi pemain lama).
  dbTes.prepare(
    'INSERT INTO players(id,name,pinHash,pinSalt,coins,totalAds,maxLevel,createdAt,lastActive) VALUES(?,?,?,?,?,?,?,?,?)'
  ).run(1, 'Pemain1', 'x', 'y', 500000, 0, 5, now, now);
  dbTes.prepare("UPDATE players SET levelChars=?, skins=?, characters=?, equipped=? WHERE id=?")
    .run('["char-01"]', '["es"]', '["jolly"]', '{"character":"char-01","skin":null}', 1);
  // Pemain 2: belum buka karakter level apa pun.
  dbTes.prepare(
    'INSERT INTO players(id,name,pinHash,pinSalt,coins,totalAds,maxLevel,createdAt,lastActive) VALUES(?,?,?,?,?,?,?,?,?)'
  ).run(2, 'Pemain2', 'x', 'y', 500000, 0, 1, now, now);
  const equippedDb = (id) => JSON.parse(dbTes.prepare('SELECT equipped FROM players WHERE id=?').get(id).equipped);

  // (L1) beli karakter toko lama -> 400 pesan dihapus, koin tetap
  for (const idKar of ['kiko', 'momo', 'rex']) {
    const r = await panggil('POST', '/api/buy', 1, { kind: 'character', id: idKar });
    cek(`(L1) beli ${idKar} -> 400 toko karakter dihapus`, r.status === 400 && /Toko karakter sudah dihapus/.test(r.body.error || ''), 'status=' + r.status + ' err=' + r.body.error);
  }
  const rJolly = await panggil('POST', '/api/buy', 1, { kind: 'character', id: 'jolly' });
  cek('(L1b) beli jolly (harga 0 / sudah dimiliki) -> 400 toko karakter dihapus', rJolly.status === 400 && /Toko karakter sudah dihapus/.test(rJolly.body.error || ''), 'status=' + rJolly.status);
  cek('(L1c) koin tetap 500.000 setelah beli ditolak', (await profil(1)).coins === 500000, 'coins=' + (await profil(1)).coins);

  // (L2) pakai karakter toko lama -> 400 pesan dihapus
  const rEq1 = await panggil('POST', '/api/equip', 1, { kind: 'character', id: 'kiko' });
  cek('(L2) pakai kiko -> 400 toko karakter dihapus', rEq1.status === 400 && /Toko karakter sudah dihapus/.test(rEq1.body.error || ''), 'status=' + rEq1.status);
  const rEq2 = await panggil('POST', '/api/equip', 1, { kind: 'character', id: 'jolly' });
  cek('(L2b) pakai jolly -> 400 toko karakter dihapus', rEq2.status === 400 && /Toko karakter sudah dihapus/.test(rEq2.body.error || ''), 'status=' + rEq2.status);
  cek('(L2c) equipped.character tetap char-01', equippedDb(1).character === 'char-01', 'equipped=' + JSON.stringify(equippedDb(1)));

  // (L3) pakai skin level es (dimiliki) -> 200
  const rEs = await panggil('POST', '/api/equip', 1, { kind: 'skin', id: 'es' });
  cek('(L3) pakai skin level es -> 200', rEs.status === 200, 'status=' + rEs.status + ' err=' + rEs.body.error);
  cek('(L3b) equipped.skin jadi es', equippedDb(1).skin === 'es', 'equipped=' + JSON.stringify(equippedDb(1)));

  // (L4) pilih karakter level char-01 (dimiliki) -> 200
  const rSel = await panggil('POST', '/api/character/select', 1, { id: 'char-01' });
  cek('(L4) pilih karakter level char-01 -> 200', rSel.status === 200 && rSel.body.character && rSel.body.character.id === 'char-01', 'status=' + rSel.status);
  cek('(L4b) equipped.character tetap char-01', equippedDb(1).character === 'char-01');

  // (L5) pilih karakter level char-02 (belum terbuka) -> 400
  const rSel2 = await panggil('POST', '/api/character/select', 1, { id: 'char-02' });
  cek('(L5) pilih karakter level char-02 (belum terbuka) -> 400', rSel2.status === 400 && /belum terbuka/.test(rSel2.body.error || ''), 'status=' + rSel2.status + ' err=' + rSel2.body.error);

  // (L6) beli power-up magnet tetap jalan -> 200, koin 500.000 - 2.000
  const rPw = await panggil('POST', '/api/buy', 1, { kind: 'powerup', id: 'magnet' });
  cek('(L6) beli power-up magnet -> 200', rPw.status === 200 && rPw.body.count === 1, 'status=' + rPw.status);
  cek('(L6b) koin jadi 498.000', (await profil(1)).coins === 498000, 'coins=' + (await profil(1)).coins);

  // (L7) beli kind tidak dikenal -> 400 (sanity: penolakan umum tetap jalan)
  const rUnk = await panggil('POST', '/api/buy', 1, { kind: 'alien', id: 'x' });
  cek('(L7) beli kind alien -> 400 Item tidak dikenal', rUnk.status === 400 && /tidak dikenal/.test(rUnk.body.error || ''), 'status=' + rUnk.status);

  // (L8) KOREKSI Rans: skin level + klaim fullset TETAP jalan normal (tidak dihapus).
  // Pemain 3: 12 skin level lengkap -> klaim fullset ok +6.666.667 koin; klaim ulang ditolak.
  const SEMUA_SKIN = ['es', 'sakura', 'laut', 'hutan', 'senja', 'salju', 'lava', 'galaksi', 'madu', 'mint', 'komet', 'legenda'];
  dbTes.prepare(
    'INSERT INTO players(id,name,pinHash,pinSalt,coins,totalAds,maxLevel,createdAt,lastActive) VALUES(?,?,?,?,?,?,?,?,?)'
  ).run(3, 'Pemain3', 'x', 'y', 500, 0, 60, now, now);
  dbTes.prepare('UPDATE players SET skins=?, fullset_claimed=0 WHERE id=?').run(JSON.stringify(SEMUA_SKIN), 3);
  const rFs = await panggil('POST', '/api/skins/fullset-claim', 3, {});
  cek('(L8) klaim fullset 12 skin -> 200 +6666667', rFs.status === 200 && rFs.body.coins === 6667167, 'status=' + rFs.status + ' coins=' + rFs.body.coins);
  cek('(L8b) saldo pemain 3 jadi 6.667.167', (await profil(3)).coins === 6667167, 'coins=' + (await profil(3)).coins);
  const rFs2 = await panggil('POST', '/api/skins/fullset-claim', 3, {});
  cek('(L8c) klaim fullset ulang -> 400 sudah ditukar', rFs2.status === 400 && /sudah ditukar/.test(rFs2.body.error || ''), 'status=' + rFs2.status + ' err=' + rFs2.body.error);
  cek('(L8d) saldo tetap setelah klaim ulang', (await profil(3)).coins === 6667167);
  // Pemain 4: baru 11 skin -> klaim ditolak, koin tetap.
  dbTes.prepare(
    'INSERT INTO players(id,name,pinHash,pinSalt,coins,totalAds,maxLevel,createdAt,lastActive) VALUES(?,?,?,?,?,?,?,?,?)'
  ).run(4, 'Pemain4', 'x', 'y', 500, 0, 60, now, now);
  dbTes.prepare('UPDATE players SET skins=?, fullset_claimed=0 WHERE id=?').run(JSON.stringify(SEMUA_SKIN.slice(0, 11)), 4);
  const rFs3 = await panggil('POST', '/api/skins/fullset-claim', 4, {});
  cek('(L8e) klaim fullset 11 skin -> 400 Belum lengkap', rFs3.status === 400 && /Belum lengkap/.test(rFs3.body.error || ''), 'status=' + rFs3.status + ' err=' + rFs3.body.error);
  cek('(L8f) koin pemain 4 tetap 500', (await profil(4)).coins === 500);

  dbTes.close();
  await matikanServer();
} catch (e) {
  gagal++;
  console.log('  GAGAL', 'tes live error:', e.message);
  try { await matikanServer(); } catch {}
} finally {
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
}

console.log(`\nHapus-toko-karakter: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
