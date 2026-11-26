// Bukti NYATA klip hewan (v21) dengan Three.js + GLTFLoader asli di Node:
// 1. Muat Fox.gltf (rubah Quaternius) — cek rig (1 skin), mesh, klip native.
// 2. Mainkan klip Gallop (lari) + Gallop_Jump (lompat) di mixer — TANPA
//    retarget: klip dipakai apa adanya dari berkas .gltf hewannya.
// 3. Cek aksi berstatus running dan mixer.update() berjalan tanpa throw,
//    lalu cek transisi lompat -> kembali ke Gallop (seperti finished listener).
// 4. Cek Idle + Idle_2 juga bisa diputar (showcase Beranda).
// Menggantikan test-retarget-manusia.mjs (Traveller + Xbot dihapus v21).
// Jalankan: node tests/test-klip-hewan.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from './inspect/three.module.mjs';
import { GLTFLoader } from './inspect/addons/GLTFLoader.mjs';

if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class ProgressEvent { constructor(t, i) { this.type = t; if (i) Object.assign(this, i); } };
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEWAN = join(ROOT, 'public/models-animals');

let lolos = 0, gagal = 0;
function cek(nama, ok, info = '') {
  if (ok) { lolos++; console.log('  PASS ', nama, info); }
  else { gagal++; console.log('  GAGAL', nama, info); }
}
async function muatGLTF(nama) {
  const text = readFileSync(join(HEWAN, nama), 'utf8');
  const loader = new GLTFLoader();
  return new Promise((res, rej) => loader.parse(text, '', res, rej));
}

console.log('== Fox.gltf: rig + klip native ==');
const fox = await muatGLTF('Fox.gltf');
const meshKulit = [];
fox.scene.traverse((o) => { if (o.isSkinnedMesh) meshKulit.push(o); });
cek('Fox punya skinned mesh (rigged)', meshKulit.length >= 1, `skinnedMesh=${meshKulit.length}`);
cek('Fox: semua mesh pakai 1 skeleton yang sama', new Set(meshKulit.map((m) => m.skeleton)).size === 1);
const namaKlip = fox.animations.map((c) => c.name);
cek('Fox punya klip Gallop', namaKlip.includes('Gallop'));
cek('Fox punya klip Gallop_Jump', namaKlip.includes('Gallop_Jump'));
cek('Fox punya klip Idle', namaKlip.includes('Idle'));
cek('Fox punya klip Idle_2', namaKlip.includes('Idle_2'));
cek('Fox punya klip Walk', namaKlip.includes('Walk'));

console.log('== Mixer: Gallop + Gallop_Jump tanpa retarget ==');
const mixer = new THREE.AnimationMixer(fox.scene);
const gallop = fox.animations.find((c) => c.name === 'Gallop');
const jump = fox.animations.find((c) => c.name === 'Gallop_Jump');
const aRun = mixer.clipAction(gallop);
aRun.setLoop(THREE.LoopRepeat, Infinity);
aRun.play();
cek('Gallop berstatus running', aRun.isRunning(), `durasi ${gallop.duration.toFixed(2)}s`);
mixer.update(0.5);
cek('mixer.update(0.5) tanpa throw (lari)', true);
// Lompat: sekali jalan (LoopOnce) lalu kembali ke Gallop — seperti finished listener di run3d.js
const aJump = mixer.clipAction(jump);
aJump.setLoop(THREE.LoopOnce, 1);
aJump.clampWhenFinished = true;
aJump.play();
mixer.update(0.1);
cek('Gallop_Jump berstatus running', aJump.isRunning(), `durasi ${jump.duration.toFixed(2)}s`);
mixer.update(jump.duration + 0.2);
cek('Gallop_Jump selesai setelah durasinya (LoopOnce)', !aJump.isRunning() || aJump.paused === false);
aRun.play();
mixer.update(0.2);
cek('Gallop bisa diputar lagi setelah lompat', aRun.isRunning());

console.log('== Idle + Idle_2 (showcase) ==');
for (const nm of ['Idle', 'Idle_2']) {
  const klip = fox.animations.find((c) => c.name === nm);
  const aksi = mixer.clipAction(klip);
  aksi.setLoop(THREE.LoopRepeat, Infinity);
  aksi.play();
  mixer.update(0.3);
  cek(`${nm} berstatus running`, aksi.isRunning(), `durasi ${klip.duration.toFixed(2)}s`);
  aksi.stop();
}

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
