# Absensi QR - MIN 1 Bangka Tengah

Website MIN 1 Bangka Tengah dengan absensi siswa memakai kartu QR. Tugas Cloud Computing.

- **Backend:** Node.js + Express, database SQLite (better-sqlite3), sandi di-hash dengan bcryptjs
- **Frontend:** HTML + JavaScript biasa di folder `public/`. QR dibuat di browser (library `qrcode`) dan dipindai dengan `html5-qrcode`.

## Fitur

**Halaman publik** (tanpa login):

| Halaman | Isi |
|---|---|
| Beranda (`/`) | Sambutan singkat dan tombol ke halaman lain |
| Profil (`/profil.html`) | Profil madrasah, alamat, visi misi, jam belajar |
| Informasi (`/informasi.html`) | Daftar berita/kegiatan dari database. Guru yang sudah login bisa menambah dan menghapus berita di halaman yang sama. |
| Kontak (`/kontak.html`) | Alamat, telepon, email, dan form pesan (nama, email, pesan) |
| Masuk Guru (`/login.html`) | Login guru |

**Halaman guru** (harus login):

| Halaman | Isi |
|---|---|
| Scan (`/scan.html`) | Scan kartu QR dengan kamera, atau ketik NIS manual. Siswa yang sudah absen hari itu tidak tercatat dua kali. |
| Siswa (`/siswa.html`) | Tambah/hapus siswa (NIS, nama, kelas) dan kartu QR tiap siswa. Tekan Ctrl+P untuk mencetak kartu. |
| Rekap (`/rekap.html`) | Tabel presensi (nama, kelas, jam), bisa pilih tanggal |
| Pesan (`/pesan.html`) | Pesan yang dikirim lewat form kontak |

Semua halaman memakai menu yang sama. Di layar HP, menu dilipat ke tombol **☰ Menu**.

Saat database pertama kali dibuat, otomatis ditambahkan 5 siswa contoh (NIS 1001–1005) dan 2 berita contoh.

## Mengedit isi halaman

Isian profil, sambutan, dan kontak ditulis langsung di file HTML dan masih berisi tanda **"-"**. Buka file di bawah ini dengan editor teks, lalu ganti setiap "-" dengan data madrasah. Tidak perlu restart server; cukup muat ulang halaman di browser.

- `public/index.html`: teks sambutan
- `public/profil.html`: profil, alamat, visi misi, jam belajar
- `public/kontak.html`: alamat, telepon, email

## Konfigurasi (`.env`)

Akun guru **tidak** tertulis di kode. Akun diambil dari file `.env`:

```bash
cp .env.example .env     # Windows: copy .env.example .env
```

Lalu buka `.env` dan isi:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `ADMIN_USER` | ya | Username guru |
| `ADMIN_PASSWORD` | ya | Sandi guru, minimal 8 karakter |
| `PORT` | tidak | Port server, default `3000`. Server selalu mendengarkan di `0.0.0.0`. |
| `TZ` | tidak | Zona waktu untuk menentukan "hari ini", default `Asia/Jakarta` |

- Jika `ADMIN_USER` atau `ADMIN_PASSWORD` kosong, server **tidak mau start** dan menampilkan pesan `[GAGAL START] ...`.
- Akun guru selalu mengikuti `.env`. Untuk mengganti sandi, ubah `ADMIN_PASSWORD` lalu restart server. Semua sesi login lama otomatis keluar.
- Variabel yang sudah diset di environment (misalnya lewat `export`) diutamakan dibanding isi `.env`.
- File `.env` berisi rahasia, jadi jangan di-commit (sudah masuk `.gitignore`).

## Keamanan dasar

- **Validasi di server** untuk semua form: wajib diisi, panjang minimal/maksimal, format email, format tanggal, dan karakter NIS. Jika tidak valid, server menjawab `400` dengan pesan yang jelas.
- **Perlindungan XSS:** semua data dari pengguna ditampilkan dengan `textContent`, sehingga HTML/skrip yang diketik pengguna tampil sebagai teks biasa dan tidak dijalankan.
- **Pembatasan percobaan per IP:** login maksimal 10 kali per 15 menit, dan form kontak maksimal 5 pesan per 10 menit. Jika server berada di belakang reverse proxy di mesin yang sama (misalnya Caddy), IP pengunjung asli dibaca dari header `X-Forwarded-For`. Header itu **hanya dipercaya jika koneksi datang dari loopback** (`127.0.0.1`/`::1`), sehingga pengunjung yang mengakses langsung tidak bisa memalsukan IP lewat header.
- Header `X-Content-Type-Options` dan `X-Frame-Options` dipasang, dan sandi disimpan sebagai hash bcrypt.

