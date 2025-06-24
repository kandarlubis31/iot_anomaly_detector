import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os

def generate_iot_data(num_records=2000, anomaly_percentage=0.04):
    np.random.seed(42)
    start_time = datetime(2024, 6, 24, 8, 0, 0)
    time_series = [start_time + timedelta(minutes=i) for i in range(num_records)]

    temperature = np.random.normal(loc=26, scale=1.5, size=num_records)
    humidity = np.random.normal(loc=65, scale=5, size=num_records)
    air_quality = np.random.normal(loc=40, scale=8, size=num_records)
    light = np.random.normal(loc=350, scale=50, size=num_records)
    loudness = np.random.normal(loc=45, scale=3, size=num_records)
    power_consumption = np.random.normal(loc=55, scale=7, size=num_records)
    
    anomaly_score = np.random.uniform(0.0, 0.15, size=num_records)
    is_anomaly = np.zeros(num_records, dtype=int)

    num_anomalies = int(num_records * anomaly_percentage)
    anomaly_indices = np.random.choice(num_records, num_anomalies, replace=False)
    
    metric_generators = {
        "Temperature": lambda: np.random.uniform(35, 42),
        "Humidity": lambda: np.random.uniform(85, 95),
        "Air Quality": lambda: np.random.uniform(150, 200),
        "Light": lambda: np.random.uniform(0, 50),
        "Loudness": lambda: np.random.uniform(80, 100),
        "Power Consumption": lambda: np.random.uniform(100, 150)
    }
    metric_data = {
        "Temperature": temperature,
        "Humidity": humidity,
        "Air Quality": air_quality,
        "Light": light,
        "Loudness": loudness,
        "Power Consumption": power_consumption
    }
    metric_names = list(metric_generators.keys())

    for idx in anomaly_indices:
        is_anomaly[idx] = 1
        anomaly_score[idx] = np.random.uniform(0.85, 1.0)
        
        num_metrics_to_alter = np.random.randint(1, 4)
        chosen_metrics = np.random.choice(metric_names, num_metrics_to_alter, replace=False)
        
        for metric_name in chosen_metrics:
            metric_data[metric_name][idx] = metric_generators[metric_name]()

    df = pd.DataFrame({
        'Time': time_series,
        'Temperature': metric_data['Temperature'],
        'Humidity': metric_data['Humidity'],
        'Air Quality': metric_data['Air Quality'],
        'Light': metric_data['Light'],
        'Loudness': metric_data['Loudness'],
        'Power Consumption': metric_data['Power Consumption'],
        'is_anomaly': is_anomaly,
        'anomaly_score': anomaly_score
    })
    
    for col in df.columns:
        if df[col].dtype == 'float64':
            df[col] = df[col].round(3)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, 'iot_sensor_data_flex.csv')

    df.to_csv(output_path, index=False, sep=';')
    print(f"Data simulasi IoT ({num_records} baris) berhasil dibuat di:\n{output_path}")

if __name__ == "__main__":
    generate_iot_data(num_records=2000, anomaly_percentage=0.04)