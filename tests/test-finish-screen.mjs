// Layar finish level: modal "LEVEL SELESAI!" + gambar karakter AKTIF
// (tindak lanjut permintaan Rans 2026-11-26 06:31 — "kalo dah finis ada
// gambar finis nya juga lah next level gitu" + "karakternya plis").
// Aturannya: modal muncul tiap tamat level; gambar = foto 2D karakter aktif
// (gambarKarakterAktif, bukan statis); koin level itu tampil; countdown
// 3 detik + tombol lanjut dua-duanya jalan; Lv 60 = varian "TAMAT!".
// Alur lama (iklan -> klaim finish-level -> auto-lanjut) TIDAK berubah.
// Jalankan: node tests/test-finish-screen.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let lolos = 0, gagal = 0;
function cek(nama, ok, info = '') {
  if (ok) { lolos++; console.log('  PASS ', nama, info); }
  else { gagal++; console.log('  GAGAL', nama, info); }
}
function baca(p) { return readFileSync(join(ROOT, p), 'utf8'); }

const html = baca('public/index.html');
const css = baca('public/style.css');
const js = baca('public/app.js');
const sw = baca('public/sw.js');

// f1: modal finish ada di index.html dengan semua slot yang dibutuhkan.
const ids = ['modalFinish', 'finishCharImg', 'finishJudul', 'finishNama', 'finishIsi', 'finishHitung', 'finishNextLv', 'hitungLanjut', 'btnFinishLanjut', 'btnFinishUlang'];
for (const id of ids) cek('(f1) index.html punya #' + id, html.includes('id="' + id + '"'));
cek('(f1b) modal finish pakai class modal', /id="modalFinish"[^>]*class="modal"|class="modal"[^>]*id="modalFinish"/.test(html));
cek('(f1c) hanya satu id="hitungLanjut" di index.html', (html.match(/id="hitungLanjut"/g) || []).length === 1);

// f2: CSS layar finish ada.
cek('(f2) CSS .finish-box ada', css.includes('.finish-box{'));
cek('(f2b) CSS .finish-char ada (bingkai foto karakter)', css.includes('.finish-char{'));
cek('(f2c) CSS .finish-nama ada', css.includes('.finish-nama{'));

// f3: selesaiLevel mengisi gambar dari karakter AKTIF (bukan statis).
cek('(f3) selesaiLevel set finishCharImg.src = gambarKarakterAktif()',
  js.includes("imgFinish.src = gambarKarakterAktif()"));
cek('(f3b) nama karakter aktif tampil di finishNama',
  js.includes("namaFinish.textContent = kAktif ?"));

// f4: varian TAMAT untuk level 60.
cek('(f4) Lv 60 judul jadi TAMAT!',
  js.includes("tamat ? '🏆 TAMAT!' : '🎉 LEVEL SELESAI!'"));
cek('(f4b) Lv 60 tidak ada countdown/tombol lanjut (return setelah tampil)',
  /if \(tamat\) return;/.test(js));

// f5: countdown 3 detik + tombol lanjut dua-duanya jalan.
cek('(f5) countdown 3 detik + interval autoLanjutTimer tetap ada',
  js.includes('let hitung = 3;') && js.includes('autoLanjutTimer = setInterval'));
cek('(f5b) tombol lanjut memanggil lanjutkan (onclick)',
  js.includes('bLanjut.onclick = lanjutkan;'));
cek('(f5c) lanjutkan menutup modal lalu mulaiGame (tetap lewat run-start)',
  js.includes("modal.classList.remove('show');") && js.includes('mulaiGame(); // tetap lewat /api/run-start'));

// f6: alur lama tidak berubah — iklan dulu, klaim finish-level, lalu modal.
const iIklan = js.indexOf('tampilIklanSelingan(async () => {');
const iKlaim = js.indexOf("api('/api/finish-level'");
const iModal = js.indexOf("modal.classList.add('show')");
cek('(f6) urutan: iklan -> klaim finish-level -> modal tampil',
  iIklan > 0 && iKlaim > iIklan && iModal > iKlaim);

// f7: gameOver tetap pakai #gameResult (tidak dirusak).
cek('(f7) gameOver tetap pakai #gameResult',
  js.includes("const el = $('gameResult');") && js.includes('Kena Halangan!'));

// f8: kode Tapjoy tidak tersentuh.
cek('(f8) kode Tapjoy utuh',
  js.includes('async function bukaTapjoyOfferwall()') && js.includes('async function perbaruiStatusTapjoy()') && js.includes("$('btnTapjoy').addEventListener('click', bukaTapjoyOfferwall);"));

// f9: satu bump SW untuk login + finish (tetap v19, tidak naik lagi).
cek('(f9) sw.js CACHE v21', sw.includes("const CACHE = 'lari-koin-v21';"));

console.log(`\nFinish screen: ${lolos} lolos, ${gagal} gagal`);
process.exitCode = gagal ? 1 : 0;
