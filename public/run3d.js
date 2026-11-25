/* Runner Coin — tampilan lari 3D (Three.js r170, WebGL).
 *
 * Karakter Xbot + animasi Mixamo (run / jump / slide / stumble) dan model koin
 * berasal dari repo Cave Runner (tope-olajide/cave-runner, lisensi MIT):
 * https://github.com/tope-olajide/cave-runner
 * Diadaptasi, BUKAN di-port mentah: tidak ada kode PlanetScale / leaderboard
 * Cave Runner di sini — semua itu sudah ditangani server game ini.
 * Karakter 3D di sini Xbot (Mixamo).
 *
 * Modul ini HANYA menggambar. Semua logika game (koin, level, nyawa, skill,
 * validasi server) tetap di app.js; modul ini membaca state game tiap frame
 * dan memutar animasi. Kalau WebGL / model gagal dimuat, game tetap jalan
 * dengan tampilan 2D canvas lama (fallback di app.js).
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/* ---------- Pemetaan koordinat game (2D) -> dunia 3D ---------- */
export const LANE_X = [-2.2, 0, 2.2]; // x dunia untuk jalur 0 / 1 / 2
export const WORLD_Z_FAR = -40; // game z=1 (spawn di horizon) -> dunia z=-40
export function laneToX(lanePos) { return (lanePos - 1) * 2.2; }
export function worldZ(gameZ) { return -40 * gameZ; }

const CHAR_SCALE = 0.01; // Xbot ~180 cm -> ~1,8 unit dunia
const COIN_SCALE = 0.004; // koin FBX 157 cm -> diameter ~0,63 unit
const MODEL_BASE = '/models/';
const CAM_POS = { x: 0, y: 3.4, z: 7.0 };
const CAM_LOOK = { x: 0, y: 1.0, z: -12 };
const COIN_POOL = 24;
const OBS_POOL = 12;
const DECOR_PER_SIDE = 7;
const DECOR_SPAN = 105; // panjang daur hiasan pinggir jalan

/* ---------- State modul (satu instance) ---------- */
const R = {
  renderer: null, scene: null, camera: null, clock: null,
  char: null, mixer: null, actions: {}, current: null, currentName: null,
  coinTemplate: null, obsTemplates: {},
  clips: {}, charSurfaceMat: null, skinHex: null, _preloadPromise: null,
  coinSlots: [], coinMap: new Map(), coinFree: [],
  obsSlots: [], obsMap: new Map(), obsFree: [],
  decor: [], decorMats: {},
  groundMat: null, roadMat: null, dashTex: null, hemi: null, shieldRing: null,
  ready: false, loading: false, failed: false,
  worldIdx: -1, world: null,
  mode: null, // null | 'idle' | 'crash'
  crashT: 0, idleT: 0, idleCoins: [],
  size: { w: 0, h: 0 },
  _raf: 0, _seen: new Set(),
};

/* ---------- Geometri & material bersama (dibuat sekali, dipakai ulang) ---------- */
let GEO = null, MAT = null;
function initShared() {
  GEO = {
    batu: new THREE.DodecahedronGeometry(0.55),
    kotak: new THREE.BoxGeometry(1.15, 1.15, 1.15),
    pagarPost: new THREE.BoxGeometry(0.18, 1.7, 0.18),
    pagarBar: new THREE.BoxGeometry(2.1, 0.35, 0.18),
    decorBox: new THREE.BoxGeometry(1, 1, 1),
    decorCone: new THREE.ConeGeometry(1, 1, 6),
    decorTrunk: new THREE.CylinderGeometry(0.25, 0.35, 1.2, 6),
    decorBall: new THREE.SphereGeometry(0.5, 10, 8),
    shield: new THREE.TorusGeometry(1.35, 0.07, 8, 40),
    fallbackCoin: new THREE.TorusGeometry(0.3, 0.11, 10, 24),
  };
  MAT = {
    batu: new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 1 }),
    kotak: new THREE.MeshStandardMaterial({ color: 0xa06a2c, roughness: 0.9 }),
    pagar: new THREE.MeshStandardMaterial({ color: 0x8d5a2b, roughness: 0.9 }),
    shield: new THREE.MeshBasicMaterial({ color: 0x448aff, transparent: true, opacity: 0.7 }),
    coinGold: new THREE.MeshStandardMaterial({ color: 0xf5b301, metalness: 0.6, roughness: 0.35 }),
  };
}

