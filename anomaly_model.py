import pandas as pd
import numpy as np
import os
from sklearn.ensemble import IsolationForest
import joblib # Untuk menyimpan dan memuat model scikit-learn

class AnomalyDetector:
    def __init__(self, model_path="data/isolation_forest_model.joblib"):
        self.model = None
        self.model_path = model_path
        self.feature_cols = ['temperature', 'humidity', 'pressure', 'power_consumption']
        self.isolation_forest = IsolationForest(contamination=0.03, random_state=42)

    def train_model(self, data_path="data/iot_data.csv"):
        print(f"Memuat data untuk pelatihan dari: {data_path}")
        try:
            df_pd = pd.read_csv(data_path)
            X_train = df_pd[self.feature_cols].copy() # Gunakan .copy() untuk memastikan bekerja pada salinan independen

            for col in X_train.columns:
                X_train.loc[:, col] = pd.to_numeric(X_train[col], errors='coerce') # Gunakan .loc untuk penugasan yang aman
            X_train.dropna(inplace=True)

            if X_train.empty:
                raise ValueError("DataFrame kosong setelah pra-pemrosesan. Tidak ada data untuk pelatihan.")

            print(f"Data pelatihan disiapkan. Jumlah baris: {len(X_train)}")
            self.isolation_forest.fit(X_train)
            self.model = self.isolation_forest
            
            joblib.dump(self.model, self.model_path)
            print(f"Model Isolation Forest berhasil dilatih dan disimpan di {self.model_path}")
        except Exception as e:
            print(f"ERROR: Pelatihan model gagal: {e}")
            self.model = None
            raise

    def load_model(self):
        try:
            self.model = joblib.load(self.model_path)
            print("Model Isolation Forest berhasil dimuat.")
        except FileNotFoundError:
            print(f"Model tidak ditemukan di {self.model_path}. Silakan latih model terlebih dahulu.")
            self.model = None
        except Exception as e:
            print(f"Gagal memuat model: {e}")
            self.model = None

    def predict_anomaly(self, data_pd):
        if self.model is None:
            print("Model belum dimuat atau dilatih.")
            return None

        X_predict = data_pd[self.feature_cols].copy() # Gunakan .copy() untuk memastikan bekerja pada salinan independen

        for col in X_predict.columns:
             X_predict.loc[:, col] = pd.to_numeric(X_predict[col], errors='coerce') # Gunakan .loc untuk penugasan yang aman
        X_predict.dropna(inplace=True)

        if X_predict.empty:
            print("ERROR: Data point kosong setelah pra-pemrosesan untuk prediksi.")
            data_pd['is_anomaly'] = False
            data_pd['anomaly_score'] = 0.0
            return data_pd

        predictions = self.model.predict(X_predict)
        anomaly_scores = self.model.decision_function(X_predict)

        data_pd['is_anomaly'] = (predictions == -1)
        data_pd['anomaly_score'] = anomaly_scores
        
        return data_pd

# Contoh penggunaan
if __name__ == "__main__":
    detector = AnomalyDetector()

    if not os.path.exists("data/iot_data.csv"):
        print("data/iot_data.csv tidak ditemukan. Harap jalankan data/generate_iot_data.py terlebih dahulu.")
    else:
        if os.path.exists(detector.model_path):
            os.remove(detector.model_path)
            print("Model lama dihapus untuk melatih ulang.")

        print("Memulai pelatihan model...")
        try:
            detector.train_model(data_path="data/iot_data.csv")
            print("Pelatihan model berhasil diselesaikan.")
        except Exception as e:
            print(f"Ada masalah fatal saat pelatihan model: {e}")

        if detector.model:
            print("\nMelakukan prediksi anomali pada data pelatihan...")
            df_test_pd = pd.read_csv("data/iot_data.csv")
            results_df = detector.predict_anomaly(df_test_pd)
            
            print("\nBeberapa hasil prediksi teratas:")
            print(results_df.head())
            print(f"\nJumlah anomali terdeteksi: {results_df['is_anomaly'].sum()} dari {len(results_df)}")
            
            anomalies = results_df[results_df['is_anomaly'] == True]
            if not anomalies.empty:
                print("\nContoh baris anomali yang terdeteksi:")
                print(anomalies)
            else:
                print("\nTidak ada anomali terdeteksi pada data pelatihan ini.")
