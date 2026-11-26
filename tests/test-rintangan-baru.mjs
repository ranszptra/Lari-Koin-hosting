// Rintangan baru + dunia berganti tiap level + jalan membelok (tindak lanjut
// pesan Rans 2026-11-26: "karakter sama kotanya di ganti sama itu lho yg lebih
// sulit kya ada penghalang lain jangan cuma 1 arah doang" + "temanya juga lah
// di ganti ganti jangan satu tema").
// Memuat app.js NYATA (bukan grep) dengan stub DOM, lalu:
//  A. duniaUntuk/duniaIdx: tema berputar tiap level (deterministik).
//  B. tabrakanKena/rintanganDiJalur/gerakGeser: dinding & geser hanya bisa
//     dihindari lewat jalur (lompat/guling TIDAK menolong).
//  C. pilihPola: semua pola ADIL — tiap baris ada jalur selamat, jarak antar
//     baris terjangkau dalam jedanya, dinding lv>=3, geser lv>=8.
//  D. spawnObject: distribusi + tidak pernah menutup semua jalur.
//  E. prosesPola: baris muncul berurutan dengan jeda yang benar.
//  F. jedaSpawn + resetGame: spawn makin rapat, kecepatan TIDAK berubah
//     (dibatasi validasi server: maxSpeed = (4+lv*0.18)*1.5).
//  G. renderScene (ctx perekam): dinding tergambar lebar 2 jalur, kurva
//     jalan benar-benar menggeser posisi gambar saat roadScroll berubah.
//  H. run3d.js (grep): belokJalan dipakai jalan/dekor/objek/kamera.
// Jalankan: node tests/test-rintangan-baru.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let lolos = 0, gagal = 0;
function cek(nama, ok, info = '') {
  if (ok) { lolos++; console.log('  PASS ', nama, info); }
  else { gagal++; console.log('  GAGAL', nama, info); }
}
// PRNG deterministik (mulberry32) supaya spawn/pola bisa diuji berulang
function benih(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Stub DOM (disalin dari test-appjs-load.mjs) ----------
const el = () => {
  const t = { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, select() {}, click() {},
    getContext() { return new Proxy({}, { get: (tt, k) => { if (k === 'canvas') return { width: 420, height: 520 }; if (k === 'createLinearGradient') return () => ({ addColorStop() {} }); if (k === 'measureText') return () => ({ width: 0 }); return (...a) => {}; }, set: () => true }); },
    textContent: '', innerHTML: '', value: '1', src: '', disabled: false, hidden: false };
  return t;
};
const cache = new Map();
globalThis.document = { querySelectorAll: () => [], querySelector: () => el(), getElementById: (id) => { if (!cache.has(id)) cache.set(id, el()); return cache.get(id); },
  createElement: () => el(), addEventListener() {}, body: el() };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.requestAnimationFrame = () => 0;
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} }, userAgent: 'test' }, configurable: true });
Object.defineProperty(globalThis, 'location', { value: { origin: 'https://x.test', search: '' }, configurable: true });

Math.random = benih(20261126);
const code = readFileSync(join(ROOT, 'public/app.js'), 'utf8');
const G = new Function(code + '\n;return { duniaUntuk, duniaIdx, tabrakanKena, rintanganDiJalur, gerakGeser, jedaSpawn, pilihPola, spawnPola, spawnObject, prosesPola, resetGame, renderScene, game };')();
const { duniaUntuk, duniaIdx, tabrakanKena, rintanganDiJalur, gerakGeser, jedaSpawn, pilihPola, spawnPola, spawnObject, prosesPola, resetGame, renderScene, game } = G;

console.log('== A. Tema dunia berputar tiap level ==');
const namaDunia = ['Kota Senja', 'Hutan Rimba', 'Gurun Pasir', 'Salju Abadi', 'Luar Angkasa', 'Lava Berapi'];
let putaranOk = true;
for (let lv = 1; lv <= 12; lv++) {
  if (duniaIdx(lv) !== (lv - 1) % 6 || duniaUntuk(lv).nama !== namaDunia[(lv - 1) % 6]) putaranOk = false;
}
cek('Lv 1-12 berputar 6 dunia lalu mengulang (Lv 7 = Kota Senja lagi)', putaranOk);
cek('Lv 60 = Lava Berapi (tema ke-6)', duniaIdx(60) === 5 && duniaUntuk(60).nama === 'Lava Berapi');
cek('Lv 61 (di luar batas) tetap deterministik = Kota Senja', duniaIdx(61) === 0);
cek('duniaUntuk konsisten dengan duniaIdx untuk Lv 1-60', Array.from({ length: 60 }, (_, i) => i + 1).every((lv) => duniaUntuk(lv).nama === namaDunia[duniaIdx(lv)]));

