// Grafik HD (v19): pixel ratio adaptif, tekstur jalan prosedural 256x1024,
// tekstur gedung/koin/rintangan tajam, ACES tone mapping, fog jauh,
// backing store 2D mengikuti DPR, smoothing kualitas tinggi.
// Anti-freeze tetap dijaga: tidak ada file eksternal baru, PR mulai 1,5,
// fase-2 tetap hanya saat idle, loop tetap berhenti saat pause.
// Jalankan: node tests/test-grafik-hd.mjs  (dari root proyek)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (p) => readFileSync(join(ROOT, p), 'utf8');
const r3 = baca('public/run3d.js');
const app = baca('public/app.js');
const sw = baca('public/sw.js');

let lolos = 0, gagal = 0;
function cek(nama, ok, info = '') {
  if (ok) { lolos++; console.log('  OK  ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (info ? ' — ' + info : '')); }
}

console.log('== 3D: pixel ratio adaptif ==');
cek('(g1) konstanta PR_MIN=1, PR_AWAL=1.5, PR_MAX=2, PR_LANGKAH=0.25',
  r3.includes('const PR_MIN = 1, PR_AWAL = 1.5, PR_MAX = 2, PR_LANGKAH = 0.25;'));
cek('(g2) renderer mulai di PR_AWAL (1,5), bukan DPR penuh',
  r3.includes("R.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR_AWAL))"));
cek('(g3) fungsi aturPixelRatioAdaptif ada', r3.includes('function aturPixelRatioAdaptif(dtMs, st)'));
cek('(g4) naik hanya bila EMA < 17,5 ms (60fps stabil)', r3.includes('R._prEMA < 17.5 && R._pr < maks'));
cek('(g5) turun bila EMA > 26 ms, lantai PR_MIN=1', r3.includes('R._prEMA > 26 && R._pr > PR_MIN'));
cek('(g6) evaluasi tiap 90 frame (tidak tiap frame)', r3.includes('if (++R._prHitung < 90) return;'));
cek('(g7) tidak jalan saat paused / tab tersembunyi', r3.includes('st.paused || document.hidden'));
cek('(g8) aturPixelRatioAdaptif dipanggil dari render()', r3.includes('aturPixelRatioAdaptif(dt * 1000, st);'));
cek('(g9) antialias tetap true', r3.includes("antialias: true, powerPreference: 'high-performance'"));

console.log('== 3D: tekstur jalan HD ==');
cek('(g10) buatTeksturJalan ada, 256x1024', r3.includes('function buatTeksturJalan(tanahHex)') && r3.includes('teksturKanvas(256, 1024'));
cek('(g11) tekstur jalan: bintik aspal + jejak ban + garis tepi + garis putus',
  r3.includes('bintik aspal') && r3.includes('jejak ban') && r3.includes('garis tepi') && r3.includes('garis putus-putus di pembatas jalur'));
cek('(g12) repeat tekstur jalan 1x10 (30 garis/110 unit, sama seperti dulu)',
  r3.includes('t.repeat.set(1, 10);'));
cek('(g13) tidak ada lagi bidang garis (dash planes) terpisah', !r3.includes('dashMat') && !r3.includes('R.dashTex'));
cek('(g14) scroll tekstur jalan dari roadScroll (kecepatan visual sama, /3)',
  r3.includes('R.roadTex.offset.y = ((st.roadScroll || 0) * 10.9 / 3) % 1'));
cek('(g15) applyWorld membuat ulang tekstur jalan bila tanah dunia ganti',
  r3.includes("if (R.roadTex && R._roadTanah !== d.tanah)") && r3.includes('R.roadTex = buatTeksturJalan(d.tanah)'));
cek('(g16) tekstur jalan lama di-dispose (tidak bocor memori)', r3.includes('if (lama) lama.dispose();'));
cek('(g17) roadMat pakai map (warna putih supaya garis tidak menggelap)',
  r3.includes('R.roadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 })') && r3.includes('R.roadMat.map = R.roadTex;'));

console.log('== 3D: tekstur + material + pencahayaan ==');
cek('(g18) teksturKanvas: SRGB + anisotropy maks 8', r3.includes('t.colorSpace = THREE.SRGBColorSpace') && r3.includes('Math.min(R.renderer.capabilities.getMaxAnisotropy(), 8)'));
cek('(g19) tekstur kotak/batu/dinding/ground prosedural ada',
  r3.includes('kotak: teksturKanvas(128, 128') && r3.includes('batu: teksturKanvas(128, 128') && r3.includes('dinding: teksturKanvas(256, 128') && r3.includes('ground: teksturKanvas(256, 256'));
cek('(g20) ground pakai map (repeat 10x10)', r3.includes('map: TEX.ground') && r3.includes('TEX.ground.repeat.set(10, 10);'));
cek('(g21) jendela gedung 256x512 + bingkai + garis lantai',
  r3.includes("c.width = 256; c.height = 512;") && r3.includes('bingkai') && r3.includes('garis lantai'));
cek('(g22) ACES tone mapping di renderer game + showcase',
  (r3.match(/THREE\.ACESFilmicToneMapping/g) || []).length >= 2 && r3.includes('toneMappingExposure = 1.12'));
cek('(g23) fog jauh: 30..110 (pemandangan jauh tetap jelas)', r3.includes('new THREE.Fog(0xff9a5c, 30, 110)'));
cek('(g24) koin: metalness 0.75, roughness 0.28, emissive hangat',
  r3.includes('metalness: 0.75, roughness: 0.28, emissive: 0x442200, emissiveIntensity: 0.5'));
cek('(g25) showcase DPR naik ke 2 + ACES',
  r3.includes("renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // panggung ringan: DPR penuh aman"));
cek('(g26) tidak ada TextureLoader / file tekstur eksternal baru',
  !r3.includes('TextureLoader') && !r3.includes('.png') && !r3.includes('.jpg'));

console.log('== 2D fallback: backing store DPR ==');
cek('(g27) samakanUkuranCanvasNormal ada (backing = 420x520 x DPR maks 2)',
  app.includes('function samakanUkuranCanvasNormal()') && app.includes('Math.round(FS_W * dpr)') && app.includes('Math.round(FS_H * dpr)'));
cek('(g28) samakanUkuranCanvasNormal dipanggil saat load', app.includes('samakanUkuranCanvasNormal(); // terapkan sekali saat load'));
cek('(g29) keluarModeLayarPenuh pakai samakanUkuranCanvasNormal (bukan reset 420x520)',
  app.includes('samakanUkuranCanvasNormal(); // kembali ke ukuran normal') && !app.includes('canvas.width = FS_W; canvas.height = FS_H;'));
cek('(g30) resize non-fullscreen juga samakan ukuran normal',
  app.includes('else samakanUkuranCanvasNormal();'));
cek('(g31) aturHalus2D: smoothing kualitas tinggi', app.includes("ctx.imageSmoothingQuality = 'high'"));
cek('(g32) aturHalus2D dipanggil ulang setelah resize fullscreen',
  app.includes('aturHalus2D(); // ubah ukuran canvas me-reset state ctx'));
cek('(g33) animasi latar login dihapus (tidak ada lagi bgCanvas/loopLogin/samakanUkuranBgCanvas)',
  !app.includes('bgCanvas') && !app.includes('loopLogin') && !app.includes('samakanUkuranBgCanvas'));
cek('(g34) index.html: tidak ada lagi #bgCanvas', !baca('public/index.html').includes('bgCanvas'));

console.log('== SW cache ==');
cek('(g35) sw.js CACHE = lari-koin-v27', sw.includes("const CACHE = 'lari-koin-v27';"));

console.log(`\nHasil: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