/* ---------- Util ---------- */
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}
function hexNum(hex) { return parseInt(String(hex).replace('#', ''), 16); }

/* ---------- Template rintangan ---------- */
function buildObstacleTemplate(type) {
  const g = new THREE.Group();
  if (type === 'batu') {
    const m = new THREE.Mesh(GEO.batu, MAT.batu);
    m.position.y = 0.55; m.castShadow = false; g.add(m);
  } else if (type === 'kotak') {
    const m = new THREE.Mesh(GEO.kotak, MAT.kotak);
    m.position.y = 0.58; g.add(m);
  } else { // pagar: dua tiang + palang atas (celah bawah untuk guling)
    const p1 = new THREE.Mesh(GEO.pagarPost, MAT.pagar); p1.position.set(-0.95, 0.85, 0); g.add(p1);
    const p2 = new THREE.Mesh(GEO.pagarPost, MAT.pagar); p2.position.set(0.95, 0.85, 0); g.add(p2);
    const bar = new THREE.Mesh(GEO.pagarBar, MAT.pagar); bar.position.set(0, 1.45, 0); g.add(bar);
  }
  return g;
}

/* ---------- Hiasan pinggir jalan per dunia ---------- */
function decorMaterials(idx) {
  if (R.decorMats[idx]) return R.decorMats[idx];
  const m = {};
  if (idx === 0) { // Kota Senja: gedung
    m.a = new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 1 });
    m.b = new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 1 });
    m.c = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 1 });
  } else if (idx === 1) { // Hutan: pohon
    m.a = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 1 });
    m.b = new THREE.MeshStandardMaterial({ color: 0x43a047, roughness: 1 });
    m.c = new THREE.MeshStandardMaterial({ color: 0x5d3a1a, roughness: 1 });
  } else if (idx === 2) { // Gurun: kaktus + bukit pasir
    m.a = new THREE.MeshStandardMaterial({ color: 0x4a7c2e, roughness: 1 });
    m.b = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 1 });
    m.c = new THREE.MeshStandardMaterial({ color: 0x8d6e3a, roughness: 1 });
  } else if (idx === 3) { // Salju: pinus bersalju
    m.a = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, roughness: 1 });
    m.b = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    m.c = new THREE.MeshStandardMaterial({ color: 0x5d3a1a, roughness: 1 });
  } else if (idx === 4) { // Luar Angkasa: monolit + bintang bercahaya
    m.a = new THREE.MeshStandardMaterial({ color: 0x2d1b4d, roughness: 0.6 });
    m.b = new THREE.MeshStandardMaterial({ color: 0xb388ff, emissive: 0x7c4dff, emissiveIntensity: 0.9 });
    m.c = new THREE.MeshStandardMaterial({ color: 0x4a3a6a, roughness: 0.6 });
  } else { // Lava: batu gelap + kerucut lava
    m.a = new THREE.MeshStandardMaterial({ color: 0x3a1a0a, roughness: 1 });
    m.b = new THREE.MeshStandardMaterial({ color: 0xff7043, emissive: 0xd84315, emissiveIntensity: 0.7 });
    m.c = new THREE.MeshStandardMaterial({ color: 0x5c1a00, roughness: 1 });
  }
  R.decorMats[idx] = m;
  return m;
}
function buildDecorItem(idx, m) {
  const g = new THREE.Group();
  const r = Math.random();
  if (idx === 0) { // gedung: kotak tinggi acak
    const h = 3 + Math.random() * 5;
    const b = new THREE.Mesh(GEO.decorBox, r < 0.4 ? m.a : (r < 0.7 ? m.b : m.c));
    b.scale.set(2 + Math.random() * 1.5, h, 2 + Math.random()); b.position.y = h / 2; g.add(b);
  } else if (idx === 1) { // pohon: batang + kerucut daun
    const t = new THREE.Mesh(GEO.decorTrunk, m.c); t.position.y = 0.6; g.add(t);
    const c = new THREE.Mesh(GEO.decorCone, r < 0.5 ? m.a : m.b);
    c.scale.set(1.6, 2.6, 1.6); c.position.y = 2.4; g.add(c);
  } else if (idx === 2) { // kaktus / bukit pasir
    if (r < 0.5) {
      const c = new THREE.Mesh(GEO.decorTrunk, m.a); c.scale.set(1.4, 1.8, 1.4); c.position.y = 1.1; g.add(c);
    } else {
      const c = new THREE.Mesh(GEO.decorCone, m.b); c.scale.set(2.4, 1.1, 2.4); c.position.y = 0.55; g.add(c);
    }
  } else if (idx === 3) { // pinus salju
    const t = new THREE.Mesh(GEO.decorTrunk, m.c); t.position.y = 0.6; g.add(t);
    const c = new THREE.Mesh(GEO.decorCone, r < 0.5 ? m.a : m.b);
    c.scale.set(1.5, 2.4, 1.5); c.position.y = 2.2; g.add(c);
  } else if (idx === 4) { // monolit + bola cahaya
    if (r < 0.5) {
      const b = new THREE.Mesh(GEO.decorBox, m.a); b.scale.set(1.6, 3 + Math.random() * 3, 1.6); b.position.y = 2; g.add(b);
    } else {
      const s = new THREE.Mesh(GEO.decorBall, m.b); s.scale.setScalar(1 + Math.random()); s.position.y = 1.2 + Math.random() * 1.5; g.add(s);
    }
  } else { // lava: batu + kerucut lava
    if (r < 0.5) {
      const b = new THREE.Mesh(GEO.decorBox, m.a); b.scale.set(1.8, 1.2 + Math.random(), 1.8); b.position.y = 0.7; g.add(b);
    } else {
      const c = new THREE.Mesh(GEO.decorCone, m.b); c.scale.set(1.6, 2 + Math.random(), 1.6); c.position.y = 1.1; g.add(c);
    }
  }
  return g;
}
function rebuildDecor(idx) {
  for (const d of R.decor) R.scene.remove(d.group);
  R.decor = [];
  const m = decorMaterials(idx);
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < DECOR_PER_SIDE; i++) {
      const g = buildDecorItem(idx, m);
      g.position.set(side * (5.4 + Math.random() * 3.5), 0, 8 - i * (DECOR_SPAN / DECOR_PER_SIDE) - Math.random() * 6);
      R.scene.add(g);
      R.decor.push({ group: g });
    }
  }
}

