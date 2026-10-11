Isi : Sistem yang dijalankan di raspberry Pi dengan proses yang berbeda dengan Hardware-control

Tujuan : Sebagai tempat untuk menerima data masuk, mengontrol user (buat/hapus/aktik/nonaktif), dan menampilkan report log

Database bernama ms_acm_site dengan tabel sebagai berikut:
1. Tabel user_system : UID, username, password (hash), created_at
2. Tabel user_machine : UID, username, password (hash), created_at
3. Tabel logs_transaction : UID, username, timestamp, status

Requirement :
1. Halaman login untuk verifikasi user kontrol sistem
2. Halaman utama yang isinya menampilkan angka orang yang berhasil diverifikasi, dan angka orang yang tidak berhasil diverifikasi. Di halaman itu ada navigasi pilihan log attempt, user management, dan user system management
3. Dibuat halaman log attempt yang isinya adalah history transaksi yang didapat dari Hardware-control, dibuat pagination. Lalu buatkan report generator untuk menampilkan
4. Dibuat halaman user management yang ada pilihan untuk menambah dan menghapus user, ketika diklik menambah user maka akan dikirim protokol pendaftaran ke Hardware-control (ikuti proses enroll dengan library AS608 yang ada) dan akan mendapat response dari Hardware-control berupa password (hash) dan kita hanya perlu mengisi form user dengan password ini. ketika hapus user maka akan dikirm protokol untuk menghapus user ke Hardware-control lalu akan menerima response dari hardware control baru dihapus usernya
5. Dibuat halaman user system management yang ada pilihan untuk menambah dan menghapus user, default user adalah admin dan passwordnya adalah admin123. 
