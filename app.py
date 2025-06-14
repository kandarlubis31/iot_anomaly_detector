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

class AnomalyDetector:
    def __init__(self, model_path="models/isolation_forest_model.joblib"):
        self.model = None
        self.model_path = model_path
        self.feature_cols = ['temperature', 'humidity', 'pressure', 'power_consumption']
        self.isolation_forest = IsolationForest(contamination=0.03, random_state=42)
        
        # Pastikan folder models ada
        os.makedirs(os.path.dirname(model_path), exist_ok=True)

    def train_model(self, df):
        """Train model dengan dataframe yang sudah ada"""
        try:
            logger.info(f"Training model dengan {len(df)} data points")
            
            # Pastikan semua kolom yang diperlukan ada
            missing_cols = [col for col in self.feature_cols if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Kolom yang diperlukan tidak ditemukan: {missing_cols}")
            
            X_train = df[self.feature_cols].copy()
            
            # Konversi ke numerik dan hapus NaN
            for col in X_train.columns:
                X_train[col] = pd.to_numeric(X_train[col], errors='coerce')
            
            X_train = X_train.dropna()
            
            if X_train.empty:
                raise ValueError("DataFrame kosong setelah preprocessing")
            
            # Train model
            self.isolation_forest.fit(X_train)
            self.model = self.isolation_forest
            
            # Simpan model
            joblib.dump(self.model, self.model_path)
            logger.info(f"Model berhasil dilatih dan disimpan di {self.model_path}")
            
            return True
        except Exception as e:
            logger.error(f"Error training model: {e}")
            self.model = None
            return False

    def load_model(self):
        """Load model dari file"""
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
        """Prediksi anomali pada dataframe"""
        if self.model is None:
            logger.error("Model belum dimuat atau dilatih")
            return None
        
        try:
            # Pastikan semua kolom yang diperlukan ada
            missing_cols = [col for col in self.feature_cols if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Kolom yang diperlukan tidak ditemukan: {missing_cols}")
            
            df_result = df.copy()
            X_predict = df[self.feature_cols].copy()
            
            # Konversi ke numerik
            for col in X_predict.columns:
                X_predict[col] = pd.to_numeric(X_predict[col], errors='coerce')
            
            # Simpan index dari baris yang valid (tidak NaN)
            valid_indices = X_predict.dropna().index
            X_predict_clean = X_predict.dropna()
            
            if X_predict_clean.empty:
                logger.warning("Tidak ada data valid untuk prediksi")
                df_result['is_anomaly'] = False
                df_result['anomaly_score'] = 0.0
                return df_result
            
            # Prediksi
            predictions = self.model.predict(X_predict_clean)
            anomaly_scores = self.model.decision_function(X_predict_clean)
            
            # Inisialisasi kolom hasil
            df_result['is_anomaly'] = False
            df_result['anomaly_score'] = 0.0
            
            # Assign hasil prediksi ke baris yang valid
            df_result.loc[valid_indices, 'is_anomaly'] = (predictions == -1)
            df_result.loc[valid_indices, 'anomaly_score'] = anomaly_scores
            
            return df_result
            
        except Exception as e:
            logger.error(f"Error predicting anomaly: {e}")
            return None

# Inisialisasi Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS untuk frontend

# Inisialisasi detector
detector = AnomalyDetector()

def generate_sample_data(n_points=1000):
    """Generate sample data jika tidak ada data real"""
    np.random.seed(42)
    
    # Generate timestamp
    start_time = datetime.now() - timedelta(hours=n_points//60)
    timestamps = [start_time + timedelta(minutes=i) for i in range(n_points)]
    
    # Generate normal data
    temperatures = np.random.normal(25, 3, n_points)  # 25°C ± 3°C
    humidity = np.random.normal(60, 10, n_points)     # 60% ± 10%
    pressure = np.random.normal(1013, 20, n_points)  # 1013 hPa ± 20 hPa
    power_consumption = np.random.normal(100, 15, n_points)  # 100W ± 15W
    
    # Inject some anomalies
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
    """
    Prepare data untuk frontend charts.
    Melakukan sampling jika jumlah data melebihi max_chart_points,
    tetapi selalu menyertakan semua titik anomali.
    """
    total_points = len(df)
    
    if total_points <= max_chart_points:
        # Jika data kecil, kirim semua
        sampled_df = df
    else:
        # Pisahkan anomali dan normal
        anomalies_df = df[df['is_anomaly'] == True]
        normal_df = df[df['is_anomaly'] == False]
        
        # Hitung berapa banyak titik normal yang bisa diambil
        num_anomalies = len(anomalies_df)
        remaining_points_for_normal = max_chart_points - num_anomalies
        
        if remaining_points_for_normal <= 0:
            # Jika semua slot sudah terisi anomali atau lebih, hanya kirim anomali
            sampled_df = anomalies_df
            logger.warning(f"Hanya {num_anomalies} anomali yang dikirim karena melebihi batas {max_chart_points} chart points.")
        else:
            # Lakukan sampling pada data normal
            if len(normal_df) > remaining_points_for_normal:
                # Ambil sample normal secara acak
                sampled_normal_df = normal_df.sample(n=remaining_points_for_normal, random_state=42)
            else:
                # Jika data normal lebih sedikit dari slot tersisa, ambil semua normal
                sampled_normal_df = normal_df
            
            # Gabungkan kembali anomali dan sample normal, lalu urutkan berdasarkan timestamp
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
    """Serve the main HTML page from the templates folder"""
    return render_template('index.html')

@app.route('/upload_csv', methods=['POST'])
def upload_csv():
    """Handle CSV upload and anomaly detection"""
    try:
        # Check if file is in request
        if 'csv_file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['csv_file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.lower().endswith('.csv'):
            return jsonify({'error': 'File must be a CSV'}), 400
        
        # Read CSV file
        try:
            # Read the uploaded file
            file_content = file.read()
            file.seek(0)  # Reset file pointer
            
            # Try different encodings
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
        
        # Log DataFrame info
        logger.info(f"CSV loaded: {len(df)} rows, columns: {df.columns.tolist()}")
        
        # Check if required columns exist
        required_cols = ['temperature', 'humidity', 'pressure', 'power_consumption']
        missing_cols = [col for col in required_cols if col not in df.columns]
        
        if missing_cols:
            # If missing columns, try to use sample data for demonstration
            logger.warning(f"Missing required columns: {missing_cols}")
            logger.info("Using sample data for demonstration")
            df = generate_sample_data(len(df) if len(df) > 0 else 1000)
        
        # Handle timestamp column
        if 'timestamp' not in df.columns:
            # Generate timestamps if not present
            start_time = datetime.now() - timedelta(minutes=len(df))
            df['timestamp'] = [start_time + timedelta(minutes=i) for i in range(len(df))]
        else:
            # Convert timestamp column to datetime
            try:
                df['timestamp'] = pd.to_datetime(df['timestamp'])
            except:
                # If conversion fails, generate new timestamps
                start_time = datetime.now() - timedelta(minutes=len(df))
                df['timestamp'] = [start_time + timedelta(minutes=i) for i in range(len(df))]
        
        # Train model with current data
        logger.info("Training model with uploaded data...")
        training_success = detector.train_model(df)
        
        if not training_success:
            return jsonify({'error': 'Failed to train anomaly detection model'}), 500
        
        # Predict anomalies
        logger.info("Predicting anomalies...")
        result_df = detector.predict_anomaly(df)
        
        if result_df is None:
            return jsonify({'error': 'Failed to predict anomalies'}), 500
        
        # Calculate statistics
        total_points = len(result_df)
        num_anomalies = int(result_df['is_anomaly'].sum())
        anomaly_percentage = round((num_anomalies / total_points) * 100, 2) if total_points > 0 else 0
        
        # Prepare response data (with potential sampling for chart_data)
        response_data = {
            'success': True,
            'message': 'Anomaly detection completed successfully',
            'total_points': total_points,
            'num_anomalies': num_anomalies,
            'anomaly_percentage': anomaly_percentage,
            'chart_data': prepare_chart_data(result_df) # prepare_chart_data sekarang memiliki sampling
        }
        
        logger.info(f"Analysis complete: {num_anomalies}/{total_points} anomalies detected ({anomaly_percentage}%)")
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"Unexpected error in upload_csv: {e}")
        logger.error(traceback.format_exc())
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': detector.model is not None,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/sample_data', methods=['GET'])
def get_sample_data():
    """Generate and return sample data for testing"""
    try:
        n_points = int(request.args.get('points', 1000))
        df = generate_sample_data(n_points)
        
        # Train model with sample data
        detector.train_model(df)
        
        # Predict anomalies
        result_df = detector.predict_anomaly(df)
        
        if result_df is None:
            return jsonify({'error': 'Failed to generate sample data'}), 500
        
        # Calculate statistics
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

if __name__ == '__main__':
    print("🚀 Starting IoT Anomaly Detection Server...")
    print("📊 Frontend will be available at: http://localhost:5000")
    print("🔍 API endpoints:")
    print("   - POST /upload_csv - Upload CSV for analysis")
    print("   - GET /sample_data - Get sample data for testing")
    print("   - GET /health - Health check")
    print("\n" + "="*50)
    
    # Create models directory if it doesn't exist
    os.makedirs("models", exist_ok=True)
    
    # Start Flask app
    app.run(debug=True, host='0.0.0.0', port=5000)
