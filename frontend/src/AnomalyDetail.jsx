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

  const getSeverityLevel = (score) => {
    if (score >= 0.8) return { level: 'critical', label: 'Kritis', color: '#dc2626' };
    if (score >= 0.6) return { level: 'high', label: 'Tinggi', color: '#ea580c' };
    if (score >= 0.4) return { level: 'medium', label: 'Sedang', color: '#d97706' };
    return { level: 'low', label: 'Rendah', color: '#65a30d' };
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
    
    const severity = getSeverityLevel(anomaly.score);
    
    const datasets = [{
      label: formatHeaderToUnit(primaryMetric),
      data: primaryData,
      borderColor: '#3b82f6',
      backgroundColor: '#3b82f620',
      fill: false,
      pointBackgroundColor: labels.map(l => new Date(l).getTime() === anomaly.time.getTime() ? severity.color : '#3b82f6'),
      pointBorderColor: labels.map(l => new Date(l).getTime() === anomaly.time.getTime() ? '#ffffff' : '#3b82f6'),
      pointBorderWidth: labels.map(l => new Date(l).getTime() === anomaly.time.getTime() ? 3 : 2),
      pointRadius: labels.map(l => new Date(l).getTime() === anomaly.time.getTime() ? 8 : 4),
      pointHoverRadius: 12,
      tension: 0.1
    }];
    
    new Chart.Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            borderColor: '#374151',
            borderWidth: 1,
            cornerRadius: 8,
            displayColors: false
          }
        },
        scales: {
          x: { 
            ticks: { 
              maxRotation: 45, 
              minRotation: 45,
              color: '#6b7280',
              font: { size: 11 }
            },
            grid: { color: '#f3f4f6' }
          },
          y: { 
            title: { 
              display: true, 
              text: formatHeaderToUnit(primaryMetric),
              color: '#374151',
              font: { size: 12, weight: 'bold' }
            },
            ticks: { color: '#6b7280' },
            grid: { color: '#f3f4f6' }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
  }, [anomaly, fullRawData, primaryMetric, secondaryMetric]);

  if (!anomaly) return null;

  const severity = getSeverityLevel(anomaly.score);

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header Section */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '32px',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#1f2937',
              margin: '0 0 8px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              🚨 Detail Anomali
            </h1>
            <p style={{
              color: '#6b7280',
              margin: 0,
              fontSize: '16px'
            }}>
              Analisis mendalam tentang kejadian anomali yang terdeteksi
            </p>
          </div>
          <button 
            onClick={onBack}
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.4)';
            }}
            onMouseOut={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.3)';
            }}
          >
            ← Kembali
          </button>
        </div>

        {/* Alert Card */}
        <div style={{
          background: `linear-gradient(135deg, ${severity.color}15 0%, ${severity.color}05 100%)`,
          border: `2px solid ${severity.color}30`,
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '24px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: severity.color,
              animation: 'pulse 2s infinite'
            }}></div>
            <h3 style={{
              margin: 0,
              color: severity.color,
              fontSize: '18px',
              fontWeight: '700'
            }}>
              Tingkat Keparahan: {severity.label}
            </h3>
          </div>
          <p style={{
            margin: 0,
            color: '#374151',
            fontSize: '14px',
            lineHeight: '1.6'
          }}>
            Anomali dengan skor <strong>{anomaly.score.toFixed(4)}</strong> terdeteksi pada <strong>{anomaly.time.toLocaleString()}</strong>
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
          {/* Detail Information Card */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
            border: '1px solid #f1f5f9'
          }}>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#1f2937',
              margin: '0 0 20px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              📋 Informasi Detail
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { label: 'Waktu Kejadian', value: anomaly.time.toLocaleString(), icon: '🕒' },
                { label: 'Skor Anomali', value: anomaly.score.toFixed(4), icon: '⚡', highlight: true },
                { label: formatHeaderToUnit(primaryMetric), value: anomaly.primary.toFixed(2), icon: '📊' },
                { label: formatHeaderToUnit(secondaryMetric), value: anomaly.secondary.toFixed(2), icon: '📈' }
              ].map((item, index) => (
                <div key={index} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px',
                  background: item.highlight ? `${severity.color}10` : '#f8fafc',
                  borderRadius: '12px',
                  border: item.highlight ? `1px solid ${severity.color}30` : '1px solid #e2e8f0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{item.icon}</span>
                    <span style={{ 
                      fontWeight: '600', 
                      color: '#374151',
                      fontSize: '14px'
                    }}>
                      {item.label}
                    </span>
                  </div>
                  <span style={{
                    fontWeight: '700',
                    fontSize: '16px',
                    color: item.highlight ? severity.color : '#1f2937'
                  }}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chart Card */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
            border: '1px solid #f1f5f9',
            gridColumn: 'span 2',
            minHeight: '400px'
          }}>
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{
                fontSize: '20px',
                fontWeight: '700',
                color: '#1f2937',
                margin: '0 0 8px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                📊 Konteks Kejadian
              </h3>
              <p style={{
                color: '#6b7280',
                margin: 0,
                fontSize: '14px',
                lineHeight: '1.6'
              }}>
                Grafik menunjukkan {formatHeaderToUnit(primaryMetric)} 10 data point sebelum dan sesudah anomali (titik berwarna) terjadi.
              </p>
            </div>
            
            <div style={{ 
              height: '350px', 
              position: 'relative',
              background: '#fafafa',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <canvas ref={contextChartRef}></canvas>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        @media (max-width: 768px) {
          .grid-container {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

export default AnomalyDetail;