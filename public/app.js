/* Runner Coin — halaman pemain. Token & progres hanya di memori JS. */
'use strict';
let token = null;
let player = null;
let profile = null;
let networks = [];
let networkIdx = 0;
let lastAdAt = 0;
let audioCtx = null;
let suaraNyala = true, musikNyala = true;
try { suaraNyala = localStorage.getItem('nr_suara') !== '0'; musikNyala = localStorage.getItem('nr_musik') !== '0'; } catch (e) {}

const $ = (id) => document.getElementById(id);
const rupiah = (n) => 'Rp' + Math.floor(n || 0).toLocaleString('id-ID');
const koinKeRp = (coins) => Math.round((coins || 0) * 15 / 1000);
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3500); }

/* ---------- Dunia (6 dunia, BERGANTI TIAP LEVEL) ----------
 * Dulu 1 dunia dipakai 10 level berturut-turut (membosankan). Sekarang tema
 * berputar tiap level: Lv 1 Kota Senja, Lv 2 Hutan Rimba, Lv 3 Gurun Pasir,
 * Lv 4 Salju Abadi, Lv 5 Luar Angkasa, Lv 6 Lava Berapi, Lv 7 Kota Senja lagi,
 * dst. Deterministik: level yang sama = tema yang sama. Dunia HANYA visual
 * (langit/tanah/partikel/gedung) — ekonomi/koin/level tidak berubah. */
const DUNIA = [
  { nama: 'Kota Senja', langit: '#ff9a5c', tanah: '#7a5a3a', aksen: '#ffd54a', hias: '🏙' },
  { nama: 'Hutan Rimba', langit: '#7ec850', tanah: '#3e6b2f', aksen: '#c8f7a0', hias: '🌳' },
  { nama: 'Gurun Pasir', langit: '#ffe08a', tanah: '#d9a441', aksen: '#fff3c4', hias: '🌵' },
  { nama: 'Salju Abadi', langit: '#bfe8ff', tanah: '#e8f4ff', aksen: '#ffffff', hias: '❄' },
  { nama: 'Luar Angkasa', langit: '#1a1033', tanah: '#2d1b4d', aksen: '#b388ff', hias: '⭐' },
  { nama: 'Lava Berapi', langit: '#5c1a00', tanah: '#8a2a00', aksen: '#ff7043', hias: '🌋' }
];
function duniaIdx(level) { return (((level || 1) - 1) % 6 + 6) % 6; }
function duniaUntuk(level) { return DUNIA[duniaIdx(level)]; }
function isBos(level) { return level % 10 === 0; }

/* Render aman: satu bagian gagal tidak boleh mengosongkan semua fitur. */
function renderAman(fn) { try { fn(); } catch (e) { console.warn('[render] gagal:', e && e.message); } }

/* ---------- Tabel data (di-hoist ke atas: dibaca pemakaian top-level) ---------- */
const KATALOG = {
  character: [
    { id: 'jolly', nama: 'Xbot', harga: 0, ikon: '🤖', desc: 'Robot lincah kesayangan — sudah dimiliki.' },
    { id: 'kiko', nama: 'Xbot Hijau', harga: 50000, ikon: '🤖', desc: 'Xbot hijau ceria.' },
    { id: 'momo', nama: 'Xbot Pink', harga: 100000, ikon: '🤖', desc: 'Xbot pink manis, pita di kepala.' },
    { id: 'rex', nama: 'Xbot Api', harga: 200000, ikon: '🤖', desc: 'Xbot oranye garang, mata laser.' }
  ],
  skin: [
    { id: 'emas', nama: 'Emas', harga: 25000, ikon: '✨', desc: 'Xbot kuning keemasan.' },
    { id: 'ninja', nama: 'Ninja', harga: 50000, ikon: '🥷', desc: 'Hitam + ikat kepala.' },
    { id: 'astronot', nama: 'Astronot', harga: 75000, ikon: '🧑‍🚀', desc: 'Putih + helm kaca.' },
    { id: 'pelangi', nama: 'Pelangi', harga: 100000, ikon: '🌈', desc: 'Warna-warni ceria.' },
    { id: 'shadow', nama: 'Shadow', harga: 150000, ikon: '🌑', desc: 'Gelap misterius.' }
  ],
  powerup: [
    { id: 'magnet', nama: 'Magnet Koin', harga: 2000, ikon: '🧲', desc: 'Menarik koin dari jalur sebelah.' },
    { id: 'perisai', nama: 'Perisai', harga: 2000, ikon: '🛡', desc: 'Menahan 1 tabrakan.' },
    { id: 'koinx2', nama: 'Koin x2', harga: 3000, ikon: '✖️2', desc: 'Koin ganda selama satu lari.' }
  ]
};
const LEVEL_CHARACTERS = [
  { id: 'char-01', level: 5, nama: 'Rex', img: '/characters/char-01.jpg', warna: ['#1a1a1a', '#000000', '#424242'] , gradasi: ['#2b2b2b', '#c62828', '#ff5252'], topi: 'cap', kacamata: '#e53935' },
  { id: 'char-02', level: 10, nama: 'Royal', img: '/characters/char-02.jpg', warna: ['#d32f2f', '#9a0007', '#ffcdd2'] , gradasi: ['#ff1744', '#c62828', '#7f0000'], topi: 'beanie', kacamata: '#e53935' },
  { id: 'char-03', level: 15, nama: 'Sky', img: '/characters/char-03.jpg', warna: ['#4fc3f7', '#0288d1', '#e1f5fe'] , gradasi: ['#b3e5fc', '#4fc3f7', '#01579b'], topi: 'beanie', kacamata: '#1565c0' },
  { id: 'char-04', level: 20, nama: 'Frost', img: '/characters/char-04.jpg', warna: ['#90caf9', '#42a5f5', '#e3f2fd'] , gradasi: ['#e3f2fd', '#90caf9', '#1565c0'], topi: null, kacamata: null },
  { id: 'char-05', level: 25, nama: 'Leaf', img: '/characters/char-05.webp', warna: ['#66bb6a', '#388e3c', '#e8f5e9'] , gradasi: ['#a5d6a7', '#43a047', '#1b5e20'], topi: 'cap', kacamata: '#111111' },
  { id: 'char-06', level: 30, nama: 'Violet', img: '/characters/char-06.webp', warna: ['#ab47bc', '#6a1b9a', '#f3e5f5'] , gradasi: ['#ce93d8', '#8e24aa', '#4a148c'], topi: 'beanie', kacamata: '#111111' },
  { id: 'char-07', level: 35, nama: 'Ember', img: '/characters/char-07.webp', warna: ['#fb8c00', '#e65100', '#fff3e0'] , gradasi: ['#ffcc80', '#fb8c00', '#bf360c'], topi: 'cap', kacamata: '#111111' },
  { id: 'char-08', level: 40, nama: 'Bubblegum', img: '/characters/char-08.webp', warna: ['#f06292', '#c2185b', '#fce4ec'] , gradasi: ['#f8bbd0', '#ec407a', '#880e4f'], topi: 'beanie', kacamata: '#111111' },
  { id: 'char-09', level: 45, nama: 'Solar', img: '/characters/char-09.webp', warna: ['#fdd835', '#f9a825', '#fffde7'] , gradasi: ['#fff176', '#fdd835', '#f57f17'], topi: 'cap', kacamata: '#111111' },
  { id: 'char-10', level: 50, nama: 'Aqua', img: '/characters/char-10.webp', warna: ['#26a69a', '#00695c', '#e0f2f1'] , gradasi: ['#80cbc4', '#26a69a', '#004d40'], topi: 'beanie', kacamata: '#111111' },
  { id: 'char-11', level: 55, nama: 'Shadow', img: '/characters/char-11.webp', warna: ['#546e7a', '#263238', '#eceff1'] , gradasi: ['#90a4ae', '#546e7a', '#11171c'], topi: 'cap', kacamata: '#111111' },
  { id: 'char-12', level: 60, nama: 'Gold', img: '/characters/char-12.webp', warna: ['#ffd700', '#b8860b', '#fffde7'] , gradasi: ['#ffe082', '#ffd700', '#8d6e00'], topi: 'cap', kacamata: '#111111' },
];
const GRADASI_DEFAULT = ['#4a2d7a', '#2d1b4d', '#8a6d00'];
const LEVEL_SKINS = [
  { id: 'es', level: 5, nama: 'Es', ikon: '❄️', desc: 'Xbot biru es yang sejuk.' },
  { id: 'sakura', level: 10, nama: 'Sakura', ikon: '🌸', desc: 'Xbot pink bunga sakura.' },
  { id: 'laut', level: 15, nama: 'Laut', ikon: '🌊', desc: 'Xbot biru laut dalam.' },
  { id: 'hutan', level: 20, nama: 'Hutan', ikon: '🌿', desc: 'Xbot hijau rimba.' },
  { id: 'senja', level: 25, nama: 'Senja', ikon: '🌇', desc: 'Xbot ungu senja.' },
  { id: 'salju', level: 30, nama: 'Salju', ikon: '⛄', desc: 'Xbot putih salju.' },
  { id: 'lava', level: 35, nama: 'Lava', ikon: '🌋', desc: 'Xbot oranye lava panas.' },
  { id: 'galaksi', level: 40, nama: 'Galaksi', ikon: '🌌', desc: 'Xbot ungu galaksi.' },
  { id: 'madu', level: 45, nama: 'Madu', ikon: '🍯', desc: 'Xbot kuning madu.' },
  { id: 'mint', level: 50, nama: 'Mint', ikon: '🍃', desc: 'Xbot hijau mint segar.' },
  { id: 'komet', level: 55, nama: 'Komet', ikon: '☄️', desc: 'Xbot oranye komet.' },
  { id: 'legenda', level: 60, nama: 'Legenda', ikon: '👑', desc: 'Xbot emas legenda — skin terakhir!' }
];
const SKIN3D_WARNA = {
  // karakter dasar (tanpa skin)
  jolly: ['#ffd93b', '#d9a400', '#fff3c4'],
  kiko: ['#a8e6a3', '#6fbf6a', '#e4f7e2'],
  momo: ['#ffc0cb', '#e88aa0', '#ffe3ea'],
  rex: ['#ffb74d', '#e08a1e', '#ffe0b3'],
  // skin toko
  emas: ['#ffd54a', '#c79a00', '#ffef9e'],
  ninja: ['#2b2b2b', '#111111', '#444444'],
  astronot: ['#ffffff', '#b0bec5', '#eef6fb'],
  pelangi: ['#ffe082', '#ff8a65', '#fff3c4'],
  shadow: ['#5a5a7a', '#33334d', '#7a7a9a'],
  // skin level (gratis per 5 level)
  es: ['#b3e5fc', '#4fc3f7', '#e1f5fe'],
  sakura: ['#f8bbd0', '#f06292', '#fce4ec'],
  laut: ['#4fc3f7', '#0288d1', '#e1f5fe'],
  hutan: ['#81c784', '#43a047', '#e8f5e9'],
  senja: ['#ce93d8', '#8e24aa', '#f3e5f5'],
  salju: ['#eceff1', '#90a4ae', '#ffffff'],
  lava: ['#ff7043', '#d84315', '#ffccbc'],
  galaksi: ['#7e57c2', '#512da8', '#ede7f6'],
  madu: ['#ffca28', '#ff8f00', '#fff8e1'],
  mint: ['#80cbc4', '#00897b', '#e0f2f1'],
  komet: ['#ff9800', '#e65100', '#fff3e0'],
  legenda: ['#ffd700', '#b8860b', '#fffde7']
};


/* ---------- Link undangan (?ref=<nama>) ----------
 * Referral berbasis NAMA: server memvalidasi nama pengundang di
 * /api/auth/social (harus ada, bukan diri sendiri). Tidak butuh ubah server. */
function parseRefParam(search) {
  try {
    const q = new URLSearchParams(search || '');
    return (q.get('ref') || '').trim().slice(0, 30);
  } catch (e) { return ''; }
}
function inviteUrlFor(name) {
  const base = (window.location && window.location.origin) || 'https://lari-koin-hosting-production.up.railway.app';
  return base + '/?ref=' + encodeURIComponent(name || '');
}
function waInviteUrl(name) {
  const url = inviteUrlFor(name);
  const text = 'Main Runner Coin bareng aku! Daftar lewat link ini, kumpulkan koin, tukar jadi uang: ' + url;
  return 'https://wa.me/?text=' + encodeURIComponent(text);
}
(function isiRefDariLink() {
  const nama = parseRefParam(window.location.search);
  if (!nama) return;
  const inp = $('authReferrer');
  if (inp) inp.value = nama;
  const note = $('refNote');
  if (note) { note.textContent = '🎁 Diundang oleh ' + nama + ' — daftar dengan Google, bonus teman otomatis tercatat.'; note.classList.remove('hidden'); }
})();
/* Tombol share di tab Undang */
(function pasangTombolInvite() {
  const salin = $('btnSalinLink');
  if (salin) salin.addEventListener('click', async () => {
    const url = ($('inviteLink') || {}).value || '';
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast('Link undangan disalin!'); }
    catch (e) { const i = $('inviteLink'); if (i) { i.select(); document.execCommand('copy'); } toast('Link undangan disalin!'); }
  });
  const bagikan = $('btnShareInvite');
  if (bagikan) bagikan.addEventListener('click', async () => {
    const nama = (profile && profile.name) || '';
    const url = inviteUrlFor(nama);
    if (navigator.share) {
      try { await navigator.share({ title: 'Runner Coin', text: 'Main Runner Coin bareng aku!', url }); } catch (e) { /* user batal share */ }
    } else {
      try { await navigator.clipboard.writeText(url); toast('Link disalin — bagikan ke temanmu!'); } catch (e) { toast('Salin manual: ' + url); }
    }
  });
})();

/* ---------- Showcase 3D (login + Beranda) ---------- */
function onRun3DReady(cb) {
  if (window.Run3D) { cb(); return; }
  window.addEventListener('run3d-ready', cb, { once: true });
}
function mulaiShowcase(canvasId, fallbackId, opts) {
  const R3 = window.Run3D;
  if (!R3 || typeof R3.showcase !== 'function') return;
  const gagal = () => {
    const fb = $(fallbackId); if (fb) fb.classList.remove('hidden');
    const cv = $(canvasId); if (cv) cv.classList.add('hidden');
  };
  R3.showcase(canvasId, opts).then((ok) => { if (!ok) gagal(); }).catch(gagal);
}
/* Login: deretan 5 karakter 3D berjejer (warna 5 roster pertama), bukan gambar. */
function mulaiShowcaseLogin() {
  mulaiShowcase('loginShowcase', 'loginShowcaseFallback', { row: true, colors: LEVEL_CHARACTERS.slice(0, 5).map((c) => c.warna), accs: LEVEL_CHARACTERS.slice(0, 5) });
}
onRun3DReady(() => mulaiShowcaseLogin());

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function api(path, method, body, timeoutMs) {
  const ctrl = timeoutMs ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(path, {
      method: method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl ? ctrl.signal : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || ('Gagal memanggil ' + path));
    return data;
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('Koneksi lambat — server tidak menjawab. Coba lagi.');
    throw e;
  } finally { if (t) clearTimeout(t); }
}