console.log('== B. Tabrakan: dinding & geser hanya bisa dihindari lewat jalur ==');
const st = (o) => Object.assign({ lane: 1, lanePos: 1, jumpY: 0, sliding: false }, o);
cek('batu di jalur + tidak lompat = kena', tabrakanKena({ kind: 'rintangan', type: 'batu', lane: 1, z: 0.05 }, st({})));
cek('batu di jalur + lompat tinggi = lolos', !tabrakanKena({ kind: 'rintangan', type: 'batu', lane: 1, z: 0.05 }, st({ jumpY: 0.7 })));
cek('pagar + guling = lolos', !tabrakanKena({ kind: 'rintangan', type: 'pagar', lane: 1, z: 0.05 }, st({ sliding: true })));
cek('pagar + tidak guling = kena', tabrakanKena({ kind: 'rintangan', type: 'pagar', lane: 1, z: 0.05 }, st({})));
cek('dinding di jalur = kena MESKIPUN lompat tinggi', tabrakanKena({ kind: 'rintangan', type: 'dinding', lane: 0, lanes: [0, 1], z: 0.05 }, st({ jumpY: 0.9 })));
cek('dinding di jalur = kena MESKIPUN guling', tabrakanKena({ kind: 'rintangan', type: 'dinding', lane: 1, lanes: [0, 1], z: 0.05 }, st({ sliding: true })));
cek('dinding di jalur kosong = lolos', !tabrakanKena({ kind: 'rintangan', type: 'dinding', lane: 0, lanes: [0, 1], z: 0.05 }, st({ lane: 2, lanePos: 2 })));
cek('geser menabrak saat lanePos berdekatan', tabrakanKena({ kind: 'rintangan', type: 'geser', lane: 0, laneA: 0, laneB: 1, lanePos: 0.5, z: 0.05 }, st({ lanePos: 0.4 })));
cek('geser lolos saat pemain di jalur jauh', !tabrakanKena({ kind: 'rintangan', type: 'geser', lane: 0, laneA: 0, laneB: 1, lanePos: 0.5, z: 0.05 }, st({ lane: 2, lanePos: 2 })));
cek('geser kena MESKIPUN lompat', tabrakanKena({ kind: 'rintangan', type: 'geser', lane: 0, laneA: 0, laneB: 1, lanePos: 1, z: 0.05 }, st({ lanePos: 1, jumpY: 0.9 })));
cek('rintangan di luar jendela z = tidak kena', !tabrakanKena({ kind: 'rintangan', type: 'batu', lane: 1, z: 0.5 }, st({})));
cek('koin bukan rintangan', !tabrakanKena({ kind: 'koin', lane: 1, z: 0.05 }, st({})));
cek('rintanganDiJalur: dinding menutup kedua jalurnya', rintanganDiJalur({ type: 'dinding', lanes: [1, 2] }, st({ lane: 2 })) && !rintanganDiJalur({ type: 'dinding', lanes: [1, 2] }, st({ lane: 0 })));

console.log('== C. Gerbang geser bergerak sinusoidal dalam batasnya ==');
const geser = { laneA: 0, laneB: 1, fase: 0, periode: 120 };
gerakGeser(geser, 0);
cek('geser di frame 0 = laneA', Math.abs(geser.lanePos - 0) < 1e-9, `lanePos=${geser.lanePos}`);
gerakGeser(geser, 60);
cek('geser di setengah periode = laneB', Math.abs(geser.lanePos - 1) < 1e-9, `lanePos=${geser.lanePos}`);
gerakGeser(geser, 120);
cek('geser di satu periode penuh kembali ke laneA', Math.abs(geser.lanePos - 0) < 1e-9, `lanePos=${geser.lanePos}`);
let diBatas = true, pernahTengah = false;
for (let f = 0; f <= 120; f++) { gerakGeser(geser, f); if (geser.lanePos < -1e-9 || geser.lanePos > 1 + 1e-9) diBatas = false; if (geser.lanePos > 0.4 && geser.lanePos < 0.6) pernahTengah = true; }
cek('geser tidak pernah keluar dari [laneA, laneB]', diBatas);
cek('geser melewati tengah (benar-benar bergerak)', pernahTengah);
const geserCepat = { laneA: 1, laneB: 2, fase: 0, periode: 10 }; // periode < 60 dijepit
gerakGeser(geserCepat, 30);
cek('periode geser dijepit minimal 60 frame (tidak terlalu cepat)', Math.abs(geserCepat.lanePos - 2) < 1e-9, `lanePos=${geserCepat.lanePos} (periode efektif 60)`);

