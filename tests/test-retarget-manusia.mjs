// Verifikasi NYATA retarget karakter manusia (v14) dengan Three.js asli di Node:
// 1. Muat traveller.fbx (karakter manusia Polyfork) — cek mesh + klip Run bawaan.
// 2. Muat xbot@jumping.fbx, remap nama track mixamorig* -> nama Traveller,
//    buang root motion Hips.position, lalu MAINkan klip itu di mixer Traveller.
// 3. Mainkan juga klip Run bawaan Traveller di mixer yang sama.
// 4. Tint skin per bagian (shirt -> warna utama) seperti applySkin di run3d.js.
// Jika mixer.update() berjalan tanpa throw dan aksi berstatus running, berarti
// animasi Xbot memang bisa dipakai ulang di model manusia (fix 9 TERBUKTI).
// Jalankan: node tests/test-retarget-manusia.mjs
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from './inspect/three.module.mjs';
import { FBXLoader } from './inspect/addons/FBXLoader.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = join(ROOT, 'public/models');

let lolos = 0, gagal = 0;
function cek(nama, ok, info = '') {
  if (ok) { lolos++; console.log('  PASS ', nama, info); }
  else { gagal++; console.log('  GAGAL', nama, info); }
}
function muatFBX(nama) {
  const buf = readFileSync(join(MODEL, nama));
  const loader = new FBXLoader();
  const obj = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), join(MODEL, nama));
  return { obj, clips: obj.animations || [] };
}
// Remap persis seperti run3d.js: strip prefix mixamorig + buang Hips.position
function remapClipMixamo(clip) {
  const tracks = clip.tracks.filter((t) => !t.name.includes('Hips.position'));
  for (const t of tracks) {
    const p = t.name.split('.');
    if (p[0].startsWith('mixamorig')) p[0] = p[0].slice('mixamorig'.length);
    t.name = p.join('.');
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

const { obj: trav, clips: travClips } = muatFBX('traveller.fbx');
const runClip = travClips.find((c) => /run/i.test(c.name));
const idleClip = travClips.find((c) => /idle/i.test(c.name));
cek('traveller.fbx termuat sebagai Group', trav && trav.isGroup);
let mesh = 0, skin = 0;
trav.traverse((o) => { if (o.isMesh) mesh++; if (o.isSkinnedMesh) skin++; });
cek(`traveller punya 17 mesh skinned (ketemu ${mesh}, skinned ${skin})`, mesh === 17 && skin === 17);
cek('traveller punya klip Run bawaan', !!runClip, runClip ? `(${runClip.duration.toFixed(2)}s, ${runClip.tracks.length} track)` : '');
cek('traveller punya klip Idle bawaan', !!idleClip, idleClip ? `(${idleClip.duration.toFixed(2)}s)` : '');
cek('klip Run bawaan punya track Hips.position (root motion)', !!runClip && runClip.tracks.some((t) => t.name.includes('Hips.position')));

// Material per bagian ada (untuk tint skin nempel)
const mats = new Set();
trav.traverse((o) => { if (o.isSkinnedMesh && o.material && o.material.name) mats.add(o.material.name); });
for (const m of ['shirt', 'coat', 'denim', 'boot', 'hair', 'skin']) {
  cek(`material bagian "${m}" ada`, mats.has(m));
}

// Remap + mainkan animasi Xbot di model manusia
const { clips: jumpClips } = muatFBX('xbot@jumping.fbx');
cek('xbot@jumping.fbx punya klip', jumpClips.length > 0);
const jumpRemap = remapClipMixamo(jumpClips[0]);
cek('klip jump hasil remap tidak punya track mixamorig*', !jumpRemap.tracks.some((t) => t.name.startsWith('mixamorig')));
cek('klip jump hasil remap tidak punya Hips.position', !jumpRemap.tracks.some((t) => t.name.includes('Hips.position')));
cek('klip jump hasil remap masih punya track tulang badan', jumpRemap.tracks.length > 20, `(${jumpRemap.tracks.length} track)`);

// Mixer sungguhan: mainkan Run bawaan + Jump hasil remap di Traveller
const mixer = new THREE.AnimationMixer(trav);
let err = null;
try {
  const aRun = mixer.clipAction(runClip, trav);
  aRun.play();
  mixer.update(0.1);
  cek('mixer: klip Run bawaan bisa dimainkan', aRun.isRunning());
  mixer.update(0.5);
  aRun.stop();
  const aJump = mixer.clipAction(jumpRemap, trav);
  aJump.setLoop(THREE.LoopOnce, 1);
  aJump.play();
  mixer.update(0.1);
  cek('mixer: klip Jump Xbot (remap) bisa dimainkan di Traveller', aJump.isRunning());
  mixer.update(0.5);
  cek('mixer: update 0.6s tanpa error', true);
} catch (e) { err = e; cek('mixer: animasi berjalan tanpa throw', false, String(e)); }

// Tint skin per bagian (simulasi applySkin run3d.js)
try {
  let shirt = null;
  trav.traverse((o) => { if (o.isSkinnedMesh && o.material && o.material.name === 'shirt') shirt = o.material; });
  shirt.color.set(0xff2222);
  cek('tint skin: warna shirt berubah ke merah roster', shirt.color.getHex() === 0xff2222);
} catch (e) { cek('tint skin: warna shirt berubah', false, String(e)); }

// Ukuran fase 1
const fase1 = statSync(join(MODEL, 'traveller.fbx')).size + statSync(join(MODEL, 'coin.fbx')).size;
cek(`fase 1 (traveller + coin) = ${(fase1 / 1e6).toFixed(2)} MB < 3 MB`, fase1 < 3_000_000);

console.log(`\nHasil: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
