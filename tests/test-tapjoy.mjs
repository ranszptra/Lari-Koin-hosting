// Tes integrasi Tapjoy Offerwall (web) — v17 (cache naik karena perbaikan showcase + rintangan).
// Memastikan: deep link Tapjoy di client, endpoint config, callback GET
// Tapjoy terverifikasi MD5 (id:snuid:currency:secret_key), dedup id reward,
// fail-closed tanpa secret, dan demo-verify MATI (410).
//
// Vektor MD5 di bawah dihitung INDEPENDEN lewat shell `md5sum` (bukan dari
// kode server), jadi tes ini benar-benar memeriksa rumus verifier Tapjoy:
//   MD5("tj-test-001:42:500000:test-secret-key") = 375cd5bcfa1c744e3b99510f38ee96f1
//   MD5("tj-test-002:9999:1000:test-secret-key") = 47b2daf771e0470e566c1f0e3eaa63c1
//   MD5("tj-test-003:0042:1000:test-secret-key") = 514271c2639552475cfc39bbacbfeaf2
//
// Jalankan: node tests/test-tapjoy.mjs
// (Menyalakan server lokal di port tes dengan DB SQLite temp — file DB temp
//  dihapus lagi setelah tes; TIDAK menyentuh lari-koin.db asli / Railway.)
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const serverJs = baca('server.js');
const dbJs = baca('db.js');
const schemaSql = baca('supabase-schema.sql');
const app = baca('public/app.js');
const html = baca('public/index.html');
const sw = baca('public/sw.js');

let lolos = 0, gagal = 0;
function cek(nama, ok, ekstra) {
  if (ok) { lolos++; console.log('  PASS ', nama); }
  else { gagal++; console.log('  GAGAL', nama, ekstra ? '— ' + ekstra : ''); }
}

// ---------- (1) Cek statis: kode integrasi ada ----------
cek('(s1) server.js: env TAPJOY_SDK_KEY dibaca', serverJs.includes('process.env.TAPJOY_SDK_KEY'));
cek('(s2) server.js: env TAPJOY_SECRET_KEY dibaca', serverJs.includes('process.env.TAPJOY_SECRET_KEY'));
cek('(s3) server.js: GET /api/tapjoy/config ada', serverJs.includes("app.get('/api/tapjoy/config'"));
cek('(s4) server.js: GET /api/tapjoy/callback ada', serverJs.includes("app.get('/api/tapjoy/callback'"));
cek('(s5) server.js: verifier MD5 id:snuid:currency:secret', serverJs.includes("crypto.createHash('md5').update(`${idRaw}:${snuidRaw}:${currencyRaw}:${TAPJOY_SECRET_KEY}`"));
cek('(s6) server.js: perbandingan verifier timing-safe', serverJs.includes('crypto.timingSafeEqual'));
cek('(s7) server.js: dedup INSERT OR IGNORE tapjoy_rewards', serverJs.includes('INSERT OR IGNORE INTO tapjoy_rewards'));
cek('(s8) server.js: demo-verify mengembalikan 410', /demo-verify[\s\S]{0,400}410/.test(serverJs));
cek('(s9) server.js: callback hanya balas 200/403 (komentar)', serverJs.includes('Respons HANYA 200 (koin dikredit) atau 403'));
cek('(s10) db.js: tabel tapjoy_rewards di SQLITE_DDL', dbJs.includes('CREATE TABLE IF NOT EXISTS tapjoy_rewards'));
cek('(s11) supabase-schema.sql: tabel tapjoy_rewards ada', schemaSql.includes('CREATE TABLE IF NOT EXISTS tapjoy_rewards'));
cek('(s12) app.js: deep link rewards.unity.com/owp/web/link', app.includes('https://rewards.unity.com/owp/web/link/'));
cek('(s13) app.js: USER_ID deep link = id numerik pemain', app.includes("encodeURIComponent(String(profile.id))"));
cek('(s14) app.js: bukaTapjoyOfferwall cek config dulu', app.includes("api('/api/tapjoy/config')"));
cek('(s15) app.js: refresh saldo saat kembali ke tab (visibilitychange)', app.includes("document.addEventListener('visibilitychange'"));
cek('(s16) app.js: tombol demo-verify sudah dihapus', !app.includes('demo-verify'));
cek('(s17) index.html: kartu Tapjoy + tombol #btnTapjoy ada', html.includes('id="tapjoyCard"') && html.includes('id="btnTapjoy"'));
cek('(s18) sw.js: cache naik ke v27 (app.js berubah)', sw.includes("CACHE = 'lari-koin-v27'"));