/* ---------- Scene dasar ---------- */
function initRenderer() {
  const canvas = document.getElementById('gameCanvas3d');
  if (!canvas) throw new Error('canvas #gameCanvas3d tidak ditemukan');
  R.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  R.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  R.clock = new THREE.Clock();
  R.scene = new THREE.Scene();
  R.scene.background = new THREE.Color(0xff9a5c);
  R.scene.fog = new THREE.Fog(0xff9a5c, 20, 65);
  R.camera = new THREE.PerspectiveCamera(60, 420 / 520, 0.1, 200);
  R.camera.position.set(CAM_POS.x, CAM_POS.y, CAM_POS.z);
  R.camera.lookAt(CAM_LOOK.x, CAM_LOOK.y, CAM_LOOK.z);
  R.hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 1.15);
  R.scene.add(R.hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(5, 12, 6);
  R.scene.add(dir);
  initShared();
  // tanah + jalan
  R.groundMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), R.groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -30);
  R.scene.add(ground);
  R.roadMat = new THREE.MeshStandardMaterial({ color: 0x3d2d1d, roughness: 1 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 110), R.roadMat);
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, -40);
  R.scene.add(road);
  // garis jalur putus-putus (tekstur canvas, digeser mengikuti roadScroll)
  const dc = document.createElement('canvas'); dc.width = 8; dc.height = 64;
  const dctx = dc.getContext('2d');
  dctx.fillStyle = 'rgba(255,255,255,0)'; dctx.fillRect(0, 0, 8, 64);
  dctx.fillStyle = 'rgba(255,255,255,.75)'; dctx.fillRect(2, 6, 4, 34);
  const dtex = new THREE.CanvasTexture(dc);
  dtex.wrapS = THREE.RepeatWrapping; dtex.wrapT = THREE.RepeatWrapping; dtex.repeat.set(1, 30);
  R.dashTex = dtex;
  const dashMat = new THREE.MeshBasicMaterial({ map: dtex, transparent: true });
  for (const x of [-1.1, 1.1]) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 110), dashMat);
    dash.rotation.x = -Math.PI / 2; dash.position.set(x, 0.02, -40);
    R.scene.add(dash);
  }
  // ring perisai (disembunyikan sampai skill aktif)
  R.shieldRing = new THREE.Mesh(GEO.shield, MAT.shield);
  R.shieldRing.visible = false;
  R.scene.add(R.shieldRing);
  // template rintangan + pool
  for (const t of ['batu', 'kotak', 'pagar']) R.obsTemplates[t] = buildObstacleTemplate(t);
  for (let i = 0; i < OBS_POOL; i++) {
    const group = new THREE.Group(); group.visible = false; R.scene.add(group);
    const slot = { obj: null, group, type: null };
    R.obsSlots.push(slot); R.obsFree.push(slot);
  }
  for (let i = 0; i < COIN_POOL; i++) {
    const group = new THREE.Group(); group.visible = false; R.scene.add(group);
    const slot = { obj: null, group };
    R.coinSlots.push(slot); R.coinFree.push(slot);
  }
  rebuildDecor(R.worldIdx >= 0 ? R.worldIdx : 0);
  if (R.world) applyWorld(R.worldIdx, R.world);
}

