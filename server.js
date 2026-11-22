// Absensi QR - MIN 1 Bangka Tengah
// Server Express + SQLite. Jalankan: node server.js  (isi .env dulu, lihat .env.example)

const fs = require('fs');
const path = require('path');

// Baca file .env (jika ada). Variabel yang sudah diset di environment tidak ditimpa.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

process.env.TZ = process.env.TZ || 'Asia/Jakarta'; // "hari ini" mengikuti WIB

// Akun guru/admin WAJIB dari environment, tidak ada sandi bawaan di kode.
const ADMIN_USER = (process.env.ADMIN_USER || '').trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
function gagalStart(pesan) {
  console.error('\n[GAGAL START] ' + pesan);
  console.error('Salin .env.example menjadi .env, isi ADMIN_USER dan ADMIN_PASSWORD, lalu jalankan lagi.\n');
  process.exit(1);
}
if (!ADMIN_USER || !ADMIN_PASSWORD) gagalStart('ADMIN_USER dan ADMIN_PASSWORD belum diisi.');
if (ADMIN_USER.length > 50) gagalStart('ADMIN_USER maksimal 50 karakter.');
if (ADMIN_PASSWORD.length < 8) gagalStart('ADMIN_PASSWORD minimal 8 karakter.');

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = '0.0.0.0';

// ---------- Database ----------
const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS guru (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sesi (
    token TEXT PRIMARY KEY,
    guru_id INTEGER NOT NULL REFERENCES guru(id) ON DELETE CASCADE,
    dibuat TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS siswa (
    nis TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    kelas TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS presensi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nis TEXT NOT NULL REFERENCES siswa(nis) ON DELETE CASCADE,
    tanggal TEXT NOT NULL,
    jam TEXT NOT NULL,
    UNIQUE (nis, tanggal)
  );
  CREATE TABLE IF NOT EXISTS berita (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    judul TEXT NOT NULL,
    isi TEXT NOT NULL,
    tanggal TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pesan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    email TEXT NOT NULL,
    isi TEXT NOT NULL,
    dikirim TEXT NOT NULL
  );
`);

// Akun admin selalu mengikuti .env: hanya ada satu akun, sandinya diperbarui
// bila ADMIN_PASSWORD diganti (sesi lama otomatis tidak berlaku).
{
  db.prepare('DELETE FROM guru WHERE username <> ?').run(ADMIN_USER);
  const ada = db.prepare('SELECT * FROM guru WHERE username = ?').get(ADMIN_USER);
  if (!ada) {
    db.prepare('INSERT INTO guru (username, password_hash) VALUES (?, ?)')
      .run(ADMIN_USER, bcrypt.hashSync(ADMIN_PASSWORD, 10));
    console.log(`Akun admin dibuat: ${ADMIN_USER}`);
  } else if (!bcrypt.compareSync(ADMIN_PASSWORD, ada.password_hash)) {
    db.prepare('UPDATE guru SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(ADMIN_PASSWORD, 10), ada.id);
    db.prepare('DELETE FROM sesi WHERE guru_id = ?').run(ada.id);
    console.log(`Sandi admin ${ADMIN_USER} diperbarui dari .env`);
  }
}

// Data contoh (hanya jika tabel masih kosong)
if (db.prepare('SELECT COUNT(*) AS n FROM siswa').get().n === 0) {
  const ins = db.prepare('INSERT INTO siswa (nis, nama, kelas) VALUES (?, ?, ?)');
  [
    ['1001', 'Ahmad Fauzi', '4A'],
    ['1002', 'Siti Aisyah', '4A'],
    ['1003', 'Muhammad Rizki', '4B'],
    ['1004', 'Nurul Hidayah', '5A'],
    ['1005', 'Dimas Pratama', '5A'],
  ].forEach((s) => ins.run(...s));
  console.log('5 siswa contoh ditambahkan');
}
if (db.prepare('SELECT COUNT(*) AS n FROM berita').get().n === 0) {
  const ins = db.prepare('INSERT INTO berita (judul, isi, tanggal) VALUES (?, ?, ?)');
  ins.run('Absensi QR mulai digunakan',
    'Mulai bulan ini presensi siswa dicatat dengan memindai kartu QR. Kartu QR dapat diminta kepada wali kelas.',
    '2026-11-17');
  ins.run('Peringatan Hari Guru Nasional',
    'Upacara dan kegiatan apresiasi guru dilaksanakan pada 25 November 2026 pukul 07.00 WIB di halaman madrasah.',
    '2026-11-20');
  console.log('2 berita contoh ditambahkan');
}

// ---------- Helper ----------
const pad = (n) => String(n).padStart(2, '0');
function sekarang() {
  const d = new Date();
  return {
    tanggal: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    jam: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
}

// Validasi input: lempar error 400 dengan pesan yang jelas
class GalatValidasi extends Error {}
function teks(nilai, label, min, maks) {
  const v = typeof nilai === 'string' || typeof nilai === 'number' ? String(nilai).trim() : '';
  if (!v) throw new GalatValidasi(`${label} wajib diisi`);
  if (v.length < min) throw new GalatValidasi(`${label} minimal ${min} karakter`);
  if (v.length > maks) throw new GalatValidasi(`${label} maksimal ${maks} karakter`);
  return v;
}
function nisValid(nilai) {
  const v = teks(nilai, 'NIS', 1, 30);
  if (!/^[0-9A-Za-z-]+$/.test(v)) throw new GalatValidasi('NIS hanya boleh berisi huruf, angka, dan tanda -');
  return v;
}
function emailValid(nilai) {
  const v = teks(nilai, 'Email', 1, 150);
  if (!/^[^\s@<>"']+@[^\s@<>"']+\.[A-Za-z]{2,}$/.test(v)) throw new GalatValidasi('Format email tidak valid');
  return v;
}
function tanggalValid(nilai) {
  const v = teks(nilai, 'Tanggal', 10, 10);
  const d = new Date(v + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(d) || d.toISOString().slice(0, 10) !== v) {
    throw new GalatValidasi('Format tanggal harus YYYY-MM-DD');
  }
  return v;
}

// Pembatas sederhana per IP (mencegah tebak sandi & spam form kontak)
function batasi(maks, menit) {
  const catatan = new Map();
  return (req, res, next) => {
    const kini = Date.now();
    const daftar = (catatan.get(req.ip) || []).filter((t) => kini - t < menit * 60000);
    if (daftar.length >= maks) {
      return res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${menit} menit.` });
    }
    daftar.push(kini);
    catatan.set(req.ip, daftar);
    next();
  };
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const sesi = token && db.prepare('SELECT guru_id FROM sesi WHERE token = ?').get(token);
  if (!sesi) return res.status(401).json({ error: 'Silakan login dulu' });
  req.token = token;
  next();
}

