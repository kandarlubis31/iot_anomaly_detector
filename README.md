🔍 Deteksi Anomali Data dan Perilaku IoT
Aplikasi web untuk mendeteksi anomali pada data sensor dan perilaku perangkat IoT menggunakan model machine learning sederhana dan menampilkan hasilnya secara interaktif dengan grafik.

📄 Pendahuluan
Proyek ini menyediakan solusi berbasis web untuk menganalisis data time series dari perangkat IoT (Internet of Things) dan mengidentifikasi pola yang menyimpang atau anomali. Aplikasi ini dirancang untuk pengguna yang ingin mengunggah data CSV mereka dan langsung mendapatkan laporan visual tentang kesehatan atau perilaku aneh dari perangkat IoT mereka.

✨ Fitur
Unggah File CSV: Mudah mengunggah data IoT dalam format CSV melalui antarmuka web.

Deteksi Anomali: Menganalisis data yang diunggah menggunakan model Isolation Forest untuk mengidentifikasi anomali data atau perilaku.

Ringkasan Statistik: Menampilkan jumlah total poin data, jumlah anomali yang terdeteksi, dan persentase anomali.

Visualisasi Interaktif: Menampilkan data sensor (suhu, konsumsi daya) dalam grafik time series menggunakan Chart.js, dengan penandaan jelas untuk anomali.

Analisis Distribusi: Grafik distribusi pengukuran dan skor anomali untuk pemahaman lebih dalam tentang data.

Daftar Anomali Teratas: Menampilkan detail 10 anomali paling signifikan yang terdeteksi.

Mudah Digunakan: Antarmuka pengguna yang sederhana dan intuitif.

🛠️ Teknologi yang Digunakan
Backend:

Python 3.10: Bahasa pemrograman utama.

Flask: Web framework untuk membangun API dan menyajikan halaman web.

scikit-learn: Pustaka machine learning untuk implementasi model Isolation Forest.

Pandas: Untuk manipulasi dan pra-pemrosesan data CSV.

joblib: Untuk menyimpan dan memuat model scikit-learn.

Flask-CORS: Untuk menangani Cross-Origin Resource Sharing antara frontend dan backend.

Frontend:

HTML5: Struktur halaman web.

CSS3: Gaya dan tampilan visual.

JavaScript: Logika interaktivitas, mengunggah file, dan memproses respons API.

Chart.js: Pustaka JavaScript untuk membuat grafik yang interaktif.

chartjs-adapter-date-fns: Adapter untuk Chart.js agar dapat menangani data waktu dengan mudah.

🚀 Persyaratan Sistem
Untuk menjalankan aplikasi ini secara lokal, Anda memerlukan:

Python 3.10: Disarankan versi ini untuk stabilitas.

pip: Manajer paket Python.

Java Runtime Environment (JRE) atau Java Development Kit (JDK): Versi 8 atau 11 sangat direkomendasikan untuk stabilitas tool terkait Hadoop di Windows.

winutils.exe dan hadoop.dll: Diperlukan untuk interaksi filesystem Hadoop/Spark di lingkungan Windows. (Meski kita pakai scikit-learn, winutils terkadang masih membantu stabilitas lingkungan Python di Windows).

Ruang disk yang cukup untuk menyimpan data dan model.

Koneksi internet untuk mengunduh dependensi (saat instalasi).

📦 Instalasi
Ikuti langkah-langkah di bawah ini untuk menyiapkan dan menjalankan proyek di lingkungan lokal Anda.

1. Kloning Repositori (atau Buat Proyek Manual)
Jika Anda belum memiliki folder proyek, buatlah:

mkdir C:\IoTApp
cd C:\IoTApp
mkdir iot_anomaly_detector
cd iot_anomaly_detector

Kemudian, letakkan semua file (app.py, anomaly_model.py, run.bat) dan folder (data/, templates/, models/) ke dalam C:\IoTApp\iot_anomaly_detector.

2. Siapkan winutils.exe (Khusus Windows)
Ini penting untuk mencegah java.lang.UnsatisfiedLinkError yang terkait dengan izin akses file.

Unduh File: Unduh winutils.exe dan hadoop.dll yang sesuai dengan versi Hadoop 3.2.2 atau 3.3.0. Anda bisa mendapatkannya dari repository winutils di GitHub. Pastikan Anda mengunduh kedua file tersebut dari folder /bin di dalam versi Hadoop yang Anda pilih.

Buat Folder: Buat folder C:\hadoop\bin.

Pindahkan File: Pindahkan winutils.exe dan hadoop.dll yang sudah diunduh ke C:\hadoop\bin.

Atur Hak Akses: Klik kanan pada folder C:\hadoop, pilih Properties > Security > Edit... > Add... > ketik nama pengguna Windows Anda (atau Everyone) > berikan izin Full control > OK.

3. Buat dan Aktifkan Virtual Environment
Sangat disarankan untuk menggunakan Python 3.10 untuk stabilitas.

Buka Command Prompt (CMD) atau PowerShell sebagai Administrator.

Navigasi ke folder proyek Anda:

cd C:\IoTApp\iot_anomaly_detector

Buat virtual environment (menggunakan Python 3.10 Anda):

"C:\Users\NAMA_ANDA\AppData\Local\Programs\Python\Python310\python.exe" -m venv venv

(Ganti C:\Users\NAMA_ANDA\AppData\Local\Programs\Python\Python310\python.exe dengan path sebenarnya ke instalasi Python 3.10 Anda).