/* ---------- Suara (WebAudio, sederhana) ---------- */
function beep(freq, dur, type) {
  if (!suaraNyala) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.12, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (dur || 0.12));
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + (dur || 0.12));
  } catch (e) { /* suara opsional */ }
}

/* ---------- Musik latar (WebAudio, tanpa file) ---------- */
let musikTimer = null, musikGain = null, musikLangkah = 0, musikWaktu = 0;
const MELODI = [523, 659, 784, 659, 880, 784, 659, 523, 587, 659, 784, 880, 784, 659, 587, 523];
const BAS = [131, 131, 175, 175, 196, 196, 175, 131];
function nada(freq, mulai, dur, type, vol) {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, mulai);
  g.gain.exponentialRampToValueAtTime(vol, mulai + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, mulai + dur);
  o.connect(g); g.connect(musikGain); o.start(mulai); o.stop(mulai + dur + 0.05);
}
function jadwalMusik() {
  if (!musikNyala || !audioCtx) return;
  const langkahDur = 0.22;
  while (musikWaktu < audioCtx.currentTime + 0.6) {
    const i = musikLangkah % 16;
    nada(MELODI[i], musikWaktu, 0.2, 'triangle', 0.06);
    if (i % 2 === 0) nada(BAS[(musikLangkah >> 1) % 8], musikWaktu, 0.4, 'sine', 0.05);
    musikWaktu += langkahDur; musikLangkah++;
  }
}
function mulaiMusik() {
  if (!musikNyala) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!musikGain) { musikGain = audioCtx.createGain(); musikGain.gain.value = 1; musikGain.connect(audioCtx.destination); }
    if (!musikTimer) { musikWaktu = audioCtx.currentTime + 0.1; musikTimer = setInterval(jadwalMusik, 200); }
  } catch (e) { /* musik opsional */ }
}
function stopMusik() { if (musikTimer) { clearInterval(musikTimer); musikTimer = null; } }



/* ---------- Latar dunia bergerak (langit, matahari/bulan, partikel) ---------- */
let partikel = [], partikelDunia = -1;
function initPartikel(duniaIdx) {
  partikelDunia = duniaIdx;
  partikel = [];
  for (let i = 0; i < 26; i++) partikel.push({ x: Math.random() * 420, y: Math.random() * 520, s: 1 + Math.random() * 3, v: 0.4 + Math.random() * 1.2, f: Math.random() * Math.PI * 2 });
}
function gambarLatar(duniaIdx, frame, c) {
  const g2 = c || ctx;
  const d = DUNIA[duniaIdx];
  if (partikelDunia !== duniaIdx) initPartikel(duniaIdx);
  const g = g2.createLinearGradient(0, 0, 0, 130);
  g.addColorStop(0, d.langit); g.addColorStop(1, d.tanah);
  g2.fillStyle = g; g2.fillRect(0, 0, 420, 130);
  g2.fillStyle = duniaIdx === 4 ? '#f5f3ce' : '#fff3b0';
  g2.beginPath(); g2.arc(368, 52, duniaIdx === 4 ? 20 : 26, 0, Math.PI * 2); g2.fill();
  if (duniaIdx === 4) { g2.fillStyle = '#c9c9a8'; g2.beginPath(); g2.arc(360, 46, 5, 0, Math.PI * 2); g2.arc(376, 58, 4, 0, Math.PI * 2); g2.fill(); }
  partikel.forEach((p) => {
    p.f += 0.02;
    if (duniaIdx === 5) { p.y -= p.v; if (p.y < -6) { p.y = 526; p.x = Math.random() * 420; } }
    else { p.y += p.v; p.x += Math.sin(p.f) * 0.4; if (p.y > 526) { p.y = -6; p.x = Math.random() * 420; } }
    if (duniaIdx === 0) { g2.fillStyle = 'rgba(255,255,255,.85)'; g2.beginPath(); g2.ellipse(p.x, p.y, p.s * 5, p.s * 2.2, 0, 0, Math.PI * 2); g2.fill(); }
    else if (duniaIdx === 1) { g2.fillStyle = 'rgba(120,220,120,.9)'; g2.save(); g2.translate(p.x, p.y); g2.rotate(p.f); g2.fillRect(-p.s * 2, -p.s, p.s * 4, p.s * 2); g2.restore(); }
    else if (duniaIdx === 2) { g2.fillStyle = 'rgba(230,200,140,.8)'; g2.beginPath(); g2.arc(p.x, p.y, p.s, 0, Math.PI * 2); g2.fill(); }
    else if (duniaIdx === 3) { g2.fillStyle = 'rgba(255,255,255,.95)'; g2.beginPath(); g2.arc(p.x, p.y, p.s, 0, Math.PI * 2); g2.fill(); }
    else if (duniaIdx === 4) { g2.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.6 * Math.abs(Math.sin(p.f))).toFixed(2) + ')'; g2.beginPath(); g2.arc(p.x, p.y, p.s * 0.8, 0, Math.PI * 2); g2.fill(); }
    else { g2.fillStyle = 'rgba(255,' + (100 + Math.floor(80 * Math.abs(Math.sin(p.f)))) + ',40,.95)'; g2.beginPath(); g2.arc(p.x, p.y, p.s, 0, Math.PI * 2); g2.fill(); }
  });
}

/* ---------- Auth ---------- */
async function sesudahLogin(pesan) {
  if (player && player.banned) {
    $('authMsg').textContent = 'Akun ini otomatis diblokir: IP kamu sudah dipakai akun lain. Hubungi admin untuk buka blokir.';
    return;
  }
  $('authScreen').classList.add('hidden');
  const bg = $('bgCanvas'); if (bg) bg.style.display = 'none';
  $('app').classList.remove('hidden');
  $('authMsg').textContent = '';
  if (pesan) toast(pesan);
  await muatProfil();
  await muatLeaderboard();
  await muatOffers();
  perbaruiStatusTapjoy();
  await muatNetworks();
  cobaPreload3D(); // muat model 3D di waktu luang (setelah login)
  if (window.Run3D && window.Run3D.showcaseStop) window.Run3D.showcaseStop('loginShowcase'); // bebaskan konteks WebGL login (HP cuma kuat 2 konteks)
  onRun3DReady(() => mulaiShowcase('berandaShowcase', 'berandaShowcaseFallback', { acc: karakterAktif() }));
  let tourDone = false;
  try { tourDone = localStorage.getItem('nr_tour_done') === '1'; } catch (e) {}
  if (!tourDone) tampilTour(0);
  pindahTab('beranda');
}

/* Navigasi tab bawah: Beranda / Wallet / Tugas / Undang Teman */
function pindahTab(nama) {
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('aktif', p.id === 'tab-' + nama));
  document.querySelectorAll('.tab-nav button').forEach((b) => b.classList.toggle('aktif', b.dataset.tab === nama));
  if (nama !== 'beranda' && typeof game !== 'undefined' && game.running && !game.paused) {
    jedaGame(); // pindah tab = jeda
  }
  if (nama === 'beranda') { if (token) mulaiShowcase('berandaShowcase', 'berandaShowcaseFallback', { acc: karakterAktif() }); }
  else if (window.Run3D && window.Run3D.showcaseStop) window.Run3D.showcaseStop('berandaShowcase');
  if (nama !== 'beranda' && window.Run3D) window.Run3D.setIdle(false); // matikan loop idle 3D di tab lain
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tab-nav button').forEach((b) => b.addEventListener('click', () => pindahTab(b.dataset.tab)));

/* ---------- Tur fitur (pertama daftar) ---------- */
const TOUR_STEPS = [
  { img: '/runner-coin-logo.png', judul: 'Selamat datang di Runner Coin! 🏃', teks: 'Karaktermu siap lari bersamamu. Lari, kumpulkan koin, tukar koin jadi uang sungguhan.' },
  { judul: '🎮 Cara Main', teks: 'Geser kiri / kanan atau ketuk tombol untuk pindah jalur. Hindari batu, kotak, pagar, tembok 2 jalur & gerbang geser — tembok dan gerbang tidak bisa dilompat, harus pindah jalur. Ambil koin — tiap koin +10 koin. Tema dunia berganti tiap level. Selesaikan level dengan lari sampai jarak target.' },
  { judul: '🏆 60 Level, 6 Dunia', teks: 'Level makin sulit sampai level 60. Tiap 10 level ada level BOS dengan hadiah 5x lipat. Dunia baru terbuka tiap 10 level: Kota Senja, Hutan Rimba, Gurun Pasir, Salju Abadi, Luar Angkasa, Lava Berapi.' },
  { judul: '🎯 Misi & Check-in', teks: 'Kerjakan misi harian dan check-in 7 hari berturut-turut untuk koin gratis. Jangan sampai putus — kalau bolos, streak kembali ke hari 1!' },
  { judul: '👥 Undang Teman', teks: 'Bagikan link undanganmu. Tiap teman yang daftar, nonton iklan, dan menyelesaikan level, kamu dapat Rp5.000.' },
  { judul: '💰 Tukar Koin Jadi Uang', teks: '1.000 koin = Rp15. Tarik mulai Rp1.000 ke DANA, GoPay, OVO, atau ShopeePay. Semakin sering main, semakin cepat cair!' }
];
let tourIdx = 0;
function tampilTour(i) {
  tourIdx = i;
  const s = TOUR_STEPS[i];
  $('tourStep').textContent = 'Langkah ' + (i + 1) + ' dari ' + TOUR_STEPS.length;
  $('tourTitle').textContent = s.judul;
  $('tourText').textContent = s.teks;
  if (s.img) { $('tourImg').src = s.img; $('tourImg').classList.remove('hidden'); }
  else $('tourImg').classList.add('hidden');
  $('tourDots').innerHTML = TOUR_STEPS.map((_, j) => '<span class="dot' + (j === i ? ' on' : '') + '"></span>').join('');
  $('btnTourNext').textContent = i === TOUR_STEPS.length - 1 ? 'Mulai Main ▶' : 'Lanjut';
  $('tourModal').classList.add('show');
}
function tutupTour() {
  $('tourModal').classList.remove('show');
  try { localStorage.setItem('nr_tour_done', '1'); } catch (e) {}
}
$('btnTourNext').addEventListener('click', () => {
  if (tourIdx >= TOUR_STEPS.length - 1) tutupTour();
  else tampilTour(tourIdx + 1);
});
$('btnTourSkip').addEventListener('click', tutupTour);
$('btnCaraMain').addEventListener('click', () => tampilTour(0));

/* ---------- Login sosial (Google, sekali ketuk) ---------- */
function muatScript(src, timeoutMs) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.defer = true;
    const t = setTimeout(() => reject(new Error('Timeout memuat ' + src)), timeoutMs || 15000);
    s.onload = () => { clearTimeout(t); resolve(); };
    s.onerror = () => { clearTimeout(t); reject(new Error('Gagal memuat ' + src)); };
    document.head.appendChild(s);
  });
}
async function masukSosial(provider, tokenSosial) {
  $('socialMsg').textContent = 'Memeriksa akun ' + provider + '…';
  try {
    const referrer = $('authReferrer') ? $('authReferrer').value.trim() : '';
    const body = { provider, token: tokenSosial };
    if (referrer) body.referrer = referrer;
    const data = await api('/api/auth/social', 'POST', body);
    token = data.token; player = data.player;
    await sesudahLogin('Selamat datang, ' + (player.name || '') + '!');
  } catch (e) { $('socialMsg').textContent = e.message; }
}
async function initSosial() {
  let cfg = {};
  try { cfg = await api('/api/auth/social-config'); } catch { const m0 = $('socialMsg'); if (m0) m0.textContent = 'Tidak bisa terhubung ke server. Periksa datamu lalu coba lagi.'; return; }
  if (!cfg.google) return; // belum dikonfigurasi — tombol tetap sembunyi
  $('socialLogin').classList.remove('hidden');
  if (cfg.google && cfg.googleClientId) {
    try {
      await muatScript('https://accounts.google.com/gsi/client', 15000);
      google.accounts.id.initialize({
        client_id: cfg.googleClientId,
        callback: (resp) => { if (resp && resp.credential) masukSosial('google', resp.credential); },
        auto_select: true
      });
      google.accounts.id.renderButton($('btnGoogleWrap'), { theme: 'outline', size: 'large', text: 'signin_with' });
      const manual = $('btnGoogleManual'); if (manual) manual.style.display = 'none';
      google.accounts.id.prompt(); // One Tap: pemain lama langsung masuk otomatis
    } catch (e) {
      // Jangan sembunyikan diam-diam: tampilkan penyebab, tombol manual tetap bisa diketuk ulang
      $('btnGoogleWrap').style.display = '';
      const alasan = (e && e.message) ? e.message : String(e);
      const msg = $('socialMsg');
      if (msg) msg.textContent = 'Tombol Google gagal dimuat: ' + alasan + '. Ketuk tombol Login dengan Google di atas, atau pakai WiFi.';
      const manual = $('btnGoogleManual'); if (manual) manual.style.display = '';
      const lama = $('btnGoogleUlangi'); if (lama) lama.remove();
    }
  } else { $('btnGoogleWrap').style.display = 'none'; }
}
async function loginGoogleManual() {
  const msg = $('socialMsg');
  if (msg) msg.textContent = 'Memuat login Google…';
  await initSosial();
}
initSosial();

