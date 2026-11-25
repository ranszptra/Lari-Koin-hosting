// Tes statis: mode layar penuh + 3D ringan (fase 1/2) + Three.js lokal + SW v13.
// Jalankan: node tests/test-fullscreen-3d.mjs  (exit 0 = semua lolos)
import { readFileSync, existsSync } from 'fs';

const ROOT = '/home/hatch/workspace/lari-koin-hosting/public';
let lolos = 0, gagal = 0;
function cek(nama, ok, detail) {
  if (ok) { lolos++; console.log('  PASS  ' + nama); }
  else { gagal++; console.log('  FAIL  ' + nama + (detail ? ' — ' + detail : '')); }
}

const run3d = readFileSync(ROOT + '/run3d.js', 'utf8');
const app = readFileSync(ROOT + '/app.js', 'utf8');
const html = readFileSync(ROOT + '/index.html', 'utf8');
const sw = readFileSync(ROOT + '/sw.js', 'utf8');

// (a) Fase 1 hanya memuat 3 model: xbot.fbx + xbot@running.fbx + coin.fbx
const f1mulai = run3d.indexOf('async function loadModelsPhase1()');
const f1akhir = run3d.indexOf('\n}\n', f1mulai) + 3;
const f1 = run3d.slice(f1mulai, f1akhir);
cek('(a1) fase 1 memuat xbot.fbx', f1.includes("MODEL_BASE + 'xbot.fbx'"));
cek('(a2) fase 1 memuat xbot@running.fbx', f1.includes("xbot@running.fbx"));
cek('(a3) fase 1 memuat coin.fbx', f1.includes("MODEL_BASE + 'coin.fbx'"));
cek('(a4) fase 1 TIDAK memuat xbot@jumping.fbx', !f1.includes('xbot@jumping.fbx'));
cek('(a5) fase 1 TIDAK memuat xbot@sliding.fbx', !f1.includes('xbot@sliding.fbx'));
cek('(a6) fase 1 TIDAK memuat xbot@stumbling.fbx', !f1.includes('xbot@stumbling.fbx'));
cek('(a7) fase 1 TIDAK memuat xbot@dancing.fbx', !f1.includes('xbot@dancing.fbx'));
const f2 = run3d.slice(run3d.indexOf('const ANIMASI_FASE2'), run3d.indexOf('async function loadModelsPhase2()'));
cek('(a8) fase 2 berisi jump+slide+stumble+dance',
  ['xbot@jumping.fbx', 'xbot@sliding.fbx', 'xbot@stumbling.fbx', 'xbot@dancing.fbx'].every((m) => f2.includes(m)));
cek('(a9) fungsi loadModels lama sudah tidak ada', !/async function loadModels\(\)/.test(run3d));

// (b) Timeout fase 1 tetap 15 detik + fallback 2D tetap ada
cek('(b1) preload memakai timeout 15000 ms', /setTimeout\(\(\) => rej\(new Error\('Timeout memuat model 3D \(15 detik\)'\)\), 15000\)/.test(run3d));
cek('(b2) preload memanggil loadModelsPhase1', run3d.includes('loadModelsPhase1(),'));
cek('(b3) fase 2 dipanggil di latar belakang setelah fase 1', run3d.includes('loadModelsPhase2().catch(() => {})'));
cek('(b4) fallback 2D tetap ada (renderLari3D false -> renderScene)', app.includes("if (!renderLari3D()) renderScene(ctx, game);"));

// (c) Importmap menunjuk ke vendor lokal (bukan unpkg)
const im = html.slice(html.indexOf('<script type="importmap">'), html.indexOf('</script>', html.indexOf('<script type="importmap">')));
cek('(c1) importmap three -> /vendor/three/three.module.js', im.includes('"/vendor/three/three.module.js"'));
cek('(c2) importmap addons -> /vendor/three/addons/', im.includes('"/vendor/three/addons/"'));
cek('(c3) importmap TIDAK lagi memakai unpkg', !im.includes('unpkg.com'));
for (const v of ['vendor/three/three.module.js', 'vendor/three/addons/loaders/FBXLoader.js', 'vendor/three/addons/utils/BufferGeometryUtils.js', 'vendor/three/addons/utils/SkeletonUtils.js', 'vendor/three/addons/libs/fflate.module.js', 'vendor/three/addons/curves/NURBSCurve.js', 'vendor/three/addons/curves/NURBSUtils.js']) {
  cek('(c4) berkas vendor ada: ' + v, existsSync(ROOT + '/' + v));
}

// (d) Overlay layar penuh + tombol keluar ada di index.html
cek('(d1) ada .fs-bar (id=fsBar)', html.includes('id="fsBar"'));
cek('(d2) ada tombol jeda layar penuh (id=btnFsJeda)', html.includes('id="btnFsJeda"'));
cek('(d3) ada tombol keluar layar penuh (id=btnFsKeluar)', html.includes('id="btnFsKeluar"'));
cek('(d4) app.js punya bukaModeLayarPenuh', app.includes('function bukaModeLayarPenuh()'));
cek('(d5) app.js punya keluarModeLayarPenuh', app.includes('function keluarModeLayarPenuh()'));
cek('(d6) mulaiGame membuka layar penuh', app.includes('bukaModeLayarPenuh(); // masuk layar game penuh'));
cek('(d7) renderScene memakai skalaCanvas (tanpa distorsi)', app.includes('function skalaCanvas(c)') && app.includes('c.translate(ox, oy); c.scale(s, s);'));
const css = readFileSync(ROOT + '/style.css', 'utf8');
cek('(d8) CSS mode-fullscreen ada (#gameSection fixed)', css.includes('body.mode-fullscreen #gameSection{position:fixed;inset:0;'));
cek('(d9) CSS hasil lari jadi overlay di layar penuh', css.includes('body.mode-fullscreen #gameResult.show{position:absolute;'));
cek('(d10) CSS modal tetap di atas layar penuh', css.includes('body.mode-fullscreen .modal{z-index:80}'));

// (e) sw.js CACHE v13
cek('(e1) sw.js CACHE = lari-koin-v13', sw.includes("const CACHE = 'lari-koin-v13';"));
cek('(e2) sw.js TIDAK lagi v12', !sw.includes('lari-koin-v12'));

console.log(`\nHasil: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
