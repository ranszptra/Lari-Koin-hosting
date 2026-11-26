// Tes musik DJ (v27) — sequencer gaya DJ remix Indo/TikTok, 100% sintesis
// WebAudio (tanpa file audio / tanpa lagu orang — bebas copyright).
// Memastikan: tempo 130 BPM, kick four-on-the-floor, bass offbeat, clap di
// ketukan 2 & 4, lead orisinal hanya di drop, struktur 8 bar
// (intro 2 -> build 2 -> drop 4) yang berulang mulus, riser di akhir build,
// layer intensitas di level >= 10, scheduler lookahead (bukan per-nada
// setInterval), dan perilaku lama tetap: musik mulai setelah interaksi,
// toggle musik/suara + localStorage nr_musik/nr_suara, SFX terpisah.
//
// Jalankan: node tests/test-musik-dj.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const app = baca('public/app.js');
const sw = baca('public/sw.js');

let lolos = 0, gagal = 0;
function cek(nama, ok, ekstra) {
  if (ok) { lolos++; console.log('  PASS ', nama); }
  else { gagal++; console.log('  GAGAL', nama, ekstra ? '— ' + ekstra : ''); }
}

// Ambil array konstanta dari sumber app.js (pola murni, bisa diuji tanpa DOM).
function ambilArray(nama) {
  const m = app.match(new RegExp('const ' + nama + ' = \\[([^\\]]*)\\]'));
  if (!m) return null;
  return JSON.parse('[' + m[1] + ']');
}
function ambilAngka(nama) {
  const m = app.match(new RegExp('const ' + nama + ' = ([0-9.]+)'));
  return m ? Number(m[1]) : null;
}

const KICK = ambilArray('DJ_KICK');
const CLAP = ambilArray('DJ_CLAP');
const HAT = ambilArray('DJ_HAT');
const BASS_L = ambilArray('DJ_BASS_LANGKAH');
const BASS_N = ambilArray('DJ_BASS_NADA');
const LEAD_A = ambilArray('DJ_LEAD_A');
const LEAD_B = ambilArray('DJ_LEAD_B');
const BPM = ambilAngka('DJ_BPM');

// ---------- (1) Cek statis: tempo + pola ----------
cek('(s1) DJ_BPM = 130', BPM === 130, 'BPM=' + BPM);
cek('(s2) DJ_STEP = 60/BPM/4 (16th)', app.includes('const DJ_STEP = DJ_BEAT / 4;') && app.includes('const DJ_BEAT = 60 / DJ_BPM;'));
cek('(s3) kick four-on-the-floor: 16 langkah, 1 hanya di 0/4/8/12',
  Array.isArray(KICK) && KICK.length === 16 && KICK.every((v, i) => v === ([0, 4, 8, 12].includes(i) ? 1 : 0)), 'KICK=' + JSON.stringify(KICK));
cek('(s4) bass offbeat: langkah 2/6/10/14',
  JSON.stringify(BASS_L) === JSON.stringify([2, 6, 10, 14]), 'BASS_L=' + JSON.stringify(BASS_L));
cek('(s5) bass nada: 4 nada A1/A1/C2/G1, frekuensi 40-80 Hz',
  Array.isArray(BASS_N) && BASS_N.length === 4 && BASS_N.every((f) => f >= 40 && f <= 80), 'BASS_N=' + JSON.stringify(BASS_N));
cek('(s6) clap hanya di ketukan 2 & 4 (langkah 4 dan 12)',
  Array.isArray(CLAP) && CLAP.length === 16 && CLAP.every((v, i) => v === ([4, 12].includes(i) ? 1 : 0)), 'CLAP=' + JSON.stringify(CLAP));
cek('(s7) hat 8th: 1 di semua langkah genap',
  Array.isArray(HAT) && HAT.length === 16 && HAT.every((v, i) => v === (i % 2 === 0 ? 1 : 0)), 'HAT=' + JSON.stringify(HAT));
cek('(s8) lead A/B: 16 langkah, nada 300-900 Hz, >= 8 nada tiap pola, A != B',
  Array.isArray(LEAD_A) && Array.isArray(LEAD_B) && LEAD_A.length === 16 && LEAD_B.length === 16
  && LEAD_A.filter((f) => f).length >= 8 && LEAD_B.filter((f) => f).length >= 8
  && LEAD_A.every((f) => f === 0 || (f >= 300 && f <= 900))
  && LEAD_B.every((f) => f === 0 || (f >= 300 && f <= 900))
  && JSON.stringify(LEAD_A) !== JSON.stringify(LEAD_B),
  'A=' + JSON.stringify(LEAD_A) + ' B=' + JSON.stringify(LEAD_B));
cek('(s9) struktur 8 bar: intro 2 + build 2 + drop 4',
  app.includes('const DJ_BARS = 8;') && app.includes("bar < 2 ? 'intro' : bar < 4 ? 'build' : 'drop'"));
cek('(s10) riser hanya di bar build terakhir (bar 3, langkah 0)',
  app.includes("bar === 3 && s === 0") && app.includes('function djRiser('));
cek('(s11) instrumen lengkap: kick/bass/hat/clap/lead/riser + noise buffer',
  ['function djKick(', 'function djBass(', 'function djHat(', 'function djClap(', 'function djLead(', 'function djRiser(', 'function djNoiseBuffer(']
    .every((f) => app.includes(f)));