/* ---------- Profil & render ---------- */
async function muatProfil() {
  try {
    const data = await api('/api/profile');
    profile = data.player; player = Object.assign({}, player, profile);
    renderProfil();
  } catch (e) { toast(e.message); }
}
function renderProfil() {
  if (!profile) return;
  const coins = profile.coins || 0;
  $('saldoKoin').textContent = coins.toLocaleString('id-ID');
  $('saldoRp').textContent = rupiah(koinKeRp(coins));
  $('dompetKoin').textContent = coins.toLocaleString('id-ID') + ' koin';
  $('dompetRp').textContent = rupiah(koinKeRp(coins));
  const maxLv = profile.maxLevel || 1;
  $('levelTertinggi').textContent = maxLv;
  $('duniaNama').textContent = duniaUntuk(maxLv).nama;
  $('namaPemain').textContent = profile.name || (player && player.name) || '—';
  $('streakInfo').textContent = 'Check-in: ' + (profile.streak || 0) + ' hari';
  $('streakText').textContent = (profile.streak || 0) + ' hari';
  $('kodeInvite').textContent = profile.name || (player && player.name) || '—';
  const namaInvite = profile.name || (player && player.name) || '';
  const linkEl = $('inviteLink'); if (linkEl) linkEl.value = inviteUrlFor(namaInvite);
  const waEl = $('btnWaInvite'); if (waEl) waEl.href = waInviteUrl(namaInvite);
  const skinEl = $('skinAktifNama'); if (skinEl) skinEl.textContent = 'Skin aktif: ' + namaKarakterSkinAktif();
  // Kartu + judul karakter aktif (Beranda + hero login).
  const kAktif = karakterAktif();
  const nB = $('berandaCharNama'); if (nB) nB.textContent = kAktif ? (kAktif.nama + ' • Lv ' + kAktif.level) : 'Rex';
  const hB = $('karakterJudul'); if (hB) hB.textContent = '🎭 Karakterku — ' + (kAktif ? kAktif.nama : 'Xbot');
  applySkin3D();
  applyAksesoris3D();
  const persen = Math.min(100, Math.round(koinKeRp(coins) / 1000 * 100));
  $('progressTarik').style.width = persen + '%';
  $('progressTarikText').textContent = persen + '% menuju penarikan Rp1.000 (' + rupiah(koinKeRp(coins)) + ' dari Rp1.000)';
  $('wheelLeft').textContent = profile.wheelLeft != null ? profile.wheelLeft : '—';
  $('chestLeft').textContent = profile.chestLeft != null ? profile.chestLeft : '—';
  $('adsToday').textContent = profile.adsToday || 0;
  renderAman(renderMisi); renderAman(renderPrestasi); renderAman(renderCheckin); renderAman(renderTeman); renderAman(renderToko); renderAman(renderTarik);
  if (!game.running) { game.level = maxLv; resetGame(); } // level = progres pemain (tidak ada pilih level manual)
  updateIklanBtn(); renderNyawa();
}
function updateDuniaInfo() {
  const lv = game.level || 1;
  const d = duniaUntuk(lv);
  const idx = duniaIdx(lv) + 1;
  $('duniaInfo').textContent = '🌍 Lv ' + lv + ' — ' + d.nama + ' (tema ' + idx + '/6, berganti tiap level)' + (isBos(lv) ? ' • 👹 LEVEL BOS — hadiah 5x!' : '');
  $('labelBos').innerHTML = isBos(lv) ? '<span class="badge-bos">👹 BOS</span>' : '';
  $('hudLevel').textContent = 'Lv ' + lv;
}
function renderMisi() {
  const el = $('daftarMisi');
  const list = profile.missions || [];
  if (!list.length) { el.innerHTML = '<p class="muted">Belum ada misi hari ini.</p>'; return; }
  el.innerHTML = '';
  list.forEach((m) => {
    const d = document.createElement('div'); d.className = 'misi';
    d.innerHTML = '<div><b>' + esc(m.title) + '</b><br><span class="muted">' + esc(m.desc || '') + '</span><br><span class="small">' + (m.progress || 0) + '/' + (m.target || 1) + ' • Hadiah ' + (m.reward || 0) + ' koin</span><div class="progress"><i style="width:' + Math.min(100, Math.round((m.progress || 0) / (m.target || 1) * 100)) + '%"></i></div></div>';
    const b = document.createElement('button');
    b.className = 'btn-hijau btn-kecil'; b.textContent = m.claimed ? 'Sudah Diklaim ✓' : 'Klaim';
    b.disabled = !!m.claimed || (m.progress || 0) < (m.target || 1);
    b.addEventListener('click', async () => { try { await api('/api/missions/claim', 'POST', { missionId: m.id }); toast('Misi diklaim: +' + (m.reward || 0) + ' koin'); await muatProfil(); } catch (e) { toast(e.message); } });
    d.appendChild(b); el.appendChild(d);
  });
}
function renderPrestasi() {
  const el = $('daftarPrestasi');
  const list = profile.achievements || [];
  if (!list.length) { el.innerHTML = '<p class="muted">Belum ada prestasi.</p>'; return; }
  el.innerHTML = '';
  list.forEach((a) => {
    const d = document.createElement('div'); d.className = 'prestasi';
    d.innerHTML = '<div><b>' + (a.unlocked ? '🏅 ' : '🔒 ') + esc(a.title) + '</b><br><span class="muted">' + esc(a.desc || '') + '</span><br><span class="small">Hadiah ' + (a.reward || 0) + ' koin</span></div>';
    const b = document.createElement('button');
    b.className = 'btn-emas btn-kecil'; b.textContent = a.claimed ? 'Diklaim ✓' : (a.unlocked ? 'Klaim' : 'Terkunci');
    b.disabled = !a.unlocked || !!a.claimed;
    b.addEventListener('click', async () => { try { await api('/api/achievements/claim', 'POST', { id: a.id }); toast('Prestasi diklaim!'); await muatProfil(); } catch (e) { toast(e.message); } });
    d.appendChild(b); el.appendChild(d);
  });
}
function renderCheckin() {
  const grid = $('checkinGrid'); grid.innerHTML = '';
  const hadiah = [3333, 3333, 6667, 10000, 13333, 33333, 66667]; // koin per hari (Rp50,50,100,150,200,500,1000)
  const streak = profile.streak || 0;
  for (let i = 1; i <= 7; i++) {
    const b = document.createElement('button');
    b.textContent = 'Hari ' + i + '\n+' + hadiah[i - 1];
    if (i <= streak) { b.classList.add('done'); b.textContent = 'Hari ' + i + ' ✓'; }
    b.disabled = true; grid.appendChild(b);
  }
}
$('btnCheckin').addEventListener('click', async () => {
  try { const d = await api('/api/checkin', 'POST', {}); toast('Check-in hari ke-' + d.day + ': +' + d.coins + ' koin!'); await muatProfil(); }
  catch (e) { toast(e.message); }
});
function renderTeman() {
  const el = $('daftarTeman');
  const list = profile.referrals || [];
  if (!list.length) { el.innerHTML = '<p class="muted">Belum ada teman yang diundang.</p>'; return; }
  el.innerHTML = '';
  list.forEach((f) => {
    const d = document.createElement('div'); d.className = 'misi';
    const statusLabel = { pending: 'Menunggu syarat (teman harus nonton 1 iklan + selesaikan level 3)', ready: 'Siap diklaim', claimed: 'Sudah diklaim' }[f.status] || f.status;
    d.innerHTML = '<div><b>' + esc(f.friendName) + '</b><br><span class="muted">Status: ' + esc(statusLabel) + '</span></div>';
    const b = document.createElement('button');
    b.className = 'btn-hijau btn-kecil'; b.textContent = 'Klaim Rp5.000';
    b.disabled = f.status !== 'ready';
    b.addEventListener('click', async () => { try { await api('/api/referral/claim', 'POST', { friendId: f.friendId }); toast('Bonus teman diklaim!'); await muatProfil(); } catch (e) { toast(e.message); } });
    d.appendChild(b); el.appendChild(d);
  });
}
function renderTarik() {
  const el = $('riwayatTarik');
  const list = profile.withdrawals || [];
  if (!list.length) { el.innerHTML = '<p class="muted">Belum ada penarikan.</p>'; return; }
  el.innerHTML = '';
  list.forEach((w) => {
    const d = document.createElement('div'); d.className = 'tarik-row';
    d.innerHTML = '<div><b>' + rupiah(w.amountRp || 0) + '</b> • ' + esc(w.method || '') + '<br><span class="muted">' + esc(w.number || '') + ' • ' + esc(w.status || 'Menunggu') + '</span></div>';
    el.appendChild(d);
  });
}
$('btnTarik').addEventListener('click', async () => {
  const amount = parseInt($('tarikJumlah').value, 10);
  const method = $('tarikMetode').value;
  const number = $('tarikNomor').value.trim();
  if (!number) { toast('Isi nomor tujuan dulu.'); return; }
  try { await api('/api/withdraw', 'POST', { amount, method, number }); toast('Penarikan ' + rupiah(amount) + ' diajukan.'); $('tarikNomor').value = ''; await muatProfil(); }
  catch (e) { toast(e.message); }
});

