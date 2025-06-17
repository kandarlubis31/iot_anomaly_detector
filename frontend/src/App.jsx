import React, { useState, useRef, useEffect } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import { Line, Bar, Scatter } from 'react-chartjs-2';
import { enUS } from 'date-fns/locale';
import 'chartjs-adapter-date-fns'; // Import adapter itself

ChartJS.register(...registerables);

// Register date-fns adapter explicitly if needed, though 'chartjs-adapter-date-fns' import should do it
// import { TimeScale } from 'chart.js';
// import { DateFnsAdapter } from 'chartjs-adapter-date-fns';
// TimeScale.register(DateFnsAdapter);

// Objek untuk menyimpan instance Chart.js
// Di React, charts akan di-manage oleh state dan refs
// var charts = {}; // Dihapus, karena React akan menangani instance chart

function App() {
  const [fileSelected, setFileSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [loading, setLoading] = useState(false);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [summaryStats, setSummaryStats] = useState({
    total_points: 0,
    num_anomalies: 0,
    normal_points: 0,
    anomaly_percentage: 0
  });
  const [rawData, setRawData] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [chartType, setChartType] = useState('line');
  const [dataRange, setDataRange] = useState('all');

  // Refs untuk chart instances
  const mainChartRef = useRef(null);
  const distributionChartRef = useRef(null);
  const scoreChartRef = useRef(null);

  // Efek samping untuk mengatur tampilan awal
  useEffect(() => {
    // Sembunyikan hasil dan loading spinner di awal
    setResultsVisible(false);
    setLoading(false);
    // document.getElementById('anomalyList').style.display = 'none'; // Ini akan ditangani oleh render conditional React
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFileSelected(file);
    const display = document.getElementById('fileDisplay');
    if (file) {
      display.innerHTML = `<strong>📄 ${file.name}</strong><br><span style="color: #28a745;">File selected (${(file.size / 1024).toFixed(1)} KB)</span>`;
    } else {
      display.innerHTML = '<strong>📁 Choose CSV File</strong><br><span style="color: #6c757d;">Click here to select your IoT data file</span>';
    }
  };

  const showMessage = (msg, type = 'info') => {
    setMessage(msg);
    setMessageType(type);
    if (type === 'success') {
      setTimeout(() => {
        setMessage('');
      }, 5000);
    }
  };

  const hideMessage = () => {
    setMessage('');
  };

  const showLoading = (show) => {
    setLoading(show);
    document.querySelector('.upload-btn').disabled = show;
  };

  const uploadCsv = async () => {
    hideMessage();
    if (!fileSelected) {
      showMessage("Harap pilih file CSV terlebih dahulu.", 'error');
      return;
    }

    const formData = new FormData();
    formData.append('csv_file', fileSelected);

    showLoading(true);
    setResultsVisible(false); // Sembunyikan hasil sebelumnya

    try {
      // Panggil API backend Flask Anda
      // Gunakan URL relatif atau URL absolut jika backend di-deploy terpisah
      // Contoh: http://localhost:5000/api/upload_csv untuk lokal, atau /api/upload_csv untuk Vercel
      const response = await fetch('/api/upload_csv', { 
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (response.ok) {
        showMessage("Deteksi anomali berhasil!", 'success');
        setRawData(result.chart_data);
        updateSummaryStats(result);
        setProcessedData(filterDataByRange(result.chart_data, dataRange)); // Set processed data based on default range
        setResultsVisible(true);
      } else {
        showMessage(`Error: ${result.error || response.statusText}`, 'error');
        console.error('Backend Error:', result.error || response.statusText);
      }
    } catch (error) {
      showMessage("Terjadi kesalahan saat berkomunikasi dengan server. Pastikan server Flask berjalan.", 'error');
      console.error('Fetch Error:', error);
    } finally {
      showLoading(false);
    }
  };

  const updateSummaryStats = (result) => {
    const total = result.total_points;
    const anomalies = result.num_anomalies;
    const normal = total - anomalies;
    const percentage = result.anomaly_percentage;

    setSummaryStats({
      total_points: total,
      num_anomalies: anomalies,
      normal_points: normal,
      anomaly_percentage: percentage
    });
  };

  const updateChartOptions = () => {
    if (rawData) {
      const filteredData = filterDataByRange(rawData, dataRange);
      setProcessedData(filteredData);
    }
  };

  useEffect(() => {
    if (processedData) {
      createMainChart(processedData);
      createDistributionChart(processedData);
      createScoreChart(processedData);
      createAnomalyList(processedData);
    }
  }, [processedData, chartType, dataRange]); // Dependensi untuk merender ulang chart

  const createMainChart = (data) => {
    const ctx = mainChartRef.current.getContext('2d');

    const datasets = [];
    const timestampsParsed = data.timestamps.map(ts => new Date(ts));

    const normalDataPoints = timestampsParsed.map((timestamp, index) => ({
      x: timestamp,
      y: data.temperatures[index],
      y2: data.power_consumptions[index]
    })).filter((_, index) => !data.is_anomaly[index]);

    const anomalyDataPoints = timestampsParsed.map((timestamp, index) => ({
      x: timestamp,
      y: data.temperatures[index],
      y2: data.power_consumptions[index],
      score: data.anomaly_scores[index]
    })).filter((_, index) => data.is_anomaly[index]);

    if (chartType === 'line' || chartType === 'both') {
      datasets.push({
        label: 'Suhu (Normal)',
        data: normalDataPoints.map(d => ({ x: d.x, y: d.y })),
        borderColor: 'rgba(75, 192, 192, 1)',
        backgroundColor: 'rgba(75, 192, 192, 0.1)',
        borderWidth: 2,
        fill: false,
        tension: 0.1,
        pointRadius: 2,
        type: 'line'
      });

      datasets.push({
        label: 'Daya (Normal)',
        data: normalDataPoints.map(d => ({ x: d.x, y: d.y2 })),
        borderColor: 'rgba(153, 102, 255, 1)',
        backgroundColor: 'rgba(153, 102, 255, 0.1)',
        borderWidth: 2,
        fill: false,
        tension: 0.1,
        pointRadius: 2,
        yAxisID: 'y1',
        type: 'line'
      });
    }

    if (chartType === 'scatter' || chartType === 'both') {
      datasets.push({
        label: 'Suhu (Anomali)',
        data: anomalyDataPoints.map(d => ({ x: d.x, y: d.y, score: d.score })),
        borderColor: 'rgba(255, 99, 132, 1)',
        backgroundColor: 'rgba(255, 99, 132, 0.8)',
        borderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        showLine: false,
        type: 'scatter'
      });

      datasets.push({
        label: 'Daya (Anomali)',
        data: anomalyDataPoints.map(d => ({ x: d.x, y: d.y2, score: d.score })),
        borderColor: 'rgba(255, 159, 64, 1)',
        backgroundColor: 'rgba(255, 159, 64, 0.8)',
        borderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        showLine: false,
        type: 'scatter',
        yAxisID: 'y1'
      });
    }

    if (mainChartRef.current && mainChartRef.current.chartInstance) {
      mainChartRef.current.chartInstance.destroy(); // Destroy previous instance if it exists
    }

    mainChartRef.current.chartInstance = new ChartJS(ctx, { // Create new instance and store it
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            position: 'top',
          },
          tooltip: {
            callbacks: {
              title: function(context) {
                return ChartJS.adapters.date.toDate(context[0].parsed.x).toLocaleString();
              },
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  label += context.parsed.y.toFixed(2);
                }
                if (context.dataset.label.includes('Anomali') && context.raw.score !== undefined) {
                  label += ` (Skor: ${context.raw.score.toFixed(3)})`;
                }
                return label;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'minute',
              displayFormats: {
                minute: 'MMM d, HH:mm'
              }
            },
            title: {
              display: true,
              text: 'Waktu'
            }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Suhu (°C)'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            grid: {
              drawOnChartArea: false
            },
            title: {
              display: true,
              text: 'Konsumsi Daya (W)'
            }
          }
        }
      }
    });
  };

  const createDistributionChart = (data) => {
    const ctx = distributionChartRef.current.getContext('2d');
    if (distributionChartRef.current && distributionChartRef.current.chartInstance) {
        distributionChartRef.current.chartInstance.destroy();
    }
    const allMeasurements = data.temperatures.concat(data.power_consumptions);
    const bins = createHistogram(allMeasurements, 30);

    distributionChartRef.current.chartInstance = new ChartJS(ctx, {
      type: 'bar',
      data: {
        labels: bins.labels,
        datasets: [{
          label: 'Distribusi Suhu & Daya',
          data: bins.counts,
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: {
          x: { title: { display: true, text: 'Nilai Pengukuran' } },
          y: { title: { display: true, text: 'Frekuensi' }, beginAtZero: true }
        }
      }
    });
  };

  const createScoreChart = (data) => {
    const ctx = scoreChartRef.current.getContext('2d');
    if (scoreChartRef.current && scoreChartRef.current.chartInstance) {
        scoreChartRef.current.chartInstance.destroy();
    }
    const scoreBins = createHistogram(data.anomaly_scores, 15);

    scoreChartRef.current.chartInstance = new ChartJS(ctx, {
      type: 'bar',
      data: {
        labels: scoreBins.labels,
        datasets: [{
          label: 'Distribusi Skor Anomali',
          data: scoreBins.counts,
          backgroundColor: 'rgba(255, 159, 64, 0.6)',
          borderColor: 'rgba(255, 159, 64, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: {
          x: { title: { display: true, text: 'Skor Anomali' } },
          y: { title: { display: true, text: 'Frekuensi' }, beginAtZero: true }
        }
      }
    });
  };

  const createHistogram = (data, bins) => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binSize = (max === min) ? 1 : (max - min) / bins;
    
    const counts = new Array(bins).fill(0);
    const labels = [];
    
    for (let i = 0; i < bins; i++) {
        labels.push((min + i * binSize).toFixed(1));
    }
    
    data.forEach(value => {
        const binIndex = Math.min(Math.floor((value - min) / binSize), bins - 1);
        counts[binIndex]++;
    });
    
    return { labels, counts };
  };

  const filterDataByRange = (data, range) => {
    let filteredTimestamps = [];
    let filteredTemperatures = [];
    let filteredPowerConsumptions = [];
    let filteredIsAnomaly = [];
    let filteredAnomalyScores = [];

    let startIndex = 0;
    if (range === 'last100') {
      startIndex = Math.max(0, data.timestamps.length - 100);
    } else if (range === 'last50') {
      startIndex = Math.max(0, data.timestamps.length - 50);
    }

    for (let i = startIndex; i < data.timestamps.length; i++) {
      const isAnomaly = data.is_anomaly[i];
      if (range === 'anomalies' && !isAnomaly) {
        continue;
      }
      filteredTimestamps.push(data.timestamps[i]);
      filteredTemperatures.push(data.temperatures[i]);
      filteredPowerConsumptions.push(data.power_consumptions[i]);
      filteredIsAnomaly.push(isAnomaly);
      filteredAnomalyScores.push(data.anomaly_scores[i]);
    }
    
    return {
      timestamps: filteredTimestamps,
      temperatures: filteredTemperatures,
      power_consumptions: filteredPowerConsumptions,
      is_anomaly: filteredIsAnomaly,
      anomaly_scores: filteredAnomalyScores
    };
  };

  const createAnomalyList = (data) => {
    const container = document.getElementById('anomaliesContainer');
    if (!container) return; // Tambahkan cek null
    container.innerHTML = '';
    
    const anomalies = data.timestamps
      .map((timestamp, index) => ({
        timestamp: timestamp,
        temperature: data.temperatures[index],
        power: data.power_consumptions[index],
        score: data.anomaly_scores[index],
        isAnomaly: data.is_anomaly[index]
      }))
      .filter(item => item.isAnomaly)
      .sort((a, b) => a.score - b.score)
      .slice(0, 10);

    if (anomalies.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: #28a745; font-weight: bold;">Tidak ada anomali terdeteksi! 🎉</p>';
      document.getElementById('anomalyList').style.display = 'block';
      return;
    }

    anomalies.forEach(anomaly => {
      const item = document.createElement('div');
      item.className = 'anomaly-item';
      item.innerHTML = `
        <div>
          <strong>${new Date(anomaly.timestamp).toLocaleString()}</strong><br>
          <small>Temp: ${anomaly.temperature.toFixed(1)}°C, Power: ${anomaly.power.toFixed(1)}W</small>
        </div>
        <div style="text-align: right;">
          <span style="color: #dc3545; font-weight: bold;">Skor Anomali: ${anomaly.score.toFixed(3)}</span>
        </div>
      `;
      container.appendChild(item);
    });
    document.getElementById('anomalyList').style.display = 'block';
  };

  return (
    <div className="container">
      <div className="header">
        <h1>🔍 IoT Anomaly Detector</h1>
        <p>Advanced anomaly detection for IoT sensor data with interactive visualizations</p>
      </div>

      <div className="main-content">
        {message && (
          <div className={`message-box ${messageType}`} id="messageBox">
            {message}
          </div>
        )}

        <div className="upload-section">
          <div className="file-input-wrapper">
            <input type="file" id="csvFile" accept=".csv" onChange={handleFileChange} />
            <div className="file-input-display" id="fileDisplay">
              <strong>📁 Choose CSV File</strong><br />
              <span style={{ color: '#6c757d' }}>Click here to select your IoT data file</span>
            </div>
          </div>
          <button className="upload-btn" onClick={uploadCsv} disabled={loading}>
            {loading ? 'Analyzing...' : '🚀 Analyze Data'}
          </button>
        </div>

        {loading && (
          <div className="loading-spinner" id="loadingSpinner">
            <div className="spinner"></div>
            <p>Analyzing data... Please wait</p>
          </div>
        )}

        {resultsVisible && processedData && ( // Render results only when data is processed and visible
          <div className="results-section" id="resultsSection">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>{summaryStats.total_points.toLocaleString()}</h3>
                <p>Total Data Points</p>
              </div>
              <div className="stat-card anomaly">
                <h3>{summaryStats.num_anomalies.toLocaleString()}</h3>
                <p>Anomalies Detected</p>
              </div>
              <div className="stat-card normal">
                <h3>{summaryStats.normal_points.toLocaleString()}</h3>
                <p>Normal Points</p>
              </div>
              <div className="stat-card">
                <h3>{summaryStats.anomaly_percentage}%</h3>
                <p>Anomaly Rate</p>
              </div>
            </div>

            <div className="charts-container">
              <div className="chart-card">
                <h3>📊 Time Series Analysis</h3>
                <div className="controls">
                  <div className="control-group">
                    <label htmlFor="chartType">Chart Type:</label>
                    <select id="chartType" value={chartType} onChange={(e) => setChartType(e.target.value)}>
                      <option value="line">Line Chart</option>
                      <option value="scatter">Scatter Plot</option>
                      <option value="both">Combined View</option>
                    </select>
                  </div>
                  <div className="control-group">
                    <label htmlFor="dataRange">Data Range:</label>
                    <select id="dataRange" value={dataRange} onChange={(e) => setDataRange(e.target.value)}>
                      <option value="all">All Data</option>
                      <option value="last100">Last 100 Points</option>
                      <option value="last50">Last 50 Points</option>
                      <option value="anomalies">Anomalies Only</option>
                    </select>
                  </div>
                </div>
                <div className="chart-container large">
                  <canvas id="mainChart" ref={mainChartRef}></canvas>
                </div>
              </div>

              <div className="chart-card">
                <h3>📈 Distribution Analysis</h3>
                <div className="chart-container">
                  <canvas id="distributionChart" ref={distributionChartRef}></canvas>
                </div>
              </div>

              <div className="chart-card">
                <h3>⚡ Anomaly Score Distribution</h3>
                <div className="chart-container">
                  <canvas id="scoreChart" ref={scoreChartRef}></canvas>
                </div>
              </div>
            </div>

            <div className="anomaly-list" id="anomalyList">
                <h4>🚨 Detected Anomalies</h4>
                <div id="anomaliesContainer"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
