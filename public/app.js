/* Nailong Runner — halaman pemain. Token & progres hanya di memori JS. */
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
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function api(path, method, body) {
  const res = await fetch(path, {
    method: method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || ('Gagal memanggil ' + path));
  return data;
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

/* ---------- Dunia (6 dunia, tiap 10 level) ---------- */
const DUNIA = [
  { nama: 'Kota Senja', langit: '#ff9a5c', tanah: '#7a5a3a', aksen: '#ffd54a', hias: '🏙' },
  { nama: 'Hutan Rimba', langit: '#7ec850', tanah: '#3e6b2f', aksen: '#c8f7a0', hias: '🌳' },
  { nama: 'Gurun Pasir', langit: '#ffe08a', tanah: '#d9a441', aksen: '#fff3c4', hias: '🌵' },
  { nama: 'Salju Abadi', langit: '#bfe8ff', tanah: '#e8f4ff', aksen: '#ffffff', hias: '❄' },
  { nama: 'Luar Angkasa', langit: '#1a1033', tanah: '#2d1b4d', aksen: '#b388ff', hias: '⭐' },
  { nama: 'Lava Berapi', langit: '#5c1a00', tanah: '#8a2a00', aksen: '#ff7043', hias: '🌋' }
];
function duniaUntuk(level) { return DUNIA[Math.min(5, Math.floor(((level || 1) - 1) / 10))]; }
function isBos(level) { return level % 10 === 0; }

/* ---------- Latar dunia bergerak (langit, matahari/bulan, partikel) ---------- */
let partikel = [], partikelDunia = -1;
function initPartikel(duniaIdx) {
  partikelDunia = duniaIdx;
  partikel = [];
  for (let i = 0; i < 26; i++) partikel.push({ x: Math.random() * 420, y: Math.random() * 520, s: 1 + Math.random() * 3, v: 0.4 + Math.random() * 1.2, f: Math.random() * Math.PI * 2 });
}
function gambarLatar(duniaIdx, frame) {
  const d = DUNIA[duniaIdx];
  if (partikelDunia !== duniaIdx) initPartikel(duniaIdx);
  const g = ctx.createLinearGradient(0, 0, 0, 110);
  g.addColorStop(0, d.langit); g.addColorStop(1, d.tanah);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 420, 110);
  ctx.fillStyle = duniaIdx === 4 ? '#f5f3ce' : '#fff3b0';
  ctx.beginPath(); ctx.arc(368, 52, duniaIdx === 4 ? 20 : 26, 0, Math.PI * 2); ctx.fill();
  if (duniaIdx === 4) { ctx.fillStyle = '#c9c9a8'; ctx.beginPath(); ctx.arc(360, 46, 5, 0, Math.PI * 2); ctx.arc(376, 58, 4, 0, Math.PI * 2); ctx.fill(); }
  partikel.forEach((p) => {
    p.f += 0.02;
    if (duniaIdx === 5) { p.y -= p.v; if (p.y < -6) { p.y = 526; p.x = Math.random() * 420; } }
    else { p.y += p.v; p.x += Math.sin(p.f) * 0.4; if (p.y > 526) { p.y = -6; p.x = Math.random() * 420; } }
    if (duniaIdx === 0) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.s * 5, p.s * 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (duniaIdx === 1) { ctx.fillStyle = 'rgba(120,220,120,.9)'; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.f); ctx.fillRect(-p.s * 2, -p.s, p.s * 4, p.s * 2); ctx.restore(); }
    else if (duniaIdx === 2) { ctx.fillStyle = 'rgba(230,200,140,.8)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); }
    else if (duniaIdx === 3) { ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); }
    else if (duniaIdx === 4) { ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.6 * Math.abs(Math.sin(p.f))).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 0.8, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillStyle = 'rgba(255,' + (100 + Math.floor(80 * Math.abs(Math.sin(p.f)))) + ',40,.95)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); }
  });
}

