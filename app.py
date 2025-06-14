from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import pandas as pd
import numpy as np
import os
import io
import traceback
from datetime import datetime, timedelta
from sklearn.ensemble import IsolationForest
import joblib
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Tentukan base directory untuk Vercel. Di Vercel, direktori kerja adalah root proyek.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
DATA_DIR = os.path.join(BASE_DIR, "data")

# Pastikan folder models ada, ini penting untuk Vercel agar bisa menyimpan model
os.makedirs(MODELS_DIR, exist_ok=True)

class AnomalyDetector:
    def __init__(self, model_path="models/isolation_forest_model.joblib"):
        # Pastikan model_path menggunakan BASE_DIR yang benar
        self.model_path = os.path.join(BASE_DIR, model_path)
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

# Inisialisasi Flask app
app = Flask(__name__, template_folder='templates') # Tentukan folder templates secara eksplisit
CORS(app)  # Enable CORS

# Inisialisasi detector
detector = AnomalyDetector()

# Logika untuk melatih atau memuat model saat aplikasi pertama kali diimpor
# Ini akan dijalankan saat serverless function "dingin" (cold start)
# Pastikan data/iot_data.csv diunggah ke Vercel
INITIAL_TRAINING_DATA_PATH = os.path.join(DATA_DIR, "iot_data.csv")
if os.path.exists(detector.model_path):
    logger.info("Mencoba memuat model yang sudah ada...")
    detector.load_model()
else:
    logger.info("Model belum ditemukan, melatih model baru...")
    try:
        if os.path.exists(INITIAL_TRAINING_DATA_PATH):
            initial_df = pd.read_csv(INITIAL_TRAINING_DATA_PATH)
            detector.train_model(initial_df)
        else:
            logger.warning(f"Data pelatihan awal '{INITIAL_TRAINING_DATA_PATH}' tidak ditemukan.")
            logger.info("Membuat data sampel untuk pelatihan awal model.")
            sample_df_for_training = generate_sample_data(1000) # Pastikan ini didefinisikan atau diimpor
            detector.train_model(sample_df_for_training)

    except Exception as e:
        logger.error(f"Gagal melatih model awal: {e}")
        # Jangan keluar dari aplikasi, biarkan tetap berjalan tapi tanpa model
        pass # Biarkan aplikasi tetap berjalan meski model gagal dimuat/dilatih

