// Fungsi bersama untuk semua halaman.
// Halaman khusus guru ditandai dengan <body data-halaman="guru">.

const MENU_PUBLIK = [
  ['/', 'Beranda'],
  ['/profil.html', 'Profil'],
  ['/informasi.html', 'Informasi'],
  ['/kontak.html', 'Kontak'],
];
const MENU_GURU = [
  ['/scan.html', 'Scan'],
  ['/siswa.html', 'Siswa'],
  ['/rekap.html', 'Rekap'],
  ['/pesan.html', 'Pesan'],
];

function sudahLogin() {
  return !!localStorage.getItem('token');
}

if (document.body.dataset.halaman === 'guru' && !sudahLogin()) {
  location.replace('/login.html');
}

async function api(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (sudahLogin()) headers.Authorization = 'Bearer ' + localStorage.getItem('token');
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && url !== '/api/login') {
    localStorage.removeItem('token');
    location.href = '/login.html';
    throw new Error('Sesi habis');
  }
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function logout() {
  await api('POST', '/api/logout').catch(() => {});
  localStorage.removeItem('token');
  location.href = '/';
}

// Membuat elemen dengan teks yang aman: textContent selalu meng-escape HTML,
// jadi isian pengguna (nama, berita, pesan) tidak pernah dijalankan sebagai kode.
function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

// Tanggal "YYYY-MM-DD" -> "21 November 2026"
function formatTanggal(t) {
  const [y, m, d] = t.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Header + menu navigasi (sama di semua halaman)
(function buatHeader() {
  const header = document.querySelector('header');
  if (!header) return;
  const sekarang = location.pathname === '/index.html' ? '/' : location.pathname;

  const atas = el('div', undefined, 'atas');
  const judul = el('a', 'MIN 1 Bangka Tengah', 'judul');
  judul.href = '/';
  const tombol = el('button', '☰ Menu', 'menu-btn');
  tombol.type = 'button';
  tombol.setAttribute('aria-expanded', 'false');
  tombol.onclick = () => {
    const buka = header.classList.toggle('buka');
    tombol.setAttribute('aria-expanded', String(buka));
  };
  atas.append(judul, tombol);

  const nav = el('nav');
  const tautan = (href, teks) => {
    const a = el('a', teks);
    a.href = href;
    if (href === sekarang) a.className = 'aktif';
    return a;
  };
  MENU_PUBLIK.forEach(([h, t]) => nav.append(tautan(h, t)));

  const guru = el('div', undefined, 'menu-guru');
  if (sudahLogin()) {
    MENU_GURU.forEach(([h, t]) => guru.append(tautan(h, t)));
    const keluar = el('button', 'Keluar');
    keluar.type = 'button';
    keluar.onclick = logout;
    guru.append(keluar);
  } else {
    guru.append(tautan('/login.html', 'Masuk Guru'));
  }
  nav.append(guru);

  header.replaceChildren(atas, nav);
})();
