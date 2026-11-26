// Hero login: logo Rex utuh, showcase login + animasi latar DIHAPUS 2026-11-26
// (tindak lanjut screenshot Rans 2026-11-26 06:29 — logo atas kepotong,
// teks RUNNER COIN tidak kelihatan, logo nempel dengan showcase di bawahnya).
// Penyebab: aturan generik `.hero-nailong img` memaksa height:230px +
// object-fit:cover pada logo persegi 1600x1600, sehingga teks di bawah
// gambar terpotong; logo dan canvas menempel tanpa jarak di satu kartu.
// Perbaikan: .hero-logo tampil utuh (height:auto, lebar dibatasi),
// .hero-nailong diberi padding sebagai pemisah.
// Jalankan: node tests/test-login-hero.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let lolos = 0, gagal = 0;
function cek(nama, ok, info = '') {
  if (ok) { lolos++; console.log('  PASS ', nama, info); }
  else { gagal++; console.log('  GAGAL', nama, info); }
}
function baca(p) { return readFileSync(join(ROOT, p), 'utf8'); }
function aturan(css, selektor) {
  const m = css.match(new RegExp(selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'));
  return m ? m[1] : '';
}

const css = baca('public/style.css');
const html = baca('public/index.html');
const sw = baca('public/sw.js');

// h0: CSS tetap seimbang (tidak ada kurung kurawal putus karena edit).
cek('(h0) style.css kurung kurawal seimbang',
  (css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length);

// h1: aturan generik pemotong logo sudah tidak ada.
cek('(h1) tidak ada lagi aturan .hero-nailong img dengan object-fit:cover',
  !css.includes('.hero-nailong img{') && !css.includes('.hero-nailong img {'));

// h2-h5: .hero-logo tampil UTUH (bukan crop) + terpisah.
const heroLogo = aturan(css, '.hero-logo');
cek('(h2) .hero-logo height:auto (gambar utuh, tidak dipotong)', /height\s*:\s*auto/.test(heroLogo), heroLogo);
cek('(h3) .hero-logo tanpa object-fit:cover', !/object-fit\s*:\s*cover/.test(heroLogo));
cek('(h4) .hero-logo lebar dibatasi (min(280px,88%))', /width\s*:\s*min\(280px/.test(heroLogo));
cek('(h5) .hero-logo punya margin bawah sebagai pemisah', /margin\s*:[^;]*12px/.test(heroLogo));

// h6: kontainer hero memberi jarak (padding) antara logo dan canvas.
const heroWrap = aturan(css, '.hero-nailong');
cek('(h6) .hero-nailong punya padding pemisah', /padding\s*:\s*12px/.test(heroWrap));
cek('(h6b) .hero-nailong tetap overflow:hidden (koin jatuh tetap terpotong rapi)',
  /overflow\s*:\s*hidden/.test(heroWrap));

// h7: showcase login dihapus (Rans 2026-11-26: kepanjangan).
cek('(h7) tidak ada lagi #loginShowcaseFallback di CSS', !css.includes('#loginShowcaseFallback'));
cek('(h7b) tidak ada lagi aturan .hero-nailong canvas', !css.includes('.hero-nailong canvas'));

// h8: animasi latar login (bgCanvas) juga dihapus — tidak ada lagi kaki
// karakter yang mengintip di bawah layar login.
cek('(h8) tidak ada lagi #bgCanvas di CSS', !css.includes('#bgCanvas'));
cek('(h8b) tidak ada lagi bgCanvas/loopLogin di app.js', !baca('public/app.js').includes('bgCanvas') && !baca('public/app.js').includes('loopLogin'));

// h9: logo sumber memang persegi 1600x1600 (teks RUNNER COIN ada di dalam gambar).
const logoPath = join(ROOT, 'public/runner-coin-logo.png');
let logoOk = false, logoInfo = '';
if (existsSync(logoPath)) {
  const b = readFileSync(logoPath);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  logoOk = b[0] === 0x89 && w === 1600 && h === 1600;
  logoInfo = `${w}x${h}, ${b.length} byte`;
}
cek('(h9) runner-coin-logo.png ada dan persegi 1600x1600', logoOk, logoInfo);

// h10: login tanpa showcase — logo tetap ada, canvas showcase + bgCanvas hilang.
const iLogo = html.indexOf('class="hero-logo"');
cek('(h10) index.html: logo hero tetap ada, tidak ada lagi loginShowcase/bgCanvas',
  iLogo > 0 && !html.includes('id="loginShowcase"') && !html.includes('id="bgCanvas"') && !html.includes('loginShowcaseFallback'));

// h11: SW cache naik ke v20 (perubahan ikut terkirim ke HP).
cek('(h11) sw.js CACHE v21', sw.includes("const CACHE = 'lari-koin-v21';"));

console.log(`\nLogin hero: ${lolos} lolos, ${gagal} gagal`);
process.exitCode = gagal ? 1 : 0;