/* ---------- Auth ---------- */
async function doAuth(mode) {
  const name = $('authName').value.trim();
  const pin = $('authPin').value.trim();
  const referrer = $('authReferrer').value.trim();
  if (!name) { $('authMsg').textContent = 'Isi nama pemain dulu.'; return; }
  if (pin.length < 4 || pin.length > 12) { $('authMsg').textContent = 'PIN harus 4–12 karakter.'; return; }
  $('authMsg').textContent = 'Memproses…';
  try {
    const body = { name, pin };
    if (mode === 'register' && referrer) body.referrer = referrer;
    const data = await api(mode === 'register' ? '/api/register' : '/api/login', 'POST', body);
    token = data.token; player = data.player;
    await sesudahLogin(mode === 'register' ? 'Akun dibuat, selamat datang ' + name + '!' : 'Selamat datang kembali, ' + name + '!');
  } catch (e) { $('authMsg').textContent = e.message; }
}
async function sesudahLogin(pesan) {
  if (player && player.banned) {
    $('authMsg').textContent = 'Akun ini otomatis diblokir: IP kamu sudah dipakai akun lain. Hubungi admin untuk buka blokir.';
    return;
  }
  $('authScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('authMsg').textContent = '';
  if (pesan) toast(pesan);
  await muatProfil();
  await muatLeaderboard();
  await muatOffers();
  await muatNetworks();
  let tourDone = false;
  try { tourDone = localStorage.getItem('nr_tour_done') === '1'; } catch (e) {}
  if (!tourDone) tampilTour(0);
}
$('btnLogin').addEventListener('click', () => doAuth('login'));
$('btnRegister').addEventListener('click', () => doAuth('register'));
$('authPin').addEventListener('keydown', (e) => { if (e.key === 'Enter') doAuth('login'); });

/* ---------- Tur fitur (pertama daftar) ---------- */
const TOUR_STEPS = [
  { img: '/nailong-wave.jpg', judul: 'Selamat datang di Nailong Runner! 🐉', teks: 'Nailong si naga kuning gembul siap lari bersamamu. Lari, kumpulkan koin, tukar koin jadi uang sungguhan.' },
  { judul: '🎮 Cara Main', teks: 'Geser kiri / kanan atau ketuk tombol untuk pindah jalur. Hindari batu, kotak & pagar. Ambil koin — tiap koin +10 koin. Selesaikan level dengan lari sampai jarak target.' },
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

/* ---------- Login sosial (Google / Facebook, sekali ketuk) ---------- */
function muatScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.defer = true;
    s.onload = resolve; s.onerror = () => reject(new Error('Gagal memuat ' + src));
    document.head.appendChild(s);
  });
}
async function masukSosial(provider, tokenSosial) {
  $('socialMsg').textContent = 'Memeriksa akun ' + provider + '…';
  try {
    const data = await api('/api/auth/social', 'POST', { provider, token: tokenSosial });
    token = data.token; player = data.player;
    await sesudahLogin('Selamat datang, ' + (player.name || '') + '!');
  } catch (e) { $('socialMsg').textContent = e.message; }
}
(async function initSosial() {
  let cfg = {};
  try { cfg = await api('/api/auth/social-config'); } catch { return; }
  if (!cfg.google && !cfg.facebook) return; // belum dikonfigurasi — tombol tetap sembunyi
  $('socialLogin').classList.remove('hidden');
  if (cfg.google && cfg.googleClientId) {
    try {
      await muatScript('https://accounts.google.com/gsi/client');
      google.accounts.id.initialize({
        client_id: cfg.googleClientId,
        callback: (resp) => { if (resp && resp.credential) masukSosial('google', resp.credential); },
        auto_select: true
      });
      google.accounts.id.renderButton($('btnGoogleWrap'), { theme: 'outline', size: 'large', text: 'signin_with' });
      google.accounts.id.prompt(); // One Tap: pemain lama langsung masuk otomatis
    } catch (e) { $('btnGoogleWrap').style.display = 'none'; }
  } else { $('btnGoogleWrap').style.display = 'none'; }
  if (cfg.facebook && cfg.facebookAppId) {
    try {
      await muatScript('https://connect.facebook.net/id_ID/sdk.js');
      FB.init({ appId: cfg.facebookAppId, cookie: false, xfbml: false, version: 'v21.0' });
      $('btnFacebook').addEventListener('click', () => {
        FB.login((r) => {
          if (r && r.authResponse && r.authResponse.accessToken) masukSosial('facebook', r.authResponse.accessToken);
          else $('socialMsg').textContent = 'Login Facebook dibatalkan.';
        }, { scope: 'public_profile' });
      });
    } catch (e) { $('btnFacebook').style.display = 'none'; }
  } else { $('btnFacebook').style.display = 'none'; }
})();

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
  const persen = Math.min(100, Math.round(koinKeRp(coins) / 1000 * 100));
  $('progressTarik').style.width = persen + '%';
  $('progressTarikText').textContent = persen + '% menuju penarikan Rp1.000 (' + rupiah(koinKeRp(coins)) + ' dari Rp1.000)';
  $('wheelLeft').textContent = profile.wheelLeft != null ? profile.wheelLeft : '—';
  $('chestLeft').textContent = profile.chestLeft != null ? profile.chestLeft : '—';
  $('adsToday').textContent = profile.adsToday || 0;
  renderLevelSelect(maxLv);
  renderMisi(); renderPrestasi(); renderCheckin(); renderTeman(); renderToko(); renderTarik();
  updateIklanBtn();
}
function renderLevelSelect(maxLv) {
  const sel = $('levelSelect');
  const cur = parseInt(sel.value || maxLv, 10);
  sel.innerHTML = '';
  for (let i = 1; i <= maxLv; i++) {
    const o = document.createElement('option');
    o.value = i; o.textContent = 'Level ' + i + (isBos(i) ? ' — BOS 👹' : '') + ' • ' + duniaUntuk(i).nama;
    sel.appendChild(o);
  }
  sel.value = String(Math.min(cur, maxLv));
  updateDuniaInfo();
}
function updateDuniaInfo() {
  const lv = parseInt($('levelSelect').value || 1, 10);
  const d = duniaUntuk(lv);
  const idx = Math.min(5, Math.floor((lv - 1) / 10)) + 1;
  $('duniaInfo').textContent = '🌍 Dunia ' + idx + ': ' + d.nama + ' (Level ' + (idx * 10 - 9) + '–' + idx * 10 + ')' + (isBos(lv) ? ' • 👹 LEVEL BOS — hadiah 5x!' : '');
  $('labelBos').innerHTML = isBos(lv) ? '<span class="badge-bos">👹 BOS</span>' : '';
  $('hudLevel').textContent = 'Lv ' + lv;
}
$('levelSelect').addEventListener('change', updateDuniaInfo);

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
const KATALOG = {
  character: [
    { id: 'jolly', nama: 'Nailong', harga: 0, ikon: '🐲', desc: 'Naga kuning gembul kesayangan — sudah dimiliki.' },
    { id: 'kiko', nama: 'Nailong Hijau', harga: 50000, ikon: '🐲', desc: 'Nailong hijau ceria.' },
    { id: 'momo', nama: 'Nailong Pink', harga: 100000, ikon: '🐲', desc: 'Nailong pink manis, pita di kepala.' },
    { id: 'rex', nama: 'Nailong Api', harga: 200000, ikon: '🐲', desc: 'Nailong oranye garang, tanduk naga.' }
  ],
  skin: [
    { id: 'emas', nama: 'Emas', harga: 25000, ikon: '✨', desc: 'Nailong kuning keemasan.' },
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
  renderTokoBagian('skin', 'tokoSkin');
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
      b1.addEventListener('click', async () => { try { await api('/api/offers/start', 'POST', { offerId: o.id }); toast('Misi dimulai (simulasi). Selesaikan instalasinya, lalu simulasikan verifikasi.'); await muatOffers(); } catch (e) { toast(e.message); } });
      const b2 = document.createElement('button'); b2.className = 'btn-putih btn-kecil'; b2.textContent = 'Simulasikan verifikasi (demo)';
      b2.addEventListener('click', async () => { try { await api('/api/offers/demo-verify', 'POST', { offerId: o.id }); toast('Verifikasi disimulasikan — misi terverifikasi (demo).'); await muatOffers(); } catch (e) { toast(e.message); } });
      const b3 = document.createElement('button'); b3.className = 'btn-hijau btn-kecil'; b3.textContent = 'Klaim Hadiah';
      b3.addEventListener('click', async () => { try { await api('/api/offers/claim', 'POST', { offerId: o.id }); toast('Hadiah misi diklaim!'); await muatProfil(); await muatOffers(); } catch (e) { toast(e.message); } });
      col.appendChild(b1); col.appendChild(b2); col.appendChild(b3);
      dEl.appendChild(col); el.appendChild(dEl);
    });
  } catch (e) { $('daftarOffer').innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; }
}

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
const game = { running: false, paused: false, lane: 1, level: 1, coins: 0, coinCount: 0, distance: 0, target: 500, speed: 4, objects: [], spawnT: 0, frame: 0, shield: false, magnet: false, mult: 1, hiasY: 0 };

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
  // kaki lari (bergantian naik-turun)
  const kakiY1 = y + r * 0.95 + Math.max(0, lari) * r * 0.25;
  const kakiY2 = y + r * 0.95 + Math.max(0, -lari) * r * 0.25;
  ctx.beginPath(); ctx.ellipse(x - r * 0.35, kakiY1, r * 0.28, r * 0.16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x + r * 0.35, kakiY2, r * 0.28, r * 0.16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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
  // pipi pink
  ctx.fillStyle = 'rgba(255,182,193,.9)';
  ctx.beginPath(); ctx.arc(x - r * 0.55, y + r * 0.25, r * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.55, y + r * 0.25, r * 0.2, 0, Math.PI * 2); ctx.fill();
  // mata hitam mengkilap
  const mata = skin === 'ninja' ? '#fff' : '#111';
  ctx.fillStyle = mata;
  ctx.beginPath(); ctx.ellipse(x - r * 0.32, y - r * 0.1, r * 0.16, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + r * 0.32, y - r * 0.1, r * 0.16, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - r * 0.27, y - r * 0.2, r * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.37, y - r * 0.2, r * 0.06, 0, Math.PI * 2); ctx.fill();
  // senyum kecil
  ctx.strokeStyle = skin === 'ninja' ? '#fff' : '#5d3a1a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y + r * 0.25, r * 0.3, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  if (game.shield) { ctx.strokeStyle = 'rgba(68,138,255,.8)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, r + 10, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}
