// Tes wrapper AdMob tahap 2 (v1.4.0) — WebView + AdMob SDK + bridge.
// Memastikan: proyek Android wrapper lengkap (manifest, gradle, Kotlin,
// ikon rubah), unit ID diambil dari server (bukan hardcode kecuali
// fallback), wiring app.js (bridge + fallback simulasi), endpoint
// /api/ads/config + /api/ads/rewarded-verify (auth, whitelist reward,
// nonce anti-replay, batas harian, nyawa penuh), dan sw.js v22.
//
// Jalankan: node tests/test-wrapper.mjs
// (Menyalakan server lokal di port tes dengan DB SQLite temp — file DB
//  temp dihapus lagi setelah tes; TIDAK menyentuh lari-koin.db asli.)
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const ada = (rel) => existsSync(join(ROOT, rel));
const serverJs = baca('server.js');
const dbJs = baca('db.js');
const schemaSql = baca('supabase-schema.sql');
const app = baca('public/app.js');
const sw = baca('public/sw.js');
const manifest = baca('wrapper/app/src/main/AndroidManifest.xml');
const appGradle = baca('wrapper/app/build.gradle');
const mainKt = baca('wrapper/app/src/main/java/id/ranszshop/larikoin/MainActivity.kt');
const bridgeKt = baca('wrapper/app/src/main/java/id/ranszshop/larikoin/AdMobBridge.kt');
const workflow = baca('.github/workflows/build-wrapper.yml');
const readme = baca('wrapper/WRAPPER-README.md');

let lolos = 0, gagal = 0;
function cek(nama, ok, ekstra) {
  if (ok) { lolos++; console.log('  PASS ', nama); }
  else { gagal++; console.log('  GAGAL', nama, ekstra ? '— ' + ekstra : ''); }
}

// ---------- (1) Proyek wrapper: file-file ada ----------
cek('(w1) wrapper/settings.gradle ada', ada('wrapper/settings.gradle'));
cek('(w2) wrapper/build.gradle ada', ada('wrapper/build.gradle'));
cek('(w3) wrapper/gradle.properties ada', ada('wrapper/gradle.properties'));
cek('(w4) wrapper/gradlew ada', ada('wrapper/gradlew'));
cek('(w5) wrapper/gradle/wrapper/gradle-wrapper.jar ada', ada('wrapper/gradle/wrapper/gradle-wrapper.jar'));
cek('(w6) wrapper/app/build.gradle ada', ada('wrapper/app/build.gradle'));
cek('(w7) AndroidManifest.xml ada', ada('wrapper/app/src/main/AndroidManifest.xml'));
cek('(w8) MainActivity.kt ada', ada('wrapper/app/src/main/java/id/ranszshop/larikoin/MainActivity.kt'));
cek('(w9) AdMobBridge.kt ada', ada('wrapper/app/src/main/java/id/ranszshop/larikoin/AdMobBridge.kt'));
cek('(w10) WRAPPER-README.md ada', ada('wrapper/WRAPPER-README.md'));
cek('(w11) ikon launcher ada (5 densitas + foreground adaptif)', ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].every((d) => ada(`wrapper/app/src/main/res/mipmap-${d}/ic_launcher.png`)) && ada('wrapper/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png') && ada('wrapper/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'));

