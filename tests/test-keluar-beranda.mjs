// Tombol keluar ke Beranda + scroll kembali normal setelah main (v23)
// Tindak lanjut laporan Rans 2026-11-26 09:55 (video): habis main game
// ngebug — halaman tidak bisa di-scroll ke bawah, dan tidak ada tombol
// keluar ke Beranda. Penyebab: (1) layar "Kena Halangan!" dan modal finish
// level tidak punya tombol Beranda (modal finish malah memaksa lanjut level
// lewat hitung-mundur 3 detik); (2) body.mode-fullscreen (overflow:hidden)
// bisa bocor saat pindah tab lewat jalur yang tidak memanggil
// keluarModeLayarPenuh(), sehingga seluruh halaman terkunci.
// Perbaikan: tombol 🏠 Beranda di kedua layar akhir + pindahTab() selalu
// membersihkan mode-fullscreen/mode-lari + modal finish + gameResult.
// Jalankan: node tests/test-keluar-beranda.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let lolos = 0, gagal = 0;
function cek(nama, ok, info = '') {
  if (ok) { lolos++; console.log('  OK  ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (info ? ' — ' + info : '')); }
}

const appjs = readFileSync(join(ROOT, 'public/app.js'), 'utf8');
const html = readFileSync(join(ROOT, 'public/index.html'), 'utf8');
const css = readFileSync(join(ROOT, 'public/style.css'), 'utf8');
const swjs = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');

// 1. Tombol Beranda ada di modal finish (HTML statis) + terikat ke keluarKeBeranda
cek('modalFinish punya tombol btnFinishBeranda', html.includes('id="btnFinishBeranda"'));
cek('btnFinishBeranda terikat ke keluarKeBeranda', appjs.includes("$('btnFinishBeranda')") && appjs.includes('keluarKeBeranda'));

// 2. Panel "Kena Halangan!" (gameOver) menyisipkan tombol Beranda + mengikatnya
cek('gameOver menyisipkan btnResultBeranda', appjs.includes('btnResultBeranda'));
cek('btnResultBeranda onclick = keluarKeBeranda', appjs.includes("bBeranda.onclick = keluarKeBeranda") || appjs.includes("$('btnResultBeranda')"));

// 3. keluarKeBeranda membersihkan semuanya: timer, modal, panel, fullscreen, lalu ke tab Beranda
const fn = appjs.match(/function keluarKeBeranda\(\) \{[\s\S]*?\n\}/);
cek('fungsi keluarKeBeranda ada', !!fn);
if (fn) {
  cek('keluarKeBeranda mematikan autoLanjutTimer', fn[0].includes('autoLanjutTimer'));
  cek('keluarKeBeranda menutup modalFinish', fn[0].includes("modalFinish") && fn[0].includes("remove('show')"));
  cek('keluarKeBeranda menutup gameResult', fn[0].includes("gameResult"));
  cek('keluarKeBeranda melepas mode-fullscreen', fn[0].includes("remove('mode-fullscreen'"));
  cek('keluarKeBeranda pindah ke tab beranda', fn[0].includes("pindahTab('beranda')"));
}

// 4. pindahTab SELALU membersihkan layar penuh (pembunuh kebocoran scroll-lock)
const pt = appjs.match(/function pindahTab\(nama\) \{[\s\S]*?\n\}/);
cek('fungsi pindahTab ada', !!pt);
if (pt) {
  cek('pindahTab melepas mode-fullscreen', pt[0].includes("remove('mode-fullscreen'"));
  cek('pindahTab melepas mode-lari', pt[0].includes('mode-lari'));
  cek('pindahTab menutup modalFinish', pt[0].includes("modalFinish"));
  cek('pindahTab menutup gameResult', pt[0].includes("gameResult"));
  cek('pindahTab mematikan autoLanjutTimer', pt[0].includes('autoLanjutTimer'));
}

// 5. autoLanjutTimer dideklarasi di ATAS (hindari TDZ saat pindahTab dipanggil di init)
const declAtas = appjs.indexOf('let autoLanjutTimer');
const pindahTabCall = appjs.indexOf("pindahTab('beranda');");
cek('autoLanjutTimer dideklarasi sebelum pemanggilan pindahTab pertama', declAtas > -1 && pindahTabCall > -1 && declAtas < pindahTabCall);
cek('hanya satu deklarasi autoLanjutTimer', (appjs.match(/let autoLanjutTimer/g) || []).length === 1);

// 6. Modal + panel hasil bisa di-scroll di layar pendek (tombol tetap terjangkau)
cek('.modal-box bisa di-scroll (max-height + overflow-y)', css.includes('.modal-box') && /\.modal-box\{[^}]*max-height:88vh;overflow-y:auto/.test(css));
cek('#gameResult fullscreen bisa di-scroll', /body\.mode-fullscreen #gameResult\.show\{[^}]*max-height:80vh;overflow-y:auto/.test(css));

// 7. Cache service worker naik ke v23
cek('sw.js CACHE = lari-koin-v23', swjs.includes("lari-koin-v23"));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