function drawCoin(x, y, r) {
  ctx.fillStyle = '#f5b301'; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#b8860b'; ctx.font = 'bold ' + Math.round(r) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Rp', x, y + 1);
}
function drawObstacle(o) {
  const x = LANES[o.lane], y = o.y;
  if (o.type === 'batu') {
    ctx.fillStyle = '#8d8d8d'; ctx.strokeStyle = '#5d5d5d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a9a9a9'; ctx.beginPath(); ctx.arc(x - 8, y - 8, 10, 0, Math.PI * 2); ctx.fill();
  } else if (o.type === 'kotak') {
    ctx.fillStyle = '#a06a2c'; ctx.strokeStyle = '#6b4210'; ctx.lineWidth = 3;
    ctx.fillRect(x - 26, y - 26, 52, 52); ctx.strokeRect(x - 26, y - 26, 52, 52);
    ctx.beginPath(); ctx.moveTo(x - 26, y - 26); ctx.lineTo(x + 26, y + 26); ctx.moveTo(x + 26, y - 26); ctx.lineTo(x - 26, y + 26); ctx.stroke();
  } else {
    ctx.fillStyle = '#8d5a2b'; ctx.strokeStyle = '#5d3a1a'; ctx.lineWidth = 3;
    ctx.fillRect(x - 28, y - 14, 56, 28); ctx.strokeRect(x - 28, y - 14, 56, 28);
    for (let i = -1; i <= 1; i++) { ctx.fillRect(x + i * 20 - 3, y - 22, 6, 44); }
  }
}
function resetGame() {
  const lv = parseInt($('levelSelect').value || 1, 10);
  const pu = $('powerupSelect').value;
  game.level = lv; game.lane = 1; game.coins = 0; game.coinCount = 0; game.distance = 0;
  game.target = (isBos(lv) ? 700 : 450) + lv * 30;
  game.speed = 4 + lv * 0.18;
  game.objects = []; game.spawnT = 0; game.frame = 0; game.debu = [];
  game.shield = pu === 'perisai' || ((profile && profile.equipped && profile.equipped.powerup) === 'perisai');
  game.magnet = pu === 'magnet' || ((profile && profile.equipped && profile.equipped.powerup) === 'magnet');
  game.mult = (pu === 'koinx2' || ((profile && profile.equipped && profile.equipped.powerup) === 'koinx2')) ? 2 : 1;
  $('gameResult').classList.remove('show'); $('gameResult').innerHTML = '';
  $('hudKoin').textContent = '🪙 0'; $('hudJarak').textContent = '0 m'; $('hudLevel').textContent = 'Lv ' + lv;
  updateDuniaInfo();
}
function spawnObject() {
  const lv = game.level;
  const r = Math.random();
  const lane = Math.floor(Math.random() * 3);
  if (r < 0.42) {
    game.objects.push({ kind: 'koin', lane, y: -30 });
    if (Math.random() < 0.5) game.objects.push({ kind: 'koin', lane, y: -80 });
    if (Math.random() < 0.3) game.objects.push({ kind: 'koin', lane: (lane + 1) % 3, y: -30 });
  } else {
    const types = ['batu', 'kotak', 'pagar'];
    game.objects.push({ kind: 'rintangan', type: types[Math.floor(Math.random() * 3)], lane, y: -40 });
    // kadang 2 rintangan sekaligus di level tinggi (selalu sisakan 1 jalur aman)
    if (lv >= 5 && Math.random() < 0.35) {
      const lane2 = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
      game.objects.push({ kind: 'rintangan', type: types[Math.floor(Math.random() * 3)], lane: lane2, y: -40 });
    }
  }
}
function loop() {
  if (!game.running) return;
  if (!game.paused) {
    game.frame++;
    const d = duniaUntuk(game.level);
    game.distance += game.speed * 0.06;
    game.hiasY = (game.hiasY + game.speed) % 80;
    // spawn: makin cepat & padat tiap level
    game.spawnT -= 1;
    if (game.spawnT <= 0) { spawnObject(); game.spawnT = Math.max(28, 75 - game.level * 1.6); }
    const px = LANES[game.lane], py = 430;
    game.objects.forEach((o) => {
      o.y += game.speed;
      if (game.magnet && o.kind === 'koin' && o.y > 250 && o.y < 480) o.y += 3; // magnet: koin jatuh lebih cepat ke arah pemain
      if (o.kind === 'koin' && Math.abs(o.y - py) < 42 && o.lane === game.lane) {
        if (!o.taken) { o.taken = true; game.coinCount++; game.coins += 10 * game.mult; beep(880, 0.08, 'sine'); }
      }
      if (o.kind === 'rintangan' && Math.abs(o.y - py) < 48 && o.lane === game.lane && !o.hit) {
        o.hit = true;
        if (game.shield) { game.shield = false; beep(300, 0.2, 'square'); toast('Perisai menahan tabrakan!'); }
        else { beep(120, 0.4, 'sawtooth'); gameOver(); return; }
      }
    });
    game.objects = game.objects.filter((o) => o.y < 560 && !o.taken);
    $('hudKoin').textContent = '🪙 ' + game.coins;
    $('hudJarak').textContent = Math.floor(game.distance) + ' / ' + game.target + ' m';
    // gambar
    ctx.fillStyle = d.langit; ctx.fillRect(0, 0, 420, 520);
    ctx.fillStyle = d.tanah; ctx.fillRect(0, 0, 420, 520);
    gambarLatar(Math.min(5, Math.floor(((game.level || 1) - 1) / 10)), game.frame);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (let y = -80 + game.hiasY; y < 520; y += 80) { ctx.fillRect(8, y, 34, 50); ctx.fillRect(378, y, 34, 50); }
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(135, 0, 6, 520); ctx.fillRect(279, 0, 6, 520);
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    for (let y = -40 + game.hiasY; y < 520; y += 80) { ctx.fillRect(138, y, 6, 40); ctx.fillRect(282, y, 6, 40); }
    ctx.font = '22px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(d.hias, 14, 40); ctx.fillText(d.hias, 384, 120);
    game.objects.forEach((o) => { if (o.kind === 'koin') drawCoin(LANES[o.lane], o.y, 15); else drawObstacle(o); });
    // bayangan + Nailong (loncat kecil saat lari) + debu kaki
    const lompat = Math.abs(Math.sin(game.frame / 8)) * 6;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(px, py + 34, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
    if (game.frame % 5 === 0) game.debu.push({ x: px + (Math.random() * 30 - 15), y: py + 32, r: 3 + Math.random() * 3, a: 0.3 });
    game.debu.forEach((d) => { d.y -= 1; d.a -= 0.012; d.r += 0.4; });
    game.debu = game.debu.filter((d) => d.a > 0);
    game.debu.forEach((d) => { ctx.fillStyle = 'rgba(210,180,140,' + d.a.toFixed(2) + ')'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); });
    drawNailong(px, py - lompat, 30);
    if (game.distance >= game.target) { selesaiLevel(); return; }
  }
  requestAnimationFrame(loop);
}
function gameOver() {
  game.running = false;
  const el = $('gameResult');
  el.innerHTML = '<h3>💥 Kena Halangan!</h3><p>Lari selesai di level ' + game.level + '. Koin terkumpul: <b>' + game.coins + '</b> (jarak ' + Math.floor(game.distance) + ' m).</p><p class="muted">Koin tetap dihitung — tekan Main Lagi untuk mencoba lagi.</p>';
  el.classList.add('show');
  $('btnStart').textContent = '▶ Main Lagi';
  if (game.coins > 0) { api('/api/bank-run-coins', 'POST', { coins: game.coins }).then(() => muatProfil()).catch(() => {}); }
}
async function selesaiLevel() {
  game.running = false;
  beep(660, 0.15); setTimeout(() => beep(880, 0.2), 150);
  tampilIklanSelingan(async () => {
    let pesan = '<h3>🎉 Level ' + game.level + ' Selesai!</h3><p>Koin terkumpul: <b>' + game.coins + '</b>' + (isBos(game.level) ? ' • 👹 LEVEL BOS — bonus 5x!' : '') + '</p>';
    try {
      const d = await api('/api/finish-level', 'POST', { level: game.level, coins: game.coins });
      pesan += '<p>Bonus level: <b>+' + (d.bonus != null ? d.bonus : 0) + '</b> • Total dari lari ini: <b>' + (d.coinsEarned != null ? d.coinsEarned : game.coins) + ' koin</b><br><span class="muted">Saldo sekarang: ' + (d.coins != null ? d.coins : '') + ' koin.</span></p>';
      await muatProfil();
    } catch (e) { pesan += '<p class="muted">Gagal menyimpan ke server (' + esc(e.message) + ') — koin lokal tetap tercatat di panel hasil.</p>'; }
    pesan += '<button class="btn-emas" id="btnLagi" style="width:100%;margin-top:8px">▶ Main Lagi</button>';
    const el = $('gameResult'); el.innerHTML = pesan; el.classList.add('show');
    $('btnStart').textContent = '▶ Main Lagi';
    const bl = $('btnLagi'); if (bl) bl.addEventListener('click', mulaiGame);
  });
}
function tampilIklanSelingan(cb) {
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
  btn.onclick = () => { modal.classList.remove('show'); cb(); };
}
function mulaiGame() {
  if (!token) { toast('Masuk dulu dengan nama + PIN.'); return; }
  resetGame();
  mulaiMusik();
  game.running = true; game.paused = false;
  $('btnStart').textContent = '🏃 Lagi Lari…';
  $('btnPause').textContent = '⏸ Jeda';
  requestAnimationFrame(loop);
}
function pindah(arah) {
  if (!game.running) return;
  if (arah === 'kiri') game.lane = Math.max(0, game.lane - 1);
  if (arah === 'kanan') game.lane = Math.min(2, game.lane + 1);
  if (arah === 'tengah') game.lane = 1;
  beep(440, 0.05, 'sine');
}
$('btnStart').addEventListener('click', mulaiGame);
$('btnPause').addEventListener('click', () => {
  if (!game.running) return;
  game.paused = !game.paused;
  $('btnPause').textContent = game.paused ? '▶ Lanjut' : '⏸ Jeda';
  if (!game.paused) requestAnimationFrame(loop);
});
function tulisTombolSuara() {
  $('btnMusik').textContent = musikNyala ? '🎵 Musik: Nyala' : '🔇 Musik: Mati';
  $('btnSuara').textContent = suaraNyala ? '🔊 Suara: Nyala' : '🔇 Suara: Mati';
}
$('btnMusik').addEventListener('click', () => {
  musikNyala = !musikNyala;
  try { localStorage.setItem('nr_musik', musikNyala ? '1' : '0'); } catch (e) {}
  if (musikNyala) mulaiMusik(); else stopMusik();
  tulisTombolSuara();
});
$('btnSuara').addEventListener('click', () => {
  suaraNyala = !suaraNyala;
  try { localStorage.setItem('nr_suara', suaraNyala ? '1' : '0'); } catch (e) {}
  tulisTombolSuara();
});
tulisTombolSuara();
$('btnKiri').addEventListener('click', () => pindah('kiri'));
$('btnKanan').addEventListener('click', () => pindah('kanan'));
$('btnTengah').addEventListener('click', () => pindah('tengah'));
document.addEventListener('keydown', (e) => {
  if ($('app').classList.contains('hidden')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); pindah('kiri'); }
  if (e.key === 'ArrowRight') { e.preventDefault(); pindah('kanan'); }
  if (e.key === ' ' || e.key === 'Enter') {
    if (document.activeElement === canvas || document.activeElement === document.body) { e.preventDefault(); if (!game.running) mulaiGame(); else $('btnPause').click(); }
  }
});
let touchX = null;
canvas.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
canvas.addEventListener('touchend', (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (dx < -24) pindah('kiri'); else if (dx > 24) pindah('kanan');
  else if (!game.running) mulaiGame();
  touchX = null;
}, { passive: true });
canvas.addEventListener('click', () => { if (!game.running && token) mulaiGame(); });

/* Gambar awal di canvas — Nailong bergerak pelan walau belum main */
let idleT = 0;
function gambarAwal() {
  if (game.running) return;
  const d = DUNIA[0];
  ctx.fillStyle = d.langit; ctx.fillRect(0, 0, 420, 520);
  ctx.fillStyle = d.tanah; ctx.fillRect(0, 0, 420, 520);
  gambarLatar(0, game.frame);
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(135, 0, 6, 520); ctx.fillRect(279, 0, 6, 520);
  game.frame = idleT++;
  const lompat = Math.abs(Math.sin(game.frame / 8)) * 6;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(210, 464, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
  drawNailong(210, 430 - lompat, 30);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Tekan ▶ Mulai Lari', 210, 120);
}
gambarAwal();
setInterval(gambarAwal, 100);

/* Service worker */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