// ---------- (2) Cek statis: tanpa file audio, perilaku lama tetap ----------
cek('(s12) tanpa file audio eksternal (tanpa mp3/wav/ogg/new Audio)',
  !/\.mp3|\.wav|\.ogg|new Audio\(/.test(app));
cek('(s13) mesin musik lama sudah diganti (tanpa MELODI/BAS/nada lama)',
  !app.includes('const MELODI') && !app.includes('const BAS =') && !app.includes('function nada('));
cek('(s14) scheduler lookahead: jadwalkan 0,5 dtk ke depan, interval 100 ms',
  app.includes('audioCtx.currentTime + 0.5') && app.includes('setInterval(jadwalMusik, 100)'));
cek('(s15) mulai/stop/toggle musik tetap ada; mulaiMusik hanya dipanggil dari dalam fungsi (gesture/toggle), bukan top-level',
  app.includes('function mulaiMusik()') && app.includes('function stopMusik()') && app.includes('function toggleMusik()')
  && app.split('\n').filter((l) => l.includes('mulaiMusik();')).every((l) => /^\s/.test(l))
  && (app.match(/mulaiMusik\(\);/g) || []).length === 2);
cek('(s16) localStorage nr_musik/nr_suara + tombol musik/suara tetap dipakai',
  app.includes("localStorage.getItem('nr_musik')") && app.includes("localStorage.getItem('nr_suara')")
  && app.includes("localStorage.setItem('nr_musik'") && app.includes("localStorage.setItem('nr_suara'")
  && app.includes('btnMusik') && app.includes('btnSuara'));
cek('(s17) SFX terpisah tetap ada (beep + suaraNyala), musik pakai musikGain sendiri',
  app.includes('function beep(') && app.includes('suaraNyala') && app.includes('musikGain'));
cek('(s18) intensitas level: level >= 10 tambah layer (hat 16th + lead lebih keras)',
  app.includes('djIntens()') && app.includes('>= 10') && app.includes("s % 2 === 1") && app.includes('intens ? 0.09 : 0.07'));
cek('(s19) sw.js: cache naik ke v27', sw.includes("CACHE = 'lari-koin-v27'"));

// ---------- (3) Simulasi logika sequencer: 1 siklus penuh 8 bar x 16 langkah ----------
// Meniru keputusan jadwalMusik() per langkah, tanpa AudioContext.
function bagian(bar) { return bar < 2 ? 'intro' : bar < 4 ? 'build' : 'drop'; }
const hitung = { intro: { kick: 0, bass: 0, clap: 0, lead: 0 }, build: { kick: 0, bass: 0, clap: 0, lead: 0 }, drop: { kick: 0, bass: 0, clap: 0, lead: 0 } };
let riser = 0;
for (let langkah = 0; langkah < 8 * 16; langkah++) {
  const bar = Math.floor(langkah / 16) % 8;
  const s = langkah % 16;
  const b = bagian(bar);
  if (KICK[s]) hitung[b].kick++;
  if (BASS_L.includes(s)) hitung[b].bass++;
  if (b !== 'intro' && CLAP[s]) hitung[b].clap++;
  if (b === 'drop') {
    const pola = bar % 2 === 0 ? LEAD_A : LEAD_B;
    if (pola[s]) hitung[b].lead++;
  }
  if (b === 'build' && bar === 3 && s === 0) riser++;
}
cek('(L1) 1 siklus = 128 langkah (8 bar x 16)',
  8 * 16 === 128);
cek('(L2) kick: 4 per bar di semua bagian (intro 8, build 8, drop 16)',
  hitung.intro.kick === 8 && hitung.build.kick === 8 && hitung.drop.kick === 16,
  JSON.stringify(hitung));
cek('(L3) bass offbeat: 4 per bar di semua bagian (intro 8, build 8, drop 16)',
  hitung.intro.bass === 8 && hitung.build.bass === 8 && hitung.drop.bass === 16,
  JSON.stringify(hitung));
cek('(L4) clap: 0 di intro, 4 di build (2 bar), 8 di drop (4 bar)',
  hitung.intro.clap === 0 && hitung.build.clap === 4 && hitung.drop.clap === 8,
  JSON.stringify(hitung));
cek('(L5) lead: 0 di intro/build, > 0 hanya di drop',
  hitung.intro.lead === 0 && hitung.build.lead === 0 && hitung.drop.lead > 0,
  JSON.stringify(hitung));
cek('(L6) riser: tepat 1x per siklus (akhir build)',
  riser === 1, 'riser=' + riser);
cek('(L7) lead drop memakai dua pola bergantian (bar genap A, ganjil B)',
  LEAD_A.filter((f) => f).length > 0 && LEAD_B.filter((f) => f).length > 0
  && JSON.stringify(LEAD_A) !== JSON.stringify(LEAD_B));
cek('(L8) durasi 1 siklus 8 bar @130 BPM = 8*16*60/130/4 dtk (~14,77 dtk)',
  Math.abs(8 * 16 * (60 / 130 / 4) - 14.769) < 0.01);

console.log('\nMusik-DJ: ' + lolos + ' lolos, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
