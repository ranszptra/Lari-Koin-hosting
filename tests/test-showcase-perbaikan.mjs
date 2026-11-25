// Perbaikan showcase + layar lari 3D (tindak lanjut screenshot Rans 2026-11-26):
// 1. Login: 5 karakter membelakangi kamera, gelap, kaku.
// 2. Beranda Rex: baju model 3D tidak sama dengan foto karakter.
// 3. Layar lari Lv 8 Kota Senja: karakter gelap kecil, kota kotak abu-abu polos.
//
// Bagian A = verifikasi NYATA dengan Three.js + FBXLoader di Node.
// Bagian B = cek statis (grep) run3d.js / app.js / db.js / sw.js.
// Jalankan: node tests/test-showcase-perbaikan.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from './inspect/three.module.mjs';
import { FBXLoader } from './inspect/addons/FBXLoader.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
let lolos = 0, gagal = 0;
function cek(nama, ok, info = '') {
  if (ok) { lolos++; console.log('  PASS ', nama, info); }
  else { gagal++; console.log('  GAGAL', nama, info); }
}
function baca(p) { return readFileSync(join(ROOT, p), 'utf8'); }
function muatFBX(nama) {
  const buf = readFileSync(join(PUB, 'models', nama));
  const loader = new FBXLoader();
  return loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), join(PUB, 'models', nama));
}
function remapClipMixamo(clip) {
  const tracks = clip.tracks.filter((t) => !t.name.includes('Hips.position'));
  for (const t of tracks) {
    const p = t.name.split('.');
    if (p[0].startsWith('mixamorig')) p[0] = p[0].slice('mixamorig'.length);
    t.name = p.join('.');
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
function pusatDunia(obj, namaMesh) {
  let out = null;
  obj.traverse((o) => {
    if ((o.isMesh || o.isSkinnedMesh) && o.name === namaMesh) {
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
      const c = new THREE.Vector3(); g.boundingBox.getCenter(c); o.localToWorld(c); out = c;
    }
  });
  return out;
}
function maksXZ(obj, namaMesh, y0, y1) {
  let mx = 0, mz = 0, n = 0;
  obj.traverse((o) => {
    if ((o.isMesh || o.isSkinnedMesh) && o.name === namaMesh) {
      const pos = o.geometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i); o.localToWorld(v);
        if (v.y >= y0 && v.y <= y1) { mx = Math.max(mx, Math.abs(v.x)); mz = Math.max(mz, Math.abs(v.z)); n++; }
      }
    }
  });
  return { mx, mz, n };
}

console.log('== A. Model Traveller: arah hadap + ukuran kepala (untuk topi/kacamata) ==');
const trav = muatFBX('traveller.fbx');
trav.updateMatrixWorld(true);
// Wajah di +Z (TERBUKTI): fitur wajah (mata/alis) + saku mantel + ujung sepatu di z>0
for (const m of ['body_Mat_2A1E18', 'body_Mat_3D3734', 'body_case_dark']) {
  const c = pusatDunia(trav, m);
  cek(`mesh wajah "${m}" ada di sisi +Z (pusat z=${c ? c.z.toFixed(1) : '?'})`, !!c && c.z > 0);
}
const pSaku = pusatDunia(trav, 'attach-coat-mesh_pouch');
cek('saku mantel di depan (z>0)', !!pSaku && pSaku.z > 0, pSaku ? `z=${pSaku.z.toFixed(1)}` : '');
// Tulang Head: sumbu +Z lokal -> dunia +Z (arah hadap)
let kepala = null;
trav.traverse((o) => { if (o.isBone && o.name === 'Head') kepala = o; });
cek('tulang Head ada', !!kepala);
if (kepala) {
  const depan = new THREE.Vector3(0, 0, 1).applyQuaternion(kepala.getWorldQuaternion(new THREE.Quaternion()));
  cek('Head +Z lokal mengarah ke dunia +Z (depan kamera saat rotation.y=0)', depan.z > 0.9, `depan=(${depan.x.toFixed(2)},${depan.y.toFixed(2)},${depan.z.toFixed(2)})`);
}
// Ukuran kepala untuk dimensi aksesori (mahkota cap r=0.15, lensa z=0.115)
const rambut = maksXZ(trav, 'attach-hair-mesh', 157, 167);
cek('rambut di tinggi topi muat dalam mahkota r=0.155 (|x|<=15.5cm)', rambut.mx <= 15.5 && rambut.n > 0, `|x| maks=${rambut.mx.toFixed(1)}cm`);
const wajah = maksXZ(trav, 'body_skin', 159, 164);
cek('permukaan wajah di tinggi mata tidak menembus lensa (z<=11.5cm)', wajah.mz <= 11.5 && wajah.n > 0, `|z| maks=${wajah.mz}cm`);
const mata = maksXZ(trav, 'body_Mat_2A1E18', 0, 300);
cek('mata di dalam rentang lensa (|x|<=7.5cm, lensa 2.05–7.55cm)', mata.mx <= 7.5 && mata.n > 0, `|x| maks=${mata.mx.toFixed(1)}cm`);