// ---------- (2) Rumus verifier: MD5 node vs vektor md5sum independen ----------
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
cek('(v1) MD5 tj-test-001:42:500000 cocok dengan md5sum', md5('tj-test-001:42:500000:test-secret-key') === '375cd5bcfa1c744e3b99510f38ee96f1');
cek('(v2) MD5 tj-test-002:9999:1000 cocok dengan md5sum', md5('tj-test-002:9999:1000:test-secret-key') === '47b2daf771e0470e566c1f0e3eaa63c1');
cek('(v3) MD5 tj-test-003:0042:1000 cocok dengan md5sum', md5('tj-test-003:0042:1000:test-secret-key') === '514271c2639552475cfc39bbacbfeaf2');

// ---------- (3) Tes live: server lokal + callback beneran ----------
const TMP = mkdtempSync(join(tmpdir(), 'tapjoy-test-'));
const DB_PATH = join(TMP, 'tapjoy-test.db');
const OWNER_SECRET = 'test-owner-secret';
const TAPJOY_SECRET = 'test-secret-key';
const TAPJOY_SDK = 'test-sdk-key-123';
const PORT = 3781;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProc = null;

function jalankanServer(envTambahan) {
  return new Promise((resolve, reject) => {
    serverProc = spawn('node', ['server.js'], {
      cwd: ROOT, stdio: 'ignore',
      env: { ...process.env, PORT: String(PORT), DB_PATH, OWNER_SECRET, ...envTambahan },
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
async function koinPemain(id) {
  const r = await fetch(BASE + '/api/profile', { headers: { Authorization: 'Bearer ' + tokenUntuk(id) } });
  const d = await r.json();
  return d.player ? d.player.coins : null;
}
async function callbackTapjoy(params) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(BASE + '/api/tapjoy/callback?' + q);
  const d = await r.json().catch(() => ({}));
  return { status: r.status, body: d };
}

try {
  await jalankanServer({ TAPJOY_SDK_KEY: TAPJOY_SDK, TAPJOY_SECRET_KEY: TAPJOY_SECRET });
  // Sisipkan pemain tes id 42 langsung ke DB temp (server sudah init skema).
  const dbTes = new DatabaseSync(DB_PATH);
  dbTes.exec('PRAGMA busy_timeout = 5000;');
  dbTes.prepare('INSERT INTO players(id,name,pinHash,pinSalt,createdAt,lastActive) VALUES(?,?,?,?,?,?)')
    .run(42, 'TesTapjoy', 'x', 'y', new Date().toISOString(), new Date().toISOString());
  const pemain = dbTes.prepare('SELECT id, coins FROM players WHERE name=?').get('TesTapjoy');
  cek('(L0) pemain tes id 42 dibuat di DB temp', pemain && pemain.id === 42, 'id=' + (pemain && pemain.id));
  const koinAwal = await koinPemain(42);
  cek('(L0b) saldo awal pemain 500 koin', koinAwal === 500, 'koin=' + koinAwal);

  // (L1) config: aktif + SDK key tampil
  const cfg = await (await fetch(BASE + '/api/tapjoy/config')).json();
  cek('(L1) /api/tapjoy/config enabled + sdkKey', cfg.enabled === true && cfg.sdkKey === TAPJOY_SDK);

  // (L2) callback valid (vektor md5sum independen) → 200 + kredit 500.000
  const r2 = await callbackTapjoy({ snuid: '42', currency: '500000', id: 'tj-test-001', verifier: '375cd5bcfa1c744e3b99510f38ee96f1' });
  cek('(L2) callback valid → 200 + credited 500000', r2.status === 200 && r2.body.credited === 500000, 'status=' + r2.status);
  cek('(L2b) saldo pemain bertambah 500.000', (await koinPemain(42)) === 500500, 'koin=' + (await koinPemain(42)));

  // (L3) replay id yang sama → 403, saldo tetap (anti double-credit)
  const r3 = await callbackTapjoy({ snuid: '42', currency: '500000', id: 'tj-test-001', verifier: '375cd5bcfa1c744e3b99510f38ee96f1' });
  cek('(L3) replay id sama → 403', r3.status === 403, 'status=' + r3.status);
  cek('(L3b) saldo tetap 500.500 setelah replay', (await koinPemain(42)) === 500500);

  // (L4) verifier salah → 403, saldo tetap
  const r4 = await callbackTapjoy({ snuid: '42', currency: '500000', id: 'tj-test-009', verifier: '00000000000000000000000000000000' });
  cek('(L4) verifier salah → 403', r4.status === 403, 'status=' + r4.status);
  cek('(L4b) saldo tetap setelah verifier salah', (await koinPemain(42)) === 500500);

  // (L5) pemain tidak dikenal (tanda tangan valid untuk snuid itu) → 403
  const r5 = await callbackTapjoy({ snuid: '9999', currency: '1000', id: 'tj-test-002', verifier: '47b2daf771e0470e566c1f0e3eaa63c1' });
  cek('(L5) snuid pemain tak dikenal → 403', r5.status === 403, 'status=' + r5.status);

  // (L6) snuid leading zero '0042' (tanda tangan valid untuk string itu) → 403
  const r6 = await callbackTapjoy({ snuid: '0042', currency: '1000', id: 'tj-test-003', verifier: '514271c2639552475cfc39bbacbfeaf2' });
  cek('(L6) snuid leading-zero 0042 → 403', r6.status === 403, 'status=' + r6.status);

  // (L7) currency tidak valid → 403 (nol, negatif, bukan angka, di atas batas)
  for (const [label, cur] of [['nol', '0'], ['negatif', '-5'], ['bukan-angka', 'abc'], ['di-atas-batas', '100000001']]) {
    const v = md5(`tj-x:${'42'}:${cur}:${TAPJOY_SECRET}`);
    const r = await callbackTapjoy({ snuid: '42', currency: cur, id: 'tj-x-' + label, verifier: v });
    cek(`(L7-${label}) currency=${cur} → 403`, r.status === 403, 'status=' + r.status);
  }
  cek('(L7b) saldo tetap setelah semua currency invalid', (await koinPemain(42)) === 500500);

  // (L8) tanpa verifier → 403
  const r8 = await callbackTapjoy({ snuid: '42', currency: '1000', id: 'tj-test-010' });
  cek('(L8) tanpa verifier → 403', r8.status === 403, 'status=' + r8.status);

  // (L9) demo-verify MATI → 410 (bukan 200, bukan 404)
  const r9 = await fetch(BASE + '/api/offers/demo-verify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokenUntuk(42) }, body: JSON.stringify({ offerId: 'offer_01' }) });
  cek('(L9) POST /api/offers/demo-verify → 410', r9.status === 410, 'status=' + r9.status);

  // (L10) admin dashboard memuat statistik tapjoy (butuh token admin)
  const tokenAdmin = `admin.${createHmac('sha256', OWNER_SECRET).update('admin').digest('hex')}`;
  const dash = await (await fetch(BASE + '/api/admin/dashboard', { headers: { Authorization: 'Bearer ' + tokenAdmin } })).json();
  cek('(L10) admin dashboard: tapjoy.rewards=1, coins=500000', dash.tapjoy && dash.tapjoy.rewards === 1 && dash.tapjoy.coins === 500000, JSON.stringify(dash.tapjoy));

  dbTes.close();
  await matikanServer();

  // (L11) Fail-closed: server TANPA TAPJOY_SECRET_KEY menolak semua callback (403)
  await jalankanServer({ TAPJOY_SDK_KEY: TAPJOY_SDK });
  const r11 = await callbackTapjoy({ snuid: '42', currency: '500000', id: 'tj-test-001', verifier: '375cd5bcfa1c744e3b99510f38ee96f1' });
  cek('(L11) tanpa TAPJOY_SECRET_KEY → callback 403 (fail-closed)', r11.status === 403, 'status=' + r11.status);
  const cfg11 = await (await fetch(BASE + '/api/tapjoy/config')).json();
  cek('(L11b) config tetap enabled (SDK key ada) walau secret kosong', cfg11.enabled === true);
  await matikanServer();
} catch (e) {
  gagal++;
  console.log('  GAGAL', 'tes live error:', e.message);
  try { await matikanServer(); } catch {}
} finally {
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
}

console.log(`\nTapjoy: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
