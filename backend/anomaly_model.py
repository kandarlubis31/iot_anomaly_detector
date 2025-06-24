import pandas as pd
import numpy as np
import os
import joblib
import logging
from sklearn.ensemble import IsolationForest

logger = logging.getLogger(__name__)

KNOWN_METRIC_HEADERS = [
    "Temperature", "Humidity", "Air Quality", "Light",
    "Loudness", "Power Consumption"
]

class AnomalyDetector:
    def __init__(self, model_path="models/isolation_forest_model.joblib"):
        self.model_path = model_path
        self.model = None
        self.features_used_by_model = []
        self.isolation_forest = IsolationForest(contamination=0.04, random_state=42, n_estimators=100)

    def train_model(self, df):
        try:
            self.features_used_by_model = [
                col for col in df.columns if col in KNOWN_METRIC_HEADERS
            ]
            
            if not self.features_used_by_model:
                raise ValueError("Tidak ditemukan kolom metrik yang valid untuk training di dalam data.")

            logger.info(f"Training model menggunakan fitur: {self.features_used_by_model}")
            X_train = df[self.features_used_by_model].copy()
            
            for col in X_train.columns:
                X_train[col] = pd.to_numeric(X_train[col], errors='coerce')
            
            X_train.dropna(inplace=True)
            
            if X_train.empty:
                raise ValueError("Dataframe kosong setelah membersihkan nilai non-numerik.")
                
            self.isolation_forest.fit(X_train)
            self.model = self.isolation_forest
            
            model_artifact = {
                'model': self.model,
                'features': self.features_used_by_model
            }
            
            os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
            joblib.dump(model_artifact, self.model_path)
            
            logger.info(f"Model berhasil dilatih dan disimpan di {self.model_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error saat training model: {e}", exc_info=True)
            self.model = None
            return False

    def load_model(self):
        try:
            if not os.path.exists(self.model_path):
                logger.warning(f"File model tidak ditemukan di {self.model_path}")
                return False
                
            model_artifact = joblib.load(self.model_path)
            
            if 'model' in model_artifact and 'features' in model_artifact:
                self.model = model_artifact['model']
                self.features_used_by_model = model_artifact['features']
                logger.info(f"Model berhasil dimuat. Fitur yang digunakan: {self.features_used_by_model}")
                return True
            else:
                logger.error("File model tidak valid atau formatnya salah.")
                return False

        except Exception as e:
            logger.error(f"Error saat memuat model: {e}", exc_info=True)
            self.model = None
            return False

    def predict_anomaly(self, df):
        if self.model is None or not self.features_used_by_model:
            logger.error("Model belum dimuat atau tidak memiliki informasi fitur.")
            return None
            
        try:
            missing_cols = [
                col for col in self.features_used_by_model if col not in df.columns
            ]
            if missing_cols:
                raise ValueError(f"Kolom untuk prediksi tidak cocok dengan model: {missing_cols} tidak ditemukan.")

            df_result = df.copy()
            X_predict = df[self.features_used_by_model].copy()
            
            for col in X_predict.columns:
                X_predict[col] = pd.to_numeric(X_predict[col], errors='coerce')
                
            valid_indices = X_predict.dropna().index
            X_predict_clean = X_predict.loc[valid_indices]
            
            if X_predict_clean.empty:
                logger.warning("Tidak ada data valid untuk diprediksi setelah cleaning.")
                df_result['is_anomaly'] = 0
                df_result['anomaly_score'] = 0.0
                return df_result

            predictions = self.model.predict(X_predict_clean)
            anomaly_scores = self.model.decision_function(X_predict_clean)
            
            df_result['is_anomaly'] = 0
            df_result['anomaly_score'] = 0.0
            
            df_result.loc[valid_indices, 'is_anomaly'] = (predictions == -1).astype(int)
            
            # Normalisasi skor agar lebih intuitif (mendekati 1 = anomali)
            score_normalized = 1 - (anomaly_scores - anomaly_scores.min()) / (anomaly_scores.max() - anomaly_scores.min())
            df_result.loc[valid_indices, 'anomaly_score'] = score_normalized
            
            return df_result
            
        except Exception as e:
            logger.error(f"Error saat prediksi anomali: {e}", exc_info=True)
            return None