// Dansa: klip Xbot di-remap, terikat ke Traveller, dan BENAR-BENAR menggerakkan pinggul
const dance = muatFBX('xbot@dancing.fbx');
const klipDansa = dance.animations && dance.animations[0];
cek('xbot@dancing.fbx punya 1 klip', !!klipDansa, klipDansa ? `(${klipDansa.duration.toFixed(2)}s, ${klipDansa.tracks.length} track)` : '');
if (klipDansa) {
  const remapped = remapClipMixamo(klipDansa);
  const mixer = new THREE.AnimationMixer(trav);
  const aksi = mixer.clipAction(remapped, trav);
  aksi.setLoop(THREE.LoopRepeat, Infinity); aksi.play();
  // fase diacak per klon (buatAksiShowcase): a.time = i * duration / n
  const nKlon = 5;
  const fase = [];
  for (let i = 0; i < nKlon; i++) fase.push((i * remapped.duration) / nKlon);
  cek('fase dansa per klon berbeda (tidak serempak)', new Set(fase.map((f) => f.toFixed(2))).size === nKlon, `fase=${fase.map((f) => f.toFixed(1)).join(',')}`);
  const pinggul = trav.getObjectByName('Hips');
  const q0 = pinggul.quaternion.clone();
  mixer.update(0.5);
  const dq = q0.angleTo(pinggul.quaternion);
  cek('dans a menggerakkan pinggul Traveller (bukan diam/kaku)', dq > 0.05, `Δrot=${dq.toFixed(3)} rad / 0.5 detik`);
}

console.log('== B. run3d.js: showcase tidak lagi berputar 360° / gelap / kaku ==');
const r3 = baca('public/run3d.js');
cek('putaran 360° kontinu dihapus (tidak ada "S.rotY += 0.004")', !r3.includes('S.rotY += 0.004'));
cek('goyang pelan menghadap kamera (±20°)', r3.includes('Math.sin(now / 1400) * 0.35'));
cek('kembali pelan menghadap depan saat didiamkan', r3.includes('Math.round(S.rotY / (Math.PI * 2))'));
cek('fase dansa diacak per klon', r3.includes('a.time = (i * clip.duration) / S.clones.length'));
cek('lompatan kecil saat dansa belum ada (fallback anti-kaku)', r3.includes("S.aksi !== 'dance'") && r3.includes('Math.abs(Math.sin(now / 450 + i * 1.3)) * 0.05'));
cek('panggung showcase lebih terang (bg 0x352a5e)', r3.includes('0x352a5e'));
cek('lampu showcase diperkuat (hemi 2.2 + isi 0xffe9c4 + rim 0x9d7bff)', r3.includes('0xffe9c4') && r3.includes('0x9d7bff') && /HemisphereLight\(0xffffff, 0x9a8a6a, 2\.2\)/.test(r3));
cek('kamera showcase lebih dekat (baris 7.6 / tunggal 3.9)', r3.includes('row ? 7.6 : 3.9'));
cek('klon tetap menghadap kamera (rotation.y = 0)', r3.includes('clone.rotation.y = 0;'));

