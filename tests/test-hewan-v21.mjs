// Tes v21: semua karakter manusia -> hewan (Quaternius, CC0).
// Memastikan: 12 model .gltf ada + valid + rigged + klip Gallop/Jump;
// 12 foto hewan ada (JPEG 1120x2240); roster db.js + app.js sama dan
// menunjuk ke foto + model yang ada; tidak ada lagi Traveller/manusia di
// jalur lari (run3d.js/app.js); logo + ikon = rubah baru; sw.js v21.
// Jalankan: node tests/test-hewan-v21.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
let lolos = 0, gagal = 0;
function cek(nama, ok, info = '') {
  if (ok) { lolos++; console.log('  PASS ', nama, info); }
  else { gagal++; console.log('  GAGAL', nama, info); }
}
function baca(p) { return readFileSync(join(ROOT, p), 'utf8'); }
function sha(p) { return createHash('sha256').update(readFileSync(p)).digest('hex'); }
// Dimensi JPEG dari marker SOF (tanpa dependensi)
function ukuranJpeg(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xC0 && m <= 0xC3 && m !== 0xC4) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}
// Dimensi PNG dari chunk IHDR
function ukuranPng(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const HEWAN = [
  { id: 'char-01', level: 5, nama: 'Rex', model: 'Fox', skala: 0.512 },
  { id: 'char-02', level: 10, nama: 'Fang', model: 'Wolf', skala: 0.52 },
  { id: 'char-03', level: 15, nama: 'Snow', model: 'Husky', skala: 0.478 },
  { id: 'char-04', level: 20, nama: 'Mochi', model: 'ShibaInu', skala: 0.541 },
  { id: 'char-05', level: 25, nama: 'Spirit', model: 'Horse', skala: 0.36 },
  { id: 'char-06', level: 30, nama: 'Blanco', model: 'Horse_White', skala: 0.36 },
  { id: 'char-07', level: 35, nama: 'Ranger', model: 'Stag', skala: 0.284 },
  { id: 'char-08', level: 40, nama: 'Fawn', model: 'Deer', skala: 0.391 },
  { id: 'char-09', level: 45, nama: 'Dunky', model: 'Donkey', skala: 0.445 },
  { id: 'char-10', level: 50, nama: 'Moo', model: 'Cow', skala: 0.31 },
  { id: 'char-11', level: 55, nama: 'Toro', model: 'Bull', skala: 0.31 },
  { id: 'char-12', level: 60, nama: 'Paca', model: 'Alpaca', skala: 0.31 },
];

console.log('== A. 12 model .gltf hewan: ada + valid + rigged + klip ==');
for (const h of HEWAN) {
  const rel = `public/models-animals/${h.model}.gltf`;
  const ada = existsSync(join(ROOT, rel));
  cek(`model ${h.model}.gltf ada`, ada);
  if (!ada) continue;
  const buf = readFileSync(join(ROOT, rel));
  let j = null;
  try { j = JSON.parse(buf.toString('utf8')); } catch (e) { j = null; }
  cek(`${h.model}: JSON glTF valid`, !!j && j.asset && j.asset.version === '2.0');
  if (!j) continue;
  cek(`${h.model}: 1 skin (rigged)`, Array.isArray(j.skins) && j.skins.length === 1);
  cek(`${h.model}: buffer tertanam (tanpa berkas luar)`, Array.isArray(j.buffers) && j.buffers.length >= 1 && j.buffers.every((b) => typeof b.uri === 'string' && b.uri.startsWith('data:')));
  const klip = (j.animations || []).map((a) => a.name);
  cek(`${h.model}: klip Gallop`, klip.includes('Gallop'), `klip: ${klip.join(',')}`);
  cek(`${h.model}: klip lompat Gallop_Jump`, klip.includes('Gallop_Jump'));
  cek(`${h.model}: klip Idle + Idle_2`, klip.includes('Idle') && klip.includes('Idle_2'));
  cek(`${h.model}: > 1 MB`, buf.length > 1_000_000, `${(buf.length / 1e6).toFixed(2)} MB`);
}

console.log('== B. 12 foto hewan: ada + JPEG 1120x2240 ==');
for (const h of HEWAN) {
  const n = h.id.slice(-2);
  const rel = `public/characters/animal-${n}.jpg`;
  const ada = existsSync(join(ROOT, rel));
  cek(`foto animal-${n}.jpg ada`, ada);
  if (!ada) continue;
  const buf = readFileSync(join(ROOT, rel));
  cek(`animal-${n}.jpg: magic JPEG`, buf[0] === 0xFF && buf[1] === 0xD8);
  const uk = ukuranJpeg(buf);
  cek(`animal-${n}.jpg: 1120x2240 portrait`, !!uk && uk.w === 1120 && uk.h === 2240, uk ? `${uk.w}x${uk.h}` : 'ukuran tidak terbaca');
  cek(`animal-${n}.jpg: > 100 KB`, buf.length > 100_000, `${(buf.length / 1e3).toFixed(0)} KB`);
}

console.log('== C. Roster db.js + app.js: sama + menunjuk berkas yang ada ==');
const db = baca('db.js');
const app = baca('public/app.js');
for (const h of HEWAN) {
  const n = h.id.slice(-2);
  const potongan = `id: '${h.id}', level: ${h.level}, nama: '${h.nama}', img: '/characters/animal-${n}.jpg'`;
  cek(`db.js: ${h.id} ${h.nama} (${h.model}, Lv ${h.level})`, db.includes(potongan));
  cek(`app.js: ${h.id} ${h.nama} (${h.model}, Lv ${h.level})`, app.includes(potongan));
  cek(`app.js: ${h.nama} model ${h.model} skala ${h.skala}`, app.includes(`model: '${h.model}', skala: ${h.skala}`));
  cek(`db.js: ${h.nama} model ${h.model} skala ${h.skala}`, db.includes(`model: '${h.model}', skala: ${h.skala}`));
}
cek('db.js: 12 entri roster', (db.match(/id: 'char-\d\d', level: /g) || []).length === 12);
cek('app.js: 12 entri roster', (app.match(/id: 'char-\d\d', level: /g) || []).length === 12);
cek('db.js: default karakter tetap char-01 (kolom equipped)', db.includes("DEFAULT '{\"character\":\"char-01\",\"skin\":null}'"));
cek('app.js: 12 hewan tanpa topi/kacamata', (app.match(/topi: null, kacamata: null/g) || []).length === 12);

console.log('== D. Jalur lari BEBAS Traveller/manusia ==');
const run3d = baca('public/run3d.js');
for (const kata of ['traveller', 'Traveller', 'CHAR_FILE', 'xbot', 'Xbot', 'remapClip', 'stripRootMotion', 'phase2', 'Phase2', 'lanjutkanPhase2', 'buatTopi', 'buatKacamata', 'pasangAksesoris', 'WARNA_BAGIAN', 'tintKlon', 'gantiShowcaseKeDansa', 'char-01.jpg']) {
  cek(`run3d.js: tidak ada "${kata}"`, !run3d.includes(kata));
}
cek('run3d.js: memuat GLTFLoader', run3d.includes("GLTFLoader") && run3d.includes("loaders/GLTFLoader.js"));
cek('run3d.js: PETA_KLIP_HEWAN (Gallop/Idle/Idle_2)', run3d.includes("run: 'Gallop'") && run3d.includes("dance: 'Idle_2'"));
cek('run3d.js: gantiKarakter tersedia', run3d.includes('function gantiKarakter(modelFile, skala)'));
cek('run3d.js: GLTFLoader.js ada di vendor', existsSync(join(PUB, 'vendor/three/addons/loaders/GLTFLoader.js')));
for (const kata of ['traveller', 'Traveller', 'CHAR_FILE', 'remapClip', 'drawNailong', 'warnaKarakter', 'lanjutkanPhase2', 'char-01.jpg']) {
  cek(`app.js: tidak ada "${kata}"`, !app.includes(kata));
}
cek('app.js: fallback 2D = foto hewan (drawHewanBelakang)', app.includes('function drawHewanBelakang(') && app.includes('fotoHewanAktif()'));
cek('app.js: gambarKarakterAktif fallback animal-01', app.includes("'/characters/animal-01.jpg'"));

console.log('== E. Logo + ikon = rubah baru ==');
const logo = join(PUB, 'runner-coin-logo.png');
cek('runner-coin-logo.png ada', existsSync(logo));
if (existsSync(logo)) {
  const buf = readFileSync(logo);
  cek('logo: PNG 1600x1600', buf[0] === 0x89 && buf[1] === 0x50 && ukuranPng(buf).w === 1600 && ukuranPng(buf).h === 1600, `${(buf.length / 1e6).toFixed(2)} MB`);
  const backup = join(ROOT, 'runner-coin-logo-rex-manusia.png');
  if (existsSync(backup)) {
    cek('logo BARU (hash beda dari logo manusia lama)', sha(logo) !== sha(backup));
  }
}
for (const [f, n] of [['icon-192.png', 192], ['icon-512.png', 512]]) {
  const p = join(PUB, f);
  cek(`${f} ada`, existsSync(p));
  if (existsSync(p)) {
    const buf = readFileSync(p);
    const uk = ukuranPng(buf);
    cek(`${f}: PNG ${n}x${n}`, uk.w === n && uk.h === n, `${uk.w}x${uk.h}`);
  }
}
const css = baca('public/style.css');
cek('style.css: .hero-logo pakai animasi logo-hewan (gerak)', css.includes('animation:logo-hewan') && css.includes('@keyframes logo-hewan'));

console.log('== F. sw.js + manifest ==');
const sw = baca('public/sw.js');
cek('sw.js CACHE = lari-koin-v24', sw.includes("const CACHE = 'lari-koin-v24';"));
cek('sw.js: TIDAK precache 12 model hewan (36 MB)', !sw.includes('models-animals'));
const manifest = JSON.parse(baca('public/manifest.json'));
cek('manifest.json: deskripsi menyebut Rex (bukan robot/manusia)', /Rex/.test(manifest.description) && !/robot/i.test(manifest.description));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