/* ---------- Dunia (warna dari tabel DUNIA di app.js) ---------- */
function applyWorld(idx, d) {
  const sky = new THREE.Color(hexNum(d.langit));
  R.scene.background = sky;
  R.scene.fog.color.copy(sky);
  R.groundMat.color.set(hexNum(d.tanah));
  R.roadMat.color.set(hexNum(d.tanah)).multiplyScalar(0.5);
  R.hemi.color.set(hexNum(d.langit));
  R.hemi.groundColor.set(hexNum(d.tanah));
}
function setWorld(idx, d) {
  if (!d) return;
  const changed = idx !== R.worldIdx;
  R.worldIdx = idx; R.world = d;
  if (!R.scene) return; // diterapkan saat initRenderer
  applyWorld(idx, d);
  if (changed) rebuildDecor(idx);
}

/* ---------- Model: Xbot + animasi + koin ---------- */
function stripRootMotion(clip) {
  // Hapus track posisi pinggul (root motion) — gerakan Y/X dikendalikan fisika game.
  // Sama seperti Cave Runner (tracks.shift pada klip slide).
  clip.tracks = clip.tracks.filter((t) => t.name !== 'mixamorigHips.position');
  return clip;
}
function makeAction(clip, loop, timeScale) {
  const a = R.mixer.clipAction(clip);
  a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  a.clampWhenFinished = !loop;
  if (timeScale) a.timeScale = timeScale;
  return a;
}
function play(name) {
  const a = R.actions[name];
  if (!a || R.currentName === name) return;
  if (R.current) R.current.fadeOut(0.18);
  R.current = a; R.currentName = name;
  a.reset().fadeIn(0.18).play();
}
async function loadModels() {
  const loader = new FBXLoader();
  // Karakter (wajib — kalau gagal, mode 3D dimatikan total)
  const charGroup = await loader.loadAsync(MODEL_BASE + 'xbot.fbx');
  charGroup.scale.setScalar(CHAR_SCALE);
  charGroup.rotation.y = Math.PI; // membelakangi kamera (lari menjauh)
  charGroup.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = false; o.receiveShadow = false;
      if (o.name === 'Beta_Surface') R.charSurfaceMat = o.material; // badan utama -> diwarnai skin
    }
  });
  R.char = charGroup;
  R.scene.add(charGroup);
  R.mixer = new THREE.AnimationMixer(charGroup);
  R.mixer.addEventListener('finished', () => {
    // klip sekali jalan selesai -> kembali ke animasi lari (kecuali saat crash)
    if (R.mode !== 'crash') play('run');
  });
  // Animasi — masing-masing opsional; kalau satu gagal, animasi itu dilewati.
  const anims = [
    ['dance', 'xbot@dancing.fbx', true, 1],
    ['run', 'xbot@running.fbx', true, 1],
    ['jump', 'xbot@jumping.fbx', false, 1.7],
    ['slide', 'xbot@sliding.fbx', false, 2.2],
    ['stumble', 'xbot@stumbling.fbx', false, 1.5],
  ];
  for (const [name, file, loop, ts] of anims) {
    try {
      const g = await loader.loadAsync(MODEL_BASE + file);
      if (!g.animations || !g.animations[0]) continue;
      const clip = g.animations[0];
      clip.name = name;
      if (name === 'jump' || name === 'slide') stripRootMotion(clip);
      R.actions[name] = makeAction(clip, loop, ts);
      R.clips[name] = clip;
    } catch (e) { console.warn('[run3d] animasi ' + name + ' gagal dimuat:', e.message); }
  }
  // Koin — kalau gagal, pakai torus emas.
  try {
    const coin = await loader.loadAsync(MODEL_BASE + 'coin.fbx');
    coin.traverse((o) => { if (o.isMesh) { o.material = MAT.coinGold; } });
    coin.scale.setScalar(COIN_SCALE);
    coin.rotation.x = Math.PI / 2; // berdirikan koin menghadap kamera
    R.coinTemplate = coin;
  } catch (e) {
    console.warn('[run3d] model koin gagal dimuat, pakai torus:', e.message);
    const t = new THREE.Mesh(GEO.fallbackCoin, MAT.coinGold);
    R.coinTemplate = t;
  }
  // Isi pool koin dengan klon template
  for (const slot of R.coinSlots) {
    const pivot = new THREE.Group();
    const mesh = R.coinTemplate.clone();
    mesh.rotation.x = R.coinTemplate.rotation.x; // klon membawa rotasi
    pivot.add(mesh);
    slot.group.add(pivot);
    slot.pivot = pivot;
  }
  if (R.actions.run) play('run');
}