def generate_sample_data(n_points=1000):
    """Generate sample data jika tidak ada data real"""
    np.random.seed(42)
    start_time = datetime.now() - timedelta(hours=n_points//60)
    timestamps = [start_time + timedelta(minutes=i) for i in range(n_points)]
    temperatures = np.random.normal(25, 3, n_points)
    humidity = np.random.normal(60, 10, n_points)
    pressure = np.random.normal(1013, 20, n_points)
    power_consumption = np.random.normal(100, 15, n_points)
    anomaly_indices = np.random.choice(n_points, size=int(n_points * 0.05), replace=False)
    for idx in anomaly_indices:
        temperatures[idx] += np.random.choice([-1, 1]) * np.random.uniform(10, 20)
        power_consumption[idx] += np.random.choice([-1, 1]) * np.random.uniform(50, 100)
    df = pd.DataFrame({
        'timestamp': timestamps,
        'temperature': temperatures,
        'humidity': humidity,
        'pressure': pressure,
        'power_consumption': power_consumption
    })
    return df

def prepare_chart_data(df, max_chart_points=2000):
    total_points = len(df)
    if total_points <= max_chart_points:
        sampled_df = df
    else:
        anomalies_df = df[df['is_anomaly'] == True]
        normal_df = df[df['is_anomaly'] == False]
        num_anomalies = len(anomalies_df)
        remaining_points_for_normal = max_chart_points - num_anomalies
        if remaining_points_for_normal <= 0:
            sampled_df = anomalies_df
            logger.warning(f"Hanya {num_anomalies} anomali yang dikirim karena melebihi batas {max_chart_points} chart points.")
        else:
            if len(normal_df) > remaining_points_for_normal:
                sampled_normal_df = normal_df.sample(n=remaining_points_for_normal, random_state=42)
            else:
                sampled_normal_df = normal_df
            sampled_df = pd.concat([anomalies_df, sampled_normal_df]).sort_values('timestamp').reset_index(drop=True)
            logger.info(f"Data disampling: {len(sampled_df)} dari {total_points} poin dikirim ({num_anomalies} anomali + {len(sampled_normal_df)} normal).")

    return {
        'timestamps': sampled_df['timestamp'].dt.strftime('%Y-%m-%d %H:%M:%S').tolist(),
        'temperatures': sampled_df['temperature'].round(2).tolist(),
        'power_consumptions': sampled_df['power_consumption'].round(2).tolist(),
        'is_anomaly': sampled_df['is_anomaly'].tolist(),
        'anomaly_scores': sampled_df['anomaly_score'].round(4).tolist()
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload_csv', methods=['POST'])
def upload_csv():
    try:
        if 'csv_file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['csv_file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.lower().endswith('.csv'):
            return jsonify({'error': 'File must be a CSV'}), 400
        
        try:
            file_content = file.read()
            file.seek(0)
            encodings = ['utf-8', 'latin-1', 'cp1252']
            df = None
            for encoding in encodings:
                try:
                    df = pd.read_csv(io.StringIO(file_content.decode(encoding)))
                    logger.info(f"Successfully read CSV with {encoding} encoding")
                    break
                except (UnicodeDecodeError, pd.errors.EmptyDataError):
                    continue
            if df is None:
                return jsonify({'error': 'Could not read CSV file. Please check file encoding.'}), 400
            
        except Exception as e:
            logger.error(f"Error reading CSV: {e}")
            return jsonify({'error': f'Error reading CSV file: {str(e)}'}), 400
        
        logger.info(f"CSV loaded: {len(df)} rows, columns: {df.columns.tolist()}")
        
        required_cols = ['temperature', 'humidity', 'pressure', 'power_consumption']
        missing_cols = [col for col in required_cols if col not in df.columns]
        
        if missing_cols:
            logger.warning(f"Missing required columns: {missing_cols}")
            logger.info("Using sample data for demonstration")
            df = generate_sample_data(len(df) if len(df) > 0 else 1000)
        
        if 'timestamp' not in df.columns:
            start_time = datetime.now() - timedelta(minutes=len(df))
            df['timestamp'] = [start_time + timedelta(minutes=i) for i in range(len(df))]
        else:
            try:
                df['timestamp'] = pd.to_datetime(df['timestamp'])
            except:
                start_time = datetime.now() - timedelta(minutes=len(df))
                df['timestamp'] = [start_time + timedelta(minutes=i) for i in range(len(df))]
        
        logger.info("Training model with uploaded data...")
        # Di serverless, model dilatih ulang jika tidak ada atau 'cold start'.
        # Jika Anda ingin model persisten, Anda perlu menyimpannya di Cloud Storage
        # dan memuatnya dari sana, bukan melatih setiap kali.
        # Untuk kasus sederhana ini, kita asumsikan model dilatih/dimuat sekali per instance fungsi.
        # Karena kita sudah mencoba memuat/melatih di awal file, kita cukup pastikan di sini.
        
        # Jika model belum dilatih atau dimuat karena kegagalan awal, coba latih lagi dengan data yang diupload
        if detector.model is None:
            logger.warning("Model tidak dimuat/dilatih saat startup, mencoba latih dengan data upload.")
            detector.train_model(df) # Coba latih dengan data yang baru diupload
            if detector.model is None: # Jika masih gagal
                 return jsonify({'error': 'Failed to train or load model'}), 500

        logger.info("Predicting anomalies...")
        result_df = detector.predict_anomaly(df)
        
        if result_df is None:
            return jsonify({'error': 'Failed to predict anomalies'}), 500
        
        total_points = len(result_df)
        num_anomalies = int(result_df['is_anomaly'].sum())
        anomaly_percentage = round((num_anomalies / total_points) * 100, 2) if total_points > 0 else 0
        
        response_data = {
            'success': True,
            'message': 'Anomaly detection completed successfully',
            'total_points': total_points,
            'num_anomalies': num_anomalies,
            'anomaly_percentage': anomaly_percentage,
            'chart_data': prepare_chart_data(result_df)
        }
        
        logger.info(f"Analysis complete: {num_anomalies}/{total_points} anomalies detected ({anomaly_percentage}%)")
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"Unexpected error in upload_csv: {e}")
        logger.error(traceback.format_exc())
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'model_loaded': detector.model is not None,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/sample_data', methods=['GET'])
def get_sample_data():
    try:
        n_points = int(request.args.get('points', 1000))
        df = generate_sample_data(n_points)
        
        detector.train_model(df) # Latih model dengan sample data
        result_df = detector.predict_anomaly(df)
        
        if result_df is None:
            return jsonify({'error': 'Failed to generate sample data'}), 500
        
        total_points = len(result_df)
        num_anomalies = int(result_df['is_anomaly'].sum())
        anomaly_percentage = round((num_anomalies / total_points) * 100, 2)
        
        response_data = {
            'success': True,
            'message': 'Sample data generated successfully',
            'total_points': total_points,
            'num_anomalies': num_anomalies,
            'anomaly_percentage': anomaly_percentage,
            'chart_data': prepare_chart_data(result_df)
        }
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"Error generating sample data: {e}")
        return jsonify({'error': f'Error generating sample data: {str(e)}'}), 500

# Objek 'app' harus tersedia di root level untuk Vercel
# Tidak ada lagi if __name__ == '__main__': di sini untuk Vercel
# app.run(debug=True, host='0.0.0.0', port=5000)