// ---------- (2) Manifest + gradle ----------
cek('(m1) manifest: package id.ranszshop.larikoin', manifest.includes('package="id.ranszshop.larikoin"') || appGradle.includes("applicationId 'id.ranszshop.larikoin'"));
cek('(m2) manifest: izin INTERNET', manifest.includes('android.permission.INTERNET'));
cek('(m3) manifest: AdMob APPLICATION_ID beneran', manifest.includes('ca-app-pub-3929807789448089~9100558334'));
cek('(m4) manifest: label Runner Coin + portrait', manifest.includes('android:label="Runner Coin"') && manifest.includes('android:screenOrientation="portrait"'));
cek('(m5) gradle: versionCode 5 / versionName 1.4.0', appGradle.includes('versionCode 5') && appGradle.includes("versionName '1.4.0'"));
cek('(m6) gradle: minSdk 24 + targetSdk 34', appGradle.includes('minSdk 24') && appGradle.includes('targetSdk 34'));
cek('(m7) gradle: dependensi play-services-ads', /play-services-ads:\d+\.\d+\.\d+/.test(appGradle));
cek('(m8) gradle: signing baca env (bukan hardcode password)', appGradle.includes("System.getenv('KEYSTORE_PASSWORD')") && appGradle.includes("System.getenv('KEY_PASSWORD')") && !/storePassword\s+"[^"]+"/.test(appGradle));
cek('(m9) gradle: namespace = package', appGradle.includes("namespace 'id.ranszshop.larikoin'"));
cek('(m10) settings.gradle: include :app', baca('wrapper/settings.gradle').includes("include ':app'"));

// ---------- (3) Kotlin: bridge + config ----------
cek('(k1) MainActivity: muat GAME_URL (Railway)', mainKt.includes('https://lari-koin-hosting-production.up.railway.app/'));
cek('(k2) MainActivity: ambil /api/ads/config (GET, timeout)', mainKt.includes('api/ads/config') && mainKt.includes('CONFIG_TIMEOUT_MS'));
cek('(k3) MainActivity: user-agent RunnerCoinWrapper/1.4.0', mainKt.includes('RunnerCoinWrapper/1.4.0'));
cek('(k4) MainActivity: addJavascriptInterface AdMobBridge', mainKt.includes('addJavascriptInterface') && mainKt.includes('"AdMobBridge"'));
cek('(k5) MainActivity: MobileAds.initialize', mainKt.includes('MobileAds.initialize'));
cek('(k6) MainActivity: tautan luar dibuka di browser sistem', mainKt.includes('Intent.ACTION_VIEW'));
cek('(k7) Bridge: showInterstitial @JavascriptInterface', bridgeKt.includes('@JavascriptInterface') && bridgeKt.includes('fun showInterstitial()'));
cek('(k8) Bridge: showRewarded @JavascriptInterface', bridgeKt.includes('fun showRewarded(rewardType: String)'));
cek('(k9) Bridge: callback __admobInterstitialClosed/Failed', bridgeKt.includes('__admobInterstitialClosed') && bridgeKt.includes('__admobInterstitialFailed'));
cek('(k10) Bridge: reward hanya lewat onUserEarnedReward + nonce UUID', bridgeKt.includes('onUserEarnedReward') || bridgeKt.includes('show(activity) {') && bridgeKt.includes('UUID.randomUUID()') && bridgeKt.includes('__admobRewarded'));
cek('(k11) Bridge: rewardType selain life ditolak', bridgeKt.includes('rewardType != "life"'));
cek('(k12) Bridge: preload ulang setelah tampil/ditutup', (bridgeKt.match(/muatInterstitial\(\)/g) || []).length >= 3 && (bridgeKt.match(/muatRewarded\(\)/g) || []).length >= 3);