/* ---------- Sinkronisasi objek game -> mesh 3D ---------- */
function syncPool(map, free, slots, objects, place) {
  const seen = R._seen; seen.clear();
  for (const o of objects) {
    if (o.taken || o.hit) continue;
    let slot = map.get(o);
    if (!slot) {
      slot = free.pop();
      if (!slot) continue; // pool penuh — objek tetap jalan di logika, cuma tidak tergambar
      slot.obj = o; map.set(o, slot); slot.group.visible = true;
    }
    place(slot, o);
    seen.add(o);
  }
  for (const [o, slot] of map) {
    if (!seen.has(o)) {
      slot.obj = null; slot.group.visible = false;
      map.delete(o); free.push(slot);
    }
  }
}
function syncObjects(st) {
  const objs = st.objects || [];
  // koin
  syncPool(R.coinMap, R.coinFree, R.coinSlots, objs.filter((o) => o.kind === 'koin'), (slot, o) => {
    slot.group.position.set(laneToX(o.lane), 0.9, worldZ(o.z));
    slot.pivot.rotation.y += 0.09; // koin berputar
  });
  // rintangan
  syncPool(R.obsMap, R.obsFree, R.obsSlots, objs.filter((o) => o.kind === 'rintangan'), (slot, o) => {
    if (slot.type !== o.type) {
      while (slot.group.children.length) slot.group.remove(slot.group.children[0]);
      slot.group.add(R.obsTemplates[o.type].clone());
      slot.type = o.type;
    }
    slot.group.position.set(laneToX(o.lane), 0, worldZ(o.z));
  });
}
function advanceDecor(speedPerFrame) {
  for (const d of R.decor) {
    d.group.position.z += speedPerFrame;
    if (d.group.position.z > 10) d.group.position.z -= DECOR_SPAN;
  }
}

