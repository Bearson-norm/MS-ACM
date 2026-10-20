# MS-ACM — Sistem Magnetic Lock Sidik Jari

MS-ACM adalah sistem akses satu sensor AS608 untuk Raspberry Pi 4B. Sidik jari operator diverifikasi oleh `System_process`; akses yang disetujui akan membuka magnetic lock melalui relay dan seluruh percobaan dicatat ke PostgreSQL.

## Arsitektur

```text
AS608 --UART GPIO 14/15--> Hardware-control (Python)
Relay <--GPIO17------------/
                              ^
                              | WebSocket JSON
                              v
Browser <--HTTP + WS--> System_process (Node.js) --> PostgreSQL ms_acm_site
```

Kedua proses berjalan terpisah. `Hardware-control` memiliki thread WebSocket, worker enroll/delete, dan verifikasi `access`. Operasi enroll/delete bersifat eksklusif dan menghentikan verifikasi sementara. Relay dilindungi lock agar pulse tidak tumpang tindih.

## Wiring

| Perangkat | Sambungan default |
|---|---|
| AS608 VCC/GND | 3.3V/GND sesuai spesifikasi modul |
| AS608 TX | GPIO 15 / RX Pi |
| AS608 RX | GPIO 14 / TX Pi |
| Relay IN | GPIO 17 |
| Relay VCC/GND | Sesuai spesifikasi relay, umumnya 5V/GND |

Aktifkan UART tanpa serial login melalui `raspi-config`, lalu pastikan konfigurasi boot memuat `enable_uart=1` dan, bila perlu, `dtoverlay=disable-bt`. User proses harus memiliki izin serial dan GPIO.

## Database dan dashboard

```sql
CREATE DATABASE ms_acm_site;
```

```bash
cd System_process
cp .env.example .env
npm install
npx prisma migrate deploy
npx prisma db seed
npm start
```

Dashboard tersedia di `http://localhost:3000`. Akun awal adalah `admin` / `admin123`. Ganti password akun, `SESSION_SECRET`, dan `HARDWARE_TOKEN` sebelum deployment. Nilai `HARDWARE_TOKEN` harus sama pada kedua proses.

## Service dengan PM2 (Raspberry Pi)

Pasang PM2 global (sekali):

```bash
sudo npm install -g pm2
```

Jalankan dari root repo (`MS-ACM`). Hentikan proses manual (`npm start` / `python src/main.py`) agar tidak bentrok dengan PID file.

Hanya dashboard:

```bash
cd ~/deployment/MS-ACM
pm2 start ecosystem.config.cjs --only ms-acm-system
```

Dashboard + hardware (venv Python harus sudah ada di `Hardware-control/.venv`):

```bash
test -x Hardware-control/.venv/bin/python || (cd Hardware-control && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)
pm2 start ecosystem.config.cjs
```

`ecosystem.config.cjs` memakai path absolut ke `.venv/bin/python` (PM2 tidak menerima `./.venv/...` relatif).

Agar hidup lagi setelah reboot:

```bash
pm2 save
pm2 startup
# jalankan perintah sudo yang dicetak PM2, lalu:
pm2 save
```

Perintah berguna:

```bash
pm2 status
pm2 logs ms-acm-system
pm2 restart ms-acm-system
pm2 stop ms-acm-system
```

## Hardware-control

```bash
cd Hardware-control
cp config.env.example config.env
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python src/main.py
```

Pada Raspberry Pi OS Bookworm, pasang backend GPIO yang sesuai bila belum tersedia, misalnya `rpi-lgpio`.

Konfigurasi penting: `SENSOR_PORT=/dev/serial0`, `SENSOR_BAUD=57600`, `RELAY_PIN=17`, `RELAY_ACTIVE_HIGH=1`, dan `RELAY_DURATION_MS=3000`. Di Pi, pastikan `/dev/serial0` mengarah ke `ttyAMA0` (`enable_uart=1` dan `dtoverlay=disable-bt` atau `miniuart-bt`). Jika scan kadang macet tanpa restart manual, atur `SERIAL_READ_TIMEOUT_S`, `UART_IO_STUCK_S`, dan `UART_ERROR_FLUSH_THRESHOLD` di `Hardware-control/config.env` — hardware-control akan flush/reset UART otomatis.

## Mode simulasi

Set `SIMULATE=1` pada konfigurasi hardware dan `ALLOW_SIMULATE=1` pada `.env` System_process. Setelah login dan enroll operator, scan dapat disimulasikan dengan cookie sesi:

```bash
curl -X POST http://localhost:3000/api/debug/simulate-scan \
  -H "Content-Type: application/json" \
  --cookie "msacm.sid=..." \
  -d '{"fingerprintId":0}'
```

Gunakan `fingerprintId: -1` untuk mensimulasikan sidik jari tidak dikenal.

## Alur operasional

1. Login sebagai admin dan enroll operator pada halaman User Management.
2. Operator meletakkan jari pada AS608; hardware mengirim `verify_request` dengan sensor `access`.
3. Operator aktif memperoleh `granted` dan relay terbuka sesuai durasi konfigurasi. Operator nonaktif/tidak dikenal memperoleh `denied`.
4. Dashboard dan log diperbarui secara real-time. Report dapat diunduh dalam CSV atau PDF.
5. Saat operator dihapus, template sensor dihapus lebih dahulu; database hanya dihapus setelah hardware berhasil.