// ---------- (4) Unit ID TIDAK hardcode (kecuali fallback yang didokumentasi) ----------
// Fallback BOLEH ada — tapi hanya di SATU tempat (konstanta FALLBACK_* di
// MainActivity) + di server.js sebagai default env. Di file lain tidak boleh.
const unitRewarded = 'ca-app-pub-3929807789448089/9615563652';
const unitInter = 'ca-app-pub-3929807789448089/1088180253';
const fallbackOccurrences = (mainKt.match(new RegExp(unitRewarded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
  + (mainKt.match(new RegExp(unitInter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
cek('(u1) unit ID di MainActivity HANYA di konstanta FALLBACK_* (2x)', fallbackOccurrences === 2 && mainKt.includes('FALLBACK_REWARDED_UNIT_ID') && mainKt.includes('FALLBACK_INTERSTITIAL_UNIT_ID'), 'ketemu ' + fallbackOccurrences + 'x');
cek('(u2) unit ID TIDAK ada di AdMobBridge.kt', !bridgeKt.includes(unitRewarded) && !bridgeKt.includes(unitInter));
cek('(u3) unit ID TIDAK ada di AndroidManifest.xml', !manifest.includes(unitRewarded) && !manifest.includes(unitInter));
cek('(u4) unit ID TIDAK ada di app/build.gradle', !appGradle.includes(unitRewarded) && !appGradle.includes(unitInter));

// ---------- (5) Server: config + rewarded-verify ----------
cek('(s1) server.js: env ADMOB_APP_ID dibaca', serverJs.includes('process.env.ADMOB_APP_ID'));
cek('(s2) server.js: env ADMOB_REWARDED_UNIT_ID dibaca', serverJs.includes('process.env.ADMOB_REWARDED_UNIT_ID'));
cek('(s3) server.js: env ADMOB_INTERSTITIAL_UNIT_ID dibaca', serverJs.includes('process.env.ADMOB_INTERSTITIAL_UNIT_ID'));
cek('(s4) server.js: GET /api/ads/config ada', serverJs.includes("app.get('/api/ads/config'"));
cek('(s5) server.js: config mengembalikan ketiga ID', serverJs.includes('admobAppId: ADMOB_APP_ID') && serverJs.includes('rewardedUnitId: ADMOB_REWARDED_UNIT_ID') && serverJs.includes('interstitialUnitId: ADMOB_INTERSTITIAL_UNIT_ID'));
cek('(s6) server.js: POST /api/ads/rewarded-verify ada + requirePlayer', serverJs.includes("app.post('/api/ads/rewarded-verify'") && /rewarded-verify', ah\(requirePlayer\)/.test(serverJs));
cek('(s7) server.js: whitelist reward HANYA life', serverJs.includes("ADMOB_REWARDED_TYPES = ['life']"));
cek('(s8) server.js: koin TIDAK PERNAH jadi reward (komentar kebijakan)', serverJs.includes("'coins' TIDAK PERNAH ada di whitelist ini"));
cek('(s9) server.js: dedup nonce INSERT OR IGNORE admob_rewards', serverJs.includes('INSERT OR IGNORE INTO admob_rewards'));
cek('(s10) server.js: nonce tidak valid → 400', serverJs.includes("nonce tidak valid"));
cek('(s11) server.js: replay nonce → 403', serverJs.includes('Reward sudah diklaim'));
cek('(s12) server.js: batas 10/hari', serverJs.includes('Batas reward iklan harian tercapai'));
cek('(s13) db.js: tabel admob_rewards (nonce PRIMARY KEY)', dbJs.includes('CREATE TABLE IF NOT EXISTS admob_rewards') && dbJs.includes('nonce TEXT PRIMARY KEY'));
cek('(s14) supabase-schema.sql: tabel admob_rewards ada', schemaSql.includes('CREATE TABLE IF NOT EXISTS admob_rewards') && schemaSql.includes('nonce text PRIMARY KEY'));

// ---------- (6) Web: wiring app.js + sw ----------
cek('(a1) app.js: deteksi wrapper (user-agent RunnerCoinWrapper)', app.includes('RunnerCoinWrapper'));
cek('(a2) app.js: adaBridge() cek window.AdMobBridge', app.includes('function adaBridge()') && app.includes('window.AdMobBridge'));
cek('(a3) app.js: tampilIklanSelingan routing ke tampilIklanAdMob', app.includes('function tampilIklanAdMob') && app.includes('adaBridge()'));
cek('(a4) app.js: fallback simulasi kalau native gagal/timeout', app.includes('__admobInterstitialFailed') && app.includes('fallbackSimulasi') && app.includes('60000'));
cek('(a5) app.js: callback __admobInterstitialClosed ada', app.includes('window.__admobInterstitialClosed'));
cek('(a6) app.js: nyawa rewarded lewat /api/ads/rewarded-verify', app.includes("api('/api/ads/rewarded-verify'") && app.includes('function mintaNyawaRewarded'));
cek('(a7) app.js: reward gagal → TIDAK ada hadiah (tanpa fallback nyawa)', app.includes('TIDAK ADA hadiah'));
cek('(a8) app.js: tombol koin TIDAK memakai rewarded AdMob', app.includes('TIDAK memakai jalur ini'));
cek('(a9) app.js: Tapjoy tidak disentuh wiring ini', app.includes('bukaTapjoyOfferwall') && app.includes('btnTapjoy'));
cek('(a10) sw.js CACHE = lari-koin-v24 (app.js berubah)', sw.includes("const CACHE = 'lari-koin-v24'"));

// ---------- (7) Workflow ----------
cek('(c1) workflow: trigger workflow_dispatch + push wrapper/**', workflow.includes('workflow_dispatch') && workflow.includes("'wrapper/**'"));
cek('(c2) workflow: JDK 17', workflow.includes("java-version: '17'"));
cek('(c3) workflow: keystore dari Secrets yang sama (TWA)', workflow.includes('secrets.ANDROID_KEYSTORE_BASE64') && workflow.includes('secrets.ANDROID_KEYSTORE_PASSWORD'));
cek('(c4) workflow: ./gradlew :app:assembleRelease', workflow.includes('./gradlew :app:assembleRelease'));
cek('(c5) workflow: upload artifact APK release', workflow.includes('app/build/outputs/apk/release/app-release.apk'));
cek('(c6) workflow: TIDAK ada bubblewrap (bukan TWA)', !workflow.toLowerCase().includes('bubblewrap'));
cek('(c7) README: kebijakan hadiah + celah SSV didokumentasi', readme.includes('HANYA boleh memberi +1 nyawa') && readme.includes('Server-Side') && readme.includes('Login Google di WebView'));

// ---------- (8) Tes live: server lokal + config + rewarded-verify ----------
const TMP = mkdtempSync(join(tmpdir(), 'wrapper-test-'));
const DB_PATH = join(TMP, 'wrapper-test.db');
const OWNER_SECRET = 'test-owner-secret';
const PORT = 3782;
const BASE = `http://127.0.0.1:${PORT}`;
const REWARDED_TEST = 'ca-app-pub-test/REWARDED-TEST';
const hariIni = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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
async function rewardedVerify(token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + '/api/ads/rewarded-verify', { method: 'POST', headers, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, body: d };
}

try {
  await jalankanServer({ ADMOB_REWARDED_UNIT_ID: REWARDED_TEST });
  const dbTes = new DatabaseSync(DB_PATH);
  dbTes.exec('PRAGMA busy_timeout = 5000;');
  dbTes.prepare('INSERT INTO players(id,name,pinHash,pinSalt,createdAt,lastActive) VALUES(?,?,?,?,?,?)')
    .run(43, 'TesWrapper', 'x', 'y', new Date().toISOString(), new Date().toISOString());
  const setLives = (n) => dbTes.prepare('UPDATE players SET lives=?, livesDay=? WHERE id=?').run(n, hariIni, 43);
  const livesDb = () => dbTes.prepare('SELECT lives FROM players WHERE id=?').get(43).lives;
  setLives(10);
  cek('(L0) pemain tes id 43 dibuat, nyawa 10', livesDb() === 10, 'lives=' + livesDb());

  // (L1) config: env override terbaca + default lain tampil
  const cfg = await (await fetch(BASE + '/api/ads/config')).json();
  cek('(L1) /api/ads/config: rewarded dari env override', cfg.rewardedUnitId === REWARDED_TEST, 'rewarded=' + cfg.rewardedUnitId);
  cek('(L1b) /api/ads/config: interstitial + app id default', cfg.interstitialUnitId === 'ca-app-pub-3929807789448089/1088180253' && cfg.admobAppId === 'ca-app-pub-3929807789448089~9100558334');

  // (L2) tanpa auth → 401
  const r2 = await rewardedVerify(null, { rewardType: 'life', nonce: 'test-nonce-000' });
  cek('(L2) rewarded-verify tanpa token → 401', r2.status === 401, 'status=' + r2.status);

  // (L3) rewardType koin → 400 (kebijakan: koin dilarang)
  const r3 = await rewardedVerify(tokenUntuk(43), { rewardType: 'coins', nonce: 'test-nonce-001' });
  cek('(L3) rewardType coins → 400', r3.status === 400, 'status=' + r3.status);

  // (L4) rewardType lain (skin) → 400
  const r4 = await rewardedVerify(tokenUntuk(43), { rewardType: 'skin', nonce: 'test-nonce-002' });
  cek('(L4) rewardType skin → 400', r4.status === 400, 'status=' + r4.status);

  // (L5) nonce tidak valid → 400
  const r5 = await rewardedVerify(tokenUntuk(43), { rewardType: 'life', nonce: 'x' });
  cek('(L5) nonce terlalu pendek → 400', r5.status === 400, 'status=' + r5.status);

  // (L6) klaim valid life → 200, nyawa 10 → 11
  const r6 = await rewardedVerify(tokenUntuk(43), { rewardType: 'life', nonce: 'test-nonce-100' });
  cek('(L6) klaim life valid → 200 + lives 11', r6.status === 200 && r6.body.lives === 11 && livesDb() === 11, 'status=' + r6.status + ' lives=' + livesDb());

  // (L7) replay nonce sama → 403, nyawa tetap 11
  const r7 = await rewardedVerify(tokenUntuk(43), { rewardType: 'life', nonce: 'test-nonce-100' });
  cek('(L7) replay nonce sama → 403', r7.status === 403, 'status=' + r7.status);
  cek('(L7b) nyawa tetap 11 setelah replay', livesDb() === 11, 'lives=' + livesDb());

  // (L8) nonce baru lain → 200, nyawa 12
  const r8 = await rewardedVerify(tokenUntuk(43), { rewardType: 'life', nonce: 'test-nonce-101' });
  cek('(L8) nonce baru → 200 + lives 12', r8.status === 200 && r8.body.lives === 12, 'status=' + r8.status);

  // (L9) nyawa penuh (15) → 400
  setLives(15);
  const r9 = await rewardedVerify(tokenUntuk(43), { rewardType: 'life', nonce: 'test-nonce-102' });
  cek('(L9) nyawa penuh → 400', r9.status === 400, 'status=' + r9.status);
  cek('(L9b) nyawa tetap 15', livesDb() === 15);

  // (L10) batas 10/hari: isi 10 klaim hari ini, lalu klaim ke-11 → 400
  setLives(10);
  for (let i = 0; i < 10; i++) {
    dbTes.prepare('INSERT INTO admob_rewards(nonce,playerId,rewardType,createdAt) VALUES(?,?,?,?)')
      .run('cap-nonce-' + i, 43, 'life', new Date().toISOString());
  }
  const r10 = await rewardedVerify(tokenUntuk(43), { rewardType: 'life', nonce: 'test-nonce-200' });
  cek('(L10) klaim ke-11 hari ini → 400 (batas 10/hari)', r10.status === 400, 'status=' + r10.status);

  // (L11) pemain tak dikenal → 401/404 (token tidak cocok)
  const r11 = await rewardedVerify(tokenUntuk(9999), { rewardType: 'life', nonce: 'test-nonce-201' });
  cek('(L11) token pemain tak dikenal → bukan 200', r11.status !== 200, 'status=' + r11.status);

  dbTes.close();
  await matikanServer();
} catch (e) {
  gagal++;
  console.log('  GAGAL', 'tes live error:', e.message);
  try { await matikanServer(); } catch {}
} finally {
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
}

console.log(`\nWrapper: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