Aktifkan virtual environment:

.\venv\Scripts\activate

Anda akan melihat (venv) di prompt terminal.

4. Instal Dependensi Python
Dengan virtual environment aktif:

pip install Flask flask-cors pandas scikit-learn joblib

5. Konfigurasi Variabel Lingkungan Sistem
Ini adalah langkah KRUSIAL untuk memastikan semua tool bekerja dengan benar di Windows.

Tekan Windows + R, ketik sysdm.cpl, lalu Enter.

Pergi ke tab Advanced, lalu klik Environment Variables....

Di bagian System variables (bukan User variables), pastikan atau buat variabel berikut:

HADOOP_HOME:

Nama: HADOOP_HOME

Nilai: C:\hadoop (lokasi induk folder bin yang berisi winutils.exe).

JAVA_HOME: (Jika belum ada atau jika Anda memiliki Java versi terbaru)

Nama: JAVA_HOME

Nilai: Path ke folder instalasi JRE/JDK 8 atau 11 Anda (misal: C:\Program Files\Java\jdk1.8.0_xxx).

Tambahkan %JAVA_HOME%\bin ke variabel Path Anda.

Path: Edit variabel Path dan pastikan tidak ada entri lama yang menunjuk ke Python versi lain atau lokasi yang salah. Tambahkan %JAVA_HOME%\bin jika Anda baru mengaturnya.

Klik OK di semua jendela untuk menyimpan perubahan.

RESTART KOMPUTER ANDA! Ini mutlak agar perubahan variabel lingkungan sistem diterapkan.

▶️ Cara Menjalankan Aplikasi
Setelah semua instalasi dan konfigurasi selesai:

Hapus Model Lama (Jika Ada):
Setelah restart komputer, buka File Explorer dan hapus file C:\IoTApp\iot_anomaly_detector\models\isolation_forest_model.joblib. Ini memastikan model dilatih ulang saat aplikasi dimulai.

Buat Ulang Data Simulasi (Opsional, untuk Data Terbaru):

Buka Command Prompt (CMD) atau PowerShell sebagai Administrator.

Navigasi ke folder proyek Anda: cd C:\IoTApp\iot_anomaly_detector

Aktifkan virtual environment: .\venv\Scripts\activate

Jalankan skrip pembuat data: python data\generate_iot_data.py

Jalankan Server Flask:

Pastikan Anda masih di terminal yang sama (dengan (venv) aktif dan sebagai Administrator).

Jalankan aplikasi menggunakan run.bat:

.\run.bat

Anda akan melihat pesan di terminal yang menunjukkan server Flask berjalan (misal: Running on http://0.0.0.0:5000).

🌐 Cara Menggunakan Aplikasi Web
Akses Aplikasi:

Buka browser web Anda dan kunjungi http://localhost:5000/.

Jika Anda mengalami masalah tampilan, coba bersihkan cache browser Anda (Ctrl + Shift + R atau buka di mode Incognito/Private Window).

Unggah File CSV:

Di halaman web, klik tombol "Choose CSV File" (atau "Pilih File").

Pilih file iot_data.csv yang ada di folder data/ proyek Anda.

Deteksi Anomali:

Klik tombol "🚀 Analyze Data".

Lihat Hasil:

Aplikasi akan menampilkan spinner loading.

Setelah analisis selesai, Anda akan melihat ringkasan statistik (Total Data Points, Anomalies Detected, Anomaly Rate), grafik interaktif, dan daftar anomali teratas.

📂 Struktur Proyek
iot_anomaly_detector/
├── app.py                     # Aplikasi utama Flask
├── anomaly_model.py           # Logika deteksi anomali menggunakan scikit-learn
├── run.bat                    # Script untuk menjalankan aplikasi (Windows)
├── data/                      # Folder untuk data input
│   └── iot_data.csv           # Contoh data IoT (hasil generate_iot_data.py)
│   └── generate_iot_data.py   # Skrip untuk membuat data IoT simulasi
├── models/                    # Folder untuk menyimpan model yang sudah dilatih
│   └── isolation_forest_model.joblib # Model IsolationForest yang disimpan
├── templates/                 # Folder untuk file HTML
│   └── index.html             # Antarmuka frontend utama
└── venv/                      # Virtual Environment Python

📈 Pengembangan Lebih Lanjut
Beberapa ide untuk mengembangkan proyek ini:

Fitur Frontend:

Filter dan zoom yang lebih canggih pada grafik.

Visualisasi data yang berbeda (misal, heatmap korelasi).

Notifikasi real-time atau dashboard yang terus diperbarui.

Model:

Tuning parameter IsolationForest untuk performa yang lebih baik.

Mencoba algoritma deteksi anomali lain (misal, One-Class SVM, Local Outlier Factor).

Feature engineering untuk mengekstraksi fitur yang lebih kompleks dari data.

Skalabilitas:

Untuk data skala sangat besar, pertimbangkan kembali Apache Spark/PySpark di lingkungan Linux atau cloud.

Menyimpan data di database sebenarnya (PostgreSQL, MongoDB) alih-alih file CSV sementara.

Deploy ke Cloud: Deploy ke layanan cloud seperti Google Cloud Platform (Google App Engine, Cloud Run), AWS Elastic Beanstalk, atau Azure Web Apps untuk ketersediaan 24/7.