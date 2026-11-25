/* Panel Admin — Nailong Runner. Token hanya di memori JS. */
'use strict';
let adminToken = null;
let semuaPemain = [];
const $ = (id) => document.getElementById(id);
const rupiah = (n) => 'Rp' + Math.floor(n || 0).toLocaleString('id-ID');
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3500); }
async function api(path, method, body, useAdmin) {
  const res = await fetch(path, {
    method: method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, (useAdmin && adminToken) ? { Authorization: 'Bearer ' + adminToken } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || ('Gagal memanggil ' + path));
  return data;
}

$('btnAdminLogin').addEventListener('click', async () => {
  const pin = $('adminPin').value.trim();
  if (!pin) { $('adminLoginMsg').textContent = 'Isi PIN dulu.'; return; }
  $('adminLoginMsg').textContent = 'Memeriksa…';
  try {
    const d = await api('/api/admin/login', 'POST', { pin });
    adminToken = d.adminToken;
    $('adminLogin').classList.add('hidden');
    $('adminApp').classList.remove('hidden');
    $('adminLoginMsg').textContent = '';
    toast('Masuk dashboard.');
    await muatDashboard();
  } catch (e) { $('adminLoginMsg').textContent = e.message; }
});
$('adminPin').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnAdminLogin').click(); });
$('btnLogoutAdmin').addEventListener('click', () => {
  adminToken = null;
  $('adminApp').classList.add('hidden');
  $('adminLogin').classList.remove('hidden');
  $('adminPin').value = '';
  toast('Keluar dari dashboard.');
});
$('btnRefreshAdmin').addEventListener('click', muatDashboard);

async function muatDashboard() {
  try {
    const d = await api('/api/admin/dashboard', 'GET', null, true);
    const t = d.totals || {};
    $('statPemain').textContent = (t.players || 0).toLocaleString('id-ID');
    $('statBaru').textContent = (t.newToday || 0).toLocaleString('id-ID');
    $('statKoin').textContent = (t.coinsCirculating || 0).toLocaleString('id-ID');
    $('statKoinRp').textContent = rupiah(t.coinsCirculatingRp || 0);
    renderTarik(d.withdrawals || {});
    semuaPemain = d.players || [];
    renderPemain('');
    const med = d.mediation || [];
    $('statMediasi').innerHTML = med.length ? '<table><tr><th>Network</th><th>Tayangan</th><th>Estimasi Rp</th></tr>' + med.map((m) => '<tr><td>' + esc(m.network) + '</td><td>' + (m.impressions || 0).toLocaleString('id-ID') + '</td><td>' + rupiah(m.estRevenueRp || 0) + '</td></tr>').join('') + '</table>' : '<p class="muted">Belum ada data mediasi.</p>';
    const off = d.offerwall || [];
    $('statOfferwall').innerHTML = off.length ? '<table><tr><th>Penyedia</th><th>Dimulai</th><th>Terverifikasi</th><th>Dibayar</th></tr>' + off.map((o) => '<tr><td>' + esc(o.provider) + '</td><td>' + (o.started || 0) + '</td><td>' + (o.verified || 0) + '</td><td>' + (o.paid || 0) + '</td></tr>').join('') + '</table>' : '<p class="muted">Belum ada data offerwall.</p>';
  } catch (e) { toast(e.message); }
}
function renderTarik(w) {
  renderTarikKelompok('tarikMenunggu', w.Menunggu || [], 'Diproses');
  renderTarikKelompok('tarikDiproses', w.Diproses || [], 'Selesai');
  const s = $('tarikSelesai');
  const list = w.Selesai || [];
  s.innerHTML = list.length ? list.map((x) => tarikHtml(x)).join('') : '<p class="muted">Tidak ada.</p>';
}
function tarikHtml(x) {
  return '<div class="tarik-row"><div><b>' + esc(x.playerName || '') + '</b> — ' + rupiah(x.amountRp || 0) + '<br><span class="muted">' + esc(x.method || '') + ' • ' + esc(x.number || '') + ' • ' + esc(x.status || '') + '</span></div></div>';
}
function renderTarikKelompok(elId, list, statusBaru) {
  const el = $(elId);
  if (!list.length) { el.innerHTML = '<p class="muted">Tidak ada.</p>'; return; }
  el.innerHTML = '';
  list.forEach((x) => {
    const d = document.createElement('div'); d.className = 'tarik-row';
    d.innerHTML = '<div><b>' + esc(x.playerName || '') + '</b> — ' + rupiah(x.amountRp || 0) + '<br><span class="muted">' + esc(x.method || '') + ' • ' + esc(x.number || '') + ' • ' + esc(x.status || '') + '</span></div>';
    const b = document.createElement('button');
    b.className = 'btn-emas btn-kecil';
    b.textContent = statusBaru === 'Diproses' ? 'Mulai Proses' : 'Tandai Sudah Dibayar';
    b.addEventListener('click', async () => {
      try { await api('/api/admin/withdrawal', 'POST', { id: x.id, status: statusBaru }, true); toast('Penarikan diubah ke ' + statusBaru + '.'); await muatDashboard(); }
      catch (e) { toast(e.message); }
    });
    d.appendChild(b); el.appendChild(d);
  });
}
function renderPemain(q) {
  const el = $('daftarPemain');
  const list = semuaPemain.filter((p) => !q || (p.name || '').toLowerCase().includes(q.toLowerCase()));
  if (!list.length) { el.innerHTML = '<p class="muted">Tidak ada pemain yang cocok.</p>'; return; }
  el.innerHTML = '<table><tr><th>Nama</th><th>Koin</th><th>Level</th><th>Terakhir Aktif</th></tr>' + list.map((p) => '<tr><td>' + esc(p.name) + '</td><td>' + (p.coins || 0).toLocaleString('id-ID') + '</td><td>' + (p.level || 0) + '</td><td>' + esc(p.lastActive || '—') + '</td></tr>').join('') + '</table>';
}
$('cariPemain').addEventListener('input', (e) => renderPemain(e.target.value));
$('btnGantiPin').addEventListener('click', async () => {
  const oldPin = $('pinLama').value.trim();
  const newPin = $('pinBaru').value.trim();
  if (!oldPin || !newPin) { $('gantiPinMsg').textContent = 'Isi PIN lama & PIN baru.'; return; }
  try {
    await api('/api/admin/change-pin', 'POST', { oldPin, newPin }, true);
    $('gantiPinMsg').textContent = 'PIN berhasil diganti.';
    $('pinLama').value = ''; $('pinBaru').value = '';
    toast('PIN berhasil diganti.');
  } catch (e) { $('gantiPinMsg').textContent = e.message; }
});