/* ---------- Render satu frame saat lari ---------- */
function ensureSize() {
  const c = R.renderer.domElement;
  const w = c.clientWidth || 420, h = c.clientHeight || 520;
  if (w !== R.size.w || h !== R.size.h) {
    R.size.w = w; R.size.h = h;
    R.renderer.setSize(w, h, false);
    R.camera.aspect = w / h;
    R.camera.updateProjectionMatrix();
  }
}
function render(st) {
  if (!R.ready) return false;
  ensureSize();
  const dt = Math.min(R.clock.getDelta(), 0.05);
  if (R.mixer) R.mixer.update(dt);
  // karakter mengikuti lanePos + lompatan; miring saat pindah jalur
  const cx = laneToX(st.lanePos == null ? 1 : st.lanePos);
  R.char.position.set(cx, st.jumpY || 0, 0);
  R.char.rotation.z = -((st.lane == null ? 1 : st.lane) - (st.lanePos == null ? 1 : st.lanePos)) * 0.3;
  // kamera sedikit mengikuti karakter
  R.camera.position.x = cx * 0.35;
  R.camera.lookAt(CAM_LOOK.x, CAM_LOOK.y, CAM_LOOK.z);
  syncObjects(st);
  advanceDecor((st.speed || 4) * 0.08);
  if (R.dashTex) R.dashTex.offset.y = ((st.roadScroll || 0) * 10.9) % 1;
  if (R.shieldRing) {
    R.shieldRing.visible = !!st.shield;
    if (st.shield) R.shieldRing.position.set(cx, 1.0 + (st.jumpY || 0), 0);
  }
  R.renderer.render(R.scene, R.camera);
  return true;
}

/* ---------- Loop internal: idle (karakter lari di tempat) & crash ---------- */
function tick() {
  if (!R.mode) { R._raf = 0; return; }
  const dt = Math.min(R.clock.getDelta(), 0.05);
  if (R.mode === 'crash') {
    R.crashT += dt;
    if (R.mixer) R.mixer.update(dt);
    R.renderer.render(R.scene, R.camera);
    if (R.crashT > 1.4) { R.mode = null; R._raf = 0; return; }
    R._raf = requestAnimationFrame(tick);
    return;
  }
  // idle: karakter lari di tempat, koin melintas, dekor bergerak pelan
  R.idleT++;
  if (R.mixer) R.mixer.update(dt);
  const sway = 1 + Math.sin(R.idleT / 40) * 0.12;
  R.char.position.set(laneToX(sway), 0, 0);
  R.char.rotation.z = 0;
  R.camera.position.x = 0;
  R.camera.lookAt(CAM_LOOK.x, CAM_LOOK.y, CAM_LOOK.z);
  for (const c of R.idleCoins) {
    c.z -= 0.004;
    if (c.z < 0.05) c.z = 1;
  }
  syncObjects({ objects: R.idleCoins });
  advanceDecor(0.24);
  if (R.dashTex) R.dashTex.offset.y = (R.idleT * 0.004 * 10.9) % 1;
  if (R.shieldRing) R.shieldRing.visible = false;
  ensureSize();
  R.renderer.render(R.scene, R.camera);
  R._raf = requestAnimationFrame(tick);
}
function startTick() {
  if (R._raf) return;
  R._raf = requestAnimationFrame(tick);
}
function setIdle(on) {
  if (!R.ready) return;
  if (on) {
    if (R.mode === 'idle') return;
    R.mode = 'idle';
    R.idleCoins = [
      { kind: 'koin', lane: 1, z: 0.7 }, { kind: 'koin', lane: 1, z: 0.55 },
      { kind: 'koin', lane: 0, z: 0.85 }, { kind: 'koin', lane: 2, z: 0.4 },
    ];
    if (R.actions.run) play('run');
    startTick();
  } else if (R.mode === 'idle') {
    R.mode = null;
  }
}
function playStumble() {
  if (!R.ready) return;
  if (R.actions.stumble) play('stumble');
  R.mode = 'crash'; R.crashT = 0;
  startTick();
}

/* ---------- Preload (dipanggil setelah login; idempotent) ---------- */
async function preload() {
  if (R.ready) return true;
  if (R._preloadPromise) return R._preloadPromise;
  R.loading = true;
  R._preloadPromise = (async () => {
    try {
      if (!webglOK()) throw new Error('WebGL tidak tersedia di perangkat ini');
      initRenderer();
      await loadModels();
      R.ready = true;
    } catch (e) {
      R.failed = true;
      console.warn('[run3d] Mode 3D tidak aktif, pakai 2D:', e.message);
    } finally {
      R.loading = false;
    }
    return R.ready;
  })();
  return R._preloadPromise;
}


