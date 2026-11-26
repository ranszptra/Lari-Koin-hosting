// Showcase hewan + layar lari 3D — versi v21 (hewan Quaternius, bukan manusia).
// Dulu (v17): Traveller membelakangi kamera, gelap, kaku + topi/kacamata.
// Sekarang: rubah Rex (Fox.gltf) menghadap kamera, Idle_2 hidup (telinga
// berkedip, badan bernapas), TANPA aksesori manusia.
//
// Bagian A = verifikasi NYATA dengan Three.js + GLTFLoader di Node.
// Bagian B-F = cek statis (grep) run3d.js / app.js / db.js / sw.js.
// Jalankan: node tests/test-showcase-perbaikan.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from './inspect/three.module.mjs';
import { GLTFLoader } from './inspect/addons/GLTFLoader.mjs';

if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class ProgressEvent { constructor(t, i) { this.type = t; if (i) Object.assign(this, i); } };
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
let lolos = 0, gagal = 0;
function cek(nama, ok, info = '') {
  if (ok) { lolos++; console.log('  PASS ', nama, info); }
  else { gagal++; console.log('  GAGAL', nama, info); }
}
function baca(p) { return readFileSync(join(ROOT, p), 'utf8'); }
async function muatGLTF(nama) {
  const text = readFileSync(join(PUB, 'models-animals', nama), 'utf8');
  const loader = new GLTFLoader();
  return new Promise((res, rej) => loader.parse(text, '', res, rej));
}

console.log('== A. Model Fox: arah hadap + Idle_2 hidup ==');
const fox = await muatGLTF('Fox.gltf');
fox.scene.updateMatrixWorld(true);
// Hewan menghadap +Z (TERBUKTI probe-hewan.mjs): tulang Head ada di z>0
let kepala = null;
fox.scene.traverse((o) => { if (o.isBone && o.name === 'Head') kepala = o; });
cek('tulang Head ada', !!kepala);
if (kepala) {
  const hp = new THREE.Vector3();
  kepala.getWorldPosition(hp);
  cek('Head ada di sisi +Z (depan kamera saat rotation.y=0)', hp.z > 0, `Head z=${hp.z.toFixed(2)}`);
}
// Kaki depan di +Z, kaki belakang di -Z, ekor di -Z -> hewan menghadap +Z
const posTulang = (nm) => { const b = fox.scene.getObjectByName(nm); const p = new THREE.Vector3(); b.getWorldPosition(p); return p; };
const kakiDepan = posTulang('FrontLowerLegL');
const kakiBelakang = posTulang('BackLowerLegL');
const ekor = posTulang('Tail1');
cek('kaki depan di +Z, kaki belakang di -Z (hewan menghadap +Z)', kakiDepan.z > 0 && kakiBelakang.z < 0, `depan z=${kakiDepan.z.toFixed(2)}, belakang z=${kakiBelakang.z.toFixed(2)}`);
cek('ekor di belakang (-Z)', ekor.z < 0, `ekor z=${ekor.z.toFixed(2)}`);
// Idle_2 (dansa showcase): BENAR-BENAR menggerakkan hewan (telinga + napas)
const klipDansa = fox.animations.find((c) => c.name === 'Idle_2');
cek('Fox.gltf punya klip Idle_2', !!klipDansa, klipDansa ? `(${klipDansa.duration.toFixed(2)}s, ${klipDansa.tracks.length} track)` : '');
if (klipDansa) {
  const mixer = new THREE.AnimationMixer(fox.scene);
  const aksi = mixer.clipAction(klipDansa, fox.scene);
  aksi.setLoop(THREE.LoopRepeat, Infinity); aksi.play();
  const tulang = [];
  fox.scene.traverse((o) => { if (o.isBone) tulang.push(o); });
  const q0 = tulang.map((b) => b.quaternion.clone());
  let maks = 0, namaMaks = '';
  for (let k = 0; k < 20; k++) {
    mixer.update(klipDansa.duration / 20);
    tulang.forEach((b, i) => { const d = q0[i].angleTo(b.quaternion); if (d > maks) { maks = d; namaMaks = b.name; } });
  }
  cek('Idle_2 menggerakkan hewan (bukan diam/kaku)', maks > 0.1, `${namaMaks} Δrot=${maks.toFixed(3)} rad / 1 siklus`);
  cek('Idle_2 berstatus running di mixer', aksi.isRunning());
}