/* ---------- Roda, peti, kode, leaderboard ---------- */
$('btnSpin').addEventListener('click', async () => {
  try { const d = await api('/api/spin-wheel', 'POST', {}); $('spinHasil').textContent = 'Kamu dapat +' + (d.prize || 0) + ' koin!'; toast('Roda hadiah: +' + (d.prize || 0) + ' koin'); await muatProfil(); }
  catch (e) { toast(e.message); }
});
$('btnChest').addEventListener('click', async () => {
  try { const d = await api('/api/open-chest', 'POST', {}); $('chestHasil').textContent = 'Peti berisi +' + (d.prize || 0) + ' koin!'; toast('Peti misteri: +' + (d.prize || 0) + ' koin'); await muatProfil(); }
  catch (e) { toast(e.message); }
});
$('btnKode').addEventListener('click', async () => {
  const code = $('kodeHadiah').value.trim();
  if (!code) { $('kodeHasil').textContent = 'Isi kodenya dulu.'; return; }
  try { const d = await api('/api/redeem', 'POST', { code }); $('kodeHasil').textContent = 'Berhasil! +' + (d.coins || d.reward || 0) + ' koin.'; $('kodeHadiah').value = ''; await muatProfil(); }
  catch (e) { $('kodeHasil').textContent = e.message; }
});
async function muatLeaderboard() {
  try {
    const d = await api('/api/leaderboard');
    const rows = d.rows || [];
    $('leaderboard').innerHTML = rows.length ? '<table><tr><th>#</th><th>Nama</th><th>Level</th><th>Koin</th></tr>' + rows.map((r, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(r.name) + '</td><td>' + (r.level || 0) + '</td><td>' + (r.coins || 0).toLocaleString('id-ID') + '</td></tr>').join('') + '</table>' : '<p class="muted">Belum ada data leaderboard.</p>';
  } catch (e) { $('leaderboard').innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; }
}
$('btnRefreshBoard').addEventListener('click', muatLeaderboard);

/* ---------- Toko ---------- */
/* Skin level — GRATIS tiap naik 5 level (Lv 5 s.d. Lv 60 = 12 skin). Set lengkap bisa ditukar Rp100.000. */
/* Karakter level — GRATIS tiap naik 5 level (Lv 5 s.d. Lv 60 = 12 karakter).
   Kartu gambar di /characters/. Warna [utama, garis, perut] dipakai tint 3D + 2D.
   Cermin dari LEVEL_CHARACTERS di db.js — jaga agar id/level/nama/img sama. */
function karakterLevel(id) { return LEVEL_CHARACTERS.find((c) => c.id === id) || null; }
/* Gradasi latar kartu per karakter (Batch 7.1) — dipakai kartu grid, hero login,
   dan kartu Beranda supaya latarnya menarik, bukan putih polos.
   Gambar karakter tetap utuh di dalam bingkai (tanpa mix-blend): 10 gambar
   berlatar putih, Sky berlatar hitam, Frost berlatar biru — blend akan merusak
   2 gambar itu (diuji visual dengan PIL: multiply gagal di bg hitam/biru,
   screen memutihkan karakter; frame + gradasi bagus untuk semuanya). */
function gradasiCSS(k) {
  const g = (k && k.gradasi) || GRADASI_DEFAULT;
  return 'radial-gradient(circle at 50% 22%, rgba(255,255,255,.55), rgba(255,255,255,0) 55%), linear-gradient(135deg, ' + g[0] + ' 0%, ' + g[1] + ' 55%, ' + g[2] + ' 100%)';
}
/* Karakter roster aktif (null kalau pakai karakter toko lama). */
function karakterAktif() {
  const char = (profile && profile.equipped && profile.equipped.character) || 'char-01';
  return karakterLevel(char);
}
/* Gambar kartu karakter aktif — char-01 "Rex" jadi flagship kalau belum login
   atau kalau pemain pakai karakter toko lama (jolly/kiko/momo/rex). */
function gambarKarakterAktif() {
  const k = karakterAktif();
  return k ? k.img : '/characters/char-01.jpg';
}
/* Warna skin untuk model 3D (Xbot) — [warna utama, garis, perut].
   Disalin dari logika warnaKarakter() (tampilan 2D) supaya 2D & 3D konsisten. */
function warnaSkin3D() {
  const char = (profile && profile.equipped && profile.equipped.character) || 'jolly';
  const k = karakterLevel(char);
  if (k) return k.warna; // karakter level menang atas skin (identitas karakter)
  const skin = (profile && profile.equipped && profile.equipped.skin) || '';
  if (skin && SKIN3D_WARNA[skin]) return SKIN3D_WARNA[skin];
  return SKIN3D_WARNA[char] || SKIN3D_WARNA.jolly;
}
/* Terapkan warna skin aktif ke badan Xbot 3D (run view + showcase). */
function applySkin3D() {
  if (!window.Run3D || typeof window.Run3D.applySkin !== 'function') return false;
  return window.Run3D.applySkin(warnaSkin3D()); // array [utama, garis, perut] -> tint per bagian baju
}
/* Terapkan topi + kacamata karakter aktif ke pelari 3D + kartu Beranda.
   Dipanggil bareng applySkin3D (renderProfil + setelah preload) supaya
   ganti karakter di Toko langsung kelihatan di model 3D. */
function applyAksesoris3D() {
  const k = karakterAktif();
  if (window.Run3D && typeof window.Run3D.applyAksesoris === 'function') window.Run3D.applyAksesoris(k);
  if (window.Run3D && typeof window.Run3D.setShowcaseAcc === 'function') window.Run3D.setShowcaseAcc('berandaShowcase', k);
  return true;
}
function namaKarakterSkinAktif() {
  const char = (profile && profile.equipped && profile.equipped.character) || 'jolly';
  const skin = (profile && profile.equipped && profile.equipped.skin) || '';
  const k = karakterLevel(char);
  const cn = k ? k.nama : ((KATALOG.character.find((c) => c.id === char) || {}).nama || 'Xbot');
  if (!skin) return cn;
  const sk = LEVEL_SKINS.find((x) => x.id === skin) || KATALOG.skin.find((x) => x.id === skin);
  return cn + ' • Skin ' + (sk ? sk.nama : skin);
}
function dimiliki(kind, id) {
  if (!profile) return false;
  if (kind === 'character') return (profile.characters || ['jolly']).includes(id);
  if (kind === 'skin') return (profile.skins || []).includes(id);
  if (kind === 'powerup') return (profile.powerups || {})[id] > 0;
  return false;
}
function terpakai(kind, id) {
  if (!profile || !profile.equipped) return false;
  return profile.equipped[kind] === id;
}
function renderToko() {
  renderTokoBagian('character', 'tokoKarakter');
  renderKarakterLevel();
  renderTokoBagian('skin', 'tokoSkin');
  renderSkinLevel();
  renderTokoBagian('powerup', 'tokoPowerup');
  const ps = $('powerupSelect'); const cur = ps.value;
  ps.innerHTML = '<option value="">Tanpa power-up</option>';
  Object.keys((profile && profile.powerups) || {}).forEach((id) => {
    if ((profile.powerups[id] || 0) > 0) {
      const o = document.createElement('option'); o.value = id;
      o.textContent = (KATALOG.powerup.find((p) => p.id === id) || { nama: id }).nama + ' (x' + profile.powerups[id] + ')';
      ps.appendChild(o);
    }
  });
  ps.value = cur || '';
}
function renderTokoBagian(kind, elId) {
  const el = $(elId); el.innerHTML = '';
  KATALOG[kind].forEach((item) => {
    const d = document.createElement('div'); d.className = 'toko-item';
    const punya = dimiliki(kind, item.id);
    d.innerHTML = '<div class="row"><span class="ikon">' + item.ikon + '</span><div style="flex:1"><b>' + esc(item.nama) + '</b><br><span class="muted">' + esc(item.desc) + '</span><br><span class="small">' + (punya ? (terpakai(kind, item.id) ? '✅ Dipakai' : 'Dimiliki') : item.harga.toLocaleString('id-ID') + ' koin') + '</span></div></div>';
    const row = document.createElement('div'); row.className = 'row'; row.style.marginTop = '8px';
    if (!punya) {
      const b = document.createElement('button'); b.className = 'btn-emas btn-kecil'; b.textContent = 'Beli • ' + item.harga.toLocaleString('id-ID') + ' koin';
      b.addEventListener('click', async () => { try { await api('/api/buy', 'POST', { kind, id: item.id }); toast(item.nama + ' dibeli!'); await muatProfil(); } catch (e) { toast(e.message); } });
      row.appendChild(b);
    } else if (kind !== 'powerup') {
      const b = document.createElement('button'); b.className = 'btn-gelap btn-kecil'; b.textContent = terpakai(kind, item.id) ? 'Dipakai ✓' : 'Pakai';
      b.disabled = terpakai(kind, item.id);
      b.addEventListener('click', async () => { try { await api('/api/equip', 'POST', { kind, id: item.id }); toast(item.nama + ' dipakai!'); await muatProfil(); } catch (e) { toast(e.message); } });
      row.appendChild(b);
    }
    d.appendChild(row); el.appendChild(d);
  });
}
/* Skin level (gratis per 5 level) + panel tukar set lengkap → Rp100.000 */
function renderSkinLevel() {
  const el = $('tokoSkin');
  const judul = document.createElement('h4'); judul.textContent = '🎨 Skin Level — Gratis tiap naik 5 level'; el.appendChild(judul);
  const milik = LEVEL_SKINS.filter((s) => dimiliki('skin', s.id)).length;
  LEVEL_SKINS.forEach((item) => {
    const d = document.createElement('div'); d.className = 'toko-item';
    const punya = dimiliki('skin', item.id);
    d.innerHTML = '<div class="row"><span class="ikon">' + item.ikon + '</span><div style="flex:1"><b>' + esc(item.nama) + '</b><br><span class="muted">' + esc(item.desc) + '</span><br><span class="small">' + (punya ? (terpakai('skin', item.id) ? '✅ Dipakai' : 'Dimiliki') : '🔒 Terbuka di Lv ' + item.level) + '</span></div></div>';
    const row = document.createElement('div'); row.className = 'row'; row.style.marginTop = '8px';
    if (punya) {
      const b = document.createElement('button'); b.className = 'btn-gelap btn-kecil'; b.textContent = terpakai('skin', item.id) ? 'Dipakai ✓' : 'Pakai';
      b.disabled = terpakai('skin', item.id);
      b.addEventListener('click', async () => { try { await api('/api/equip', 'POST', { kind: 'skin', id: item.id }); toast(item.nama + ' dipakai!'); await muatProfil(); } catch (e) { toast(e.message); } });
      row.appendChild(b);
    }
    d.appendChild(row); el.appendChild(d);
  });
  const panel = document.createElement('div'); panel.className = 'fullset-panel';
  const sudah = profile && profile.fullsetClaimed;
  panel.innerHTML = '<b>🎁 Set Lengkap Skin Level: ' + milik + '/12</b><p class="muted">Kalau 12 skin level sudah lengkap, tukar jadi saldo <b>Rp100.000</b>! (Sekali saja)</p>';
  const b = document.createElement('button'); b.className = 'btn-emas'; b.textContent = sudah ? '✅ Sudah ditukar Rp100.000' : '💱 Tukar Set Lengkap → Rp100.000';
  b.disabled = sudah || milik < 12;
  b.addEventListener('click', async () => { try { await api('/api/skins/fullset-claim', 'POST', {}); toast('Set lengkap ditukar! +Rp100.000 🎉'); await muatProfil(); } catch (e) { toast(e.message); } });
  panel.appendChild(b); el.appendChild(panel);
}

/* Grid pilih karakter level (12 karakter, gratis tiap naik 5 level) */
function renderKarakterLevel() {
  const el = $('tokoKarakterLevel');
  if (!el) return;
  el.innerHTML = '';
  const milik = (profile && profile.levelChars) || [];
  const aktif = (profile && profile.equipped && profile.equipped.character) || '';
  LEVEL_CHARACTERS.forEach((c) => {
    const punya = milik.includes(c.id);
    const d = document.createElement('div');
    d.className = 'karakter-card' + (punya ? '' : ' terkunci') + (aktif === c.id ? ' aktif' : '');
    d.style.background = gradasiCSS(c);
    const status = punya ? ((aktif === c.id ? '✅ Dipakai' : 'Dimiliki') + ' • Lv ' + c.level) : ('🔒 Lv ' + c.level);
    d.innerHTML = '<img src="' + c.img + '" alt="' + esc(c.nama) + '" loading="lazy"><b>' + esc(c.nama) + '</b><span class="status">' + status + '</span>';
    if (punya && aktif !== c.id) {
      d.addEventListener('click', async () => { try { await api('/api/character/select', 'POST', { id: c.id }); toast(c.nama + ' dipakai! 🎭'); await muatProfil(); } catch (e) { toast(e.message); } });
    } else if (!punya) {
      d.addEventListener('click', () => toast(c.nama + ' terbuka di Lv ' + c.level + ' — terus main!'));
    }
    el.appendChild(d);
  });
}

/* ---------- Offerwall ---------- */
async function muatOffers() {
  try {
    const d = await api('/api/offers');
    const list = d.offers || [];
    const el = $('daftarOffer');
    if (!list.length) { el.innerHTML = '<p class="muted">Belum ada misi install saat ini.</p>'; return; }
    el.innerHTML = '';
    list.forEach((o) => {
      const dEl = document.createElement('div'); dEl.className = 'tawaran';
      dEl.innerHTML = '<div style="flex:1"><b>' + esc(o.title) + '</b> <span class="pill">' + esc(o.provider || '') + '</span><br><span class="muted">' + esc(o.desc || '') + '</span><br><span class="small">Hadiah ' + (o.rewardCoins || 0) + ' koin • Mitra: ' + rupiah(o.partnerRp || 0) + ' • Status: ' + esc(o.status || 'baru') + '</span></div>';
      const col = document.createElement('div'); col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.gap = '6px';
      const b1 = document.createElement('button'); b1.className = 'btn-emas btn-kecil'; b1.textContent = '▶ Mulai';
      b1.addEventListener('click', async () => { try { await api('/api/offers/start', 'POST', { offerId: o.id }); toast('Misi demo dimulai (simulasi). Verifikasi demo sudah dimatikan — pakai Offerwall Tapjoy untuk misi beneran.'); await muatOffers(); } catch (e) { toast(e.message); } });
      const b3 = document.createElement('button'); b3.className = 'btn-hijau btn-kecil'; b3.textContent = 'Klaim Hadiah';
      b3.addEventListener('click', async () => { try { await api('/api/offers/claim', 'POST', { offerId: o.id }); toast('Hadiah misi diklaim!'); await muatProfil(); await muatOffers(); } catch (e) { toast(e.message); } });
      col.appendChild(b1); col.appendChild(b3);
      dEl.appendChild(col); el.appendChild(dEl);
    });
  } catch (e) { $('daftarOffer').innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; }
}

/* ---------- Tapjoy Offerwall (web, deep link) ---------- */
// Dokumen resmi: docs.unity.com/en-us/grow/offerwall/web/displaying-offerwall/deep-linking-implementation
// Deep link: https://rewards.unity.com/owp/web/link/<SDK_KEY>/u/<USER_ID>
// USER_ID = id numerik pemain (jadi `snuid` di callback Tapjoy) — unik,
// stabil seumur hidup akun, tanpa PII (sesuai syarat dokumen Tapjoy).
// Tapjoy TIDAK memberi notifikasi client-side untuk self-managed currency,
// jadi saldo di-refresh saat pemain kembali ke tab game.
let tapjoyDibuka = false;
async function bukaTapjoyOfferwall() {
  if (!token || !profile) { toast('Login dulu untuk buka offerwall.'); return; }
  try {
    const cfg = await api('/api/tapjoy/config');
    if (!cfg.enabled || !cfg.sdkKey) { toast('Offerwall Tapjoy belum aktif — server belum dikonfigurasi.'); return; }
    const url = 'https://rewards.unity.com/owp/web/link/' + encodeURIComponent(cfg.sdkKey) + '/u/' + encodeURIComponent(String(profile.id));
    tapjoyDibuka = true;
    window.open(url, '_blank');
    toast('Offerwall dibuka di tab baru. Hadiah Koin bisa butuh beberapa menit — saldo diperbarui otomatis saat kamu kembali.');
  } catch (e) { toast(e.message); }
}
async function perbaruiStatusTapjoy() {
  const st = $('tapjoyStatus'); if (!st) return;
  try {
    const cfg = await api('/api/tapjoy/config');
    st.textContent = cfg.enabled ? 'Aktif — misi Tapjoy membayar Koin beneran.' : 'Belum aktif — menunggu pengaturan server.';
  } catch (e) { st.textContent = 'Status offerwall tidak bisa dimuat.'; }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && tapjoyDibuka) { tapjoyDibuka = false; muatProfil(); }
});
window.addEventListener('focus', () => { if (tapjoyDibuka) { tapjoyDibuka = false; muatProfil(); } });

/* ---------- Iklan ---------- */
async function muatNetworks() {
  try {
    const d = await api('/api/ads/networks');
    networks = d.networks || [];
    if (networks.length) tampilBanner();
  } catch (e) { $('bannerNama').textContent = 'Iklan (simulasi) — jaringan belum termuat.'; }
}
function tampilBanner() {
  if (!networks.length) return;
  const n = networks[networkIdx % networks.length]; networkIdx++;
  $('bannerNama').textContent = n.name + ' • eCPM ' + rupiah(n.ecpm || 0) + ' • Iklan simulasi';
  api('/api/ads/impression', 'POST', { network: n.name, format: 'banner' }).catch(() => {});
}
setInterval(() => { if (token && networks.length) tampilBanner(); }, 15000);
function updateIklanBtn() {
  const b = $('btnNontonIklan');
  const sisa = Math.ceil((5 * 60 * 1000 - (Date.now() - lastAdAt)) / 1000);
  if ((profile && (profile.adsToday || 0) >= 10)) { b.disabled = true; $('iklanCooldown').textContent = 'Batas 10 iklan hari ini sudah habis.'; return; }
  if (lastAdAt && Date.now() - lastAdAt < 5 * 60 * 1000) {
    b.disabled = true;
    $('iklanCooldown').textContent = 'Tunggu ' + Math.floor(sisa / 60) + ' menit ' + (sisa % 60) + ' detik lagi sebelum iklan berikutnya.';
  } else { b.disabled = false; $('iklanCooldown').textContent = ''; }
}
setInterval(updateIklanBtn, 1000);
$('btnTapjoy').addEventListener('click', bukaTapjoyOfferwall);
$('btnNontonIklan').addEventListener('click', async () => {
  lastAdAt = Date.now(); updateIklanBtn();
  const n = networks.length ? networks[networkIdx % networks.length].name : 'Simulasi';
  toast('Memutar iklan simulasi (' + n + ')…');
  try { const d = await api('/api/claim-ad-reward', 'POST', {}); toast('Iklan selesai: +' + (d.coins || 1000) + ' koin!'); await muatProfil(); }
  catch (e) { toast(e.message); }
});

/* ================= GAME CANVAS ================= */
const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d');
const LANES = [80, 210, 340];
const game = { running: false, paused: false, lane: 1, level: 1, coins: 0, coinCount: 0, distance: 0, target: 500, speed: 4, objects: [], polaAntrian: [], spawnT: 0, frame: 0, shield: false, magnet: false, mult: 1, hiasY: 0, mulaiAt: 0, lanePos: 1, roadScroll: 0, jumpY: 0, vy: 0, sliding: false, slideT: 0, noIdleUntil: 0 };

/* ---------- Lompat & guling (Batch 5: mekanik baru, fungsi murni) ---------- */
const JUMP_VY = 0.32, JUMP_G = 0.022, SLIDE_FRAMES = 42; // lompat ~0,5 dtk, guling ~0,7 dtk
function stepGerak(g) {
  if (g.vy !== 0 || g.jumpY > 0) {
    g.jumpY += g.vy; g.vy -= JUMP_G;
    if (g.jumpY <= 0) { g.jumpY = 0; g.vy = 0; }
  }
  if (g.slideT > 0) { g.slideT--; g.sliding = g.slideT > 0; }
}
/* Apakah rintangan ini berada di jalur pemain? (dipakai loop + tabrakanKena) */
function rintanganDiJalur(o, g) {
  if (o.type === 'dinding') return !!(o.lanes && o.lanes.indexOf(g.lane) !== -1);
  if (o.type === 'geser') {
    const lp = (o.lanePos == null ? o.lane : o.lanePos);
    const gp = (g.lanePos == null ? g.lane : g.lanePos);
    return Math.abs(lp - gp) < 0.6;
  }
  return o.lane === g.lane;
}
/* Apakah rintangan ini menabrak pemain? (dipakai loop; dites juga) */
function tabrakanKena(o, g) {
  if (o.kind !== 'rintangan' || o.z > 0.10 || o.z <= -0.02) return false;
  if (!rintanganDiJalur(o, g)) return false;
  if (o.type === 'pagar') return !g.sliding; // pagar: guling di bawahnya
  if (o.type === 'dinding' || o.type === 'geser') return true; // tinggi: tidak bisa dilompat / diguling — harus pindah jalur
  return !(g.jumpY > 0.6); // batu & kotak: rendah, bisa dilompati
}
/* Gerbang geser: posisi jalur bergerak sinusoidal antara laneA dan laneB.
 * frame = game.frame (bertambah tiap frame saat lari). */