/* ---------- Skin: tint warna badan Xbot mengikuti skin aktif ---------- */
function applySkin(warnaHex) {
  if (!R.charSurfaceMat || !warnaHex) return false;
  try {
    R.charSurfaceMat.color.set(hexNum(warnaHex));
    R.skinHex = warnaHex;
    return true;
  } catch (e) { return false; }
}

/* ---------- Showcase karakter (login + Beranda) ----------
 * Satu panggung 3D per canvas: klon Xbot (SkeletonUtils.clone — model FBX
 * TIDAK diunduh ulang), animasi dance (jatuh ke run kalau dance gagal),
 * geser untuk memutar + putar otomatis pelan biar terasa hidup.
 * Render dilewati saat canvas tersembunyi (tab lain / sudah login).
 */
const SHOWCASES = new Map();
async function showcase(canvasId) {
  if (SHOWCASES.has(canvasId)) return SHOWCASES.get(canvasId).ok;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return false;
  const ok = await preload();
  if (!ok || !R.char) return false;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1033);
  const camera = new THREE.PerspectiveCamera(45, 420 / 300, 0.1, 100);
  camera.position.set(0, 1.7, 4.6);
  camera.lookAt(0, 1.05, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
  dir.position.set(4, 8, 5);
  scene.add(dir);
  // panggung emas
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.35, 0.14, 40),
    new THREE.MeshStandardMaterial({ color: 0x2d1b4d, roughness: 0.7, metalness: 0.2 })
  );
  platform.position.y = -0.07;
  scene.add(platform);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.035, 10, 48),
    new THREE.MeshBasicMaterial({ color: 0xf5b301 })
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.01;
  scene.add(ring);
  const clone = cloneSkinned(R.char);
  clone.rotation.y = 0; // menghadap kamera (bukan membelakangi seperti saat lari)
  clone.position.set(0, 0, 0);
  scene.add(clone);
  const mixer = new THREE.AnimationMixer(clone);
  const clip = R.clips.dance || R.clips.run;
  if (clip) {
    const a = mixer.clipAction(clip, clone);
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.play();
  }
  const S = {
    canvas, renderer, scene, camera, clone, mixer, ok: true,
    rotY: 0, dragging: false, lastX: 0, lastDragAt: 0, raf: 0,
    clock: new THREE.Clock(), w: 0, h: 0,
  };
  canvas.addEventListener('pointerdown', (e) => { S.dragging = true; S.lastX = e.clientX; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} });
  canvas.addEventListener('pointermove', (e) => {
    if (!S.dragging) return;
    S.rotY += (e.clientX - S.lastX) * 0.008;
    S.lastX = e.clientX; S.lastDragAt = performance.now();
  });
  const endDrag = () => { S.dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  const tickShow = () => {
    S.raf = requestAnimationFrame(tickShow);
    if (!canvas.isConnected || canvas.offsetParent === null || canvas.clientWidth === 0) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w !== S.w || h !== S.h) {
      S.w = w; S.h = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const dt = Math.min(S.clock.getDelta(), 0.05);
    mixer.update(dt);
    if (!S.dragging && performance.now() - S.lastDragAt > 2000) S.rotY += 0.004; // putar pelan sendiri
    clone.rotation.y = S.rotY;
    clone.position.y = Math.sin(performance.now() / 500) * 0.02; // bob halus
    renderer.render(scene, camera);
  };
  S.raf = requestAnimationFrame(tickShow);
  SHOWCASES.set(canvasId, S);
  return true;
}
function showcaseStop(canvasId) {
  const S = SHOWCASES.get(canvasId);
  if (!S) return;
  cancelAnimationFrame(S.raf);
  try { S.renderer.dispose(); } catch (e) {}
  SHOWCASES.delete(canvasId);
}

/* ---------- Jembatan ke app.js (classic script) ---------- */
if (typeof window !== 'undefined') {
  window.Run3D = {
    laneToX, worldZ, preload, setWorld, render, setIdle, playStumble,
    showcase, showcaseStop, applySkin,
    playJump() { play('jump'); },
    playSlide() { play('slide'); },
    playRun() { play('run'); },
    get ready() { return R.ready; },
    get loading() { return R.loading; },
    get failed() { return R.failed; },
  };
  if (typeof window.dispatchEvent === 'function' && typeof Event !== 'undefined') {
    window.dispatchEvent(new Event('run3d-ready'));
  }
}