console.log('== D. Pola rintangan ADIL (semua level 1-60, banyak seed) ==');
// Jalur yang bisa dilalui di satu baris: dinding menutup lanes-nya, geser
// menutup {laneA,laneB} (konservatif), batu/kotak/pagar tidak menutup apa-apa.
function jalurSelamat(baris) {
  const tutup = new Set();
  for (const it of baris.items) {
    if (it.kind === 'koin') continue;
    if (it.type === 'dinding' && it.lanes) it.lanes.forEach((l) => tutup.add(l));
    else if (it.type === 'geser') { tutup.add(it.laneA); tutup.add(it.laneB); }
  }
  return [0, 1, 2].filter((l) => !tutup.has(l));
}
let polaDiuji = 0, polaBermasalah = 0, contohMasalah = '';
for (let seed = 1; seed <= 8; seed++) {
  Math.random = benih(1000 + seed);
  for (let lv = 1; lv <= 60; lv++) {
    for (let k = 0; k < 12; k++) {
      const pola = pilihPola(lv);
      polaDiuji++;
      let selamatSebelumnya = null, jedaSebelumnya = 0;
      for (const baris of pola) {
        const selamat = jalurSelamat(baris);
        if (selamat.length < 1) { polaBermasalah++; contohMasalah = contohMasalah || `lv${lv} baris tanpa jalur selamat: ${JSON.stringify(baris.items)}`; }
        if (selamatSebelumnya) {
          const jarak = Math.min(...selamatSebelumnya.flatMap((a) => selamat.map((b) => Math.abs(a - b))));
          if (jarak > 2) { polaBermasalah++; contohMasalah = contohMasalah || `lv${lv} jarak jalur aman ${jarak} > 2`; }
          if (baris.jeda < 8 + 6 * jarak) { polaBermasalah++; contohMasalah = contohMasalah || `lv${lv} jeda ${baris.jeda} < ${8 + 6 * jarak} untuk jarak ${jarak}`; }
        }
        for (const it of baris.items) {
          if (it.type === 'dinding' && lv < 3) { polaBermasalah++; contohMasalah = contohMasalah || `dinding di lv${lv} < 3`; }
          if (it.type === 'geser' && lv < 8) { polaBermasalah++; contohMasalah = contohMasalah || `geser di lv${lv} < 8`; }
          if (it.type === 'geser' && it.periode < 90) { polaBermasalah++; contohMasalah = contohMasalah || `geser periode ${it.periode} < 90`; }
          if (it.type === 'dinding' && !(it.lanes && it.lanes.length === 2 && Math.abs(it.lanes[0] - it.lanes[1]) === 1)) { polaBermasalah++; contohMasalah = contohMasalah || `dinding lanes tidak bersebelahan: ${JSON.stringify(it.lanes)}`; }
        }
        selamatSebelumnya = selamat; jedaSebelumnya = baris.jeda;
      }
    }
  }
}
cek(`semua pola adil (${polaDiuji} pola diuji, ${polaBermasalah} masalah)`, polaBermasalah === 0, contohMasalah);
Math.random = benih(777);
const contohPola = { tembok: 0, sapu: 0, zigzag: 0, koridor: 0, geserKoin: 0 };
for (let i = 0; i < 400; i++) {
  const p = pilihPola(30);
  const adaGeser = p.some((b) => b.items.some((it) => it.type === 'geser'));
  const adaDinding = p.some((b) => b.items.some((it) => it.type === 'dinding'));
  if (adaGeser && adaDinding) contohPola.sapu++; // gerbang geser + tembok
  else if (adaDinding) contohPola.tembok++;
  else if (adaGeser) contohPola.geserKoin++;
  else if (p.length >= 3 && p.every((b) => b.items.length === 1)) {
    const types = p.map((b) => b.items[0].type);
    if (types.includes('pagar') && types.includes('batu')) contohPola.koridor++;
    else contohPola.zigzag++;
  }
}
cek('lima jenis pola semuanya muncul di Lv 30', Object.values(contohPola).every((v) => v > 0), JSON.stringify(contohPola));

