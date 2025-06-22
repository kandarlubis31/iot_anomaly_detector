import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os

def generate_iot_data(num_records=1000, anomaly_percentage=0.03):
    np.random.seed(42)
    start_time = datetime(2023, 1, 1, 0, 0, 0)
    timestamps = [start_time + timedelta(minutes=i) for i in range(num_records)]

    # Data normal:
    temperature = np.random.normal(loc=25, scale=2, size=num_records).astype(np.float32)
    humidity = np.random.normal(loc=60, scale=5, size=num_records).astype(np.float32)
    pressure = np.random.normal(loc=1000, scale=10, size=num_records).astype(np.float32)
    power_consumption = np.random.normal(loc=50, scale=5, size=num_records).astype(np.float32)

    num_anomalies = int(num_records * anomaly_percentage)
    anomaly_indices = np.random.choice(num_records, num_anomalies, replace=False)

    for idx in anomaly_indices:
        # --- PERBAIKAN DI SINI: Jadikan anomali sedikit kurang ekstrem ---
        # Suhu: Jaraknya tidak terlalu jauh dari normal, tapi cukup untuk dideteksi
        if np.random.rand() < 0.5:
            # Anomali suhu tinggi: misal dari 25 jadi 30-33 (bukan 35-45)
            temperature[idx] = np.random.uniform(low=30, high=33)
        else:
            # Anomali suhu rendah: misal dari 25 jadi 17-20 (bukan 5-15)
            temperature[idx] = np.random.uniform(low=17, high=20)
        
        # Konsumsi Daya: Jaraknya tidak terlalu jauh dari normal, tapi cukup untuk dideteksi
        # Misal dari 50 jadi 70-90 (bukan 100-150)
        power_consumption[idx] = np.random.uniform(low=70, high=90)
        # --- AKHIR PERBAIKAN ---

    df = pd.DataFrame({
        'timestamp': timestamps,
        'temperature': temperature,
        'humidity': humidity,
        'pressure': pressure,
        'power_consumption': power_consumption,
        'is_anomaly': 0
    })
    df.loc[anomaly_indices, 'is_anomaly'] = 1
    df['is_anomaly'] = df['is_anomaly'].astype(np.int32)

    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'iot_data.csv')


    df.to_csv(output_path, index=False)
    print(f"Data IoT simulasi {num_records} baris berhasil dibuat di {output_path}")

if __name__ == "__main__":
    generate_iot_data(num_records=1000, anomaly_percentage=0.03)