// Uji beban app.js: apakah skrip mati (TDZ / ReferenceError) saat dievaluasi?
// Stub DOM minimal — dievaluasi sebagai classic script (bukan module).
// Harus mencetak "LOAD OK" — kalau ada TDZ (misal tabel data dibaca sebelum
// dideklarasikan), cetak LOAD GAGAL + pesannya.
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
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} }, userAgent: 'test' }, configurable: true });
Object.defineProperty(globalThis, 'location', { value: { origin: 'https://x.test', search: '' }, configurable: true });
import('fs').then(async ({ readFileSync }) => {
  const appPath = process.argv[2] || '/home/hatch/workspace/lari-koin-hosting/public/app.js';
  const code = readFileSync(appPath, 'utf8');
  try {
    (new Function(code))();
    console.log('LOAD OK — tidak ada TDZ saat evaluasi awal');
    setTimeout(() => process.exit(0), 500);
  } catch (e) {
    console.log('LOAD GAGAL:', e.constructor.name + ': ' + e.message);
    console.log((e.stack || '').split('\n').slice(0, 6).join('\n'));
    setTimeout(() => process.exit(1), 500);
  }
});