// ---------- App ----------
const app = express();
app.disable('x-powered-by');
// Di belakang reverse proxy (Caddy) di VM yang sama: X-Forwarded-For hanya dipercaya jika
// koneksi datang dari loopback (127.0.0.1 / ::1). req.ip = alamat paling kanan yang bukan
// loopback, jadi IP palsu yang dikirim pengunjung tidak bisa dipakai untuk lolos dari batas.
// Koneksi langsung dari luar tetap memakai alamat socket-nya, header-nya diabaikan.
app.set('trust proxy', 'loopback');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
});
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));
// Library frontend (tidak perlu internet/CDN):
// - public/lib/qrcode.min.js = library qrcode yang sudah dibundel untuk browser
// - html5-qrcode dilayani langsung dari node_modules
app.get('/lib/html5-qrcode.min.js', (req, res) =>
  res.sendFile(require.resolve('html5-qrcode/html5-qrcode.min.js')));

// Login & logout
app.post('/api/login', batasi(10, 15), (req, res) => {
  const username = teks(req.body?.username, 'Username', 1, 50);
  const password = teks(req.body?.password, 'Sandi', 1, 200);
  const guru = db.prepare('SELECT * FROM guru WHERE username = ?').get(username);
  if (!guru || !bcrypt.compareSync(password, guru.password_hash)) {
    return res.status(401).json({ error: 'Username atau sandi salah' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sesi (token, guru_id, dibuat) VALUES (?, ?, ?)')
    .run(token, guru.id, new Date().toISOString());
  res.json({ token, username: guru.username });
});

app.post('/api/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sesi WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

// Siswa
app.get('/api/siswa', auth, (req, res) => {
  res.json(db.prepare('SELECT nis, nama, kelas FROM siswa ORDER BY kelas, nama').all());
});

app.post('/api/siswa', auth, (req, res) => {
  const nis = nisValid(req.body?.nis);
  const nama = teks(req.body?.nama, 'Nama', 2, 100);
  const kelas = teks(req.body?.kelas, 'Kelas', 1, 20);
  try {
    db.prepare('INSERT INTO siswa (nis, nama, kelas) VALUES (?, ?, ?)').run(nis, nama, kelas);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(409).json({ error: 'NIS sudah terdaftar' });
    throw e;
  }
  res.status(201).json({ nis, nama, kelas });
});

app.delete('/api/siswa/:nis', auth, (req, res) => {
  const r = db.prepare('DELETE FROM siswa WHERE nis = ?').run(req.params.nis);
  if (r.changes === 0) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  res.json({ ok: true });
});

// Presensi
app.post('/api/presensi', auth, (req, res) => {
  const nis = nisValid(req.body?.nis);
  const siswa = db.prepare('SELECT nis, nama, kelas FROM siswa WHERE nis = ?').get(nis);
  if (!siswa) return res.status(404).json({ error: `NIS ${nis} tidak terdaftar` });

  const { tanggal, jam } = sekarang();
  const r = db.prepare('INSERT OR IGNORE INTO presensi (nis, tanggal, jam) VALUES (?, ?, ?)')
    .run(nis, tanggal, jam);
  if (r.changes === 0) {
    const lama = db.prepare('SELECT jam FROM presensi WHERE nis = ? AND tanggal = ?').get(nis, tanggal);
    return res.status(409).json({ ...siswa, tanggal, jam: lama.jam, status: 'Sudah absen hari ini' });
  }
  res.status(201).json({ ...siswa, tanggal, jam, status: 'Hadir' });
});

app.get('/api/presensi', auth, (req, res) => {
  const tanggal = req.query.tanggal ? tanggalValid(req.query.tanggal) : sekarang().tanggal;
  const data = db.prepare(`
    SELECT s.nis, s.nama, s.kelas, p.jam
    FROM presensi p JOIN siswa s ON s.nis = p.nis
    WHERE p.tanggal = ? ORDER BY p.jam`).all(tanggal);
  res.json({ tanggal, data });
});

// Berita / informasi (publik bisa membaca, guru bisa tambah & hapus)
app.get('/api/berita', (req, res) => {
  res.json(db.prepare('SELECT id, judul, isi, tanggal FROM berita ORDER BY tanggal DESC, id DESC').all());
});

app.post('/api/berita', auth, (req, res) => {
  const judul = teks(req.body?.judul, 'Judul', 3, 150);
  const isi = teks(req.body?.isi, 'Isi', 10, 5000);
  const tanggal = tanggalValid(req.body?.tanggal);
  const r = db.prepare('INSERT INTO berita (judul, isi, tanggal) VALUES (?, ?, ?)').run(judul, isi, tanggal);
  res.status(201).json({ id: r.lastInsertRowid, judul, isi, tanggal });
});

app.delete('/api/berita/:id', auth, (req, res) => {
  const r = db.prepare('DELETE FROM berita WHERE id = ?').run(Number(req.params.id) || 0);
  if (r.changes === 0) return res.status(404).json({ error: 'Berita tidak ditemukan' });
  res.json({ ok: true });
});

// Pesan dari form kontak (publik bisa mengirim, guru bisa membaca)
app.post('/api/pesan', batasi(5, 10), (req, res) => {
  const nama = teks(req.body?.nama, 'Nama', 2, 100);
  const email = emailValid(req.body?.email);
  const isi = teks(req.body?.pesan, 'Pesan', 5, 2000);
  const { tanggal, jam } = sekarang();
  db.prepare('INSERT INTO pesan (nama, email, isi, dikirim) VALUES (?, ?, ?, ?)')
    .run(nama, email, isi, `${tanggal} ${jam}`);
  res.status(201).json({ ok: true });
});

app.get('/api/pesan', auth, (req, res) => {
  res.json(db.prepare('SELECT id, nama, email, isi, dikirim FROM pesan ORDER BY id DESC').all());
});

// API yang tidak ada
app.use('/api', (req, res) => res.status(404).json({ error: 'Alamat API tidak ditemukan' }));

// Penanganan error: pesan validasi -> 400, JSON rusak -> 400, lainnya -> 500
app.use((err, req, res, next) => {
  if (err instanceof GalatValidasi) return res.status(400).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Data yang dikirim tidak valid' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Data terlalu besar' });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan di server' });
});

// ---------- Start (HTTPS jika ada certs/key.pem & certs/cert.pem) ----------
const keyFile = path.join(__dirname, 'certs', 'key.pem');
const certFile = path.join(__dirname, 'certs', 'cert.pem');
const pakaiHttps = fs.existsSync(keyFile) && fs.existsSync(certFile);

const server = pakaiHttps
  ? https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, app)
  : http.createServer(app);

server.listen(PORT, HOST, () => {
  console.log(`Absensi QR berjalan di ${pakaiHttps ? 'https' : 'http'}://${HOST}:${PORT}`);
});
