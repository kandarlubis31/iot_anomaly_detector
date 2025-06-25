import React, { useEffect, useRef } from 'react';
import * as Chart from "chart.js";

function AnomalyDetail({ anomaly, fullRawData, onBack, primaryMetric, secondaryMetric }) {
  const contextChartRef = useRef(null);

  const formatHeaderToUnit = (header) => {
    if (!header) return "";
    const lowerCaseHeader = header.toLowerCase();
    if (lowerCaseHeader.includes("temperature")) return `${header} (°C)`;
    if (lowerCaseHeader.includes("power")) return `${header} (W)`;
    if (lowerCaseHeader.includes("humidity")) return `${header} (%)`;
    if (lowerCaseHeader.includes("air")) return `${header} (AQI)`;
    if (lowerCaseHeader.includes("light")) return `${header} (Lux)`;
    if (lowerCaseHeader.includes("loudness")) return `${header} (dB)`;
    return header;
  };

  useEffect(() => {
    const canvas = contextChartRef.current;
    if (!canvas || !anomaly || !fullRawData) return;

    const chartInstance = Chart.Chart.getChart(canvas);
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    const anomalyIndex = fullRawData.timestamp.findIndex(ts => new Date(ts).getTime() === anomaly.time.getTime());
    if (anomalyIndex === -1) return;

    const contextRange = 10;
    const startIndex = Math.max(0, anomalyIndex - contextRange);
    const endIndex = Math.min(fullRawData.timestamp.length - 1, anomalyIndex + contextRange);

    const labels = fullRawData.timestamp.slice(startIndex, endIndex + 1);
    const primaryData = fullRawData.metrics[primaryMetric].slice(startIndex, endIndex + 1);
    
    const datasets = [{
      label: formatHeaderToUnit(primaryMetric),
      data: primaryData,
      borderColor: 'var(--color-primary)',
      fill: false,
      pointBackgroundColor: labels.map(l => new Date(l).getTime() === anomaly.time.getTime() ? 'var(--color-danger)' : 'var(--color-primary)'),
      pointRadius: labels.map(l => new Date(l).getTime() === anomaly.time.getTime() ? 8 : 4),
      pointHoverRadius: 10,
    }];
    
    new Chart.Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxRotation: 70, minRotation: 70 } },
          y: { title: { display: true, text: formatHeaderToUnit(primaryMetric) } }
        }
      }
    });
  }, [anomaly, fullRawData, primaryMetric, secondaryMetric]);

  if (!anomaly) return null;

  return (
    <div className="app-container">
      <div className="anomaly-detail-view">
        <div className="card">
          <div className="detail-header">
            <h2 className="card-title">🚨 Detail Anomali</h2>
            <button className="btn btn-secondary" onClick={onBack}>Kembali</button>
          </div>
          <div className="detail-grid">
            <div className="detail-item"><strong>Waktu Kejadian</strong><span>{anomaly.time.toLocaleString()}</span></div>
            <div className="detail-item"><strong>Skor Anomali</strong><span className="anomaly-score">{anomaly.score.toFixed(4)}</span></div>
            <div className="detail-item"><strong>{formatHeaderToUnit(primaryMetric)}</strong><span>{anomaly.primary.toFixed(2)}</span></div>
            <div className="detail-item"><strong>{formatHeaderToUnit(secondaryMetric)}</strong><span>{anomaly.secondary.toFixed(2)}</span></div>
          </div>
        </div>
        <div className="card">
          <h3 className="card-title">📊 Konteks Kejadian</h3>
          <p className="context-desc">Grafik ini menunjukkan {formatHeaderToUnit(primaryMetric)} 10 data point sebelum dan sesudah anomali (titik merah) terjadi.</p>
          <div className="chart-container" style={{height: '350px'}}>
            <canvas ref={contextChartRef}></canvas>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnomalyDetail;