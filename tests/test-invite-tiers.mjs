// Tes tangga hadiah undang teman (v24) — menggantikan toko skin + bonus lama Rp5.000/teman.
// Memastikan: syarat terkualifikasi (10 iklan + level 5), ambang tiap tingkat,
// klaim ganda ditolak, klaim sebelum ambang ditolak, endpoint lama menolak dengan
// pesan jelas, beli/pakai skin ditolak (v26: skin level juga dihapus).
//
// Jalankan: node tests/test-invite-tiers.mjs
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
const schemaSql = baca('supabase-schema.sql');
const app = baca('public/app.js');
const html = baca('public/index.html');
const sw = baca('public/sw.js');

let lolos = 0, gagal = 0;
function cek(nama, ok, ekstra) {
  if (ok) { lolos++; console.log('  PASS ', nama); }
  else { gagal++; console.log('  GAGAL', nama, ekstra ? '— ' + ekstra : ''); }
}

// ---------- (1) Cek statis ----------
cek('(s1) db.js: referralReady syarat 10 iklan + level 5', dbJs.includes('friend.totalAds >= 10 && friend.maxLevel >= 5'));
cek('(s2) db.js: INVITE_TIERS 3/5/10/20/50/100 dengan Rp benar',
  dbJs.includes('{ tier: 3, rp: 5000') && dbJs.includes('{ tier: 5, rp: 10000') &&
  dbJs.includes('{ tier: 10, rp: 30000') && dbJs.includes('{ tier: 20, rp: 50000') &&
  dbJs.includes('{ tier: 50, rp: 150000') && dbJs.includes('{ tier: 100, rp: 250000'));
cek('(s3) db.js: tabel invite_tier_claims di SQLITE_DDL', dbJs.includes('CREATE TABLE IF NOT EXISTS invite_tier_claims'));
cek('(s4) supabase-schema.sql: tabel invite_tier_claims ada', schemaSql.includes('CREATE TABLE IF NOT EXISTS invite_tier_claims'));
cek('(s5) db.js: SKINS toko dikosongkan', /const SKINS = \{\};/.test(dbJs));
cek('(s6) server.js: POST /api/referral/tier-claim ada', serverJs.includes("app.post('/api/referral/tier-claim'"));
cek('(s7) server.js: tier-claim dedup INSERT OR IGNORE invite_tier_claims', serverJs.includes('INSERT OR IGNORE INTO invite_tier_claims'));
cek('(s8) server.js: endpoint lama /api/referral/claim beri pesan pengganti', /referral\/claim[\s\S]{0,600}diganti sistem tingkat invite/.test(serverJs));
cek('(s9) server.js: /api/buy tolak skin (pesan v26)', serverJs.includes('Skin Level sudah dihapus'));
cek('(s10) server.js: profil kembalikan inviteTiers (qualified + claimed)', serverJs.includes('inviteTiers: { qualified: qualifiedReferrals'));
cek('(s11) app.js: KATALOG.skin sudah dihapus', !app.includes('KATALOG.skin') && !app.includes("id: 'emas', nama: 'Emas'"));
cek('(s12) app.js: renderTokoBagian skin toko sudah dihapus', !app.includes("renderTokoBagian('skin'"));
cek('(s13) app.js: tangga INVITE_TIERS ada (cermin db.js)', app.includes("tier: 100, rp: 250000, coins: 16666667"));
cek('(s14) app.js: renderInviteTiers + klaim tier-claim', app.includes('function renderInviteTiers') && app.includes("api('/api/referral/tier-claim'"));
cek('(s15) app.js: tidak ada lagi tombol Klaim Rp5.000 per teman', !app.includes("Klaim Rp5.000"));
cek('(s16) app.js: teks tour invite menyebut syarat 10 iklan + level 5', app.includes('nonton 10 iklan dan mencapai level 5'));
cek('(s17) index.html: wadah #tanggaInvite ada', html.includes('id="tanggaInvite"'));
cek('(s18) index.html: judul Undang Teman baru (tanpa Bonus Rp5.000)', !html.includes('Undang Teman — Bonus Rp5.000') && html.includes('Hadiah sampai Rp250.000'));
cek('(s19) index.html: notice beranda tanpa Rp5.000 per teman', !html.includes('Undang teman dapat Rp5.000 per teman'));
cek('(s20) v26: index.html div #tokoSkin dihapus', !html.includes('<h3>Skin Karakter</h3>') && !html.includes('id="tokoSkin"'));
cek('(s21) sw.js: cache naik ke v27', sw.includes("CACHE = 'lari-koin-v27'"));
cek('(s22) v26: app.js skin level + fullset sudah dihapus', !app.includes('function renderSkinLevel') && !app.includes('/api/skins/fullset-claim'));