## Struktur

```
server.js            # server Express + API + database
.env.example         # contoh konfigurasi (salin menjadi .env)
public/              # halaman web + app.js (menu & fungsi bersama) + style.css
public/lib/          # qrcode.min.js (library qrcode 1.5.4 yang sudah dibundel untuk browser)
data.db              # database SQLite (dibuat otomatis)
certs/               # (opsional) key.pem + cert.pem untuk HTTPS
```

**API** (✱ = perlu header `Authorization: Bearer <token>` dari login):

| Method | Alamat | Keterangan |
|---|---|---|
| POST | `/api/login`, `/api/logout`✱ | Masuk / keluar |
| GET, POST✱ | `/api/siswa` | Daftar / tambah siswa (GET juga ✱) |
| DELETE✱ | `/api/siswa/:nis` | Hapus siswa |
| POST✱ | `/api/presensi` | Catat presensi `{nis}` |
| GET✱ | `/api/presensi?tanggal=YYYY-MM-DD` | Rekap |
| GET, POST✱ | `/api/berita` | Daftar berita (publik) / tambah berita |
| DELETE✱ | `/api/berita/:id` | Hapus berita |
| POST, GET✱ | `/api/pesan` | Kirim pesan (publik) / lihat pesan |

## HTTPS

Jika file `certs/key.pem` dan `certs/cert.pem` ada, server otomatis memakai HTTPS. Jika tidak ada, server memakai HTTP.
Kamera di browser HP **hanya bisa dipakai lewat HTTPS** (kecuali di `localhost`). Tanpa HTTPS, input NIS manual tetap bisa dipakai.

Membuat sertifikat self-signed (ganti `<IP>` dengan IP server, yaitu IP VM atau IP laptop di Wi-Fi):

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=absensi-qr" -addext "subjectAltName=IP:<IP>"
```

Di Windows, jalankan perintah ini di **Git Bash** (sudah berisi openssl). Jika muncul error tentang path `/CN=...`, tambahkan `MSYS_NO_PATHCONV=1` di depan `openssl`.

Karena sertifikatnya self-signed, browser akan memberi peringatan. Pilih **Lanjutan / Advanced → Lanjutkan ke situs**, setelah itu kamera bisa dipakai.

---

## 1. Menjalankan di komputer

Butuh **Node.js versi 22 atau lebih baru** (https://nodejs.org).

```bash
cd persensi-qr
npm install
cp .env.example .env      # lalu isi ADMIN_USER dan ADMIN_PASSWORD
npm start
```

Buka http://localhost:3000, klik **Masuk Guru**, lalu login dengan akun dari `.env`.

Kamera laptop bisa langsung dipakai di `localhost`. Untuk mencoba scan dari HP yang tersambung ke Wi-Fi yang sama:
1. Cari IP laptop (`ipconfig` di Windows), misalnya `192.168.1.10`.
2. Buat sertifikat (lihat bagian HTTPS) dengan `subjectAltName=IP:192.168.1.10`.
3. Jalankan ulang `npm start`, lalu buka `https://192.168.1.10:3000` di HP.
4. Jika HP tidak bisa membuka halamannya, izinkan Node.js atau port 3000 di Windows Firewall.

Untuk mengulang dari awal (semua data hilang): hentikan server, hapus `data.db`, `data.db-shm`, dan `data.db-wal`, lalu jalankan lagi.

---

## 2. Deploy di VM Ubuntu

Contoh untuk Ubuntu 22.04/24.04 di cloud (GCP, AWS, Azure, dll). Ganti `<IP-VM>` dengan IP publik VM.

### a. Buka port di firewall

**Di konsol cloud** (Firewall rules / Security Group / Network Security Group): izinkan TCP masuk ke port **22**, **80**, dan **443**.

