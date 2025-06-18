# 🔍 Deteksi Anomali Data dan Perilaku IoT

Aplikasi web untuk mendeteksi anomali pada data sensor dan perilaku perangkat IoT. Aplikasi ini menampilkan hasil analisis secara interaktif dengan grafik yang mudah dipahami.

---

## 📄 Pendahuluan

Proyek ini menawarkan solusi web untuk menganalisis data time series dari perangkat IoT, lalu mengidentifikasi pola atau perilaku yang menyimpang (anomali).  
Cukup unggah file CSV, dan aplikasi akan memberikan laporan visual tentang kondisi perangkatmu.

---

## ✨ Fitur Unggulan

- **📂 Unggah File CSV:** Mudah mengunggah data IoT dalam format CSV.  
- **🧠 Deteksi Anomali Cerdas:** Menggunakan model *Isolation Forest* untuk menemukan anomali.  
- **📊 Ringkasan Statistik Instan:** Gambaran cepat total data, jumlah anomali, dan persentasenya.  
- **📈 Visualisasi Interaktif:** Grafik time series jelas dengan anomali ditandai khusus.  
- **📌 Analisis Distribusi Data:** Grafik distribusi pengukuran dan skor anomali.  
- **🔥 Daftar Anomali Teratas:** Tampilkan 10 anomali paling signifikan dengan detail lengkap.  
- **👤 Antarmuka Ramah Pengguna:** Desain intuitif dan mudah digunakan.

---

## 🛠️ Teknologi yang Digunakan

**Backend:**
- Python 3.10
- Flask (API Web)
- Flask-CORS
- Pandas
- scikit-learn (Isolation Forest)
- joblib

**Frontend:**
- HTML5
- CSS3
- JavaScript
- Chart.js
- chartjs-adapter-date-fns

---

## 🚀 Persyaratan Sistem

- Python 3.10
- `pip` (Python package manager)
- Java (JRE/JDK 8 atau 11)
- `winutils.exe` dan `hadoop.dll` (untuk Windows)
- Koneksi internet (untuk instalasi awal)

---

## 📦 Instalasi dan Menjalankan Aplikasi

### 1. Persiapan Awal

```bash
mkdir C:\IoTApp
cd C:\IoTApp
mkdir iot_anomaly_detector
cd iot_anomaly_detector