console.log('== C. run3d.js: aksesori topi + kacamata ==');
for (const fn of ['function buatTopi', 'function buatKacamata', 'function hapusAksesoris', 'function pasangAksesoris', 'function applyAksesoris', 'function setShowcaseAcc']) {
  cek(`ada ${fn}`, r3.includes(fn));
}
cek('aksesori dipasang sebagai anak tulang Head', r3.includes('kepala.add(buatTopi') && r3.includes('kepala.add(buatKacamata'));
cek('aksesori dipasang ke klon showcase (baris + tunggal)', r3.includes('pasangAksesoris(clone, accs[i])') && r3.includes('pasangAksesoris(clone, opts.acc)'));
cek('bridge mengekspor applyAksesoris + setShowcaseAcc', r3.includes('applyAksesoris, setShowcaseAcc'));
cek('mahkota cap r=0.155 di atas mata (y=0.15) — tidak menelan wajah', r3.includes('CylinderGeometry(0.145, 0.155, 0.09, 20)') && r3.includes('mahkota.position.set(0, 0.15, -0.005)'));
cek('lensa kacamata di depan wajah (z=0.115)', r3.includes('0.09, 0.115'));

console.log('== D. run3d.js: layar lari lebih terang + kota berjendela ==');
cek('kamera lari lebih dekat (CAM_POS z 5.6)', r3.includes('z: 5.6'));
cek('lampu isi dari arah kamera (0xfff2dd)', r3.includes('0xfff2dd'));
cek('jalan lebih terang (pengali 0.65)', r3.includes('multiplyScalar(0.65)'));
cek('tekstur jendela kota ada (jendelaTex + emissiveMap)', r3.includes('function jendelaTex') && r3.includes('emissiveMap'));
cek('gedung Kota Senja warna slate (0x7a7f9e, bukan abu polos)', r3.includes('0x7a7f9e'));

console.log('== E. app.js + db.js: wiring aksesori per karakter ==');
const app = baca('public/app.js');
const db = baca('db.js');
const topiApp = (app.match(/topi: '(cap|beanie)'/g) || []).length;
cek(`LEVEL_CHARACTERS app.js: 11 karakter bertopi (ketemu ${topiApp})`, topiApp === 11);
cek('Rex: cap + kacamata merah', app.includes("topi: 'cap', kacamata: '#e53935'"));
cek('Frost: tanpa topi/kacamata', app.includes("topi: null, kacamata: null"));
cek('loginShowcase menerima accs 5 karakter pertama', app.includes('accs: LEVEL_CHARACTERS.slice(0, 5)'));
cek('showcase Beranda menerima acc karakter aktif (2 tempat)', (app.match(/\{ acc: karakterAktif\(\) \}/g) || []).length === 2);
cek('applyAksesoris3D ada + dipanggil di renderProfil dan setelah preload', app.includes('function applyAksesoris3D()') && (app.match(/applyAksesoris3D\(\);/g) || []).length >= 2);
const topiDb = (db.match(/topi: '(cap|beanie)'/g) || []).length;
cek(`LEVEL_CHARACTERS db.js cermin: 11 bertopi (ketemu ${topiDb})`, topiDb === 11);
cek('db.js Frost null/null', db.includes('topi: null, kacamata: null'));

console.log('== F. sw.js ==');
cek('CACHE v19 (showcase + rintangan + tema + hero login)', baca('public/sw.js').includes("lari-koin-v19"));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
