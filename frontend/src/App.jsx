// frontend/src/App.js
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Chart as ChartJS, registerables } from "chart.js";
import "chartjs-adapter-date-fns";
import "./App.css";

ChartJS.register(...registerables);

function App() {
  const [fileSelected, setFileSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [loading, setLoading] = useState(false);

  const [resultsVisible, setResultsVisible] = useState(false);
  const [summaryStats, setSummaryStats] = useState({
    total_points: 0,
    num_anomalies: 0,
    normal_points: 0,
    anomaly_percentage: 0,
  });
  const [rawData, setRawData] = useState(null);
  const [processedData, setProcessedData] = useState(null);

  const [chartType, setChartType] = useState("line");
  const [dataRange, setDataRange] = useState("all");

  const [fileDisplayContent, setFileDisplayContent] = useState({
    icon: "📁",
    name: "Pilih File CSV",
    details: "Klik untuk memuat data sensor IoT Anda (.csv)",
    color: "var(--text-muted)",
  });

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [currentTheme, setCurrentTheme] = useState("default"); // 'default' untuk terang, 'dark-theme' untuk gelap

  const mainChartRef = useRef(null);
  const distributionChartRef = useRef(null);
  const scoreChartRef = useRef(null);
  const csvFileInputRef = useRef(null); // Ref baru untuk input file

  const API_BASE_URL =
    process.env.VITE_API_URL || "https://iotanomalydetector-production.up.railway.app";

  useEffect(() => {
    // Sembunyikan bagian hasil di awal jika belum ada data
    if (!rawData) {
      setResultsVisible(false);
    }
    setLoading(false);
  }, [rawData]); // Ditambahkan rawData sebagai dependency

  const handleFileChange = (e) => {
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
      setFileDisplayContent({
        icon: "📁",
        name: "Pilih File CSV",
        details: "Klik untuk memuat data sensor IoT Anda (.csv)",
        color: "var(--text-muted)",
      });
    }
  };

  const showMessage = (msg, type = "info") => {
    setMessage(msg);
    setMessageType(type);
    // Hapus timeout jika ini menyebabkan masalah tampilan pesan
    setTimeout(() => {
      setMessage("");
    }, 5000);
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
      anomaly_percentage: percentage,
    });
  };

  const createHistogram = useCallback((data, bins) => {
    if (!data || data.length === 0) return { labels: [], counts: [] };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binSize = max === min ? 1 : (max - min) / bins;

    const counts = new Array(bins).fill(0);
    const labels = [];

    for (let i = 0; i < bins; i++) {
      const lowerBound = min + i * binSize;
      const upperBound = lowerBound + binSize;
      labels.push(`${lowerBound.toFixed(1)}-${upperBound.toFixed(1)}`);
    }

    data.forEach((value) => {
      let binIndex = Math.floor((value - min) / binSize);
      if (binIndex >= bins) {
        binIndex = bins - 1;
      }
      if (binIndex < 0) {
        binIndex = 0;
      }
      counts[binIndex]++;
    });

    return { labels, counts };
  }, []);

  const filterDataByRange = useCallback((data, range) => {
    if (!data || !data.timestamps || data.timestamps.length === 0) {
      return {
        timestamps: [],
        temperatures: [],
        power_consumptions: [],
        is_anomaly: [],
        anomaly_scores: [],
      };
    }

    let filteredTimestamps = [];
    let filteredTemperatures = [];
    let filteredPowerConsumptions = [];
    let filteredIsAnomaly = [];
    let filteredAnomalyScores = [];

    let startIndex = 0;
    if (range === "last100") {
      startIndex = Math.max(0, data.timestamps.length - 100);
    } else if (range === "last50") {
      startIndex = Math.max(0, data.timestamps.length - 50);
    }

    for (let i = startIndex; i < data.timestamps.length; i++) {
      const isAnomaly = data.is_anomaly[i];
      if (range === "anomalies" && !isAnomaly) {
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
      anomaly_scores: filteredAnomalyScores,
    };
  }, []);

  const createMainChart = useCallback(
    (data) => {
      const canvas = mainChartRef.current;
      if (!canvas) return;

      if (canvas.chart) {
        canvas.chart.destroy();
      }

      if (!data || !data.timestamps || data.timestamps.length === 0) {
        return;
      }

      const ctx = canvas.getContext("2d");
      const datasets = [];
      const timestampsParsed = data.timestamps.map((ts) => new Date(ts));

      const normalDataPoints = timestampsParsed
        .map((timestamp, index) => ({
          x: timestamp,
          y: data.temperatures[index],
          y2: data.power_consumptions[index],
        }))
        .filter((_, index) => !data.is_anomaly[index]);

      const anomalyDataPoints = timestampsParsed
        .map((timestamp, index) => ({
          x: timestamp,
          y: data.temperatures[index],
          y2: data.power_consumptions[index],
          score: data.anomaly_scores[index],
        }))
        .filter((_, index) => data.is_anomaly[index]);

      if (chartType === "line" || chartType === "both") {
        datasets.push({
          label: "Suhu (Normal)",
          data: normalDataPoints.map((d) => ({ x: d.x, y: d.y })),
          borderColor: "var(--color-primary)",
          backgroundColor: "rgba(0, 123, 255, 0.1)",
          borderWidth: 2,
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 3,
          type: "line",
        });

        datasets.push({
          label: "Daya (Normal)",
          data: normalDataPoints.map((d) => ({ x: d.x, y: d.y2 })),
          borderColor: "var(--color-secondary)",
          backgroundColor: "rgba(40, 167, 69, 0.1)",
          borderWidth: 2,
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 3,
          yAxisID: "y1",
          type: "line",
        });
      }

      if (chartType === "scatter" || chartType === "both") {
        datasets.push({
          label: "Suhu (Anomali)",
          data: anomalyDataPoints.map((d) => ({
            x: d.x,
            y: d.y,
            score: d.score,
          })),
          borderColor: "var(--color-danger)",
          backgroundColor: "rgba(220, 53, 69, 0.6)",
          borderWidth: 2,
          pointRadius: 8,
          pointHoverRadius: 10,
          pointStyle: "triangle",
          rotation: 0,
          showLine: false,
          type: "scatter",
        });

        datasets.push({
          label: "Daya (Anomali)",
          data: anomalyDataPoints.map((d) => ({
            x: d.x,
            y: d.y2,
            score: d.score,
          })),
          borderColor: "var(--color-warning)",
          backgroundColor: "rgba(255, 193, 7, 0.6)",
          borderWidth: 2,
          pointRadius: 8,
          pointHoverRadius: 10,
          pointStyle: "star",
          rotation: 0,
          showLine: false,
          type: "scatter",
          yAxisID: "y1",
        });
      }

      canvas.chart = new ChartJS(ctx, {
        type: "line",
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
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
                title: function (context) {
                  return ChartJS.adapters.date
                    .toDate(context[0].parsed.x)
                    .toLocaleString();
                },
                label: function (context) {
                  let label = context.dataset.label || "";
                  if (label) {
                    label += ": ";
                  }
                  if (context.parsed.y !== null) {
                    label += context.parsed.y.toFixed(2);
                  }
                  if (
                    context.dataset.label.includes("Anomali") &&
                    context.raw.score !== undefined
                  ) {
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
                displayFormats: {
                  minute: "MMM d, HH:mm",
                },
              },
              title: {
                display: true,
                text: "Timestamp",
                color: "var(--text-main)",
                font: { size: 16, weight: "bold" },
              },
              ticks: {
                color: "var(--text-muted)",
              },
              grid: {
                color: "rgba(255,255,255,0.08)",
              },
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
              ticks: {
                color: "var(--text-muted)",
              },
              grid: {
                color: "rgba(255,255,255,0.08)",
              },
            },
            y1: {
              type: "linear",
              display: true,
              position: "right",
              grid: {
                drawOnChartArea: false,
                color: "rgba(255,255,255,0.08)",
              },
              title: {
                display: true,
                text: "Konsumsi Daya (W)",
                color: "var(--text-main)",
                font: { size: 16, weight: "bold" },
              },
              ticks: {
                color: "var(--text-muted)",
              },
            },
          },
        },
      });
    },
    [chartType]
  );

  const createDistributionChart = useCallback(
    (data) => {
      const canvas = distributionChartRef.current;
      if (!canvas) return;
      if (canvas.chart) {
        canvas.chart.destroy();
      }

      if (!data || !data.temperatures || data.temperatures.length === 0) {
        return;
      }

      const ctx = canvas.getContext("2d");
      const allMeasurements = data.temperatures.concat(data.power_consumptions);
      const bins = createHistogram(allMeasurements, 30);

      canvas.chart = new ChartJS(ctx, {
        type: "bar",
        data: {
          labels: bins.labels,
          datasets: [
            {
              label: "Distribusi Nilai Sensor Gabungan",
              data: bins.counts,
              backgroundColor: "rgba(0, 123, 255, 0.6)",
              borderColor: "rgba(0, 123, 255, 1)",
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              labels: {
                color: "var(--text-main)",
              },
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
              ticks: {
                color: "var(--text-muted)",
              },
              grid: {
                color: "rgba(255,255,255,0.08)",
              },
            },
            y: {
              title: {
                display: true,
                text: "Frekuensi",
                color: "var(--text-main)",
              },
              beginAtZero: true,
              ticks: {
                color: "var(--text-muted)",
              },
              grid: {
                color: "rgba(255,255,255,0.08)",
              },
            },
          },
        },
      });
    },
    [createHistogram]
  );

  const createScoreChart = useCallback(
    (data) => {
      const canvas = scoreChartRef.current;
      if (!canvas) return;
      if (canvas.chart) {
        canvas.chart.destroy();
      }

      if (!data || !data.anomaly_scores || data.anomaly_scores.length === 0) {
        return;
      }

      const ctx = canvas.getContext("2d");
      const anomalyScoresOnly = data.anomaly_scores.filter(
        (_, i) => data.is_anomaly[i]
      );
      const scoreBins = createHistogram(anomalyScoresOnly, 15);

      canvas.chart = new ChartJS(ctx, {
        type: "bar",
        data: {
          labels: scoreBins.labels,
          datasets: [
            {
              label: "Distribusi Skor Anomali",
              data: scoreBins.counts,
              backgroundColor: "rgba(220, 53, 69, 0.6)",
              borderColor: "rgba(220, 53, 69, 1)",
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              labels: {
                color: "var(--text-main)",
              },
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
              ticks: {
                color: "var(--text-muted)",
              },
              grid: {
                color: "rgba(255,255,255,0.08)",
              },
            },
            y: {
              title: {
                display: true,
                text: "Frekuensi Anomali",
                color: "var(--text-main)",
              },
              beginAtZero: true,
              ticks: {
                color: "var(--text-muted)",
              },
              grid: {
                color: "rgba(255,255,255,0.08)",
              },
            },
          },
        },
      });
    },
    [createHistogram]
  );

  const createAnomalyList = useCallback((data) => {
    const container = document.getElementById("anomaliesContainer");
    if (!container) return;
    container.innerHTML = "";

    if (!data || !data.timestamps || data.timestamps.length === 0) {
      container.innerHTML = `<p style='color: var(--text-muted); text-align: center; padding: 16px;'>Tidak ada anomali kritis terdeteksi dalam kumpulan data ini.</p>`;
      return;
    }

    const anomalies = [];
    for (let i = 0; i < data.is_anomaly.length; i++) {
      if (data.is_anomaly[i]) {
        anomalies.push({
          timestamp: new Date(data.timestamps[i]),
          temperature: data.temperatures[i],
          power_consumption: data.power_consumptions[i],
          score: data.anomaly_scores[i],
        });
      }
    }

    if (anomalies.length === 0) {
      container.innerHTML = `<p style='color: var(--text-muted); text-align: center; padding: 16px;'>Tidak ada anomali kritis terdeteksi dalam kumpulan data ini.</p>`;
      return;
    }

    anomalies.sort((a, b) => b.score - a.score);

    const displayLimit = 50;
    const anomaliesToDisplay = anomalies.slice(0, displayLimit);

    anomaliesToDisplay.forEach((anomaly) => {
      const item = document.createElement("div");
      item.className = "anomaly-item";
      item.innerHTML = `
        <div>
          <strong>${anomaly.timestamp.toLocaleString()}</strong><br>
          <small>Suhu: ${anomaly.temperature.toFixed(
            2
          )}°C, Daya: ${anomaly.power_consumption.toFixed(2)}W</small>
        </div>
        <span class="anomaly-score">Skor: ${anomaly.score.toFixed(3)}</span>
      `;
      container.appendChild(item);
    });

    if (anomalies.length > displayLimit) {
      const moreInfo = document.createElement("p");
      moreInfo.style =
        "text-align: center; margin-top: 16px; color: var(--text-muted); font-size: 0.875rem;";
      moreInfo.textContent = `Menampilkan ${displayLimit} dari ${anomalies.length} total anomali.`;
      container.appendChild(moreInfo);
    }
  }, []);

  useEffect(() => {
    if (rawData) {
      const filteredData = filterDataByRange(rawData, dataRange);
      setProcessedData(filteredData);
    } else {
      setProcessedData(null);
    }
  }, [rawData, dataRange, filterDataByRange]);

  useEffect(() => {
    if (
      processedData &&
      processedData.timestamps &&
      processedData.timestamps.length > 0
    ) {
      createMainChart(processedData);
      createDistributionChart(processedData);
      createScoreChart(processedData);
      createAnomalyList(processedData);
    } else {
      if (mainChartRef.current && mainChartRef.current.chart)
        mainChartRef.current.chart.destroy();
      if (distributionChartRef.current && distributionChartRef.current.chart)
        distributionChartRef.current.chart.destroy();
      if (scoreChartRef.current && scoreChartRef.current.chart)
        scoreChartRef.current.chart.destroy();
      const container = document.getElementById("anomaliesContainer");
      if (container)
        container.innerHTML = `<p style='color: var(--text-muted); text-align: center; padding: 16px;'>Tidak ada anomali kritis terdeteksi dalam kumpulan data ini.</p>`;
    }
  }, [
    processedData,
    chartType,
    createMainChart,
    createDistributionChart,
    createScoreChart,
    createAnomalyList,
  ]);

  // Fungsi untuk memicu klik pada input file tersembunyi
  const handleFileDisplayClick = () => {
    csvFileInputRef.current.click();
  };

  const uploadCsv = async () => {
    setMessage("");
    if (!fileSelected) {
      showMessage("Silakan pilih file CSV terlebih dahulu untuk memulai analisis.", "error");
      return;
    }

    const formData = new FormData();
    formData.append("csv_file", fileSelected);

    setLoading(true);
    setResultsVisible(false);

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload_csv`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        showMessage("Deteksi anomali berhasil diselesaikan!", "success");
        setRawData(result.chart_data);
        updateSummaryStats(result);
        setResultsVisible(true);
      } else {
        console.error("Backend mengembalikan error:", result);
        showMessage(
          `Analisis gagal: ${
            result.error || response.statusText
          }. Harap verifikasi format CSV Anda.`,
          "error"
        );
      }
    } catch (error) {
      console.error("Fetch Error saat upload CSV:", error);
      showMessage(
        "Kesalahan jaringan: Tidak dapat terhubung ke server analisis. Silakan periksa koneksi Anda atau coba lagi nanti.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const clearDataAndReload = () => {
    setShowConfirmModal(true);
  };

  const executeReset = () => {
    setShowConfirmModal(false);
    window.location.reload();
  };

  const toggleTheme = () => {
    setCurrentTheme((prevTheme) => (prevTheme === "default" ? "dark-theme" : "default"));
  };

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
          {message && (
            <div
              className={`message-box ${messageType}`}
              style={{ display: message ? "block" : "none" }}
            >
              {message}
            </div>
          )}

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
                style={{ display: 'none' }} // Sembunyikan input file agar hanya div display yang terlihat
              />
              <div className="file-input-display" onClick={handleFileDisplayClick}> {/* Tambahkan onClick */}
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

          {loading && (
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p style={{ color: "var(--text-main)" }}>
                Memproses data... Memulai pemindaian anomali.
              </p>
            </div>
          )}

          {resultsVisible && processedData && (
            <div className="results-section">
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
                  <canvas id="mainChart" ref={mainChartRef}></canvas>
                </div>
              </div>

              <div className="charts-container">
                <div className="card">
                  <h2 className="card-title">
                    <span className="material-icons">bar_chart</span>
                    Metrik Distribusi Data
                  </h2>
                  <div className="chart-container">
                    <canvas id="distributionChart" ref={distributionChartRef}></canvas>
                  </div>
                </div>

                <div className="card">
                  <h2 className="card-title">
                    <span className="material-icons">bubble_chart</span>
                    Magnitudo Skor Anomali
                  </h2>
                  <div className="chart-container">
                    <canvas id="scoreChart" ref={scoreChartRef}></canvas>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {resultsVisible && (
          <div className="sidebar-content">
            <div className="card anomaly-list" id="anomalyList">
              <h2 className="card-title">
                <span className="material-icons">warning</span>
                Peringatan Anomali Kritis
              </h2>
              <div id="anomaliesContainer"></div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Button (Analyze Data) - Muncul hanya jika tidak loading dan tidak ada modal */}
      {!loading && !showConfirmModal && (
        <div className="fab" onClick={uploadCsv}>
          <span className="material-icons">analytics</span>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      <div id="confirmModal" className={`modal-overlay ${showConfirmModal ? "show" : ""}`}>
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

      {/* Tombol Ganti Tema - Muncul hanya jika tidak loading dan tidak ada modal */}
      {!loading && !showConfirmModal && (
        <div className="fab theme-toggle" onClick={toggleTheme} style={{ bottom: '90px' }}>
          <span className="material-icons">palette</span>
        </div>
      )}
    </div>
  );
}

export default App;