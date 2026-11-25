// Tes statis "9 perbaikan" (v14).
// Memastikan: fase 2 tidak jalan saat lari, iklan menjeda game, tidak ada
// pilih level / tombol kontrol lama, suara di header, skill HUD di dalam
// layar game, showcase login berjejer 5 klon, model manusia ada, dan
// auto-lanjut level tetap lewat run-start (gerbang nyawa).
// Jalankan: node tests/test-perbaikan-9.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const app = baca('public/app.js');
const run3d = baca('public/run3d.js');
const html = baca('public/index.html');
const css = baca('public/style.css');
const sw = baca('public/sw.js');

let lolos = 0, gagal = 0;
function cek(nama, ok) {
  if (ok) { lolos++; console.log('  PASS ', nama); }
  else { gagal++; console.log('  GAGAL', nama); }
}

// (a) Fase 2 TIDAK PERNAH mulai saat game sedang berjalan
cek('(a1) run3d: bolehMuatFase2 menolak saat __rcGameRunning', /function bolehMuatFase2\(\) \{\s*return !document\.hidden && !window\.__rcGameRunning;/.test(run3d));
cek('(a2) run3d: loadModelsPhase2 berhenti jika lari mulai di tengah muat', run3d.includes('if (!bolehMuatFase2()) { R._phase2Ditunda = true; break; }'));
cek('(a3) run3d: lanjutkanPhase2 tidak jalan saat lari', /function lanjutkanPhase2\(\) \{[\s\S]{0,120}if \(!bolehMuatFase2\(\)\) return;/.test(run3d));
cek('(a4) run3d: lanjutkanPhase2 diekspor ke window.Run3D', /lanjutkanPhase2,/.test(run3d));
cek('(a5) app.js: mulaiGame menandai __rcGameRunning = true', app.includes('window.__rcGameRunning = true'));
cek('(a6) app.js: gameOver/selesaiLevel mematikan __rcGameRunning', (app.match(/window\.__rcGameRunning = false/g) || []).length >= 2);
cek('(a7) run3d: showcase beralih ke dansa hanya setelah fase 2 selesai', run3d.includes('function gantiShowcaseKeDansa') && run3d.includes('if (!R._phase2Ditunda) { R.phase2Done = true; gantiShowcaseKeDansa(); }'));

// (b) Iklan buka -> jeda; iklan tutup -> lanjut HANYA jika tadi lagi lari
cek('(b1) app.js: tampilIklanSelingan mendeteksi sedangLari', app.includes("const sedangLari = game.running && !game.paused;"));
cek('(b2) app.js: iklan buka memanggil jedaGame()', app.includes('if (sedangLari) { jedaKarenaIklan = true; jedaGame(); }'));
cek('(b3) app.js: iklan tutup memanggil lanjutGame() hanya jika jedaKarenaIklan', app.includes("if (jedaKarenaIklan) lanjutGame();"));
cek('(b4) app.js: jedaGame() menghentikan loop (paused=true)', /function jedaGame\(\) \{\s*if \(!game\.running \|\| game\.paused\) return;\s*game\.paused = true;/.test(app));
cek('(b5) app.js: loop() tidak menjadwalkan RAF saat paused', app.includes('if (game.paused) return; // diam saat jeda'));
cek('(b6) app.js: jedaKarenaIklan direset di gameOver/lanjutGame', (app.match(/jedaKarenaIklan = false/g) || []).length >= 2);

// (c) Tidak ada pemilih level di index.html
cek('(c1) index.html: tidak ada levelSelect', !html.includes('levelSelect'));
cek('(c2) app.js: tidak ada referensi levelSelect', !app.includes('levelSelect'));
cek('(c3) app.js: tidak ada renderLevelSelect', !app.includes('renderLevelSelect'));
cek('(c4) app.js: game.level diambil dari profile.maxLevel', app.includes('game.level = maxLv'));

// (d) Tidak ada grid tombol kontrol di bawah arena
for (const id of ['btnStart', 'btnPause', 'btnKiri', 'btnKanan', 'btnTengah']) {
  cek(`(d1) index.html: tidak ada #${id}`, !html.includes(`id="${id}"`));
}
cek('(d2) index.html: tidak ada .game-controls', !html.includes('game-controls'));
cek('(d3) index.html: tidak ada .lane-btns', !html.includes('lane-btns'));
cek('(d4) style.css: tidak ada aturan .game-controls/.lane-btns', !css.includes('.game-controls') && !css.includes('.lane-btns'));
cek('(d5) index.html: ada petunjuk gestur', html.includes('Geser kiri/kanan = pindah jalur'));
cek('(d6) app.js: fs-bar tetap punya Jeda + Keluar', app.includes("$('btnFsJeda').addEventListener('click', toggleJeda)") && html.includes('id="btnFsKeluar"'));

// (e) Pengaturan suara di kanan atas header
cek('(e1) index.html: header punya #btnMusik', html.includes('id="btnMusik"'));
cek('(e2) index.html: header punya #btnSuara', html.includes('id="btnSuara"'));
cek('(e3) index.html: kedua tombol di dalam .topbar-suara', /<div class="topbar-suara">[\s\S]*?id="btnMusik"[\s\S]*?id="btnSuara"[\s\S]*?<\/div>/.test(html));
cek('(e4) app.js: persistensi nr_musik/nr_suara tetap ada', app.includes("localStorage.setItem('nr_musik'") && app.includes("localStorage.setItem('nr_suara'"));
cek('(e5) style.css: ada .topbar-suara/.topbar-ico', css.includes('.topbar-suara') && css.includes('.topbar-ico'));

// (f) Skill HUD ada DI DALAM layar game (fullscreen)
cek('(f1) index.html: ada #skillHud', html.includes('id="skillHud"'));
cek('(f2) index.html: skillHud di dalam #gameSection', html.indexOf('id="skillHud"') > html.indexOf('id="gameSection"') && html.indexOf('id="skillHud"') < html.indexOf('</section>', html.indexOf('id="gameSection"')));
cek('(f3) index.html: skillHud punya 3 tombol data-skill', (html.split('id="skillHud"')[1].split('</div>')[0].match(/data-skill="(cepat|magnet|perisai)"/g) || []).length === 3);
cek('(f4) app.js: binding skill memakai semua [data-skill]', app.includes("document.querySelectorAll('[data-skill]')"));
cek('(f5) style.css: .skill-hud hanya tampil di mode-fullscreen', css.includes('body.mode-fullscreen .skill-hud{display:flex'));

// (g) Showcase login DIHAPUS 2026-11-26 (Rans: kepanjangan) — mode baris tetap ada di run3d.js
cek('(g1) run3d: showcase punya mode baris (row)', run3d.includes('const row = !!opts.row'));
cek('(g2) run3d: mode baris membuat 5 klon', run3d.includes('const n = row ? 5 : 1'));
cek('(g3) run3d: klon memakai SkeletonUtils.clone', run3d.includes('cloneSkinned(R.char)'));
cek('(g4) run3d: klon baris diwarnai warna roster berbeda', run3d.includes('tintKlon(clone, colors[i])'));
cek('(g5) app.js: showcase login dihapus (login lebih pendek, tanpa canvas 3D)', !app.includes('loginShowcase') && !app.includes('mulaiShowcaseLogin'));
cek('(g6) index.html: tidak ada lagi kartu gambar login (#loginCharCard)', !html.includes('loginCharCard'));
cek('(g7) index.html: tidak ada lagi kartu gambar Beranda (#berandaCharCard)', !html.includes('berandaCharCard'));
cek('(g8) index.html: strip nama Beranda tetap ada (#berandaCharNama)', html.includes('id="berandaCharNama"'));
cek('(g9) run3d: showcase berhenti memakai RAF saat canvas tersembunyi', run3d.includes('S.timer = setTimeout(tickShow, 500)'));
cek('(g10) run3d: showcaseStop membersihkan timer juga', run3d.includes('clearTimeout(S.timer)'));

// (h) Model manusia ada + fase 1 ringan
const trav = join(ROOT, 'public/models/traveller.fbx');
const coin = join(ROOT, 'public/models/coin.fbx');
cek('(h1) public/models/traveller.fbx ada', existsSync(trav));
cek('(h2) traveller.fbx > 1 MB (model manusia lengkap)', existsSync(trav) && statSync(trav).size > 1_000_000);
cek('(h3) public/models/coin.fbx ada', existsSync(coin));
const fase1 = (existsSync(trav) ? statSync(trav).size : 0) + (existsSync(coin) ? statSync(coin).size : 0);
cek(`(h4) fase 1 total ${(fase1 / 1e6).toFixed(2)} MB (traveller + coin) < 3 MB`, fase1 < 3_000_000);
cek('(h5) animasi fase 2 (xbot@jumping/sliding/stumbling/dancing) masih ada', ['xbot@jumping.fbx', 'xbot@sliding.fbx', 'xbot@stumbling.fbx', 'xbot@dancing.fbx'].every((f) => existsSync(join(ROOT, 'public/models', f))));
cek('(h6) run3d: karakter manusia dipakai (CHAR_FILE traveller)', run3d.includes("CHAR_FILE = 'traveller.fbx'"));
cek('(h7) run3d: koper tangan kiri disembunyikan', run3d.includes('attach-lefthand-mesh_case'));
cek('(h8) run3d: skin tint per bagian (baju/celana/sepatu)', run3d.includes('WARNA_BAGIAN') && run3d.includes("shirt|coat") && run3d.includes('denim') && run3d.includes('boot'));

// (i) Auto-lanjut level tetap lewat run-start
cek('(i1) app.js: selesaiLevel menangkap lvSelesai', app.includes('const lvSelesai = game.level;'));
cek('(i2) app.js: ada hitung mundur auto-lanjut 3 detik', app.includes('Lanjut ke Level') && app.includes('let hitung = 3;'));
cek('(i3) app.js: auto-lanjut memanggil mulaiGame()', /const lanjutkan = \(\) => \{[\s\S]*?mulaiGame\(\);/.test(app));
cek('(i4) app.js: mulaiGame memanggil /api/run-start (gerbang nyawa)', app.includes("api('/api/run-start', 'POST', {}, 10000)"));
cek('(i5) app.js: level 60 tidak auto-lanjut (tamat)', app.includes('const tamat = lvSelesai >= 60;') && app.includes('if (tamat) return;'));
cek('(i6) app.js: simpan gagal -> ulang level yang sama, bukan loncat', app.includes('if (!tersimpan)') && app.includes("bUlang.textContent = '▶ Main Lagi (Level ' + lvSelesai + ')'"));
cek('(i7) app.js: autoLanjutTimer dibatalkan saat keluar layar penuh', app.includes('keluarModeLayarPenuh') && /function keluarModeLayarPenuh\(\) \{[\s\S]*?clearInterval\(autoLanjutTimer\)/.test(app));
cek('(i8) sw.js CACHE = lari-koin-v20', sw.includes("const CACHE = 'lari-koin-v20';"));

console.log(`\nHasil: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
