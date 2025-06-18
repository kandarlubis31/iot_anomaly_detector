import pandas as pd
import numpy as np
import os
from sklearn.ensemble import IsolationForest
import joblib
import logging

logger = logging.getLogger(__name__)

class AnomalyDetector:
    def __init__(self, model_path="models/isolation_forest_model.joblib"):
        self.model_path = model_path
        self.model = None
        self.feature_cols = ['temperature', 'humidity', 'pressure', 'power_consumption']
        self.isolation_forest = IsolationForest(contamination=0.03, random_state=42)

    def train_model(self, df):
        try:
            logger.info(f"Training model dengan {len(df)} data points")
            missing_cols = [col for col in self.feature_cols if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Kolom yang diperlukan tidak ditemukan: {missing_cols}")
            X_train = df[self.feature_cols].copy()
            for col in X_train.columns:
                X_train[col] = pd.to_numeric(X_train[col], errors='coerce')
            X_train = X_train.dropna()
            if X_train.empty:
                raise ValueError("DataFrame kosong setelah preprocessing")
            self.isolation_forest.fit(X_train)
            self.model = self.isolation_forest
            joblib.dump(self.model, self.model_path)
            logger.info(f"Model berhasil dilatih dan disimpan di {self.model_path}")
            return True
        except Exception as e:
            logger.error(f"Error training model: {e}")
            self.model = None
            return False

    def load_model(self):
        try:
            if os.path.exists(self.model_path):
                self.model = joblib.load(self.model_path)
                logger.info("Model berhasil dimuat")
                return True
            else:
                logger.warning(f"Model tidak ditemukan di {self.model_path}")
                return False
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            self.model = None
            return False

    def predict_anomaly(self, df):
        if self.model is None:
            logger.error("Model belum dimuat atau dilatih")
            return None
        try:
            missing_cols = [col for col in self.feature_cols if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Kolom yang diperlukan tidak ditemukan: {missing_cols}")
            df_result = df.copy()
            X_predict = df[self.feature_cols].copy()
            for col in X_predict.columns:
                X_predict[col] = pd.to_numeric(X_predict[col], errors='coerce')
            valid_indices = X_predict.dropna().index
            X_predict_clean = X_predict.dropna()
            if X_predict_clean.empty:
                logger.warning("Tidak ada data valid untuk prediksi")
                df_result['is_anomaly'] = False
                df_result['anomaly_score'] = 0.0
                return df_result
            predictions = self.model.predict(X_predict_clean)
            anomaly_scores = self.model.decision_function(X_predict_clean)
            df_result['is_anomaly'] = False
            df_result['anomaly_score'] = 0.0
            df_result.loc[valid_indices, 'is_anomaly'] = (predictions == -1)
            df_result.loc[valid_indices, 'anomaly_score'] = anomaly_scores
            return df_result
        except Exception as e:
            logger.error(f"Error predicting anomaly: {e}")
            return None