**Di dalam VM** (jika `ufw` aktif):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### b. Pasang Node.js 22 dan git

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
node -v
```

### c. Salin kode ke VM

Pilih salah satu.

**git clone** (jika kode sudah di-push ke GitHub; `.env`, `data.db`, dan `certs/` tidak ikut ter-push):

```bash
git clone https://github.com/<akun>/<repo>.git ~/absensi-qr
```

**scp** (dari komputer sendiri, di dalam folder proyek; `node_modules` tidak perlu ikut):

```bash
ssh <user>@<IP-VM> "mkdir -p ~/absensi-qr"
scp -r server.js package.json package-lock.json .env.example public <user>@<IP-VM>:~/absensi-qr/
```

### d. Install dependensi dan isi `.env`

```bash
cd ~/absensi-qr
npm ci --omit=dev
cp .env.example .env
nano .env            # isi ADMIN_USER, ADMIN_PASSWORD, dan ubah PORT=443
chmod 600 .env       # hanya pemilik yang bisa membaca
```

Jika `better-sqlite3` gagal terpasang, pasang alat build dulu lalu ulangi: `sudo apt install -y build-essential python3`.

### e. Buat sertifikat HTTPS

```bash
cd ~/absensi-qr
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=absensi-qr" -addext "subjectAltName=IP:<IP-VM>"
```

### f. Jalankan dengan pm2 atau systemd

Port 443 biasanya butuh root. Supaya server tidak perlu dijalankan sebagai root, Node diberi izin khusus memakai port tersebut. Server membaca `.env` sendiri dari folder proyek, jadi `PORT=443` cukup ditulis di `.env`.

**Pilihan A: pm2**

```bash
# izinkan node memakai port 80/443 tanpa root (ulangi setiap kali Node.js di-upgrade)
sudo setcap 'cap_net_bind_service=+ep' "$(readlink -f "$(which node)")"

sudo npm install -g pm2
cd ~/absensi-qr
pm2 start server.js --name absensi-qr
pm2 save
pm2 startup        # salin dan jalankan perintah sudo yang ditampilkan, supaya otomatis jalan saat VM reboot
```

Perintah berguna: `pm2 logs absensi-qr`, `pm2 restart absensi-qr`, `pm2 status`.

**Pilihan B: systemd**

Buat file `/etc/systemd/system/absensi-qr.service` (ganti `<user>` dengan nama user di VM):

```ini
[Unit]
Description=Absensi QR - MIN 1 Bangka Tengah
After=network.target

[Service]
User=<user>
WorkingDirectory=/home/<user>/absensi-qr
ExecStart=/usr/bin/node server.js
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now absensi-qr
sudo systemctl status absensi-qr
journalctl -u absensi-qr -f     # melihat log
```

Jika status menunjukkan server berhenti, lihat log. Pesan `[GAGAL START]` berarti `.env` belum diisi dengan benar.

### g. Akses

Buka **https://\<IP-VM\>** di laptop atau HP, lalu terima peringatan sertifikat. Halaman publik langsung bisa dibuka; guru masuk lewat **Masuk Guru**.

### h. (Alternatif) Di belakang Caddy

Jika HTTPS ditangani Caddy di VM yang sama, jangan buat folder `certs/`. Biarkan `PORT=3000` di `.env`, lalu isi `/etc/caddy/Caddyfile`:

```
https://<IP-VM> {
    tls internal
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

- Tulis `127.0.0.1:3000`, bukan `localhost:3000`, karena `localhost` bisa mengarah ke `::1`, sedangkan server hanya mendengarkan IPv4.
- Jangan buka port 3000 di firewall. Pengunjung cukup lewat Caddy di port 443.
- Server hanya memercayai `X-Forwarded-For` dari proxy lokal. Jika nanti ada proxy atau load balancer lain di depan Caddy, header dari proxy itu tidak dipercaya, dan batas percobaan akan dihitung per alamat proxy, bukan per pengunjung.

### Tanpa HTTPS

Jangan buat folder `certs/`, isi `PORT=80` di `.env`, lalu buka **http://\<IP-VM\>**. Kamera HP tidak akan bisa dipakai, tetapi input NIS manual tetap berfungsi.
