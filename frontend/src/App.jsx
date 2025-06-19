// frontend/src/App.js
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Chart as ChartJS, registerables } from "chart.js";
import "chartjs-adapter-date-fns";
import "./App.css";

// Register Chart.js components once
ChartJS.register(...registerables);

// Constants
const API_BASE_URL = process.env.VITE_API_URL || "https://iotanomalydetector-production.up.railway.app";
const MESSAGE_TIMEOUT = 5000;
const ANOMALY_DISPLAY_LIMIT = 50;
const HISTOGRAM_BINS = 30;
const SCORE_BINS = 15;

// Default states
const DEFAULT_SUMMARY_STATS = {
  total_points: 0,
  num_anomalies: 0,
  normal_points: 0,
  anomaly_percentage: 0,
};

const DEFAULT_FILE_DISPLAY = {
  icon: "📁",
  name: "Pilih File CSV",
  details: "Klik untuk memuat data sensor IoT Anda (.csv)",
  color: "var(--text-muted)",
};

function App() {
  // Core states
  const [fileSelected, setFileSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [loading, setLoading] = useState(false);
  const [resultsVisible, setResultsVisible] = useState(false);
  
  // Data states
  const [summaryStats, setSummaryStats] = useState(DEFAULT_SUMMARY_STATS);
  const [rawData, setRawData] = useState(null);
  const [chartType, setChartType] = useState("line");
  const [dataRange, setDataRange] = useState("all");
  const [fileDisplayContent, setFileDisplayContent] = useState(DEFAULT_FILE_DISPLAY);
  
  // UI states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [currentTheme, setCurrentTheme] = useState("default");

  // Refs
  const mainChartRef = useRef(null);
  const distributionChartRef = useRef(null);
  const scoreChartRef = useRef(null);
  const csvFileInputRef = useRef(null);
  const messageTimeoutRef = useRef(null);

  // Memoized processed data
  const processedData = useMemo(() => {
    if (!rawData) return null;
    return filterDataByRange(rawData, dataRange);
  }, [rawData, dataRange]);

  // Utility functions
  const showMessage = useCallback((msg, type = "info") => {
    setMessage(msg);
    setMessageType(type);
    
    // Clear existing timeout
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    
    // Set new timeout
    messageTimeoutRef.current = setTimeout(() => {
      setMessage("");
    }, MESSAGE_TIMEOUT);
  }, []);

  const updateSummaryStats = useCallback((result) => {
    const total = result.total_points;
    const anomalies = result.num_anomalies;
    const normal = total - anomalies;
    const percentage = result.anomaly_percentage;

    setSummaryStats({
      total_points: total,
      num_anomalies: anomalies,
      normal_points: normal,
      anomaly_percentage: percentage,
    });
  }, []);

  const createHistogram = useCallback((data, bins) => {
    if (!data?.length) return { labels: [], counts: [] };
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binSize = max === min ? 1 : (max - min) / bins;

    const counts = new Array(bins).fill(0);
    const labels = Array.from({ length: bins }, (_, i) => {
      const lowerBound = min + i * binSize;
      const upperBound = lowerBound + binSize;
      return `${lowerBound.toFixed(1)}-${upperBound.toFixed(1)}`;
    });

    data.forEach((value) => {
      let binIndex = Math.floor((value - min) / binSize);
      binIndex = Math.max(0, Math.min(bins - 1, binIndex));
      counts[binIndex]++;
    });

    return { labels, counts };
  }, []);

  // Filter data function (not a useCallback as it's called inside useMemo)
  function filterDataByRange(data, range) {
    if (!data?.timestamps?.length) {
      return {
        timestamps: [],
        temperatures: [],
        power_consumptions: [],
        is_anomaly: [],
        anomaly_scores: [],
      };
    }

    let startIndex = 0;
    if (range === "last100") {
      startIndex = Math.max(0, data.timestamps.length - 100);
    } else if (range === "last50") {
      startIndex = Math.max(0, data.timestamps.length - 50);
    }

    const filtered = {
      timestamps: [],
      temperatures: [],
      power_consumptions: [],
      is_anomaly: [],
      anomaly_scores: [],
    };

    for (let i = startIndex; i < data.timestamps.length; i++) {
      const isAnomaly = data.is_anomaly[i];
      if (range === "anomalies" && !isAnomaly) continue;
      
      filtered.timestamps.push(data.timestamps[i]);
      filtered.temperatures.push(data.temperatures[i]);
      filtered.power_consumptions.push(data.power_consumptions[i]);
      filtered.is_anomaly.push(isAnomaly);
      filtered.anomaly_scores.push(data.anomaly_scores[i]);
    }

    return filtered;
  }

  const destroyChart = useCallback((chartRef) => {
    if (chartRef.current?.chart) {
      chartRef.current.chart.destroy();
      chartRef.current.chart = null; // Penting: set to null after destroying
    }
  }, []);

  const createMainChart = useCallback((data) => {
    const canvas = mainChartRef.current;
    if (!canvas || !data?.timestamps?.length) {
        destroyChart(mainChartRef); // Pastikan chart dihancurkan jika data tidak valid
        return;
    }

    destroyChart(mainChartRef);

    const ctx = canvas.getContext("2d");
    const datasets = [];
    const timestampsParsed = data.timestamps.map(ts => new Date(ts));

    // Separate normal and anomaly data points
    const normalPoints = [];
    const anomalyPoints = [];

    timestampsParsed.forEach((timestamp, index) => {
      const point = {
        x: timestamp,
        y: data.temperatures[index],
        y2: data.power_consumptions[index],
        score: data.anomaly_scores[index],
      };

      if (data.is_anomaly[index]) {
        anomalyPoints.push(point);
      } else {
        normalPoints.push(point);
      }
    });

    // Add line datasets
    if (chartType === "line" || chartType === "both") {
      datasets.push(
        {
          label: "Suhu (Normal)",
          data: normalPoints.map(d => ({ x: d.x, y: d.y })),
          borderColor: "var(--color-primary)",
          backgroundColor: "rgba(0, 123, 255, 0.1)",
          borderWidth: 2,
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 3,
          type: "line",
        },
        {
          label: "Daya (Normal)",
          data: normalPoints.map(d => ({ x: d.x, y: d.y2 })),
          borderColor: "var(--color-secondary)",
          backgroundColor: "rgba(40, 167, 69, 0.1)",
          borderWidth: 2,
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 3,
          yAxisID: "y1",
          type: "line",
        }
      );
    }

    // Add scatter datasets
    if (chartType === "scatter" || chartType === "both") {
      datasets.push(
        {
          label: "Suhu (Anomali)",
          data: anomalyPoints.map(d => ({ x: d.x, y: d.y, score: d.score })),
          borderColor: "var(--color-danger)",
          backgroundColor: "rgba(220, 53, 69, 0.6)",
          borderWidth: 2,
          pointRadius: 8,
          pointHoverRadius: 10,
          pointStyle: "triangle",
          showLine: false,
          type: "scatter",
        },
        {
          label: "Daya (Anomali)",
          data: anomalyPoints.map(d => ({ x: d.x, y: d.y2, score: d.score })),
          borderColor: "var(--color-warning)",
          backgroundColor: "rgba(255, 193, 7, 0.6)",
          borderWidth: 2,
          pointRadius: 8,
          pointHoverRadius: 10,
          pointStyle: "star",
          showLine: false,
          type: "scatter",
          yAxisID: "y1",
        }
      );
    }

    canvas.chart = new ChartJS(ctx, {
      type: "line",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 300, // Faster animation
        },
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              color: "var(--text-main)",
              font: { size: 14 },
            },
          },
          tooltip: {
            callbacks: {
              title: (context) => new Date(context[0].parsed.x).toLocaleString(),
              label: (context) => {
                let label = context.dataset.label || "";
                if (label) label += ": ";
                if (context.parsed.y !== null) {
                  label += context.parsed.y.toFixed(2);
                }
                if (context.dataset.label.includes("Anomali") && context.raw.score !== undefined) {
                  label += ` (Skor: ${context.raw.score.toFixed(3)})`;
                }
                return label;
              },
            },
            backgroundColor: "rgba(0,0,0,0.7)",
            titleColor: "var(--text-contrast)",
            bodyColor: "var(--text-contrast)",
          },
        },
        scales: {
          x: {
            type: "time",
            time: {
              unit: "minute",
              displayFormats: { minute: "MMM d, HH:mm" },
            },
            title: {
              display: true,
              text: "Timestamp",
              color: "var(--text-main)",
              font: { size: 16, weight: "bold" },
            },
            ticks: { color: "var(--text-muted)" },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
          y: {
            type: "linear",
            display: true,
            position: "left",
            title: {
              display: true,
              text: "Suhu (°C)",
              color: "var(--text-main)",
              font: { size: 16, weight: "bold" },
            },
            ticks: { color: "var(--text-muted)" },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
          y1: {
            type: "linear",
            display: true,
            position: "right",
            grid: { drawOnChartArea: false, color: "rgba(255,255,255,0.08)" },
            title: {
              display: true,
              text: "Konsumsi Daya (W)",
              color: "var(--text-main)",
              font: { size: 16, weight: "bold" },
            },
            ticks: { color: "var(--text-muted)" },
          },
        },
      },
    });
  }, [chartType, destroyChart]);

  const createDistributionChart = useCallback((data) => {
    const canvas = distributionChartRef.current;
    if (!canvas || !data?.temperatures?.length) {
        destroyChart(distributionChartRef);
        return;
    }

    destroyChart(distributionChartRef);

    const ctx = canvas.getContext("2d");
    const allMeasurements = [...data.temperatures, ...data.power_consumptions];
    const bins = createHistogram(allMeasurements, HISTOGRAM_BINS);

    canvas.chart = new ChartJS(ctx, {
      type: "bar",
      data: {
        labels: bins.labels,
        datasets: [{
          label: "Distribusi Nilai Sensor Gabungan",
          data: bins.counts,
          backgroundColor: "rgba(0, 123, 255, 0.6)",
          borderColor: "rgba(0, 123, 255, 1)",
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          legend: {
            display: true,
            labels: { color: "var(--text-main)" },
          },
          tooltip: {
            backgroundColor: "rgba(0,0,0,0.7)",
            titleColor: "var(--text-contrast)",
            bodyColor: "var(--text-contrast)",
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Rentang Nilai",
              color: "var(--text-main)",
            },
            ticks: { color: "var(--text-muted)" },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
          y: {
            title: {
              display: true,
              text: "Frekuensi",
              color: "var(--text-main)",
            },
            beginAtZero: true,
            ticks: { color: "var(--text-muted)" },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
        },
      },
    });
  }, [createHistogram, destroyChart]);

  const createScoreChart = useCallback((data) => {
    const canvas = scoreChartRef.current;
    if (!canvas || !data?.anomaly_scores?.length) {
        destroyChart(scoreChartRef);
        return;
    }

    destroyChart(scoreChartRef);

    const ctx = canvas.getContext("2d");
    const anomalyScoresOnly = data.anomaly_scores.filter((_, i) => data.is_anomaly[i]);
    const scoreBins = createHistogram(anomalyScoresOnly, SCORE_BINS);

    canvas.chart = new ChartJS(ctx, {
      type: "bar",
      data: {
        labels: scoreBins.labels,
        datasets: [{
          label: "Distribusi Skor Anomali",
          data: scoreBins.counts,
          backgroundColor: "rgba(220, 53, 69, 0.6)",
          borderColor: "rgba(220, 53, 69, 1)",
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          legend: {
            display: true,
            labels: { color: "var(--text-main)" },
          },
          tooltip: {
            backgroundColor: "rgba(0,0,0,0.7)",
            titleColor: "var(--text-contrast)",
            bodyColor: "var(--text-contrast)",
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Rentang Skor Anomali",
              color: "var(--text-main)",
            },
            ticks: { color: "var(--text-muted)" },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
          y: {
            title: {
              display: true,
              text: "Frekuensi Anomali",
              color: "var(--text-main)",
            },
            beginAtZero: true,
            ticks: { color: "var(--text-muted)" },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
        },
      },
    });
  }, [createHistogram, destroyChart]);

  const createAnomalyList = useCallback((data) => {
    const container = document.getElementById("anomaliesContainer");
    if (!container) return;

    container.innerHTML = "";

    if (!data?.timestamps?.length) {
      container.innerHTML = `<p style='color: var(--text-muted); text-align: center; padding: 16px;'>Tidak ada anomali kritis terdeteksi dalam kumpulan data ini.</p>`;
      return;
    }

    const anomalies = [];
    for (let i = 0; i < data.is_anomaly.length; i++) {
      if (data.is_anomaly[i]) {
        anomalies.push({
          timestamp: new Date(data.timestamps[i]),
          temperature: data.temperatures[i],
          power: data.power_consumptions[i],
          score: data.anomaly_scores[i],
        });
      }
    }

    if (anomalies.length === 0) {
      container.innerHTML = `<p style='color: var(--text-muted); text-align: center; padding: 16px;'>Tidak ada anomali kritis terdeteksi dalam kumpulan data ini.</p>`;
      return;
    }

    anomalies.sort((a, b) => b.score - a.score);
    const anomaliesToDisplay = anomalies.slice(0, ANOMALY_DISPLAY_LIMIT);

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();

    anomaliesToDisplay.forEach((anomaly) => {
      const item = document.createElement("div");
      item.className = "anomaly-item";
      item.innerHTML = `
        <div>
          <strong>${anomaly.timestamp.toLocaleString()}</strong><br>
          <small>Suhu: ${anomaly.temperature.toFixed(2)}°C, Daya: ${anomaly.power.toFixed(2)}W</small>
        </div>
        <span class="anomaly-score">Skor: ${anomaly.score.toFixed(3)}</span>
      `;
      fragment.appendChild(item);
    });

    container.appendChild(fragment);

    if (anomalies.length > ANOMALY_DISPLAY_LIMIT) {
      const moreInfo = document.createElement("p");
      moreInfo.style = "text-align: center; margin-top: 16px; color: var(--text-muted); font-size: 0.875rem;";
      moreInfo.textContent = `Menampilkan ${ANOMALY_DISPLAY_LIMIT} dari ${anomalies.length} total anomali.`;
      container.appendChild(moreInfo);
    }
  }, []);

  // Event handlers for UI interaction
  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0];
    setFileSelected(file);

    if (file) {
      setFileDisplayContent({
        icon: "📄",
        name: file.name,
        details: `File dipilih (${(file.size / 1024).toFixed(1)} KB)`,
        color: "var(--color-secondary)",
      });
    } else {
      setFileDisplayContent(DEFAULT_FILE_DISPLAY);
    }
  }, []);

  const handleFileDisplayClick = useCallback(() => {
    csvFileInputRef.current?.click();
  }, []);

  const uploadCsv = useCallback(async () => {
    setMessage(""); // Clear previous messages
    if (!fileSelected) {
      showMessage("Silakan pilih file CSV terlebih dahulu untuk memulai analisis.", "error");
      return;
    }

    const formData = new FormData();
    formData.append("csv_file", fileSelected);

    setLoading(true);
    setResultsVisible(false); // Hide results while uploading new data

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload_csv`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        showMessage("Deteksi anomali berhasil diselesaikan!", "success");
        setRawData(result.chart_data); // Store raw data from API
        updateSummaryStats(result);
        setResultsVisible(true); // Show results section after successful data load
      } else {
        console.error("Backend error:", result);
        showMessage(
          `Analisis gagal: ${result.error || response.statusText}. Harap verifikasi format CSV Anda.`,
          "error"
        );
        setResultsVisible(false); // Ensure results are hidden if there's an error
      }
    } catch (error) {
      console.error("Network error:", error);
      showMessage(
        "Kesalahan jaringan: Tidak dapat terhubung ke server analisis. Silakan periksa koneksi Anda atau coba lagi nanti.",
        "error"
      );
      setResultsVisible(false); // Ensure results are hidden if there's a network error
    } finally {
      setLoading(false);
    }
  }, [fileSelected, showMessage, updateSummaryStats]);

  const clearDataAndReload = useCallback(() => {
    setShowConfirmModal(true);
  }, []);

  const executeReset = useCallback(() => {
    setShowConfirmModal(false);
    
    // Clean up charts
    destroyChart(mainChartRef);
    destroyChart(distributionChartRef);
    destroyChart(scoreChartRef);
    
    // Reset all states
    setFileSelected(null);
    setRawData(null);
    setResultsVisible(false);
    setSummaryStats(DEFAULT_SUMMARY_STATS);
    setFileDisplayContent(DEFAULT_FILE_DISPLAY);
    setMessage("");
    setChartType("line");
    setDataRange("all");
    
    // Clear file input value to allow re-uploading the same file
    if (csvFileInputRef.current) {
      csvFileInputRef.current.value = "";
    }
    
    // Clear message timeout
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
  }, [destroyChart]);

  const toggleTheme = useCallback(() => {
    setCurrentTheme(prev => prev === "default" ? "dark-theme" : "default");
  }, []);

  // --- Effects to render/destroy charts based on data availability and UI changes ---

  // Effect to manage initial visibility of results section (when rawData changes)
  useEffect(() => {
    // If rawData is null (e.g., after reset), hide results.
    // If rawData exists, results visibility is controlled by setResultsVisible(true/false) in uploadCsv
    if (!rawData) {
      setResultsVisible(false);
      setLoading(false); // Ensure loading is off if data is cleared
    }
  }, [rawData]);

  // Main chart rendering effect (depends on processedData and chartType)
  useEffect(() => {
    if (processedData?.timestamps?.length) {
      createMainChart(processedData);
    } else {
      destroyChart(mainChartRef);
    }
  }, [processedData, chartType, createMainChart, destroyChart]);

  // Other charts and anomaly list rendering effect (depends only on processedData)
  useEffect(() => {
    if (processedData?.timestamps?.length) {
      createDistributionChart(processedData);
      createScoreChart(processedData);
      createAnomalyList(processedData);
    } else {
      destroyChart(distributionChartRef);
      destroyChart(scoreChartRef);
      
      // Clear anomaly list display if no data
      const container = document.getElementById("anomaliesContainer");
      if (container) {
        container.innerHTML = `<p style='color: var(--text-muted); text-align: center; padding: 16px;'>Tidak ada anomali kritis terdeteksi dalam kumpulan data ini.</p>`;
      }
    }
  }, [processedData, createDistributionChart, createScoreChart, createAnomalyList, destroyChart]);

  // Cleanup effect: destroys charts and clears timeout when component unmounts
  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
      destroyChart(mainChartRef);
      destroyChart(distributionChartRef);
      destroyChart(scoreChartRef);
    };
  }, [destroyChart]); // destroyChart is a dependency because it's used inside the cleanup function

  return (
    <div className={`app-container ${currentTheme}`}>
      <div className="container">
        <div className="header">
          <div className="header-content">
            <h1>
              <span className="material-icons">data_object</span>
              IoT Anomaly Insights
            </h1>
            <p>Deteksi anomali *real-time* untuk data sensor IoT penting.</p>
          </div>
        </div>

        <div className="main-content">
          {/* Message Box */}
          {message && (
            <div className={`message-box ${messageType}`}>
              {message}
            </div>
          )}

          {/* Upload Section */}
          <div className="card upload-section">
            <h2 className="card-title">
              <span className="material-icons">upload_file</span>
              Masukkan Data
            </h2>
            <div className="file-input-wrapper">
              <input
                type="file"
                id="csvFile"
                accept=".csv"
                onChange={handleFileChange}
                ref={csvFileInputRef}
                style={{ display: 'none' }} // Sembunyikan input file
              />
              <div className="file-input-display" onClick={handleFileDisplayClick}>
                <strong>
                  {fileDisplayContent.icon} {fileDisplayContent.name}
                </strong>
                <br />
                <span style={{ color: fileDisplayContent.color }}>
                  {fileDisplayContent.details}
                </span>
              </div>
            </div>
            <div className="button-group">
              <button
                className="btn btn-primary"
                onClick={uploadCsv}
                disabled={loading}
              >
                <span className="material-icons">analytics</span>
                Analisis Data
              </button>
              <button
                className="btn btn-danger"
                onClick={clearDataAndReload}
                disabled={loading}
              >
                <span className="material-icons">refresh</span>
                Bersihkan & Atur Ulang
              </button>
            </div>
          </div>

          {/* Loading Spinner */}
          {loading && (
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p style={{ color: "var(--text-main)" }}>
                Memproses data... Memulai pemindaian anomali.
              </p>
            </div>
          )}

          {/* Results Section */}
          {resultsVisible && (
            <div className="results-section show">
              <div className="stats-grid">
                <div className="stat-card primary">
                  <h3 id="totalPoints">
                    {summaryStats.total_points.toLocaleString()}
                  </h3>
                  <p>Total Data Poin</p>
                </div>
                <div className="stat-card error">
                  <h3 id="numAnomalies">
                    {summaryStats.num_anomalies.toLocaleString()}
                  </h3>
                  <p>Anomali Terdeteksi</p>
                </div>
                <div className="stat-card success">
                  <h3 id="normalPoints">
                    {summaryStats.normal_points.toLocaleString()}
                  </h3>
                  <p>Poin Normal</p>
                </div>
                <div className="stat-card">
                  <h3 id="anomalyPercentage">
                    {summaryStats.anomaly_percentage}%
                  </h3>
                  <p>Tingkat Anomali</p>
                </div>
              </div>

              <div className="card">
                <h2 className="card-title">
                  <span className="material-icons">timeline</span>
                  Analisis Tren *Real-time*
                </h2>
                <div className="controls">
                  <div className="control-group">
                    <label htmlFor="chartType">Tipe Visualisasi</label>
                    <select
                      id="chartType"
                      value={chartType}
                      onChange={(e) => setChartType(e.target.value)}
                    >
                      <option value="line">Grafik Garis</option>
                      <option value="scatter">Diagram Sebar</option>
                      <option value="both">Tampilan Gabungan</option>
                    </select>
                  </div>
                  <div className="control-group">
                    <label htmlFor="dataRange">Jendela Data</label>
                    <select
                      id="dataRange"
                      value={dataRange}
                      onChange={(e) => setDataRange(e.target.value)}
                    >
                      <option value="all">Semua Data Tersedia</option>
                      <option value="last100">100 Entri Terakhir</option>
                      <option value="last50">50 Entri Terakhir</option>
                      <option value="anomalies">Hanya Anomali</option>
                    </select>
                  </div>
                </div>
                <div className="chart-container large">
                  <canvas ref={mainChartRef}></canvas>
                </div>
              </div>

              <div className="charts-container">
                <div className="card">
                  <h2 className="card-title">
                    <span className="material-icons">bar_chart</span>
                    Metrik Distribusi Data
                  </h2>
                  <div className="chart-container">
                    <canvas ref={distributionChartRef}></canvas>
                  </div>
                </div>

                <div className="card">
                  <h2 className="card-title">
                    <span className="material-icons">bubble_chart</span>
                    Magnitudo Skor Anomali
                  </h2>
                  <div className="chart-container">
                    <canvas ref={scoreChartRef}></canvas>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Content */}
        {resultsVisible && (
          <div className="sidebar-content">
            <div className="card anomaly-list">
              <h2 className="card-title">
                <span className="material-icons">warning</span>
                Peringatan Anomali Kritis
              </h2>
              <div id="anomaliesContainer"></div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Button (Analyze Data) */}
      {!loading && !showConfirmModal && (
        <div className="fab" onClick={uploadCsv}>
          <span className="material-icons">analytics</span>
        </div>
      )}

      {/* Confirmation Modal */}
      <div className={`modal-overlay ${showConfirmModal ? "show" : ""}`}>
        <div className="modal-content">
          <h3 className="modal-title">
            <span className="material-icons">help_outline</span> Konfirmasi Reset
          </h3>
          <p>Apakah Anda yakin ingin menghapus semua data yang dimuat dan mengatur ulang aplikasi?</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>Batal</button>
            <button className="btn btn-danger" onClick={executeReset}>Reset</button>
          </div>
        </div>
      </div>

      {/* Tombol Ganti Tema */}
      {!loading && !showConfirmModal && (
        <div className="fab theme-toggle" onClick={toggleTheme} style={{ bottom: '90px' }}>
          <span className="material-icons">palette</span>
        </div>
      )}
    </div>
  );
}

export default App;