// ---------- (2) Tes live: server lokal + klaim tingkat beneran ----------
const TMP = mkdtempSync(join(tmpdir(), 'invite-tiers-test-'));
const DB_PATH = join(TMP, 'invite-tiers-test.db');
const OWNER_SECRET = 'invite-tiers-test-owner-secret';
const PORT = 3782;
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
  const buatPemain = (id, name, totalAds, maxLevel) => dbTes.prepare(
    'INSERT INTO players(id,name,pinHash,pinSalt,coins,totalAds,maxLevel,createdAt,lastActive) VALUES(?,?,?,?,?,?,?,?,?)'
  ).run(id, name, 'x', 'y', 500, totalAds, maxLevel, now, now);
  const undang = (referrerId, friendId, status) => dbTes.prepare(
    'INSERT INTO referrals(referrerId,friendId,status,createdAt) VALUES(?,?,?,?)'
  ).run(referrerId, friendId, status, now);

  // Pengundang id 1 + teman-teman dengan profil berbeda.
  buatPemain(1, 'Pengundang', 0, 1);
  buatPemain(2, 'TemanA', 10, 5);   // terkualifikasi (pas ambang)
  buatPemain(3, 'TemanB', 10, 4);   // TIDAK: level 4
  buatPemain(4, 'TemanC', 9, 5);    // TIDAK: baru 9 iklan
  buatPemain(5, 'TemanD', 0, 1);    // TIDAK
  buatPemain(6, 'TemanE', 1, 4);    // diklaim di sistem lama -> tetap dihitung
  buatPemain(7, 'TemanF', 15, 6);   // terkualifikasi
  buatPemain(8, 'TemanG', 20, 9);   // terkualifikasi
  buatPemain(9, 'TemanH', 10, 5);   // terkualifikasi
  for (const fid of [2, 3, 4, 5, 7, 8, 9]) undang(1, fid, 'pending');
  undang(1, 6, 'claimed');
  // 95 teman terkualifikasi tambahan -> total terkualifikasi = 100 (2,6,7,8,9 + 95).
  for (let i = 10; i <= 104; i++) { buatPemain(i, 'Teman' + i, 12, 7); undang(1, i, 'pending'); }
  // Pengundang kedua (id 200) cuma punya 2 teman terkualifikasi.
  buatPemain(200, 'Pengundang2', 0, 1);
  buatPemain(201, 'T2A', 10, 5); buatPemain(202, 'T2B', 11, 6); buatPemain(203, 'T2C', 0, 1);
  undang(200, 201, 'pending'); undang(200, 202, 'pending'); undang(200, 203, 'pending');

  // (L1) profil: jumlah terkualifikasi + status per teman
  const p1 = await profil(1);
  cek('(L1) profil inviteTiers.qualified = 100', p1 && p1.inviteTiers && p1.inviteTiers.qualified === 100, 'qualified=' + (p1 && p1.inviteTiers && p1.inviteTiers.qualified));
  cek('(L1b) profil inviteTiers.claimed awal kosong', p1 && p1.inviteTiers && Array.isArray(p1.inviteTiers.claimed) && p1.inviteTiers.claimed.length === 0);
  const statusTeman = Object.fromEntries((p1.referrals || []).map((r) => [r.friendName, r.status]));
  cek('(L1c) teman level 4 (10 iklan) status pending', statusTeman.TemanB === 'pending', 'status=' + statusTeman.TemanB);
  cek('(L1d) teman 9 iklan (level 5) status pending', statusTeman.TemanC === 'pending', 'status=' + statusTeman.TemanC);
  cek('(L1e) teman 10 iklan + level 5 status ready', statusTeman.TemanA === 'ready', 'status=' + statusTeman.TemanA);
  cek('(L1f) teman lama status claimed tetap tampil claimed', statusTeman.TemanE === 'claimed', 'status=' + statusTeman.TemanE);

  // (L2) klaim sebelum ambang: pengundang 2 (baru 2 terkualifikasi) klaim tingkat 3 -> 400
  const r2 = await panggil('POST', '/api/referral/tier-claim', 200, { tier: 3 });
  cek('(L2) klaim tingkat 3 dengan 2 teman -> 400 Belum mencapai', r2.status === 400 && /Belum mencapai 3/.test(r2.body.error || ''), 'status=' + r2.status + ' err=' + r2.body.error);
  cek('(L2b) saldo pengundang 2 tetap 500', (await profil(200)).coins === 500);

  // (L3) tingkat tidak dikenal -> 400
  const r3 = await panggil('POST', '/api/referral/tier-claim', 1, { tier: 7 });
  cek('(L3) tier 7 (tidak ada) -> 400', r3.status === 400, 'status=' + r3.status);

  // (L4) klaim tingkat 3 -> ok +333.333 koin (saldo 500 -> 333.833)
  const r4 = await panggil('POST', '/api/referral/tier-claim', 1, { tier: 3 });
  cek('(L4) klaim tingkat 3 -> ok +333333', r4.status === 200 && r4.body.coins === 333333, 'status=' + r4.status + ' coins=' + r4.body.coins);
  cek('(L4b) saldo jadi 333.833', (await profil(1)).coins === 333833, 'coins=' + (await profil(1)).coins);

  // (L5) klaim ganda tingkat 3 -> 400, saldo tetap
  const r5 = await panggil('POST', '/api/referral/tier-claim', 1, { tier: 3 });
  cek('(L5) klaim ulang tingkat 3 -> 400 sudah diklaim', r5.status === 400 && /sudah diklaim/.test(r5.body.error || ''), 'status=' + r5.status + ' err=' + r5.body.error);
  cek('(L5b) saldo tetap 333.833 setelah klaim ganda', (await profil(1)).coins === 333833);

  // (L6) klaim tingkat 5 (+666.667) dan 100 (+16.666.667)
  const r6 = await panggil('POST', '/api/referral/tier-claim', 1, { tier: 5 });
  cek('(L6) klaim tingkat 5 -> ok +666667', r6.status === 200 && r6.body.coins === 666667, 'status=' + r6.status);
  const r6b = await panggil('POST', '/api/referral/tier-claim', 1, { tier: 100 });
  cek('(L6b) klaim tingkat 100 -> ok +16666667', r6b.status === 200 && r6b.body.coins === 16666667, 'status=' + r6b.status + ' coins=' + r6b.body.coins);
  cek('(L6c) saldo akhir = 500+333333+666667+16666667', (await profil(1)).coins === 17667167, 'coins=' + (await profil(1)).coins);
  cek('(L6d) profil claimed = [3,5,100]', JSON.stringify((await profil(1)).inviteTiers.claimed.sort((a, b) => a - b)) === '[3,5,100]');

  // (L7) endpoint lama /api/referral/claim -> 400 dengan pesan pengganti
  const r7 = await panggil('POST', '/api/referral/claim', 1, { friendId: 2 });
  cek('(L7) endpoint lama -> 400 pesan tingkat invite', r7.status === 400 && /diganti sistem tingkat invite/.test(r7.body.error || ''), 'status=' + r7.status + ' err=' + r7.body.error);
  cek('(L7b) saldo tetap setelah endpoint lama', (await profil(1)).coins === 17667167);

  // (L8) beli skin toko -> 400 pesan dihapus
  const r8 = await panggil('POST', '/api/buy', 1, { kind: 'skin', id: 'astronot' });
  cek('(L8) beli skin astronot -> 400 Skin Level dihapus', r8.status === 400 && /Skin Level sudah dihapus/.test(r8.body.error || ''), 'status=' + r8.status + ' err=' + r8.body.error);

  // (L9) pakai skin toko -> 400; pakai skin level (belum dimiliki) -> pesan lain (bukan "dihapus")
  const r9 = await panggil('POST', '/api/equip', 1, { kind: 'skin', id: 'ninja' });
  cek('(L9) pakai skin ninja -> 400 Skin Level dihapus', r9.status === 400 && /Skin Level sudah dihapus/.test(r9.body.error || ''), 'status=' + r9.status);
  const r9b = await panggil('POST', '/api/equip', 1, { kind: 'skin', id: 'es' });
  cek('(L9b) v26: pakai skin level es -> 400 Skin Level dihapus', r9b.status === 400 && /Skin Level sudah dihapus/.test(r9b.body.error || ''), 'status=' + r9b.status + ' err=' + r9b.body.error);

  dbTes.close();
  await matikanServer();
} catch (e) {
  gagal++;
  console.log('  GAGAL', 'tes live error:', e.message);
  try { await matikanServer(); } catch {}
} finally {
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
}

console.log(`\nInvite-tiers: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