console.log('== B. run3d.js: showcase tidak lagi berputar 360° / gelap / kaku ==');
const r3 = baca('public/run3d.js');
cek('putaran 360° kontinu dihapus (tidak ada "S.rotY += 0.004")', !r3.includes('S.rotY += 0.004'));
cek('goyang pelan menghadap kamera (±20°)', r3.includes('Math.sin(now / 1400) * 0.35'));
cek('kembali pelan menghadap depan saat didiamkan', r3.includes('Math.round(S.rotY / (Math.PI * 2))'));
cek('lompatan kecil saat dansa belum ada (fallback anti-kaku)', r3.includes("S.aksi !== 'dance'") && r3.includes('Math.abs(Math.sin(now / 450 + i * 1.3)) * 0.05'));
cek('panggung showcase lebih terang (bg 0x352a5e)', r3.includes('0x352a5e'));
cek('lampu showcase diperkuat (hemi 2.2 + isi 0xffe9c4 + rim 0x9d7bff)', r3.includes('0xffe9c4') && r3.includes('0x9d7bff') && /HemisphereLight\(0xffffff, 0x9a8a6a, 2\.2\)/.test(r3));
cek('kamera showcase tunggal lebih jauh (4.6 — hewan lebih panjang)', r3.includes('camera.position.set(0, 1.9, 4.6)'));
cek('klon tetap menghadap kamera (rotation.y = 0)', r3.includes('clone.rotation.y = 0;'));
cek('showcase SATU klon hewan (mode baris dihapus)', r3.includes('const clone = cloneSkinned(R.char);') && !r3.includes('const n = row ? 5 : 1'));
cek('showcase memakai klip dansa hewan (Idle_2)', r3.includes('R.clips.dance || R.clips.idle || R.clips.run'));

console.log('== C. run3d.js: aksesori manusia MATI untuk hewan ==');
for (const fn of ['function buatTopi', 'function buatKacamata', 'function hapusAksesoris', 'function pasangAksesoris', 'function cariKepala']) {
  cek(`TIDAK ada ${fn}`, !r3.includes(fn));
}
cek('applyAksesoris + setShowcaseAcc ada sebagai no-op (return false)', /function applyAksesoris\(spec\) \{ return false; \}/.test(r3) && /function setShowcaseAcc\(canvasId, spec\) \{ return false; \}/.test(r3));
cek('bridge tetap mengekspor applyAksesoris + setShowcaseAcc', r3.includes('applyAksesoris, setShowcaseAcc'));
cek('TIDAK ada tintKlon (hewan tidak di-tint)', !r3.includes('tintKlon'));
cek('applySkin no-op (hewan tidak di-tint)', /function applySkin\(warna\) \{\s*return false;\s*\}/.test(r3));

console.log('== D. run3d.js: layar lari lebih terang + kota berjendela ==');
cek('kamera lari lebih dekat (CAM_POS z 5.6)', r3.includes('z: 5.6'));
cek('lampu isi dari arah kamera (0xfff2dd)', r3.includes('0xfff2dd'));
cek('jalan lebih terang (pengali 0.65)', r3.includes('multiplyScalar(0.65)'));
cek('tekstur jendela kota ada (jendelaTex + emissiveMap)', r3.includes('function jendelaTex') && r3.includes('emissiveMap'));
cek('gedung Kota Senja warna slate (0x7a7f9e, bukan abu polos)', r3.includes('0x7a7f9e'));

console.log('== E. app.js + db.js: wiring hewan per karakter ==');
const app = baca('public/app.js');
const db = baca('db.js');
const modelApp = (app.match(/model: '[A-Za-z_]+'/g) || []).length;
cek(`LEVEL_CHARACTERS app.js: 12 hewan punya model (ketemu ${modelApp})`, modelApp === 12);
cek('Rex = Fox (rubah)', app.includes("nama: 'Rex'") && app.includes("model: 'Fox'"));
const topiNullApp = (app.match(/topi: null, kacamata: null/g) || []).length;
cek(`LEVEL_CHARACTERS app.js: 12 hewan tanpa topi/kacamata (ketemu ${topiNullApp})`, topiNullApp === 12);
cek('showcase login dihapus (tidak ada lagi loginShowcase/mulaiShowcaseLogin)', !app.includes('loginShowcase') && !app.includes('mulaiShowcaseLogin'));
cek('showcase Beranda menerima opts hewan (2 tempat)', (app.match(/hewanShowcaseOpts\(\)/g) || []).length >= 2);
cek('applyAksesoris3D ada + dipanggil di renderProfil dan setelah preload', app.includes('function applyAksesoris3D()') && (app.match(/applyAksesoris3D\(\);/g) || []).length >= 2);
cek('gantiModel3D ada + dipanggil di renderProfil', app.includes('function gantiModel3D()') && app.includes('gantiModel3D(); // hewan 3D ikut karakter aktif'));
const modelDb = (db.match(/model: '[A-Za-z_]+'/g) || []).length;
cek(`LEVEL_CHARACTERS db.js cermin: 12 model (ketemu ${modelDb})`, modelDb === 12);
const topiNullDb = (db.match(/topi: null, kacamata: null/g) || []).length;
cek(`LEVEL_CHARACTERS db.js cermin: 12 tanpa topi/kacamata (ketemu ${topiNullDb})`, topiNullDb === 12);
cek('db.js Rex = Fox', db.includes("nama: 'Rex'") && db.includes("model: 'Fox'"));

console.log('== F. sw.js ==');
cek('CACHE v24', baca('public/sw.js').includes("lari-koin-v24"));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
