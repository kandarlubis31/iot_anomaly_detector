from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import os
import io
import traceback
import logging
from anomaly_model import AnomalyDetector, KNOWN_METRIC_HEADERS

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

detector = AnomalyDetector()
detector.load_model()

def find_column_by_keyword(df, keyword):
    for col in df.columns:
        if keyword.lower() in col.lower():
            return col
    return None

def prepare_chart_data(df, max_points=2000):
    time_col = find_column_by_keyword(df, 'time')
    anomaly_col = find_column_by_keyword(df, 'is_anomaly')
    score_col = find_column_by_keyword(df, 'anomaly_score')
    
    if not time_col:
        raise ValueError("Kolom 'Time' tidak ditemukan di DataFrame hasil.")
    
    df[time_col] = pd.to_datetime(df[time_col])
    df = df.sort_values(by=time_col)

    if len(df) > max_points:
        anomalies_df = df[df[anomaly_col] == 1] if anomaly_col in df and df[anomaly_col].sum() > 0 else pd.DataFrame()
        normal_df = df[~df.index.isin(anomalies_df.index)]
        
        n_anomalies = len(anomalies_df)
        n_normal_to_sample = max(0, max_points - n_anomalies)
        
        sampled_normal = normal_df.sample(n=n_normal_to_sample, random_state=42) if len(normal_df) > n_normal_to_sample else normal_df
        
        df = pd.concat([anomalies_df, sampled_normal]).sort_values(by=time_col)
        logger.info(f"Data di-sampling menjadi {len(df)} titik untuk dikirim ke chart.")

    metric_cols = [col for col in df.columns if col in KNOWN_METRIC_HEADERS]
    
    response = {
        "timestamp": df[time_col].dt.strftime('%Y-%m-%d %H:%M:%S').tolist(),
        "is_anomaly": df[anomaly_col].astype(int).tolist() if anomaly_col in df else [0] * len(df),
        "anomaly_score": df[score_col].round(4).tolist() if score_col in df else [0.0] * len(df),
        "metrics": {col: df[col].round(3).tolist() for col in metric_cols}
    }
            
    return response

@app.route('/api/upload_csv', methods=['POST'])
def upload_csv():
    try:
        if 'csv_file' not in request.files:
            return jsonify({'error': 'File tidak ter-upload'}), 400
        file = request.files['csv_file']
        
        contamination = request.form.get('contamination', 0.04, type=float)
        
        df = pd.read_csv(file, sep=r'[;,]', engine='python', on_bad_lines='skip')
        logger.info(f"File CSV berhasil dibaca. Kolom: {df.columns.tolist()}")

        logger.info(f"Melatih ulang model dengan data baru dan contamination={contamination}...")
        training_success = detector.train_model(df, contamination=contamination)
        if not training_success:
            return jsonify({'error': 'Gagal melatih model dengan data baru'}), 500
        
        logger.info("Memaksa load ulang model dari file untuk memastikan konsistensi...")
        detector.load_model()
        
        logger.info("Melakukan prediksi anomali...")
        result_df = detector.predict_anomaly(df)

        if result_df is None:
            return jsonify({'error': 'Gagal melakukan prediksi anomali'}), 500

        anomaly_col = find_column_by_keyword(result_df, 'is_anomaly')
        num_anomalies = int(result_df[anomaly_col].sum()) if anomaly_col in result_df else 0
        total_points = len(result_df)
        anomaly_percentage = round((num_anomalies / total_points) * 100, 2) if total_points > 0 else 0

        response_data = {
            'success': True,
            'message': 'Deteksi anomali selesai',
            'total_points': total_points,
            'num_anomalies': num_anomalies,
            'anomaly_percentage': anomaly_percentage,
            'chart_data': prepare_chart_data(result_df)
        }

        logger.info(f"Analisis Selesai: {num_anomalies}/{total_points} anomali terdeteksi.")
        return jsonify(response_data)

    except Exception as e:
        logger.error(f"Error di endpoint upload_csv: {e}", exc_info=True)
        return jsonify({'error': f'Internal Server Error: {str(e)}'}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'model_loaded': detector.model is not None,
        'model_features': detector.features_used_by_model
    })

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)