function gerakGeser(o, frame) {
  const a = o.laneA, b = (o.laneB == null ? a : o.laneB);
  const periode = Math.max(60, o.periode || 150);
  o.lanePos = a + (b - a) * (0.5 - 0.5 * Math.cos(2 * Math.PI * (frame + (o.fase || 0)) / periode));
}
function mulaiLompat() {
  if (!game.running || game.paused || game.jumpY > 0 || game.vy !== 0) return;
  game.vy = JUMP_VY;
  if (window.Run3D && window.Run3D.ready) window.Run3D.playJump();
  beep(520, 0.08, 'sine');
}
function mulaiGuling() {
  if (!game.running || game.paused || game.sliding || game.jumpY > 0) return;
  game.slideT = SLIDE_FRAMES; game.sliding = true;
  if (window.Run3D && window.Run3D.ready) window.Run3D.playSlide();
  beep(330, 0.08, 'sine');
}
/* ---------- Jembatan 3D (modul run3d.js; semua akses dijaga) ---------- */
let r3PreloadDimulai = false, mode3dAktif = false, mode3dToasted = false;
function cobaPreload3D() {
  if (r3PreloadDimulai || !window.Run3D) return;
  r3PreloadDimulai = true;
  window.Run3D.preload().then((ok) => { if (ok) { applySkin3D(); applyAksesoris3D(); } });
}
function aktifkanMode3D() {
  const tm = $('tekanMulai');
  if (tm) tm.hidden = game.running; // tampil saat idle 3D, sembunyi saat lari
  if (mode3dAktif) return;
  mode3dAktif = true;
  document.body.classList.add('mode-3d');
  if (!mode3dToasted) { mode3dToasted = true; toast('Mode 3D aktif! 🏃'); }
}
/* Render lari: 3D kalau siap, kalau tidak 2D lama. Return true kalau 3D. */
function renderLari3D() {
  const R3 = window.Run3D;
  if (!R3 || !R3.ready) return false;
  aktifkanMode3D();
  R3.render(game);
  return true;
}