console.log('== E. spawnObject: distribusi + tidak pernah menutup semua jalur ==');
function jalurSelamatSpawn(obstacles) {
  const tutup = new Set();
  for (const o of obstacles) {
    if (o.type === 'dinding' && o.lanes) o.lanes.forEach((l) => tutup.add(l));
    else if (o.type === 'geser') { tutup.add(o.laneA); tutup.add(o.laneB); }
  }
  return [0, 1, 2].filter((l) => !tutup.has(l));
}
let spawnDiuji = 0, spawnBermasalah = 0, dindingLv1 = 0, geserLv7 = 0, dindingLv10 = 0, geserLv10 = 0, polaLv30 = 0;
for (const lv of [1, 2, 3, 7, 10, 30, 60]) {
  Math.random = benih(5000 + lv);
  for (let i = 0; i < 1500; i++) {
    game.level = lv; game.objects = []; game.polaAntrian = [];
    const sebelum = game.objects.length;
    spawnObject();
    const baru = game.objects.slice(sebelum).filter((o) => o.kind === 'rintangan');
    spawnDiuji++;
    if (jalurSelamatSpawn(baru).length < 1) spawnBermasalah++;
    for (const o of baru) {
      if (o.type === 'dinding' && lv < 3) dindingLv1++;
      if (o.type === 'geser' && lv < 8) geserLv7++;
      if (o.type === 'dinding' && lv === 10) dindingLv10++;
      if (o.type === 'geser' && lv === 10) geserLv10++;
    }
    if (game.polaAntrian.length) polaLv30 += lv === 30 ? 1 : 0;
  }
}
cek(`spawn tunggal tidak pernah menutup semua jalur (${spawnDiuji} spawn)`, spawnBermasalah === 0);
cek('dinding tidak muncul di Lv 1-2', dindingLv1 === 0);
cek('geser tidak muncul di Lv 1-7', geserLv7 === 0);
cek('dinding & geser muncul di Lv 10', dindingLv10 > 0 && geserLv10 > 0, `dinding=${dindingLv10}, geser=${geserLv10} dari 1500 spawn`);
cek('pola berurutan muncul di Lv 30', polaLv30 > 0, `${polaLv30} dari 1500 spawn memicu pola`);

console.log('== F. prosesPola: baris muncul berurutan dengan jeda benar ==');
// Cari pola multi-baris (tembok/sapu/zigzag/koridor) supaya jeda antar baris teruji
let jedaAwal = [], totalBaris = 0;
for (let coba = 0; coba < 20; coba++) {
  Math.random = benih(42 + coba);
  game.level = 30; game.objects = []; game.polaAntrian = [];
  spawnPola();
  if (game.polaAntrian.length >= 2) { jedaAwal = game.polaAntrian.map((b) => b.t); totalBaris = game.polaAntrian.length; break; }
}
cek('spawnPola menghasilkan pola multi-baris', totalBaris >= 2, `${totalBaris} baris, jeda=${JSON.stringify(jedaAwal)}`);
let frame = 0, muncul = [];
while (game.polaAntrian.length && frame < 200) {
  frame++;
  const nSebelum = game.objects.length;
  prosesPola();
  if (game.objects.length > nSebelum) muncul.push(frame);
}
cek('semua baris pola akhirnya muncul', game.polaAntrian.length === 0 && muncul.length === totalBaris, `muncul di frame ${JSON.stringify(muncul)}`);
let jedaOk = true;
for (let i = 0; i < muncul.length; i++) {
  const harus = jedaAwal.slice(0, i + 1).reduce((a, b) => a + Math.max(1, b), 0);
  if (muncul[i] !== harus) jedaOk = false;
}
cek('jeda antar baris sesuai (baris ke-i muncul setelah jumlah jedanya)', jedaOk, `muncul=${JSON.stringify(muncul)}, jeda=${JSON.stringify(jedaAwal)}`);

console.log('== G. Kesulitan naik: spawn makin rapat, kecepatan TETAP ==');
cek('jedaSpawn menurun per level (Lv1 > Lv30 > Lv60)', jedaSpawn(1) > jedaSpawn(30) && jedaSpawn(30) >= jedaSpawn(60));
cek('jedaSpawn lantai 22 frame (tidak di bawah itu)', jedaSpawn(60) === 22 && jedaSpawn(100) === 22);
cek('jedaSpawn Lv 1 = 74.2 frame', Math.abs(jedaSpawn(1) - 74.2) < 1e-9, `jedaSpawn(1)=${jedaSpawn(1)}`);
game.level = 1; resetGame();
cek('kecepatan Lv 1 = 4.18 (rumus lama, tidak diubah)', Math.abs(game.speed - 4.18) < 1e-9, `speed=${game.speed}`);
game.level = 60; resetGame();
cek('kecepatan Lv 60 = 14.8 (rumus lama, tidak diubah)', Math.abs(game.speed - 14.8) < 1e-9, `speed=${game.speed}`);
cek('kecepatan selalu di bawah batas validasi server (4+lv*0.18)*1.5', [1, 10, 30, 60].every((lv) => { game.level = lv; resetGame(); return game.speed <= (4 + lv * 0.18) * 1.5; }));
cek('resetGame mengosongkan antrean pola', (() => { game.polaAntrian = [{ t: 5, items: [] }]; game.level = 5; resetGame(); return game.polaAntrian.length === 0; })());

