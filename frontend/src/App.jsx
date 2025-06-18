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
    details: "Klik di sini untuk memilih file data IoT Anda",
    color: "var(--gray-600)",
  });

  const mainChartRef = useRef(null);
  const distributionChartRef = useRef(null);
  const scoreChartRef = useRef(null);

  // Define API_BASE_URL here
  const API_BASE_URL = process.env.VITE_API_URL || "https://iotanomalydetector-production.up.railway.app/"; 

  useEffect(() => {
    setResultsVisible(false);
    setLoading(false);
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFileSelected(file);

    if (file) {
      setFileDisplayContent({
        icon: "📄",
        name: file.name,
        details: `File dipilih (${(file.size / 1024).toFixed(1)} KB)`,
        color: "var(--success)",
      });
    } else {
      setFileDisplayContent({
        icon: "📁",
        name: "Pilih File CSV",
        details: "Klik di sini untuk memilih file data IoT Anda",
        color: "var(--gray-600)",
      });
    }
  };

  const showMessage = (msg, type = "info") => {
    setMessage(msg);
    setMessageType(type);
    if (type === "success") {
      setTimeout(() => {
        setMessage("");
      }, 5000);
    }
  };

  const hideMessage = () => {
    setMessage("");
  };

  const showLoading = (show) => {
    setLoading(show);
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
      labels.push((min + i * binSize).toFixed(1));
    }

    data.forEach((value) => {
      const binIndex = Math.min(Math.floor((value - min) / binSize), bins - 1);
      counts[binIndex]++;
    });

    return { labels, counts };
  }, []);

  const filterDataByRange = useCallback((data, range) => {
    if (!data || !data.timestamps || data.timestamps.length === 0) {
      console.warn("filterDataByRange: Data tidak valid atau kosong.");
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
      if (!canvas) {
        console.warn("createMainChart: Ref Canvas utama tidak ditemukan.");
        return;
      }
      if (!data || !data.timestamps || data.timestamps.length === 0) {
        console.warn("createMainChart: Tidak ada data yang diberikan.");
        if (canvas.chart) canvas.chart.destroy();
        return;
      }

      const ctx = canvas.getContext("2d");
      if (canvas.chart) {
        canvas.chart.destroy();
      }

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
          borderColor: "rgba(75, 192, 192, 1)",
          backgroundColor: "rgba(75, 192, 192, 0.1)",
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 2,
          type: "line",
        });

        datasets.push({
          label: "Daya (Normal)",
          data: normalDataPoints.map((d) => ({ x: d.x, y: d.y2 })),
          borderColor: "rgba(153, 102, 255, 1)",
          backgroundColor: "rgba(153, 102, 255, 0.1)",
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 2,
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
          borderColor: "rgba(255, 99, 132, 1)",
          backgroundColor: "rgba(255, 99, 132, 0.8)",
          borderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
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
          borderColor: "rgba(255, 159, 64, 1)",
          backgroundColor: "rgba(255, 159, 64, 0.8)",
          borderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false,
          type: "scatter",
          yAxisID: "y1",
        });
      }

      if (datasets.length === 0) {
        console.warn(
          "createMainChart: Tidak ada dataset yang dibuat. Grafik mungkin kosong."
        );
        if (canvas.chart) canvas.chart.destroy();
        return;
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
                font: {
                  size: 14,
                  family: "var(--font-primary)",
                },
                color: "var(--gray-800)",
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
            },
          },
          scales: {
            x: {
              type: "time",
              time: {
                unit: "minute",
                displayFormats: {
                  minute: "MMM d, HH:mm",
                  hour: "MMM d, HH:mm",
                  day: "MMM d",
                },
              },
              title: {
                display: true,
                text: "Waktu",
                font: {
                  size: 14,
                  family: "var(--font-primary)",
                },
                color: "var(--gray-700)",
              },
              ticks: {
                color: "var(--gray-600)",
              },
            },
            y: {
              type: "linear",
              display: true,
              position: "left",
              title: {
                display: true,
                text: "Suhu (°C)",
                font: {
                  size: 14,
                  family: "var(--font-primary)",
                },
                color: "var(--gray-700)",
              },
              ticks: {
                color: "var(--gray-600)",
              },
            },
            y1: {
              type: "linear",
              display: true,
              position: "right",
              grid: {
                drawOnChartArea: false,
              },
              title: {
                display: true,
                text: "Konsumsi Daya (W)",
                font: {
                  size: 14,
                  family: "var(--font-primary)",
                },
                color: "var(--gray-700)",
              },
              ticks: {
                color: "var(--gray-600)",
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
      if (!canvas) {
        console.warn(
          "createDistributionChart: Ref Canvas distribusi tidak ditemukan."
        );
        return;
      }
      if (!data || !data.temperatures || data.temperatures.length === 0) {
        console.warn("createDistributionChart: Tidak ada data yang diberikan.");
        if (canvas.chart) canvas.chart.destroy();
        return;
      }

      const ctx = canvas.getContext("2d");
      if (canvas.chart) {
        canvas.chart.destroy();
      }
      const allMeasurements = data.temperatures.concat(data.power_consumptions);
      const bins = createHistogram(allMeasurements, 30);

      canvas.chart = new ChartJS(ctx, {
        type: "bar",
        data: {
          labels: bins.labels,
          datasets: [
            {
              label: "Distribusi Suhu & Daya",
              data: bins.counts,
              backgroundColor: "rgba(75, 192, 192, 0.6)",
              borderColor: "rgba(75, 192, 192, 1)",
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
                font: { family: "var(--font-primary)" },
                color: "var(--gray-800)",
              },
            },
          },
          scales: {
            x: {
              title: {
                display: true,
                text: "Nilai Pengukuran",
                font: { family: "var(--font-primary)" },
                color: "var(--gray-700)",
              },
              ticks: { color: "var(--gray-600)" },
            },
            y: {
              title: {
                display: true,
                text: "Frekuensi",
                font: { family: "var(--font-primary)" },
                color: "var(--gray-700)",
              },
              beginAtZero: true,
              ticks: { color: "var(--gray-600)" },
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
      if (!canvas) {
        console.warn("createScoreChart: Ref Canvas skor tidak ditemukan.");
        return;
      }
      if (!data || !data.anomaly_scores || data.anomaly_scores.length === 0) {
        console.warn("createScoreChart: Tidak ada data yang diberikan.");
        if (canvas.chart) canvas.chart.destroy();
        return;
      }

      const ctx = canvas.getContext("2d");
      if (canvas.chart) {
        canvas.chart.destroy();
      }
      const scoreBins = createHistogram(data.anomaly_scores, 15);

      canvas.chart = new ChartJS(ctx, {
        type: "bar",
        data: {
          labels: scoreBins.labels,
          datasets: [
            {
              label: "Distribusi Skor Anomali",
              data: scoreBins.counts,
              backgroundColor: "rgba(255, 159, 64, 0.6)",
              borderColor: "rgba(255, 159, 64, 1)",
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
                font: { family: "var(--font-primary)" },
                color: "var(--gray-800)",
              },
            },
          },
          scales: {
            x: {
              title: {
                display: true,
                text: "Skor Anomali",
                font: { family: "var(--font-primary)" },
                color: "var(--gray-700)",
              },
              ticks: { color: "var(--gray-600)" },
            },
            y: {
              title: {
                display: true,
                text: "Frekuensi",
                font: { family: "var(--font-primary)" },
                color: "var(--gray-700)",
              },
              beginAtZero: true,
              ticks: { color: "var(--gray-600)" },
            },
          },
        },
      });
    },
    [createHistogram]
  );

  const createAnomalyList = useCallback((data) => {
    const container = document.getElementById("anomaliesContainer");
    if (!container) {
      console.warn(
        "createAnomalyList: Kontainer daftar anomali tidak ditemukan di DOM."
      );
      return;
    }
    container.innerHTML = "";

    if (!data || !data.timestamps || data.timestamps.length === 0) {
      console.warn("createAnomalyList: Tidak ada data yang diberikan.");
      container.innerHTML =
        '<p style="text-align: center; color: var(--gray-600); font-weight: bold;">Tidak ada data tersedia untuk daftar anomali.</p>';
      return;
    }

    const anomalies = data.timestamps
      .map((timestamp, index) => ({
        timestamp: timestamp,
        temperature: data.temperatures[index],
        power: data.power_consumptions[index],
        score: data.anomaly_scores[index],
        isAnomaly: data.is_anomaly[index],
      }))
      .filter((item) => item.isAnomaly)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (anomalies.length === 0) {
      container.innerHTML =
        '<p style="text-align: center; color: var(--success); font-weight: bold;">Tidak ada anomali terdeteksi! 🎉</p>';
      return;
    }

    anomalies.forEach((anomaly) => {
      const item = document.createElement("div");
      item.className = "anomaly-item";
      item.innerHTML = `
        <div>
          <strong>${new Date(anomaly.timestamp).toLocaleString()}</strong><br>
          <small>Suhu: ${anomaly.temperature.toFixed(
            1
          )}°C, Daya: ${anomaly.power.toFixed(1)}W</small>
        </div>
        <div style="text-align: right;">
          <span style="color: var(--danger); font-weight: bold;">Skor Anomali: ${anomaly.score.toFixed(
            3
          )}</span>
        </div>
      `;
      container.appendChild(item);
    });
  }, []);

  // Efek untuk memproses ulang data saat rawData atau dataRange berubah
  useEffect(() => {
    if (rawData) {
      const filteredData = filterDataByRange(rawData, dataRange);
      setProcessedData(filteredData);
    } else {
      setProcessedData(null);
    }
  }, [rawData, dataRange, filterDataByRange]);

  // Efek untuk merender ulang CHART UTAMA saja
  useEffect(() => {
    if (
      processedData &&
      processedData.timestamps &&
      processedData.timestamps.length > 0
    ) {
      createMainChart(processedData);
    } else {
      if (mainChartRef.current && mainChartRef.current.chart)
        mainChartRef.current.chart.destroy();
    }
  }, [processedData, chartType, createMainChart]);

  // Efek untuk merender ulang CHART DISTRIBUSI & SKOR + Anomaly List
  // Hanya bergantung pada processedData, tidak pada chartType
  useEffect(() => {
    if (
      processedData &&
      processedData.timestamps &&
      processedData.timestamps.length > 0
    ) {
      createDistributionChart(processedData);
      createScoreChart(processedData);
      createAnomalyList(processedData);
    } else {
      if (distributionChartRef.current && distributionChartRef.current.chart)
        distributionChartRef.current.chart.destroy();
      if (scoreChartRef.current && scoreChartRef.current.chart)
        scoreChartRef.current.chart.destroy();
      const container = document.getElementById("anomaliesContainer");
      if (container)
        container.innerHTML =
          '<p style="text-align: center; color: var(--gray-600); font-weight: bold;">Tidak ada data tersedia untuk ditampilkan.</p>';
    }
  }, [
    processedData,
    createDistributionChart,
    createScoreChart,
    createAnomalyList,
  ]);

  // Logika utama untuk upload data
  const uploadCsv = async () => {
    hideMessage();
    if (!fileSelected) {
      showMessage("Harap pilih file CSV terlebih dahulu.", "error");
      return;
    }

    const formData = new FormData();
    formData.append("csv_file", fileSelected);

    showLoading(true);
    setResultsVisible(false);

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload_csv`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        showMessage("Deteksi anomali berhasil!", "success");
        setRawData(result.chart_data);
        updateSummaryStats(result);
        setResultsVisible(true);
      } else {
        console.error("Backend mengembalikan error:", result);
        showMessage(`Error: ${result.error || response.statusText}`, "error");
      }
    } catch (error) {
      console.error("Fetch Error saat upload CSV:", error);
      showMessage(
        "Terjadi kesalahan saat berkomunikasi dengan server. Pastikan server Flask berjalan dan CORS sudah diatur.",
        "error"
      );
    } finally {
      showLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>🔍 Detektor Anomali IoT</h1>
        <p>
          Deteksi anomali canggih untuk data sensor IoT dengan visualisasi
          interaktif
        </p>
      </div>

      <div className="main-content">
        {message && (
          <div
            className={`message-box ${messageType} ${message ? "show" : ""}`}
          >
            {message}
          </div>
        )}

        <div className="upload-section">
          <div className="file-input-wrapper">
            <input
              type="file"
              id="csvFile"
              accept=".csv"
              onChange={handleFileChange}
            />
            <div className="file-input-display">
              <strong>
                {fileDisplayContent.icon} {fileDisplayContent.name}
              </strong>
              <br />
              <span style={{ color: fileDisplayContent.color }}>
                {fileDisplayContent.details}
              </span>
            </div>
          </div>
          <button className="upload-btn" onClick={uploadCsv} disabled={loading}>
            {loading ? "Menganalisis..." : "🚀 Analisis Data"}
          </button>
        </div>

        {loading && (
          <div className={`loading-spinner ${loading ? "show" : ""}`}>
            <div className="spinner"></div>
            <p>Menganalisis data... Harap tunggu</p>
          </div>
        )}

        {resultsVisible && processedData && (
          <div className={`results-section ${resultsVisible ? "show" : ""}`}>
            <div className="stats-grid">
              <div className="stat-card">
                <h3>{summaryStats.total_points.toLocaleString()}</h3>
                <p>Total Poin Data</p>
              </div>
              <div className="stat-card anomaly">
                <h3>{summaryStats.num_anomalies.toLocaleString()}</h3>
                <p>Anomali Terdeteksi</p>
              </div>
              <div className="stat-card normal">
                <h3>{summaryStats.normal_points.toLocaleString()}</h3>
                <p>Poin Normal</p>
              </div>
              <div className="stat-card">
                <h3>{summaryStats.anomaly_percentage}%</h3>
                <p>Tingkat Anomali</p>
              </div>
            </div>

            <div className="charts-container">
              <div className="chart-card">
                <h3>📊 Analisis Deret Waktu</h3>
                <div className="controls">
                  <div className="control-group">
                    <label htmlFor="chartType">Jenis Grafik:</label>
                    <select
                      id="chartType"
                      value={chartType}
                      onChange={(e) => setChartType(e.target.value)}
                    >
                      <option value="line">Grafik Garis</option>
                      <option value="scatter">Plot Sebar</option>
                      <option value="both">Tampilan Gabungan</option>
                    </select>
                  </div>
                  <div className="control-group">
                    <label htmlFor="dataRange">Rentang Data:</label>
                    <select
                      id="dataRange"
                      value={dataRange}
                      onChange={(e) => setDataRange(e.target.value)}
                    >
                      <option value="all">Semua Data</option>
                      <option value="last100">100 Poin Terakhir</option>
                      <option value="last50">50 Poin Terakhir</option>
                      <option value="anomalies">Hanya Anomali</option>
                    </select>
                  </div>
                </div>
                <div className="chart-container large">
                  <canvas id="mainChart" ref={mainChartRef}></canvas>
                </div>
              </div>

              <div className="chart-card">
                <h3>📈 Analisis Distribusi</h3>
                <div className="chart-container">
                  <canvas
                    id="distributionChart"
                    ref={distributionChartRef}
                  ></canvas>
                </div>
              </div>

              <div className="chart-card">
                <h3>⚡ Distribusi Skor Anomali</h3>
                <div className="chart-container">
                  <canvas id="scoreChart" ref={scoreChartRef}></canvas>
                </div>
              </div>
            </div>

            <div className="anomaly-list">
              <h4>🚨 Anomali Terdeteksi</h4>
              <div id="anomaliesContainer"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default App;