function drawNailong(x, y, r, skinId, charId) {
  const char = charId || (profile && profile.equipped && profile.equipped.character) || 'jolly';
  const skin = skinId || (profile && profile.equipped && profile.equipped.skin) || '';
  let warna = '#ffd93b', garis = '#d9a400', perut = '#fff3c4';
  if (char === 'kiko') { warna = '#a8e6a3'; garis = '#6fbf6a'; perut = '#e4f7e2'; }
  if (char === 'momo') { warna = '#ffc0cb'; garis = '#e88aa0'; perut = '#ffe3ea'; }
  if (char === 'rex') { warna = '#ffb74d'; garis = '#e08a1e'; perut = '#ffe0b3'; }
  if (skin === 'emas') { warna = '#ffd54a'; garis = '#c79a00'; perut = '#ffef9e'; }
  if (skin === 'ninja') { warna = '#2b2b2b'; garis = '#111'; perut = '#444444'; }
  if (skin === 'astronot') { warna = '#ffffff'; garis = '#b0bec5'; perut = '#eef6fb'; }
  if (skin === 'shadow') { warna = '#5a5a7a'; garis = '#33334d'; perut = '#7a7a9a'; }
  if (skin === 'pelangi') { warna = '#ffe082'; garis = '#ff8a65'; perut = '#fff3c4'; }
  // warna skin level (12 skin gratis per 5 level)
  const WARNA_SKIN_LEVEL = {
    es: ['#b3e5fc', '#4fc3f7', '#e1f5fe'], sakura: ['#f8bbd0', '#f06292', '#fce4ec'],
    laut: ['#4fc3f7', '#0288d1', '#e1f5fe'], hutan: ['#81c784', '#43a047', '#e8f5e9'],
    senja: ['#ce93d8', '#8e24aa', '#f3e5f5'], salju: ['#eceff1', '#90a4ae', '#ffffff'],
    lava: ['#ff7043', '#d84315', '#ffccbc'], galaksi: ['#7e57c2', '#512da8', '#ede7f6'],
    madu: ['#ffca28', '#ff8f00', '#fff8e1'], mint: ['#80cbc4', '#00897b', '#e0f2f1'],
    komet: ['#ff9800', '#e65100', '#fff3e0'], legenda: ['#ffd700', '#b8860b', '#fffde7']
  };
  if (WARNA_SKIN_LEVEL[skin]) { warna = WARNA_SKIN_LEVEL[skin][0]; garis = WARNA_SKIN_LEVEL[skin][1]; perut = WARNA_SKIN_LEVEL[skin][2]; }
  const f = game.frame || 0;
  const lari = Math.sin(f / 4); // ayunan kaki saat lari
  const goyang = Math.sin(f / 6) * 0.12; // ekor bergoyang
  // squash & stretch biar tidak kaku
  const sy = 1 + Math.sin(f / 4) * 0.05, sx = 1 - Math.sin(f / 4) * 0.04;
  ctx.save();
  ctx.translate(x, y); ctx.scale(sx, sy); ctx.translate(-x, -y);
  // ekor naga (bergoyang)
  ctx.fillStyle = warna; ctx.strokeStyle = garis; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.7, y + r * 0.55);
  ctx.quadraticCurveTo(x - r * 1.5, y + r * (0.7 + goyang), x - r * 1.35, y + r * 0.1);
  ctx.quadraticCurveTo(x - r * 1.1, y + r * 0.35, x - r * 0.6, y + r * 0.3);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // kaki lari (bergantian naik-turun) + telapak pink (sesuai foto referensi)
  const kakiY1 = y + r * 0.95 + Math.max(0, lari) * r * 0.25;
  const kakiY2 = y + r * 0.95 + Math.max(0, -lari) * r * 0.25;
  ctx.beginPath(); ctx.ellipse(x - r * 0.35, kakiY1, r * 0.28, r * 0.16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x + r * 0.35, kakiY2, r * 0.28, r * 0.16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffb6c1';
  ctx.beginPath(); ctx.ellipse(x - r * 0.35, kakiY1 + r * 0.07, r * 0.17, r * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + r * 0.35, kakiY2 + r * 0.07, r * 0.17, r * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  // lengan kecil (mengayun)
  ctx.beginPath(); ctx.ellipse(x - r * 0.95, y + r * (0.1 - lari * 0.15), r * 0.16, r * 0.3, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x + r * 0.95, y + r * (0.1 + lari * 0.15), r * 0.16, r * 0.3, 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // tanduk naga kecil (krem)
  ctx.fillStyle = '#fff3c4'; ctx.strokeStyle = garis; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(x - r * 0.45, y - r * 1.05, r * 0.14, r * 0.3, -0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x + r * 0.45, y - r * 1.05, r * 0.14, r * 0.3, 0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (char === 'rex') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x - r * 0.25, y - r * 0.7); ctx.lineTo(x + r * 0.25, y - r * 0.7); ctx.closePath(); ctx.fill(); }
  if (char === 'momo') { ctx.fillStyle = '#ff5c8a'; ctx.beginPath(); ctx.arc(x + r * 0.45, y - r * 0.9, r * 0.18, 0, Math.PI * 2); ctx.fill(); }
  // badan naga gembul
  ctx.fillStyle = warna;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = garis; ctx.lineWidth = 3; ctx.stroke();
  // perut krem
  ctx.fillStyle = perut;
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.45, r * 0.55, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
  if (skin === 'astronot') { ctx.strokeStyle = 'rgba(120,180,220,.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.stroke(); }
  if (skin === 'ninja') { ctx.fillStyle = '#c62828'; ctx.fillRect(x - r, y - r * 0.55, r * 2, r * 0.22); }
  if (skin === 'pelangi') { ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, r * 0.75, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.strokeStyle = '#448aff'; ctx.beginPath(); ctx.arc(x, y, r * 0.6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  // bintik hijau di punggung (sesuai foto referensi, hanya Nailong kuning polos)
  if (char === 'jolly' && !skin) {
    ctx.fillStyle = '#8bc34a';
    ctx.beginPath(); ctx.arc(x - r * 0.28, y - r * 0.62, r * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - r * 0.78, r * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.28, y - r * 0.62, r * 0.09, 0, Math.PI * 2); ctx.fill();
  }
  // pipi pink
  ctx.fillStyle = 'rgba(255,182,193,.9)';
  ctx.beginPath(); ctx.arc(x - r * 0.55, y + r * 0.25, r * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.55, y + r * 0.25, r * 0.2, 0, Math.PI * 2); ctx.fill();
  // mata hijau mengkilap (sesuai foto referensi)
  const mata = skin === 'ninja' ? '#fff' : '#43a047';
  ctx.fillStyle = mata;
  ctx.beginPath(); ctx.ellipse(x - r * 0.32, y - r * 0.1, r * 0.16, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + r * 0.32, y - r * 0.1, r * 0.16, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  if (skin !== 'ninja') {
    ctx.fillStyle = '#1b5e20';
    ctx.beginPath(); ctx.ellipse(x - r * 0.32, y - r * 0.08, r * 0.07, r * 0.11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + r * 0.32, y - r * 0.08, r * 0.07, r * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - r * 0.27, y - r * 0.2, r * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.37, y - r * 0.2, r * 0.06, 0, Math.PI * 2); ctx.fill();
  // senyum kecil
  ctx.strokeStyle = skin === 'ninja' ? '#fff' : '#5d3a1a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y + r * 0.25, r * 0.3, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  if (game.shield) { ctx.strokeStyle = 'rgba(68,138,255,.8)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, r + 10, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}
function drawCoin(c, x, y, r) {
  c.fillStyle = '#f5b301'; c.strokeStyle = '#b8860b'; c.lineWidth = Math.max(1, 3 * (r / 15));
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = '#b8860b'; c.font = 'bold ' + Math.round(r) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('Rp', x, y + 1);
}
function drawObstacle(c, o, x, y, s) {
  const lw = Math.max(1, 3 * s);
  if (o.type === 'batu') {
    c.fillStyle = '#8d8d8d'; c.strokeStyle = '#5d5d5d'; c.lineWidth = lw;
    c.beginPath(); c.arc(x, y, 26 * s, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#a9a9a9'; c.beginPath(); c.arc(x - 8 * s, y - 8 * s, 10 * s, 0, Math.PI * 2); c.fill();
  } else if (o.type === 'kotak') {
    c.fillStyle = '#a06a2c'; c.strokeStyle = '#6b4210'; c.lineWidth = lw;
    c.fillRect(x - 26 * s, y - 26 * s, 52 * s, 52 * s); c.strokeRect(x - 26 * s, y - 26 * s, 52 * s, 52 * s);
    c.beginPath(); c.moveTo(x - 26 * s, y - 26 * s); c.lineTo(x + 26 * s, y + 26 * s); c.moveTo(x + 26 * s, y - 26 * s); c.lineTo(x - 26 * s, y + 26 * s); c.stroke();
  } else if (o.type === 'dinding') {
    // tembok tinggi 2 jalur: badan merah + garis peringatan kuning + tanda seru
    const w = 200 * s, h = 56 * s;
    c.fillStyle = '#b03a2e'; c.strokeStyle = '#6e1f16'; c.lineWidth = lw;
    c.fillRect(x - w / 2, y - h, w, h); c.strokeRect(x - w / 2, y - h, w, h);
    c.fillStyle = '#f5b301';
    for (let i = 0; i < 5; i++) c.fillRect(x - w / 2 + (i * w) / 5, y - h, 8 * s, h);
    c.fillStyle = '#fff'; c.font = 'bold ' + Math.round(20 * s) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('⚠', x, y - h / 2);
  } else if (o.type === 'geser') {
    // gerbang geser: palang oranye + panah kiri-kanan
    c.fillStyle = '#e65100'; c.strokeStyle = '#8d2f00'; c.lineWidth = lw;
    c.fillRect(x - 28 * s, y - 52 * s, 56 * s, 52 * s); c.strokeRect(x - 28 * s, y - 52 * s, 56 * s, 52 * s);
    c.fillStyle = '#fff'; c.font = 'bold ' + Math.round(22 * s) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('↔', x, y - 26 * s);
  } else {
    c.fillStyle = '#8d5a2b'; c.strokeStyle = '#5d3a1a'; c.lineWidth = lw;
    c.fillRect(x - 28 * s, y - 14 * s, 56 * s, 28 * s); c.strokeRect(x - 28 * s, y - 14 * s, 56 * s, 28 * s);
    for (let i = -1; i <= 1; i++) { c.fillRect(x + i * 20 * s - 3 * s, y - 22 * s, 6 * s, 44 * s); }
  }
}
/* ---------- Tampilan 3D ala Subway Surfers (perspektif, kamera di belakang karakter) ---------- */
const P3 = { hy: 130, bawah: 470, vx: 210 };
function proyeksi(lanePos, z) {
  const u = Math.max(0, Math.min(1, 1 - z)); // 1 = dekat pemain, 0 = horizon
  const k = Math.pow(u, 1.6);
  const s = 0.12 + 0.88 * k;
  return { x: P3.vx + (lanePos - 1) * 150 * s, y: P3.hy + (P3.bawah - P3.hy) * k, s };
}
function warnaKarakter() {
  const char = (profile && profile.equipped && profile.equipped.character) || 'jolly';
  const skin = (profile && profile.equipped && profile.equipped.skin) || '';
  let warna = '#ffd93b', garis = '#d9a400', perut = '#fff3c4';
  if (char === 'kiko') { warna = '#a8e6a3'; garis = '#6fbf6a'; perut = '#e4f7e2'; }
  if (char === 'momo') { warna = '#ffc0cb'; garis = '#e88aa0'; perut = '#ffe3ea'; }
  if (char === 'rex') { warna = '#ffb74d'; garis = '#e08a1e'; perut = '#ffe0b3'; }
  if (skin === 'emas') { warna = '#ffd54a'; garis = '#c79a00'; perut = '#ffef9e'; }
  if (skin === 'ninja') { warna = '#2b2b2b'; garis = '#111'; perut = '#444444'; }
  if (skin === 'astronot') { warna = '#ffffff'; garis = '#b0bec5'; perut = '#eef6fb'; }
  if (skin === 'shadow') { warna = '#5a5a7a'; garis = '#33334d'; perut = '#7a7a9a'; }
  if (skin === 'pelangi') { warna = '#ffe082'; garis = '#ff8a65'; perut = '#fff3c4'; }
  const WARNA_SKIN_LEVEL = {
    es: ['#b3e5fc', '#4fc3f7', '#e1f5fe'], sakura: ['#f8bbd0', '#f06292', '#fce4ec'],
    laut: ['#4fc3f7', '#0288d1', '#e1f5fe'], hutan: ['#81c784', '#43a047', '#e8f5e9'],
    senja: ['#ce93d8', '#8e24aa', '#f3e5f5'], salju: ['#eceff1', '#90a4ae', '#ffffff'],
    lava: ['#ff7043', '#d84315', '#ffccbc'], galaksi: ['#7e57c2', '#512da8', '#ede7f6'],
    madu: ['#ffca28', '#ff8f00', '#fff8e1'], mint: ['#80cbc4', '#00897b', '#e0f2f1'],
    komet: ['#ff9800', '#e65100', '#fff3e0'], legenda: ['#ffd700', '#b8860b', '#fffde7']
  };
  if (WARNA_SKIN_LEVEL[skin]) { warna = WARNA_SKIN_LEVEL[skin][0]; garis = WARNA_SKIN_LEVEL[skin][1]; perut = WARNA_SKIN_LEVEL[skin][2]; }
  const k = karakterLevel(char);
  if (k) { warna = k.warna[0]; garis = k.warna[1]; perut = k.warna[2]; }
  return { warna, garis, perut, skin, char };
}
function drawNailongBelakang(c, x, y, r, lean, frame, shield) {
  const { warna, garis, skin, char } = warnaKarakter();
  const f = frame || 0;
  const lari = Math.sin(f / 4);
  const goyang = Math.sin(f / 6) * 0.12;
  const sy = 1 + Math.sin(f / 4) * 0.05, sx = 1 - Math.sin(f / 4) * 0.04;
  c.save();
  c.translate(x, y); c.rotate(lean || 0); c.scale(sx, sy); c.translate(-x, -y);
  c.fillStyle = warna; c.strokeStyle = garis; c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x - r * 0.5, y + r * 0.5);
  c.quadraticCurveTo(x - r * 1.3, y + r * (0.7 + goyang), x - r * 1.2, y + r * 0.05);
  c.quadraticCurveTo(x - r * 0.9, y + r * 0.3, x - r * 0.45, y + r * 0.3);
  c.closePath(); c.fill(); c.stroke();
  const kakiY1 = y + r * 0.95 + Math.max(0, lari) * r * 0.25;
  const kakiY2 = y + r * 0.95 + Math.max(0, -lari) * r * 0.25;
  c.beginPath(); c.ellipse(x - r * 0.35, kakiY1, r * 0.28, r * 0.16, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(x + r * 0.35, kakiY2, r * 0.28, r * 0.16, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = '#ffb6c1';
  c.beginPath(); c.ellipse(x - r * 0.35, kakiY1 + r * 0.07, r * 0.17, r * 0.07, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(x + r * 0.35, kakiY2 + r * 0.07, r * 0.17, r * 0.07, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = warna;
  c.beginPath(); c.ellipse(x - r * 0.95, y + r * (0.1 - lari * 0.15), r * 0.16, r * 0.3, -0.4, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(x + r * 0.95, y + r * (0.1 + lari * 0.15), r * 0.16, r * 0.3, 0.4, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = '#fff3c4';
  c.beginPath(); c.ellipse(x - r * 0.45, y - r * 1.05, r * 0.14, r * 0.3, -0.35, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(x + r * 0.45, y - r * 1.05, r * 0.14, r * 0.3, 0.35, 0, Math.PI * 2); c.fill(); c.stroke();
  if (char === 'rex') { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x, y - r * 1.15); c.lineTo(x - r * 0.25, y - r * 0.7); c.lineTo(x + r * 0.25, y - r * 0.7); c.closePath(); c.fill(); }
  if (char === 'momo') { c.fillStyle = '#ff5c8a'; c.beginPath(); c.arc(x + r * 0.45, y - r * 0.9, r * 0.18, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = warna;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = garis; c.lineWidth = 3; c.stroke();
  if (skin === 'astronot') { c.strokeStyle = 'rgba(120,180,220,.9)'; c.lineWidth = 5; c.beginPath(); c.arc(x, y, r + 6, 0, Math.PI * 2); c.stroke(); }
  if (skin === 'ninja') { c.fillStyle = '#c62828'; c.fillRect(x - r, y - r * 0.55, r * 2, r * 0.22); }
  if (skin === 'pelangi') { c.strokeStyle = '#ff5252'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, r * 0.75, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); c.strokeStyle = '#448aff'; c.beginPath(); c.arc(x, y, r * 0.6, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
  if (char === 'jolly' && !skin) {
    c.fillStyle = '#8bc34a';
    c.beginPath(); c.arc(x - r * 0.28, y - r * 0.62, r * 0.09, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x, y - r * 0.78, r * 0.09, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + r * 0.28, y - r * 0.62, r * 0.09, 0, Math.PI * 2); c.fill();
  }
  if (shield) { c.strokeStyle = 'rgba(68,138,255,.8)'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, r + 10, 0, Math.PI * 2); c.stroke(); }
  c.restore();
}
/* Skala gambar 2D ke ukuran canvas: arena digambar dalam ruang logis 420x520,
   lalu dipusatkan (letterbox) kalau canvas lebih besar — misal layar penuh.
   Canvas 420x520 biasa -> skala 1, tanpa perubahan. */
function skalaCanvas(c) {
  const W = (c.canvas && c.canvas.width) || 420, H = (c.canvas && c.canvas.height) || 520;
  const s = Math.min(W / 420, H / 520);
  return { s, ox: (W - 420 * s) / 2, oy: (H - 520 * s) / 2 };
}
function renderScene(c, st) {
  const d = duniaUntuk(st.level);
  const { s, ox, oy } = skalaCanvas(c);
  // Jalan bergelombang (bukan lurus monoton): pusat jalan bergeser mengikuti
  // sinus dari jarak + guliran jalan; 0 di dekat pemain, maks di horizon.
  const kurva = (z) => Math.sin(z * 4 + (st.roadScroll || 0) * 3) * 40 * z;
  const k1 = kurva(1); // geser tepi atas jalan (horizon)
  c.fillStyle = d.langit; c.fillRect(0, 0, c.canvas.width, c.canvas.height); // latar penuh (bilah letterbox menyatu dengan langit)
  c.save();
  c.translate(ox, oy); c.scale(s, s);
  gambarLatar(duniaIdx(st.level), st.frame, c);
  c.fillStyle = d.tanah; c.fillRect(0, P3.hy, 420, 520 - P3.hy);
  c.fillStyle = 'rgba(0,0,0,.25)';
  c.beginPath(); c.moveTo(0, P3.hy); c.lineTo(186 + k1, P3.hy); c.lineTo(10, 520); c.lineTo(0, 520); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(234 + k1, P3.hy); c.lineTo(420, P3.hy); c.lineTo(420, 520); c.lineTo(410, 520); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,.10)';
  c.beginPath(); c.moveTo(186 + k1, P3.hy); c.lineTo(234 + k1, P3.hy); c.lineTo(410, 520); c.lineTo(10, 520); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 5; c.setLineDash([26, 34]);
  c.lineDashOffset = -(((st.roadScroll || 0) * 520) % 60);
  for (const b of [-0.5, 0.5]) {
    c.beginPath();
    c.moveTo(210 + b * 150 * 0.12 + k1, P3.hy);
    c.lineTo(210 + b * 150, 520);
    c.stroke();
  }
  c.setLineDash([]);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i < 6; i++) {
    const z = (((i * 0.2 + (st.roadScroll || 0)) % 1) + 1) % 1;
    const u = 1 - z, k = Math.pow(u, 1.6), s = 0.12 + 0.88 * k;
    const y = P3.hy + (P3.bawah - P3.hy) * k;
    c.font = Math.max(8, Math.round(30 * s)) + 'px sans-serif';
    c.fillText(d.hias, 210 - (200 * s + 28 * s) + kurva(z), y);
    c.fillText(d.hias, 210 + (200 * s + 28 * s) + kurva(z), y);
  }
  const objs = (st.objects || []).slice().sort((a, b) => b.z - a.z);
  for (const o of objs) {
    let laneGambar = o.lane;
    if (o.type === 'geser') laneGambar = (o.lanePos == null ? o.lane : o.lanePos);
    else if (o.type === 'dinding' && o.lanes) laneGambar = (o.lanes[0] + o.lanes[1]) / 2;
    const p = proyeksi(laneGambar, o.z);
    p.x += kurva(o.z); // objek mengikuti belokan jalan
    if (o.kind === 'koin') drawCoin(c, p.x, p.y, Math.max(4, 15 * p.s));
    else drawObstacle(c, o, p.x, p.y, p.s);
  }
  (st.debu || []).forEach((dd) => { c.fillStyle = 'rgba(210,180,140,' + dd.a.toFixed(2) + ')'; c.beginPath(); c.arc(dd.x, dd.y, dd.r, 0, Math.PI * 2); c.fill(); });
  const pp = proyeksi(st.lanePos, 0);
  const lompat = Math.abs(Math.sin(st.frame / 8)) * 6 + (st.jumpY || 0) * 30;
  c.fillStyle = 'rgba(0,0,0,.25)';
  c.beginPath(); c.ellipse(pp.x, 478, 26, 8, 0, 0, Math.PI * 2); c.fill();
  const lean = ((st.lane || 1) - st.lanePos) * 0.25;
  const rKarakter = st.sliding ? 26 : 34; // guling: karakter merunduk
  drawNailongBelakang(c, pp.x, 448 - lompat + (st.sliding ? 10 : 0), rKarakter, lean, st.frame, st.shield);
  c.restore();
}

/* Skill iklan: 3 item — aktif setelah nonton iklan, berlaku 1x lari */
const skillIklan = { cepat: false, magnet: false, perisai: false };
function resetSkillIklan() {
  skillIklan.cepat = skillIklan.magnet = skillIklan.perisai = false;
  document.querySelectorAll('[data-skill]').forEach((b) => { b.disabled = false; b.textContent = b.dataset.label || '▶ Nonton Iklan'; });
}
document.querySelectorAll('[data-skill]').forEach((b) => b.addEventListener('click', () => {
  const nama = b.dataset.skill;
  if (skillIklan[nama]) return;
  document.querySelectorAll('[data-skill="' + nama + '"]').forEach((x) => { x.disabled = true; x.textContent = '⏳ Memutar iklan…'; });
  tampilIklanSelingan(() => {
    skillIklan[nama] = true;
    document.querySelectorAll('[data-skill="' + nama + '"]').forEach((x) => { x.textContent = x.dataset.labelAktif || '✅ Aktif'; });
    toast('Skill aktif untuk lari ini!');
  });
}));
function resetGame() {
  const lv = game.level || 1;
  const pu = $('powerupSelect').value;
  game.level = lv; game.lane = 1; game.coins = 0; game.coinCount = 0; game.distance = 0;
  game.target = (isBos(lv) ? 700 : 450) + lv * 30;
  game.speed = 4 + lv * 0.18;
  if (skillIklan.cepat) game.speed = Math.round(game.speed * 1.5);
  game.objects = []; game.polaAntrian = []; game.spawnT = 0; game.frame = 0; game.debu = []; game.lanePos = 1; game.roadScroll = 0;
  game.jumpY = 0; game.vy = 0; game.sliding = false; game.slideT = 0;
  if (window.Run3D && window.Run3D.ready) window.Run3D.setWorld(duniaIdx(lv), duniaUntuk(lv));
  game.shield = pu === 'perisai' || ((profile && profile.equipped && profile.equipped.powerup) === 'perisai') || skillIklan.perisai;
  game.magnet = pu === 'magnet' || ((profile && profile.equipped && profile.equipped.powerup) === 'magnet') || skillIklan.magnet;
  game.mult = (pu === 'koinx2' || ((profile && profile.equipped && profile.equipped.powerup) === 'koinx2')) ? 2 : 1;
  $('gameResult').classList.remove('show'); $('gameResult').innerHTML = '';
  const mf = $('modalFinish'); if (mf) mf.classList.remove('show');
  $('hudKoin').textContent = '🪙 0'; $('hudJarak').textContent = '0 m'; $('hudLevel').textContent = 'Lv ' + lv;
  updateDuniaInfo();
  try { renderScene(ctx, game); } catch (e) {} // gambar arena sekali supaya tidak biru kosong sebelum mulai
}
/* ---------- Pola rintangan (lebih sulit, tetap adil) ----------
 * Selain rintangan tunggal acak, level >= 5 kadang memunculkan POLA:
 * baris-baris rintangan berurutan dengan jeda FRAME (bukan z) supaya adil
 * di semua kecepatan — jeda dijamin cukup untuk pindah jalur.
 * Jenis baru:
 * - 'dinding' (lv>=3): tembok tinggi menutup 2 jalur sekaligus — wajib ke
 *   jalur kosong; tidak bisa dilompat/diguling.
 * - 'geser' (lv>=8): gerbang tinggi yang bergeser pelan antar 2 jalur —
 *   jalur ke-3 selalu aman; tidak bisa dilompat/diguling.
 * Aturan adil (dicek tes test-rintangan-baru.mjs): tiap baris menyisakan
 * >=1 jalur yang bisa dilalui; jalur aman antar baris berurutan berjarak
 * <= 2; jeda antar baris >= 8 + 6*jarak jalur (cukup pindah jalur + reaksi).
 * Kecepatan TIDAK diubah di sini: dibatasi validasi server
 * (maxSpeed = (4 + lv*0.18) * 1.5) — sulitnya dari pola + kerapatan spawn. */
function jedaSpawn(level) { return Math.max(22, 76 - level * 1.8); } // spawn makin rapat per level
function pilihPola(lv) {
  const acak = (n) => Math.floor(Math.random() * n);
  const tipeAcak = () => ['batu', 'kotak', 'pagar'][acak(3)];
  const daftar = ['zigzag', 'koridor'];
  if (lv >= 3) daftar.push('tembok');
  if (lv >= 8) daftar.push('geser-koin');
  if (lv >= 12) daftar.push('sapu');
  const nama = daftar[acak(daftar.length)];
  if (nama === 'zigzag') {
    // rintangan tunggal zigzag kiri-tengah-kanan — paksa pindah jalur terus
    const jalur = [0, 1, 2].sort(() => Math.random() - 0.5);
    const n = 3 + acak(2);
    const baris = [];
    for (let i = 0; i < n; i++) baris.push({ jeda: i === 0 ? 0 : 14, items: [{ type: tipeAcak(), lane: jalur[i % 3] }] });
    return baris;
  }
  if (nama === 'koridor') {
    // pagar -> batu -> kotak di 3 jalur berbeda: guling, lompat, lompat bergantian
    const jalur = [0, 1, 2].sort(() => Math.random() - 0.5);
    return [
      { jeda: 0, items: [{ type: 'pagar', lane: jalur[0] }] },
      { jeda: 14, items: [{ type: 'batu', lane: jalur[1] }] },
      { jeda: 14, items: [{ type: 'kotak', lane: jalur[2] }] },
    ];
  }
  if (nama === 'tembok') {
    // tembok 2 jalur, lalu tembok 2 jalur di sisi lain — wajib pindah ujung ke ujung
    const kiri = Math.random() < 0.5;
    const d1 = kiri ? [0, 1] : [1, 2], d2 = kiri ? [1, 2] : [0, 1];
    const bebas1 = kiri ? 2 : 0, bebas2 = kiri ? 0 : 2;
    return [
      { jeda: 0, items: [{ type: 'dinding', lane: d1[0], lanes: d1 }, { kind: 'koin', lane: bebas1 }, { kind: 'koin', lane: bebas1, z: 0.94 }] },
      { jeda: 20, items: [{ type: 'dinding', lane: d2[0], lanes: d2 }, { kind: 'koin', lane: bebas2 }, { kind: 'koin', lane: bebas2, z: 0.94 }] },
    ];
  }
  if (nama === 'geser-koin') {
    const a = acak(2), bebas = a === 0 ? 2 : 0;
    return [{ jeda: 0, items: [{ type: 'geser', lane: a, laneA: a, laneB: a + 1, fase: acak(150), periode: Math.max(90, 180 - lv * 2) }, { kind: 'koin', lane: bebas }] }];
  }
  // 'sapu' (lv>=12): gerbang geser, lalu tembok menutup sisi sapuan — akhiri di jalur ujung
  const a = acak(2), bebas = a === 0 ? 2 : 0;
  const d = a === 0 ? [1, 2] : [0, 1];
  return [
    { jeda: 0, items: [{ type: 'geser', lane: a, laneA: a, laneB: a + 1, fase: acak(150), periode: Math.max(90, 180 - lv * 2) }] },
    { jeda: 22, items: [{ type: 'dinding', lane: d[0], lanes: d }, { kind: 'koin', lane: bebas }] },
  ];
}
function spawnPola() {
  const pola = pilihPola(game.level);
  game.polaAntrian = pola.map((baris) => ({ t: baris.jeda, items: baris.items.map((it) => Object.assign({ kind: 'rintangan', z: 1 }, it)) }));
}
/* Keluarkan baris pola yang jedanya sudah habis (dipanggil tiap frame di loop). */
function prosesPola() {
  if (!game.polaAntrian.length) return;
  const br = game.polaAntrian[0];
  br.t -= 1;
  if (br.t <= 0) {
    game.polaAntrian.shift();
    for (const it of br.items) game.objects.push(it);
  }
}
function spawnObject() {
  const lv = game.level;
  if (game.polaAntrian.length) return; // pola sedang berjalan — jangan tumpuk spawn acak
  // pola berurutan (lv >= 5): makin sering di level tinggi
  if (lv >= 5 && Math.random() < Math.min(0.45, 0.10 + lv * 0.006)) { spawnPola(); return; }
  const r = Math.random();
  const lane = Math.floor(Math.random() * 3);
  if (r < 0.42) {
    game.objects.push({ kind: 'koin', lane, z: 1 });
    if (Math.random() < 0.5) game.objects.push({ kind: 'koin', lane, z: 0.94 });
    if (Math.random() < 0.3) game.objects.push({ kind: 'koin', lane: (lane + 1) % 3, z: 1 });
  } else {
    // rintangan tunggal: dinding (lv>=3) dan geser (lv>=8) ikut muncul
    let type = ['batu', 'kotak', 'pagar'][Math.floor(Math.random() * 3)];
    const roll = Math.random();
    if (lv >= 8 && roll < 0.12) type = 'geser';
    else if (lv >= 3 && roll < 0.24) type = 'dinding';
    const ob = { kind: 'rintangan', type, lane, z: 1 };
    if (type === 'dinding') ob.lanes = lane === 2 ? [1, 2] : [lane, lane + 1];
    if (type === 'geser') { const a = lane === 2 ? 1 : lane; ob.laneA = a; ob.laneB = a + 1; ob.lane = a; ob.fase = Math.floor(Math.random() * 150); ob.periode = Math.max(90, 180 - lv * 2); ob.lanePos = a; }
    game.objects.push(ob);
    // kadang 2 rintangan sekaligus di level tinggi (selalu sisakan 1 jalur aman)
    // — rintangan ke-2 HANYA yang bisa dilompat/diguling, supaya tidak pernah
    // menutup semua jalur bersama tembok/gerbang pertama.
    if (lv >= 5 && Math.random() < 0.35) {
      const lane2 = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
      game.objects.push({ kind: 'rintangan', type: ['batu', 'kotak', 'pagar'][Math.floor(Math.random() * 3)], lane: lane2, z: 1 });
    }
  }
}
function loop() {
  if (!game.running) return;
  if (game.paused) return; // diam saat jeda — lanjutGame()/toggleJeda() yang menjadwalkan lagi
  const sekarang = performance.now();
  const terakhir = loop._terakhir || sekarang;
  if (sekarang - terakhir > 250) { loop._terakhir = sekarang; requestAnimationFrame(loop); return; } // frame panjang (mis. habis iklan) tidak boleh melompatkan state
  loop._terakhir = sekarang;
  {
    game.frame++;
    game.distance += game.speed * 0.06;
    game.roadScroll += game.speed * 0.002;
    // spawn: makin cepat & padat tiap level
    game.spawnT -= 1;
    if (game.spawnT <= 0) {
      if (game.polaAntrian.length) { game.spawnT = 10; } // pola jalan — tunda spawn acak
      else { spawnObject(); game.spawnT = jedaSpawn(game.level); }
    }
    prosesPola();
    game.lanePos += (game.lane - game.lanePos) * 0.22;
    stepGerak(game); // lompat & guling
    game.objects.forEach((o) => {
      if (o.type === 'geser') gerakGeser(o, game.frame); // gerbang bergeser tiap frame
      o.z -= game.speed * 0.002;
      if (game.magnet && o.kind === 'koin' && o.z > 0.08 && o.z < 0.6) o.z -= game.speed * 0.002 * 1.2; // magnet: koin melaju ke arah pemain
      if (o.kind === 'koin' && o.z <= 0.12 && o.z > -0.02 && o.lane === game.lane) {
        if (!o.taken) { o.taken = true; game.coinCount++; game.coins += 10 * game.mult; beep(880, 0.08, 'sine'); }
      }
      if (o.kind === 'rintangan' && o.z <= 0.10 && o.z > -0.02 && rintanganDiJalur(o, game) && !o.hit) {
        o.hit = true;
        if (tabrakanKena(o, game)) {
          if (game.shield) { game.shield = false; beep(300, 0.2, 'square'); toast('Perisai menahan tabrakan!'); }
          else { beep(120, 0.4, 'sawtooth'); gameOver(); return; }
        }
        // kalau tidak kena (lompat/guling), o.hit sudah ditandai — lolos
      }
    });
    game.objects = game.objects.filter((o) => o.z > -0.08 && !o.taken);
    $('hudKoin').textContent = '🪙 ' + game.coins;
    $('hudJarak').textContent = Math.floor(game.distance) + ' / ' + game.target + ' m';
    // debu kaki (di posisi pemain, perspektif)
    const pp = proyeksi(game.lanePos, 0);
    if (game.frame % 5 === 0) game.debu.push({ x: pp.x + (Math.random() * 30 - 15), y: 478, r: 3 + Math.random() * 3, a: 0.3 });
    game.debu.forEach((dd) => { dd.y -= 1; dd.a -= 0.012; dd.r += 0.4; });
    game.debu = game.debu.filter((dd) => dd.a > 0);
    if (!renderLari3D()) renderScene(ctx, game);
    if (game.distance >= game.target) { selesaiLevel(); return; }
  }
  requestAnimationFrame(loop);
}
let autoLanjutTimer = null;
function gameOver() {
  game.running = false;
  window.__rcGameRunning = false; // fase 2 boleh lanjut dimuat lagi
  jedaKarenaIklan = false;
  if (autoLanjutTimer) { clearInterval(autoLanjutTimer); autoLanjutTimer = null; }
  game.noIdleUntil = Date.now() + 1500; // beri waktu animasi tersandung 3D
  if (window.Run3D && window.Run3D.ready) window.Run3D.playStumble();
  document.body.classList.remove('mode-lari');
  const po0 = $('pauseOverlay'); if (po0) po0.classList.add('hidden');
  resetSkillIklan();
  const el = $('gameResult');
  el.innerHTML = '<h3>💥 Kena Halangan!</h3><p>Lari selesai di level ' + game.level + '. Koin terkumpul: <b>' + game.coins + '</b> (jarak ' + Math.floor(game.distance) + ' m).</p><p class="muted">Koin tetap dihitung — tekan Main Lagi untuk mencoba lagi.</p>';
  el.classList.add('show');
  const pillOver = $('tekanMulai'); if (pillOver) { pillOver.textContent = '▶ Main Lagi — ketuk untuk coba lagi'; pillOver.hidden = false; }
  if (game.coins > 0) { const durBank = Date.now() - (game.mulaiAt || Date.now()); api('/api/bank-run-coins', 'POST', { coins: game.coins, coinCount: game.coinCount, distance: Math.floor(game.distance), durationMs: durBank, level: game.level }).then(() => muatProfil()).catch(() => {}); } else { muatProfil(); }
}
async function selesaiLevel() {
  const lvSelesai = game.level;
  game.running = false;
  window.__rcGameRunning = false;
  game.noIdleUntil = Date.now() + 1200;
  document.body.classList.remove('mode-lari');
  const po1 = $('pauseOverlay'); if (po1) po1.classList.add('hidden');
  resetSkillIklan();
  beep(660, 0.15); setTimeout(() => beep(880, 0.2), 150);
  tampilIklanSelingan(async () => {
    let pesan = '<p>Koin terkumpul: <b>' + game.coins + '</b>' + (isBos(lvSelesai) ? ' • 👹 LEVEL BOS — bonus 5x!' : '') + '</p>';
    let tersimpan = false;
    try {
      const d = await api('/api/finish-level', 'POST', { level: lvSelesai, coins: game.coins, coinCount: game.coinCount, distance: Math.floor(game.distance), durationMs: Date.now() - (game.mulaiAt || Date.now()) });
      tersimpan = true;
      pesan += '<p>Bonus level: <b>+' + (d.bonus != null ? d.bonus : 0) + '</b> • Total dari lari ini: <b>' + (d.coinsEarned != null ? d.coinsEarned : game.coins) + ' koin</b><br><span class="muted">Saldo sekarang: ' + (d.coins != null ? d.coins : '') + ' koin.</span></p>';
      if (d.skinsBaru && d.skinsBaru.length) pesan += '<p>🎨 Skin baru terbuka: <b>' + d.skinsBaru.map(esc).join(', ') + '</b> — cek di Toko!</p>';
      if (d.charsBaru && d.charsBaru.length) pesan += '<p>🎭 Karakter baru terbuka: <b>' + d.charsBaru.map(esc).join(', ') + '</b> — cek di Toko!</p>';
      await muatProfil();
    } catch (e) { pesan += '<p class="muted">Gagal menyimpan ke server (' + esc(e.message) + ') — koin lokal tetap tercatat di panel hasil.</p>'; }
    // Layar finish: gambar KARAKTER AKTIF (foto 2D dari /characters/), bukan statis.
    const kAktif = karakterAktif();
    const imgFinish = $('finishCharImg');
    if (imgFinish) { imgFinish.src = gambarKarakterAktif(); imgFinish.alt = kAktif ? kAktif.nama : 'Karakter'; }
    const namaFinish = $('finishNama');
    if (namaFinish) namaFinish.textContent = kAktif ? ('🎭 ' + kAktif.nama + ' • Lv ' + kAktif.level) : '';
    const tamat = lvSelesai >= 60;
    $('finishJudul').textContent = tamat ? '🏆 TAMAT!' : '🎉 LEVEL SELESAI!';
    if (tamat) pesan += '<p>🏆 Kamu sudah menamatkan semua 60 level! Main lagi level 60 kapan saja.</p>';
    $('finishIsi').innerHTML = pesan;
    const pHitung = $('finishHitung'), bLanjut = $('btnFinishLanjut'), bUlang = $('btnFinishUlang');
    pHitung.classList.add('hidden'); bLanjut.classList.add('hidden'); bUlang.classList.add('hidden');
    const modal = $('modalFinish'); modal.classList.add('show');
    const pill = $('tekanMulai'); if (pill) { pill.textContent = '▶ Main Lagi'; pill.hidden = false; }
    if (tamat) return;
    if (!tersimpan) {
      // simpan gagal — jangan loncat level; pemain ulang level yang sama
      bUlang.textContent = '▶ Main Lagi (Level ' + lvSelesai + ')';
      bUlang.classList.remove('hidden');
      bUlang.onclick = mulaiGame;
      return;
    }
    // Otomatis lanjut ke level berikutnya — tanpa pilih level manual.
    const nextLv = Math.min(60, (profile && profile.maxLevel) || (lvSelesai + 1));
    let hitung = 3;
    $('finishNextLv').textContent = nextLv;
    $('hitungLanjut').textContent = hitung;
    pHitung.classList.remove('hidden');
    bLanjut.textContent = '▶ Lanjut ke Level Berikutnya';
    bLanjut.classList.remove('hidden');
    const lanjutkan = () => {
      if (autoLanjutTimer) { clearInterval(autoLanjutTimer); autoLanjutTimer = null; }
      if (!document.body.classList.contains('mode-fullscreen')) { modal.classList.remove('show'); return; } // pemain sudah keluar — tutup layar finish
      game.level = nextLv;
      modal.classList.remove('show');
      mulaiGame(); // tetap lewat /api/run-start (gerbang nyawa)
    };
    bLanjut.onclick = lanjutkan;
    autoLanjutTimer = setInterval(() => {
      hitung--;
      const hEl = $('hitungLanjut'); if (hEl) hEl.textContent = hitung;
      if (hitung <= 0) lanjutkan();
    }, 1000);
  });
}
let jedaKarenaIklan = false;
/* Jeda game: loop berhenti maju (2D & 3D membeku di frame terakhir). */
function jedaGame() {
  if (!game.running || game.paused) return;
  game.paused = true;
  const po = $('pauseOverlay'); if (po) po.classList.toggle('hidden', !(game.paused && document.body.classList.contains('mode-lari')));
}
function lanjutGame() {
  jedaKarenaIklan = false;
  if (!game.running || !game.paused) return;
  game.paused = false;
  const po = $('pauseOverlay'); if (po) po.classList.add('hidden');
  requestAnimationFrame(loop);
}
function toggleJeda() {
  if (!game.running) return;
  if (game.paused) lanjutGame();
  else jedaGame();
}
function tampilIklanSelingan(cb) {
  const sedangLari = game.running && !game.paused;
  if (sedangLari) { jedaKarenaIklan = true; jedaGame(); } // iklan muncul -> game HARUS jeda
  const n = networks.length ? networks[networkIdx % networks.length].name : 'Simulasi';
  networkIdx++;
  $('iklanNamaJaringan').textContent = n + ' (simulasi)';
  const modal = $('modalIklan'); modal.classList.add('show');
  const btn = $('btnTutupIklan'); btn.disabled = true;
  let sisa = 5; $('iklanHitung').textContent = sisa; btn.textContent = 'Tutup (' + sisa + ')';
  api('/api/ads/impression', 'POST', { network: n, format: 'interstitial' }).catch(() => {});
  const timer = setInterval(() => {
    sisa--; $('iklanHitung').textContent = Math.max(0, sisa); btn.textContent = sisa > 0 ? 'Tutup (' + sisa + ')' : 'Tutup ✕';
    if (sisa <= 0) { clearInterval(timer); btn.disabled = false; }
  }, 1000);
  btn.onclick = () => { modal.classList.remove('show'); if (jedaKarenaIklan) lanjutGame(); cb(); };
}
async function mulaiGame() {
  if (!token) { toast('Masuk dulu dengan Google.'); return; }
  const pill = $('tekanMulai'); const teksPill = pill ? pill.textContent : '';
  if (pill) pill.textContent = '⏳ Memeriksa nyawa…';
  try {
    const d = await api('/api/run-start', 'POST', {}, 10000);
    if (player) { player.lives = d.lives; player.livesCooldownUntil = d.cooldownUntil || null; }
    renderNyawa();
  } catch (e) {
    toast(e.message);
    if (pill) pill.textContent = teksPill;
    await muatProfil();
    return;
  }
  cobaPreload3D(); // jaga-jaga kalau modul 3D baru termuat setelah login
  bukaModeLayarPenuh(); // masuk layar game penuh (canvas disesuaikan ke layar)
  resetGame();
  mulaiMusik();
  game.running = true; game.paused = false;
  window.__rcGameRunning = true; // fase 2 ditunda selama lari (anti-freeze)
  const tm = $('tekanMulai'); if (tm) tm.hidden = true;
  if (window.Run3D && window.Run3D.ready) { window.Run3D.setIdle(false); window.Run3D.playRun(); }
  game.mulaiAt = Date.now(); // bukti lari untuk validasi server (anti-cheat)
  document.body.classList.add('mode-lari');
  const po2 = $('pauseOverlay'); if (po2) po2.classList.add('hidden');
  requestAnimationFrame(loop);
}
/* ---------- Mode layar penuh (masuk game) ----------
 * Ketuk "Mulai Lari" -> #gameSection jadi layar game penuh (fixed, menutupi
 * tab & header), canvas mengisi layar, HUD di atas, tombol Jeda + Keluar di
 * bawah. Jalan di mode 3D maupun 2D (canvas 2D di-scale tanpa distorsi lewat
 * skalaCanvas di renderScene; canvas 3D menyesuaikan sendiri via ensureSize).
 * Hasil lari (game over / level selesai) tampil sebagai overlay di layar ini.
 * Keluar: kalau masih lari, sama seperti "Akhiri Lari" (koin tetap dibank),
 * lalu kembali ke Beranda dengan arena digambar ulang ukuran normal. */
const FS_W = 420, FS_H = 520; // ukuran canvas normal (di luar layar penuh)
function samakanUkuranCanvasLayarPenuh() {
  const wrap = document.querySelector('.game-wrap');
  const w = (wrap && wrap.clientWidth) || FS_W, h = (wrap && wrap.clientHeight) || FS_H;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
}
function bukaModeLayarPenuh() {
  if (document.body.classList.contains('mode-fullscreen')) return;
  document.body.classList.add('mode-fullscreen');
  samakanUkuranCanvasLayarPenuh(); // canvas 2D: backing store = ukuran layar (tajam)
}
function keluarModeLayarPenuh() {
  if (!document.body.classList.contains('mode-fullscreen')) return;
  if (autoLanjutTimer) { clearInterval(autoLanjutTimer); autoLanjutTimer = null; }
  if (game.running) gameOver(); // akhiri lari seperti tombol "Akhiri Lari"
  document.body.classList.remove('mode-fullscreen');
  canvas.width = FS_W; canvas.height = FS_H; // kembali ke ukuran normal
  try { renderScene(ctx, game); } catch (e) {} // gambar ulang arena di Beranda
}
window.addEventListener('resize', () => { if (document.body.classList.contains('mode-fullscreen')) samakanUkuranCanvasLayarPenuh(); });
$('btnFsJeda').addEventListener('click', toggleJeda);
$('btnFsKeluar').addEventListener('click', keluarModeLayarPenuh);
const _bfm = $('btnFsMusik'); if (_bfm) _bfm.addEventListener('click', toggleMusik);
function pindah(arah) {
  if (!game.running) return;
  if (arah === 'kiri') game.lane = Math.max(0, game.lane - 1);
  if (arah === 'kanan') game.lane = Math.min(2, game.lane + 1);
  if (arah === 'tengah') game.lane = 1;
  beep(440, 0.05, 'sine');
}
$('btnLanjut').addEventListener('click', toggleJeda);
$('btnAkhiri').addEventListener('click', () => { if (game.running) gameOver(); });
function tulisTombolSuara() {
  const bm = $('btnMusik'); if (bm) { bm.textContent = musikNyala ? '🎵' : '🔇'; bm.title = musikNyala ? 'Musik: Nyala' : 'Musik: Mati'; }
  const bs = $('btnSuara'); if (bs) { bs.textContent = suaraNyala ? '🔊' : '🔇'; bs.title = suaraNyala ? 'Suara: Nyala' : 'Suara: Mati'; }
  const bf = $('btnFsMusik'); if (bf) bf.textContent = musikNyala ? '🎵' : '🔇';
}
function toggleMusik() {
  musikNyala = !musikNyala;
  try { localStorage.setItem('nr_musik', musikNyala ? '1' : '0'); } catch (e) {}
  if (musikNyala) mulaiMusik(); else stopMusik();
  tulisTombolSuara();
}
function toggleSuara() {
  suaraNyala = !suaraNyala;
  try { localStorage.setItem('nr_suara', suaraNyala ? '1' : '0'); } catch (e) {}
  tulisTombolSuara();
}
$('btnMusik').addEventListener('click', toggleMusik);
$('btnSuara').addEventListener('click', toggleSuara);
tulisTombolSuara();
document.addEventListener('keydown', (e) => {
  if ($('app').classList.contains('hidden')) return;
  if (e.key === 'Escape' && document.body.classList.contains('mode-fullscreen')) { e.preventDefault(); keluarModeLayarPenuh(); return; }
  if (e.key === 'ArrowLeft') { e.preventDefault(); pindah('kiri'); }
  if (e.key === 'ArrowRight') { e.preventDefault(); pindah('kanan'); }
  if (e.key === 'ArrowUp') { e.preventDefault(); if (game.running) mulaiLompat(); }
  if (e.key === 'ArrowDown') { e.preventDefault(); if (game.running) mulaiGuling(); }
  if (e.key === ' ' || e.key === 'Enter') {
    if (document.activeElement === canvas || document.activeElement === document.body) {
      e.preventDefault();
      if (!game.running) mulaiGame();
      else if (e.key === 'Enter') toggleJeda();
      else mulaiLompat(); // Spasi saat lari = lompat
    }
  }
});
let touchX = null, touchY = null;
let abaikanKlik = false; /* cegah klik susulan setelah tap di layar sentuh */
const wrap = document.querySelector('.game-wrap');
/* Sentuh di .game-wrap (bukan canvas) supaya jalan di mode 2D maupun 3D */
wrap.addEventListener('touchstart', (e) => {
  if (e.target.closest('button')) return; // tombol di overlay jeda punya handler sendiri
  touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
}, { passive: true });
wrap.addEventListener('touchend', (e) => {
  if (touchX == null || touchY == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  touchX = null; touchY = null;
  if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx)) { if (dy < 0) mulaiLompat(); else mulaiGuling(); return; }
  if (dx < -24) pindah('kiri'); else if (dx > 24) pindah('kanan');
  else if (!game.running) mulaiGame();
  else { abaikanKlik = true; setTimeout(() => abaikanKlik = false, 400); toggleJeda(); }
}, { passive: true });
wrap.addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  if (abaikanKlik) return; if (!game.running && token) mulaiGame(); else if (game.running) toggleJeda();
});

/* Gambar awal di canvas — Xbot bergerak pelan walau belum main */
let idleT = 0;
const idleCoins = [{ kind: 'koin', lane: 1, z: 0.7 }, { kind: 'koin', lane: 1, z: 0.55 }, { kind: 'koin', lane: 0, z: 0.85 }, { kind: 'koin', lane: 2, z: 0.4 }];
function gambarAwal() {
  if (game.running) return;
  if (Date.now() < (game.noIdleUntil || 0)) return; // beri waktu animasi akhir (tersandung 3D)
  const R3 = window.Run3D;
  if (token) { cobaPreload3D(); if (window.Run3D && window.Run3D.lanjutkanPhase2) window.Run3D.lanjutkanPhase2(); } // fase 2 hanya saat idle
  if (R3 && R3.ready && document.querySelector('#tab-beranda').classList.contains('aktif')) {
    aktifkanMode3D(); R3.setIdle(true); return; // idle 3D: karakter lari di tempat
  }
  game.frame = idleT++;
  idleCoins.forEach((o) => { o.z -= 0.004; if (o.z < 0.05) o.z = 1; });
  const st = { level: 1, frame: game.frame, lane: 1, lanePos: 1 + Math.sin(game.frame / 40) * 0.12, objects: idleCoins, roadScroll: game.frame * 0.004, debu: [], shield: false };
  renderScene(ctx, st);
  const sk = skalaCanvas(ctx); // teks ikut skala arena (layar penuh)
  ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(12, Math.round(20 * sk.s)) + 'px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Tekan ▶ Mulai Lari', sk.ox + 210 * sk.s, sk.oy + 110 * sk.s);
}
gambarAwal();
setInterval(gambarAwal, 100);

/* ---------- Nyawa (15/hari, cooldown 15 menit kalau habis) ---------- */
function renderNyawa() {
  const bar = $('livesBar'); if (!bar || !player) return;
  const lives = player.lives == null ? 15 : player.lives;
  bar.textContent = '❤️ Nyawa: ' + lives + '/15';
  const cd = $('livesCooldown'), btn = $('btnNyawaIklan');
  const aktif = lives <= 0 && player.livesCooldownUntil && new Date(player.livesCooldownUntil).getTime() > Date.now();
  if (cd) cd.classList.toggle('hidden', !aktif);
  if (btn) btn.classList.toggle('hidden', !(lives < 15));
  if (aktif) tickNyawa();
}
function tickNyawa() {
  const el = $('livesCooldown');
  if (!el || !player || !player.livesCooldownUntil) return;
  const sisa = Math.max(0, new Date(player.livesCooldownUntil).getTime() - Date.now());
  if (sisa <= 0) { el.classList.add('hidden'); const b = $('btnNyawaIklan'); if (b) b.classList.add('hidden'); muatProfil(); return; }
  const m = Math.floor(sisa / 60000), s = Math.floor(sisa % 60000 / 1000);
  el.textContent = '⏳ Cooldown nyawa: ' + m + ':' + String(s).padStart(2, '0') + ' — atau nonton iklan buat +1 nyawa';
}
$('btnNyawaIklan').addEventListener('click', () => {
  tampilIklanSelingan(async () => {
    try {
      const d = await api('/api/lives/ad', 'POST', {});
      toast('+1 nyawa! Sekarang ' + d.lives + '/15 ❤️');
      await muatProfil();
    } catch (e) { toast(e.message); }
  });
});
setInterval(tickNyawa, 1000);

/* ---------- Login: animasi live full-screen (attract mode 3D) ---------- */
const bgCanvas = $('bgCanvas');
const bgCtx = bgCanvas ? bgCanvas.getContext('2d') : null;
const demo = { level: 1, frame: 0, lane: 1, lanePos: 1, objects: [], spawnT: 0, roadScroll: 0, debu: [], shield: false, speed: 4.5 };
function loopLogin() {
  if (!bgCtx || !bgCanvas || bgCanvas.style.display === 'none') return;
  if ($('authScreen').classList.contains('hidden')) return;
  demo.frame++;
  demo.roadScroll += demo.speed * 0.002;
  demo.lanePos += (demo.lane - demo.lanePos) * 0.1;
  if (demo.frame % 120 === 0) demo.lane = Math.floor(Math.random() * 3);
  demo.spawnT -= 1;
  if (demo.spawnT <= 0) {
    const lane = Math.floor(Math.random() * 3);
    if (Math.random() < 0.5) demo.objects.push({ kind: 'koin', lane, z: 1 });
    else {
      const t = ['batu', 'kotak', 'pagar', 'dinding'][Math.floor(Math.random() * 4)];
      const ob = { kind: 'rintangan', type: t, lane, z: 1 };
      if (t === 'dinding') ob.lanes = lane === 2 ? [1, 2] : [lane, lane + 1];
      demo.objects.push(ob);
    }
    demo.spawnT = 45;
  }
  demo.objects.forEach((o) => { o.z -= demo.speed * 0.002; });
  demo.objects = demo.objects.filter((o) => o.z > -0.08);
  renderScene(bgCtx, demo);
  requestAnimationFrame(loopLogin);
}
if (bgCtx) requestAnimationFrame(loopLogin);

/* Service worker */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
