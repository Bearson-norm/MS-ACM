Isi : Proses yang mengontrol satu sensor AS608 dan satu relay magnetic lock dari Raspberry Pi 4B.

Requirement :
1. Pada mode standby, tunggu pembacaan AS608 dan minta keputusan akses ke System_process.
2. Buka relay hanya setelah menerima keputusan granted.
3. Terima perintah enroll dan delete secara eksklusif dari System_process.
4. Dukung simulasi sensor dan relay untuk pengembangan tanpa hardware.