console.log('== H. renderScene: dinding lebar + jalan bergelombang (ctx perekam) ==');
function ctxPerekam() {
  const rek = { fillRect: [], fillText: [] };
  return {
    rek,
    ctx: new Proxy({ canvas: { width: 420, height: 520 } }, {
      get: (t, k) => {
        if (k === 'canvas') return t.canvas;
        if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
        if (k === 'measureText') return () => ({ width: 0 });
        if (k === 'fillRect') return (...a) => { rek.fillRect.push(a); };
        if (k === 'fillText') return (...a) => { rek.fillText.push(a); };
        return (...a) => {};
      },
      set: (t, k, v) => { t[k] = v; return true; },
    }),
  };
}
const dasar = { level: 5, frame: 10, lane: 1, lanePos: 1, objects: [], roadScroll: 0, debu: [], shield: false, jumpY: 0, sliding: false };
let tanpaThrow = true;
try {
  const r1 = ctxPerekam();
  renderScene(r1.ctx, Object.assign({}, dasar, { objects: [{ kind: 'rintangan', type: 'dinding', lane: 0, lanes: [0, 1], z: 0.5 }, { kind: 'rintangan', type: 'geser', lane: 0, laneA: 0, laneB: 1, lanePos: 0.5, z: 0.6 }, { kind: 'koin', lane: 2, z: 0.7 }] }));
  const lebarMaks = Math.max(0, ...r1.rek.fillRect.map((a) => a[2]));
  cek('dinding tergambar jauh lebih lebar dari kotak (2 jalur)', lebarMaks > 60, `lebar fillRect maks=${lebarMaks.toFixed(1)}px`);
  const r2 = ctxPerekam();
  renderScene(r2.ctx, Object.assign({}, dasar, { roadScroll: 0 }));
  const r3 = ctxPerekam();
  renderScene(r3.ctx, Object.assign({}, dasar, { roadScroll: 0.5 }));
  const x2 = r2.rek.fillText.map((a) => a[1]);
  const x3 = r3.rek.fillText.map((a) => a[1]);
  const bergeser = x2.some((x, i) => Math.abs(x - x3[i]) > 0.01);
  cek('kurva jalan menggeser posisi gambar saat roadScroll berubah', bergeser, `contoh x: ${x2[0].toFixed(1)} -> ${x3[0].toFixed(1)}`);
} catch (e) { tanpaThrow = false; console.log('  renderScene throw:', e.message); }
cek('renderScene tidak throw dengan dinding/geser/koin', tanpaThrow);

console.log('== I. run3d.js: belokJalan + template baru ==');
const r3 = readFileSync(join(ROOT, 'public/run3d.js'), 'utf8');
cek('belokJalan ada + diekspor di bridge', r3.includes('export function belokJalan') && r3.includes('laneToX, worldZ, belokJalan,'));
cek('geometri jalan ditekuk (PlaneGeometry 24 segmen + belokJalan)', r3.includes('new THREE.PlaneGeometry(7.4, 110, 1, 24)') && r3.includes('belokJalan(pos.getZ(i) - 40)'));
cek('garis jalur ikut ditekuk (v19: garis menyatu di tekstur jalan, jalan ditekuk)', r3.includes('garis putus-putus di pembatas jalur') && r3.includes('new THREE.PlaneGeometry(7.4, 110, 1, 24)') && r3.includes('belokJalan(pos.getZ(i) - 40)'));
cek('dekor mengikuti belokan (baseX + advanceDecor)', r3.includes('baseX + belokJalan') && r3.includes('d.group.position.x = (d.baseX || 0) + belokJalan'));
cek('template dinding + geser dibuat', r3.includes("['batu', 'kotak', 'pagar', 'dinding', 'geser']"));
cek('pool rintangan diperbesar (OBS_POOL 18)', r3.includes('const OBS_POOL = 18;'));
cek('syncObjects memakai belokJalan + x dinding/geser', r3.includes('belokJalan(wz)') && r3.includes("o.type === 'geser'") && r3.includes("o.type === 'dinding'"));
cek('karakter + kamera mengikuti belokan', r3.includes('belokJalan(0)') && r3.includes('belokJalan(-12)'));
cek('sw.js CACHE v21', readFileSync(join(ROOT, 'public/sw.js'), 'utf8').includes("lari-koin-v21"));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
