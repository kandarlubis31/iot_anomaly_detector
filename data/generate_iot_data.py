import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os

def generate_iot_data(num_records=1000, anomaly_percentage=0.03):
        np.random.seed(42)

        start_time = datetime(2023, 1, 1, 0, 0, 0)
        timestamps = [start_time + timedelta(minutes=i) for i in range(num_records)]

        temperature = np.random.normal(loc=25, scale=2, size=num_records).astype(np.float32)
        humidity = np.random.normal(loc=60, scale=5, size=num_records).astype(np.float32)
        pressure = np.random.normal(loc=1000, scale=10, size=num_records).astype(np.float32)
        power_consumption = np.random.normal(loc=50, scale=5, size=num_records).astype(np.float32)

        num_anomalies = int(num_records * anomaly_percentage)
        anomaly_indices = np.random.choice(num_records, num_anomalies, replace=False)

        for idx in anomaly_indices:
            # PENTING: PASTIKAN TIDAK ADA .astype(np.float32) DI SINI
            if np.random.rand() < 0.5:
                temperature[idx] = np.random.uniform(low=35, high=45)
            else:
                temperature[idx] = np.random.uniform(low=5, high=15)

            # PENTING: PASTIKAN TIDAK ADA .astype(np.float32) DI SINI
            power_consumption[idx] = np.random.uniform(low=100, high=150)

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


        output_path = os.path.join(os.path.dirname(__file__), 'iot_data.csv')
        df.to_csv(output_path, index=False)
        print(f"Data IoT simulasi {num_records} baris berhasil dibuat di {output_path}")

if __name__ == "__main__":
        generate_iot_data(num_records=1000, anomaly_percentage=0.03)
