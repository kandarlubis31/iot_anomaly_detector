from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import os
import io
import traceback
import logging
from anomaly_model import AnomalyDetector

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
    
    if not time_col or not anomaly_col:
        raise ValueError("Kolom 'Time' atau 'is_anomaly' tidak ditemukan di DataFrame hasil.")
    
    df[time_col] = pd.to_datetime(df[time_col])
    df = df.sort_values(by=time_col)

    if len(df) > max_points:
        anomalies = df[df[anomaly_col] == 1]
        normal = df[df[anomaly_col] == 0]
        
        n_anomalies = len(anomalies)
        n_normal_to_sample = max(0, max_points - n_anomalies)
        
        sampled_normal = normal.sample(n=n_normal_to_sample, random_state=42) if len(normal) > n_normal_to_sample else normal
        
        df = pd.concat([anomalies, sampled_normal]).sort_values(by=time_col)
        logger.info(f"Data di-sampling menjadi {len(df)} titik untuk dikirim ke chart.")

    chart_data = {}
    for column in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[column]):
            chart_data[column] = df[column].dt.strftime('%Y-%m-%d %H:%M:%S').tolist()
        elif pd.api.types.is_numeric_dtype(df[column]):
            chart_data[column] = df[column].round(3).tolist()
        else:
            chart_data[column] = df[column].tolist()
            
    return chart_data

@app.route('/api/upload_csv', methods=['POST'])
def upload_csv():
    try:
        if 'csv_file' not in request.files:
            return jsonify({'error': 'File tidak ter-upload'}), 400
        file = request.files['csv_file']
        
        df = pd.read_csv(file, sep=r'[;,]', engine='python')
        logger.info(f"File CSV berhasil dibaca. Kolom: {df.columns.tolist()}")

        if detector.model is None:
            logger.info("Model belum ada. Melakukan training pertama kali dengan data ini.")
            training_success = detector.train_model(df)
            if not training_success:
                return jsonify({'error': 'Gagal melatih model awal'}), 500
        
        logger.info("Melakukan prediksi anomali...")
        result_df = detector.predict_anomaly(df)

        if result_df is None:
            return jsonify({'error': 'Gagal melakukan prediksi anomali'}), 500

        total_points = len(result_df)
        num_anomalies = int(result_df[find_column_by_keyword(result_df, 'is_anomaly')].sum())
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
    app.run(host='0.0.0.0', port=port)