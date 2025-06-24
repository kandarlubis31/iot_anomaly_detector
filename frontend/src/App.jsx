import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import * as Chart from "chart.js";

Chart.Chart.register(...Chart.registerables);

const KNOWN_METRIC_HEADERS = [
    "Temperature",
    "Humidity",
    "Air Quality",
    "Light",
    "Loudness",
    "Power Consumption"
];

const API_BASE_URL = "https://iotanomalydetector-production.up.railway.app";
const MESSAGE_TIMEOUT = 5000;
const ANOMALY_DISPLAY_LIMIT = 50;
const HISTOGRAM_BINS = 30;
const SCORE_BINS = 15;

const DEFAULT_SUMMARY_STATS = {
  total_points: 0,
  num_anomalies: 0,
  normal_points: 0,
  anomaly_percentage: 0,
};

const DEFAULT_FILE_DISPLAY = {
  icon: "📊",
  name: "Pilih File CSV",
  details: "Klik untuk memuat data sensor IoT Anda (.csv)",
  color: "var(--text-muted)",
};

const AppStyles = () => (
  <style>
    {`
:root {
  --color-primary: #007bff;
  --color-primary-dark: #0056b3;
  --color-primary-light: rgba(0, 123, 255, 0.1);
  --color-secondary: #28a745;
  --color-danger: #dc3545;
  --color-warning: #ffc107;
  --text-main: #333;
  --text-secondary: #555;
  --text-muted: #888;
  --bg-main: #f8f9fa;
  --bg-container: #ffffff;
  --border-default: #dee2e6;
  --shadow-sm: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
  --shadow-md: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
}

.dark-theme {
  --color-primary: #4dabf7;
  --color-primary-dark: #1c7ed6;
  --color-primary-light: rgba(77, 171, 247, 0.1);
  --color-secondary: #40c057;
  --color-danger: #fa5252;
  --color-warning: #fcc419;
  --text-main: #e9ecef;
  --text-secondary: #adb5bd;
  --text-muted: #868e96;
  --bg-main: #1a1b1e;
  --bg-container: #2c2e33;
  --border-default: #495057;
  --shadow-sm: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.15);
  --shadow-md: 0 0.5rem 1rem rgba(0, 0, 0, 0.25);
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen",
    "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue",
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: var(--bg-main);
  color: var(--text-main);
  transition: background-color 0.3s, color 0.3s;
}

.app-container {
  min-height: 100vh;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}

@media (min-width: 1200px) {
    .container {
        grid-template-columns: 1fr 350px;
    }
}

.header {
  grid-column: 1 / -1;
  text-align: center;
  padding: 20px;
  background-color: var(--bg-container);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-default);
}

.header h1 {
  margin: 0 0 10px 0;
  color: var(--color-primary);
  font-size: 2.5rem;
}

.header p {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text-secondary);
}

.main-content {
    grid-column: 1 / 2;
    display: flex;
    flex-direction: column;
    gap: 20px;
}
.sidebar-content {
    grid-column: 2 / 3;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

@media (max-width: 1199px) {
    .main-content, .sidebar-content {
        grid-column: 1 / -1;
    }
}


.card {
  background-color: var(--bg-container);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-default);
  transition: all 0.3s ease;
}

.card-title {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 1.5rem;
  color: var(--text-main);
  border-bottom: 2px solid var(--color-primary);
  padding-bottom: 10px;
}

.message-box {
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-weight: 500;
}
.message-box.info { background-color: #e2f3ff; color: #0069d9; border: 1px solid #b8daff;}
.message-box.success { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb;}
.message-box.error { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;}
.message-box.warning { background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba;}


.file-input-wrapper {
  margin-top: 20px;
}
.file-input-display {
  border: 2px dashed var(--border-default);
  border-radius: 8px;
  padding: 30px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.3s, background-color 0.3s;
}
.file-input-display:hover {
  border-color: var(--color-primary);
  background-color: var(--color-primary-light);
}
.file-input-display strong { font-size: 1.1rem; }

.button-group {
  display: flex;
  gap: 15px;
  margin-top: 20px;
  flex-wrap: wrap;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background-color: var(--color-primary);
  color: white;
}
.btn-primary:hover:not(:disabled) {
  background-color: var(--color-primary-dark);
  box-shadow: 0 4px 12px rgba(0,123,255,0.3);
}

.btn-danger {
  background-color: var(--color-danger);
  color: white;
}
.btn-danger:hover:not(:disabled) {
  background-color: #c82333;
  box-shadow: 0 4px 12px rgba(220,53,69,0.3);
}

.btn-secondary {
    background-color: var(--text-secondary);
    color: var(--bg-main);
}
.btn-secondary:hover:not(:disabled) {
    background-color: var(--text-main);
}


.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 20px;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 5px solid var(--border-default);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.results-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.results-section.show {
  opacity: 1;
  transform: translateY(0);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.stat-card {
  background-color: var(--bg-container);
  border-left: 5px solid var(--border-default);
  padding: 20px;
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
}

.stat-card.primary { border-color: var(--color-primary); }
.stat-card.error { border-color: var(--color-danger); }
.stat-card.success { border-color: var(--color-secondary); }

.stat-card h3 {
  margin: 0 0 5px 0;
  font-size: 2rem;
}
.stat-card p {
  margin: 0;
  color: var(--text-secondary);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 20px;
}
.control-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.control-group label {
  font-weight: bold;
  font-size: 0.9rem;
  color: var(--text-secondary);
}
.control-group select {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background-color: var(--bg-main);
  color: var(--text-main);
  min-width: 200px;
}


.chart-container {
    position: relative;
    height: 300px;
    width: 100%;
}
.chart-container.large {
    height: 450px;
}


.charts-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}
@media (max-width: 768px) {
    .charts-container {
        grid-template-columns: 1fr;
    }
}


.anomaly-list .card-title {
  color: var(--color-danger);
  border-color: var(--color-danger);
}
#anomaliesContainer {
  max-height: 800px;
  overflow-y: auto;
  padding-right: 10px;
}
.anomaly-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--border-default);
  transition: background-color 0.2s;
}
.anomaly-item:last-child {
  border-bottom: none;
}
.anomaly-item:hover {
  background-color: var(--color-primary-light);
}
.anomaly-score {
  font-weight: bold;
  font-size: 1.1rem;
}

.fab {
    position: fixed;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background-color: var(--color-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    box-shadow: var(--shadow-md);
    cursor: pointer;
    transition: all 0.3s ease;
    z-index: 1000;
}
.fab:hover {
    transform: scale(1.1);
    background-color: var(--color-primary-dark);
}

.fab.theme-toggle {
    bottom: 20px;
    right: 20px;
}
.fab:not(.theme-toggle) {
    bottom: 90px;
    right: 20px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s, visibility 0.3s;
  z-index: 2000;
}
.modal-overlay.show {
  opacity: 1;
  visibility: visible;
}

.modal-content {
  background-color: var(--bg-container);
  padding: 30px;
  border-radius: 12px;
  box-shadow: var(--shadow-md);
  width: 90%;
  max-width: 450px;
  transform: scale(0.9);
  transition: transform 0.3s;
}
.modal-overlay.show .modal-content {
    transform: scale(1);
}
.modal-title {
    margin-top: 0;
    font-size: 1.5rem;
}
.modal-actions {
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}
    `}
  </style>
);


function App() {
  const [fileSelected, setFileSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [loading, setLoading] = useState(false);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem("theme");
      return savedTheme || "default";
    } catch (error) {
      console.error("Could not access localStorage:", error);
      return "default";
    }
  });

  const [summaryStats, setSummaryStats] = useState(DEFAULT_SUMMARY_STATS);
  const [rawData, setRawData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [detectedMetrics, setDetectedMetrics] = useState([]);
  const [chartType, setChartType] = useState("line");
  const [dataRange, setDataRange] = useState("last1000");
  const [fileDisplayContent, setFileDisplayContent] =
    useState(DEFAULT_FILE_DISPLAY);
  
  const [primaryMetric, setPrimaryMetric] = useState(null);
  const [secondaryMetric, setSecondaryMetric] = useState(null);

  const mainChartRef = useRef(null);
  const distributionChartRef = useRef(null);
  const scoreChartRef = useRef(null);
  const csvFileInputRef = useRef(null);
  const messageTimeoutRef = useRef(null);
  const pdfButtonRef = useRef(null);
  
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

  const filterDataByRange = useCallback((data, range, mapping, pMetric, sMetric) => {
    const timeKey = mapping.time;
    const anomalyKey = mapping.is_anomaly;
    const scoreKey = mapping.anomaly_score;

    if (!data?.[timeKey]?.length || !pMetric || !sMetric || !anomalyKey || !scoreKey) {
      return { time: [], [pMetric]: [], [sMetric]: [], is_anomaly: [], anomaly_score: [] };
    }

    const filteredTimes = [];
    const filteredPrimaryMetrics = [];
    const filteredSecondaryMetrics = [];
    const filteredIsAnomaly = [];
    const filteredAnomalyScores = [];

    let startIndex = 0;
    if (range === "last100") startIndex = Math.max(0, data[timeKey].length - 100);
    else if (range === "last50") startIndex = Math.max(0, data[timeKey].length - 50);
    else if (range === "last1000") startIndex = Math.max(0, data[timeKey].length - 1000);

    for (let i = startIndex; i < data[timeKey].length; i++) {
      const rawIsAnomalyValue = data[anomalyKey][i];
      const isAnomaly = ["true", "1", true, 1].includes(rawIsAnomalyValue);

      const primary = parseFloat(data[pMetric][i]);
      const secondary = parseFloat(data[sMetric][i]);
      const score = parseFloat(data[scoreKey][i]);

      if (isNaN(primary) || isNaN(secondary) || isNaN(score)) continue;
      if (range === "anomalies" && !isAnomaly) continue;

      filteredTimes.push(data[timeKey][i]);
      filteredPrimaryMetrics.push(primary);
      filteredSecondaryMetrics.push(secondary);
      filteredIsAnomaly.push(isAnomaly);
      filteredAnomalyScores.push(score);
    }

    return {
      time: filteredTimes,
      [pMetric]: filteredPrimaryMetrics,
      [sMetric]: filteredSecondaryMetrics,
      is_anomaly: filteredIsAnomaly,
      anomaly_score: filteredAnomalyScores,
    };
  }, []);

  const processedData = useMemo(() => {
    if (!rawData || !primaryMetric || !secondaryMetric || Object.keys(columnMapping).length === 0) return null;
    return filterDataByRange(rawData, dataRange, columnMapping, primaryMetric, secondaryMetric);
  }, [rawData, dataRange, columnMapping, primaryMetric, secondaryMetric, filterDataByRange]);

  const getCssVariable = useCallback((variable) => {
    if (typeof document !== "undefined") {
      return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    }
    return "";
  }, []);

  const showMessage = useCallback((msg, type = "info") => {
    setMessage(msg);
    setMessageType(type);
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    messageTimeoutRef.current = setTimeout(() => setMessage(""), MESSAGE_TIMEOUT);
  }, []);

  const updateSummaryStats = useCallback((result) => {
    const total = result.total_points;
    const anomalies = result.num_anomalies;
    const normal = total - anomalies;
    const percentage = total > 0 ? (anomalies / total) * 100 : 0;
    setSummaryStats({
      total_points: total,
      num_anomalies: anomalies,
      normal_points: normal,
      anomaly_percentage: parseFloat(percentage.toFixed(2)),
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

  const destroyChart = useCallback((chartRef) => {
    if (chartRef.current?.chart) {
      chartRef.current.chart.destroy();
      chartRef.current.chart = null;
    }
  }, []);

  const createMainChart = useCallback(
    (data) => {
      const canvas = mainChartRef.current;
      if (!canvas || !data?.time?.length || !primaryMetric || !secondaryMetric) {
        destroyChart(mainChartRef);
        return;
      }

      destroyChart(mainChartRef);
      const ctx = canvas.getContext("2d");

      const normalPoints = [];
      const anomalyPoints = [];
      data.time.forEach((_, index) => {
        const point = {
          x: index,
          y: data[primaryMetric][index],
          y2: data[secondaryMetric][index],
          score: data.anomaly_score[index],
        };
        if (data.is_anomaly[index]) anomalyPoints.push(point);
        else normalPoints.push(point);
      });

      let datasets = [];
      if (normalPoints.length > 0 && (chartType === "line" || chartType === "both")) {
        datasets.push(
          { label: `${formatHeaderToUnit(primaryMetric)} (Normal)`, data: normalPoints.map(d => ({ x: d.x, y: d.y })), borderColor: getCssVariable("--color-primary"), type: "line", borderWidth: 2, fill: false, tension: 0.2, pointRadius: 0 },
          { label: `${formatHeaderToUnit(secondaryMetric)} (Normal)`, data: normalPoints.map(d => ({ x: d.x, y: d.y2 })), borderColor: getCssVariable("--color-secondary"), yAxisID: "y1", type: "line", borderWidth: 2, fill: false, tension: 0.2, pointRadius: 0 }
        );
      }
      if (anomalyPoints.length > 0 && (chartType === "scatter" || chartType === "both")) {
        datasets.push(
          { label: `${formatHeaderToUnit(primaryMetric)} (Anomali)`, data: anomalyPoints.map(d => ({ x: d.x, y: d.y, score: d.score })), backgroundColor: getCssVariable("--color-danger"), type: "scatter", pointRadius: 8, pointStyle: 'triangle' },
          { label: `${formatHeaderToUnit(secondaryMetric)} (Anomali)`, data: anomalyPoints.map(d => ({ x: d.x, y: d.y2, score: d.score })), backgroundColor: getCssVariable("--color-warning"), yAxisID: "y1", type: "scatter", pointRadius: 8, pointStyle: 'star' }
        );
      }
      
      canvas.chart = new Chart.Chart(ctx, {
        type: "line",
        data: { labels: data.time.map(ts => new Date(ts).toLocaleString()), datasets },
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, parsing: false, normalized: true,
          plugins: {
            legend: { position: "top", labels: { color: getCssVariable("--text-main"), font: { size: 14 } } },
            tooltip: {
              callbacks: {
                title: ctx => data.time[ctx[0].parsed.x] ? new Date(data.time[ctx[0].parsed.x]).toLocaleString() : "",
                label: ctx => {
                  let label = ctx.dataset.label || "";
                  if (label) label += ": ";
                  if (ctx.parsed.y !== null) label += ctx.parsed.y.toFixed(2);
                  if (ctx.dataset.label.includes("Anomali") && ctx.raw.score !== undefined) label += ` (Skor: ${ctx.raw.score.toFixed(3)})`;
                  return label;
                },
              },
            },
          },
          scales: {
            x: { title: { display: true, text: "Index Data", color: getCssVariable("--text-main") }, ticks: { color: getCssVariable("--text-muted") } },
            y: { position: "left", title: { display: true, text: formatHeaderToUnit(primaryMetric), color: getCssVariable("--text-main") }, ticks: { color: getCssVariable("--text-muted") } },
            y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: formatHeaderToUnit(secondaryMetric), color: getCssVariable("--text-main") }, ticks: { color: getCssVariable("--text-muted") } },
          },
        },
      });
    }, [chartType, destroyChart, getCssVariable, primaryMetric, secondaryMetric]
  );

  const createDistributionChart = useCallback(
    (data) => {
      const canvas = distributionChartRef.current;
      if (!canvas || !data?.[primaryMetric]?.length || !data?.[secondaryMetric]?.length) {
        destroyChart(distributionChartRef);
        return;
      }
      destroyChart(distributionChartRef);
      const ctx = canvas.getContext("2d");
      const allMeasurements = [...data[primaryMetric], ...data[secondaryMetric]];
      const bins = createHistogram(allMeasurements, HISTOGRAM_BINS);
      canvas.chart = new Chart.Chart(ctx, {
        type: "bar",
        data: {
          labels: bins.labels,
          datasets: [{ label: "Distribusi Nilai Sensor Gabungan", data: bins.counts, backgroundColor: getCssVariable("--color-primary") }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: true, labels: { color: getCssVariable("--text-main") } } },
          scales: {
            x: { title: { display: true, text: "Rentang Nilai", color: getCssVariable("--text-main") }, ticks: { color: getCssVariable("--text-muted") } },
            y: { title: { display: true, text: "Frekuensi", color: getCssVariable("--text-main") }, beginAtZero: true, ticks: { color: getCssVariable("--text-muted") } },
          },
        },
      });
    }, [createHistogram, destroyChart, getCssVariable, primaryMetric, secondaryMetric]
  );

  const createScoreChart = useCallback(
    (data) => {
      const canvas = scoreChartRef.current;
      if (!canvas || !data?.anomaly_score?.length) {
        destroyChart(scoreChartRef);
        return;
      }
      destroyChart(scoreChartRef);
      const ctx = canvas.getContext("2d");
      const anomalyScoresOnly = data.anomaly_score.filter((_, i) => data.is_anomaly[i]);
      const scoreBins = createHistogram(anomalyScoresOnly, SCORE_BINS);
      canvas.chart = new Chart.Chart(ctx, {
        type: "bar",
        data: {
          labels: scoreBins.labels,
          datasets: [{ label: "Distribusi Skor Anomali", data: scoreBins.counts, backgroundColor: getCssVariable("--color-danger") }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: true, labels: { color: getCssVariable("--text-main") } } },
          scales: {
            x: { title: { display: true, text: "Rentang Skor Anomali", color: getCssVariable("--text-main") }, ticks: { color: getCssVariable("--text-muted") } },
            y: { title: { display: true, text: "Frekuensi Anomali", color: getCssVariable("--text-main") }, beginAtZero: true, ticks: { color: getCssVariable("--text-muted") } },
          },
        },
      });
    }, [createHistogram, destroyChart, getCssVariable]
  );
  
  const createAnomalyList = useCallback(
    (data) => {
      const container = document.getElementById("anomaliesContainer");
      if (!container) return;
      container.innerHTML = "";

      if (!data?.time?.length || !primaryMetric || !secondaryMetric) {
        container.innerHTML = `<p style='color: ${getCssVariable("--text-muted")}; text-align: center;'>Tidak ada anomali.</p>`;
        return;
      }

      const anomalies = [];
      for (let i = 0; i < data.is_anomaly.length; i++) {
        if (data.is_anomaly[i]) {
          anomalies.push({
            time: new Date(data.time[i]),
            primary: data[primaryMetric][i],
            secondary: data[secondaryMetric][i],
            score: data.anomaly_score[i],
          });
        }
      }

      if (anomalies.length === 0) {
        container.innerHTML = `<p style='color: ${getCssVariable("--text-muted")}; text-align: center;'>Tidak ada anomali terdeteksi.</p>`;
        return;
      }

      anomalies.sort((a, b) => b.score - a.score);
      const anomaliesToDisplay = anomalies.slice(0, ANOMALY_DISPLAY_LIMIT);
      const fragment = document.createDocumentFragment();
      anomaliesToDisplay.forEach(anomaly => {
        const item = document.createElement("div");
        item.className = "anomaly-item";
        item.innerHTML = `
          <div>
            <strong>⏰ ${anomaly.time.toLocaleString()}</strong><br>
            <small>${formatHeaderToUnit(primaryMetric)}: ${anomaly.primary.toFixed(2)}, ${formatHeaderToUnit(secondaryMetric)}: ${anomaly.secondary.toFixed(2)}</small>
          </div>
          <span class="anomaly-score" style="color: ${getCssVariable("--color-danger")};">🎯 Skor: ${anomaly.score.toFixed(3)}</span>`;
        fragment.appendChild(item);
      });
      container.appendChild(fragment);
    }, [getCssVariable, primaryMetric, secondaryMetric]
  );

  const handleFileChange = useCallback(
    (e) => {
      const file = e.target.files[0];
      const resetInput = () => {
        setFileSelected(null);
        setFileDisplayContent(DEFAULT_FILE_DISPLAY);
        setColumnMapping({});
        setDetectedMetrics([]);
        setPrimaryMetric(null);
        setSecondaryMetric(null);
        if (csvFileInputRef.current) csvFileInputRef.current.value = "";
      };

      if (!file) {
        resetInput();
        return;
      }
      if (!file.name.toLowerCase().endsWith(".csv")) {
        showMessage("File harus berekstensi .csv", "error");
        resetInput();
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const fileContent = event.target.result;
          const firstLine = fileContent.split('\n')[0].trim();
          const headers = firstLine.split(/;|,/).map(h => h.trim().replace(/"/g, ''));
          
          const mapping = {};
          const foundMetrics = [];
          
          headers.forEach(header => {
            const lowerHeader = header.toLowerCase();
            if (lowerHeader.includes('time')) mapping.time = header;
            else if (lowerHeader.includes('anomaly_score')) mapping.anomaly_score = header;
            else if (lowerHeader.includes('is_anomaly')) mapping.is_anomaly = header;
            else if (KNOWN_METRIC_HEADERS.some(known => lowerHeader.includes(known.toLowerCase().split(" ")[0]))) {
                foundMetrics.push(header);
            }
          });
          
          if (!mapping.time || foundMetrics.length < 1) {
              showMessage("CSV tidak valid. Pastikan ada kolom 'Time' dan minimal satu kolom metrik.", "error");
              resetInput();
              return;
          }

          setFileSelected(file);
          setColumnMapping(mapping);
          setDetectedMetrics(foundMetrics);
          setPrimaryMetric(foundMetrics[0]);
          setSecondaryMetric(foundMetrics.length > 1 ? foundMetrics[1] : foundMetrics[0]);
          setFileDisplayContent({
            icon: "📈",
            name: file.name,
            details: `✅ Valid | Metrik: ${foundMetrics.join(', ')}`,
            color: getCssVariable("--color-secondary"),
          });

        } catch (readError) {
          showMessage("Gagal membaca file, mungkin rusak.", "error");
          resetInput();
        }
      };
      reader.readAsText(file);
    },
    [getCssVariable, showMessage]
  );

  const handleFileDisplayClick = useCallback(() => csvFileInputRef.current?.click(), []);

  const uploadCsv = useCallback(async () => {
    if (!fileSelected) {
      showMessage("Pilih file CSV terlebih dahulu.", "error");
      return;
    }
    setLoading(true);
    setResultsVisible(false);
    const formData = new FormData();
    formData.append("csv_file", fileSelected);
    try {
      const response = await fetch(`${API_BASE_URL}/api/upload_csv`, { method: "POST", body: formData });
      const result = await response.json();
      if (response.ok) {
        showMessage("Analisis berhasil!", "success");
        setRawData(result.chart_data);
        updateSummaryStats(result);
        setResultsVisible(true);
      } else {
        showMessage(`Analisis gagal: ${result.error || "Error tidak diketahui"}.`, "error");
        setResultsVisible(false);
      }
    } catch (error) {
      showMessage("Kesalahan jaringan, tidak bisa terhubung ke server.", "error");
      setResultsVisible(false);
    } finally {
      setLoading(false);
    }
  }, [fileSelected, showMessage, updateSummaryStats]);

  const clearDataAndReload = useCallback(() => setShowConfirmModal(true), []);

  const executeReset = useCallback(() => {
    setShowConfirmModal(false);
    destroyChart(mainChartRef);
    destroyChart(distributionChartRef);
    destroyChart(scoreChartRef);
    setFileSelected(null);
    setRawData(null);
    setResultsVisible(false);
    setSummaryStats(DEFAULT_SUMMARY_STATS);
    setFileDisplayContent(DEFAULT_FILE_DISPLAY);
    setMessage("");
    setChartType("line");
    setDataRange("last1000");
    setColumnMapping({});
    setDetectedMetrics([]);
    setPrimaryMetric(null);
    setSecondaryMetric(null);
    if (csvFileInputRef.current) csvFileInputRef.current.value = "";
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
  }, [destroyChart]);

  const toggleTheme = useCallback(() => {
    setCurrentTheme(prev => {
      const newTheme = prev === "default" ? "dark-theme" : "default";
      try { localStorage.setItem("theme", newTheme); } catch (error) { console.error("Could not access localStorage:", error); }
      return newTheme;
    });
  }, []);

  const downloadPdf = useCallback(() => {
     if (!window.html2canvas || !window.jspdf) {
        showMessage("Library PDF sedang dimuat, coba sesaat lagi.", "info");
        return;
    }
    showMessage("Mempersiapkan laporan PDF...", "info");
    setLoading(true);
    const resultsSection = document.querySelector(".results-section");
    const pdfButtonElement = pdfButtonRef.current;
    if (pdfButtonElement) pdfButtonElement.style.display = "none";
    if (resultsSection) {
      window.html2canvas(resultsSection, { scale: 2.0, useCORS: true, windowWidth: resultsSection.scrollWidth, windowHeight: resultsSection.scrollHeight, backgroundColor: getCssVariable('--bg-main') })
        .then(canvas => {
          const { jsPDF } = window.jspdf;
          const imgData = canvas.toDataURL("image/jpeg", 0.8);
          const pdf = new jsPDF("p", "mm", "a4");
          let position = 0;
          const imgWidth = 210;
          const pageHeight = 297;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          let heightLeft = imgHeight;
          pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
          while (heightLeft > 0) {
            position = -pageHeight + (imgHeight - heightLeft);
            pdf.addPage();
            pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
          }
          pdf.save("Laporan_Anomali_IoT.pdf");
          showMessage("Laporan PDF berhasil diunduh!", "success");
        })
        .catch(error => showMessage("Gagal mengunduh PDF.", "error"))
        .finally(() => {
          if (pdfButtonElement) pdfButtonElement.style.display = "flex";
          setLoading(false);
        });
    } else {
      showMessage("Tidak ada hasil untuk dibuat laporan.", "warning");
      setLoading(false);
      if (pdfButtonElement) pdfButtonElement.style.display = "flex";
    }
  }, [showMessage, getCssVariable]);

  useEffect(() => {
    document.documentElement.className = currentTheme;
  }, [currentTheme]);

  useEffect(() => {
    if (resultsVisible && processedData) {
      createMainChart(processedData);
      createDistributionChart(processedData);
      if(columnMapping.is_anomaly && columnMapping.anomaly_score) {
        createScoreChart(processedData);
        createAnomalyList(processedData);
      }
    } else {
        destroyChart(mainChartRef);
        destroyChart(distributionChartRef);
        destroyChart(scoreChartRef);
    }
  }, [resultsVisible, processedData, chartType, createMainChart, createDistributionChart, createScoreChart, createAnomalyList, destroyChart, columnMapping]);

  useEffect(() => {
    const loadScript = (src, id) => new Promise((resolve, reject) => {
        if (document.getElementById(id)) return resolve();
        const script = document.createElement('script');
        script.src = src; script.id = id;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Script load error for ${src}`));
        document.head.appendChild(script);
    });
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas-script').catch(console.error);
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf-script').catch(console.error);
    return () => {
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
      destroyChart(mainChartRef);
      destroyChart(distributionChartRef);
      destroyChart(scoreChartRef);
    };
  }, [destroyChart]);

  return (
    <>
      <AppStyles />
      <div className={`app-container ${currentTheme}`}>
        <div className="container">
          <div className="header">
            <div className="header-content"><h1>🔍 IoT Anomaly Insights</h1><p>⚡ Deteksi anomali untuk data sensor IoT.</p></div>
          </div>
          <div className="main-content">
            <div className="csv-download-info">
              <p style={{ color: getCssVariable("--text-secondary"), fontSize: "0.9rem", textAlign: "center" }}>
                Data simulasi dapat diunduh di: <a href="https://www.kaggle.com/datasets/hkayan/anomliot" target="_blank" rel="noopener noreferrer" style={{ color: getCssVariable("--color-primary"), fontWeight: "bold" }}>🔗 Kaggle Dataset</a>
              </p>
            </div>
            {message && <div className={`message-box ${messageType}`}>{message}</div>}
            <div className="card upload-section">
              <h2 className="card-title">📂 Masukkan Data</h2>
              <div className="file-input-wrapper">
                <input type="file" id="csvFile" accept=".csv" onChange={handleFileChange} ref={csvFileInputRef} style={{ display: "none" }} />
                <div className="file-input-display" onClick={handleFileDisplayClick}>
                  <strong>{fileDisplayContent.icon} {fileDisplayContent.name}</strong><br />
                  <span style={{ color: fileDisplayContent.color }}>{fileDisplayContent.details}</span>
                </div>
              </div>
              <div style={{ marginTop: "20px", padding: "15px", borderRadius: "8px", backgroundColor: getCssVariable("--bg-main"), border: `1px dashed ${getCssVariable("--border-default")}`, fontSize: "0.9rem" }}>
                <p style={{ fontWeight: "bold", marginBottom: "10px", color: getCssVariable("--text-main") }}>📋 Syarat File CSV:</p>
                <ul style={{ margin: 0, paddingLeft: "20px", color: getCssVariable("--text-secondary"), lineHeight: "1.6" }}>
                   <li>Ekstensi file harus <strong>.csv</strong>.</li>
                   <li>Pemisah kolom bisa titik koma (<strong>;</strong>) atau koma (<strong>,</strong>).</li>
                   <li>Header wajib mengandung kata kunci '<strong>Time</strong>' dan minimal salah satu dari metrik berikut: <strong>{KNOWN_METRIC_HEADERS.join(", ")}</strong>.</li>
                   <li>Untuk deteksi anomali, header juga harus mengandung '<strong>is_anomaly</strong>' dan '<strong>anomaly_score</strong>'.</li>
                </ul>
              </div>
              <div className="button-group">
                <button className="btn btn-primary" onClick={uploadCsv} disabled={loading || !fileSelected}>🚀 Analisis Data</button>
                <button className="btn btn-danger" onClick={clearDataAndReload} disabled={loading}>🔄 Bersihkan & Atur Ulang</button>
              </div>
            </div>
            {loading && <div className="loading-spinner"><div className="spinner"></div><p>Memproses data...</p></div>}
            {resultsVisible && (
              <div className="results-section show">
                <div className="stats-grid">
                  <div className="stat-card primary"><h3>📊 {summaryStats.total_points.toLocaleString()}</h3><p>Total Data Poin</p></div>
                  <div className="stat-card error"><h3>⚠️ {summaryStats.num_anomalies.toLocaleString()}</h3><p>Anomali Terdeteksi</p></div>
                  <div className="stat-card success"><h3>✅ {summaryStats.normal_points.toLocaleString()}</h3><p>Poin Normal</p></div>
                  <div className="stat-card"><h3>📈 {summaryStats.anomaly_percentage}%</h3><p>Tingkat Anomali</p></div>
                </div>
                <div className="card">
                  <h2 className="card-title">📈 Analisis Tren Sensor</h2>
                  <div className="controls">
                    <div className="control-group">
                      <label htmlFor="chartType">🎨 Tipe Visualisasi</label>
                      <select id="chartType" value={chartType} onChange={(e) => setChartType(e.target.value)}>
                        <option value="line">📊 Grafik Garis</option>
                        <option value="scatter">🔵 Diagram Sebar</option>
                        <option value="both">🎭 Tampilan Gabungan</option>
                      </select>
                    </div>
                    <div className="control-group">
                      <label htmlFor="dataRange">🔍 Jendela Data</label>
                      <select id="dataRange" value={dataRange} onChange={(e) => setDataRange(e.target.value)}>
                        <option value="all">🌐 Semua Data</option>
                        <option value="last1000">🔢 1000 Terakhir</option>
                        <option value="last100">💯 100 Terakhir</option>
                        <option value="last50">📋 50 Terakhir</option>
                        <option value="anomalies">🎯 Hanya Anomali</option>
                      </select>
                    </div>
                     {detectedMetrics.length > 1 && (
                        <>
                        <div className="control-group">
                          <label htmlFor="primaryMetric">Y-Axis Kiri</label>
                          <select id="primaryMetric" value={primaryMetric} onChange={(e) => setPrimaryMetric(e.target.value)}>
                            {detectedMetrics.filter(m => m !== secondaryMetric).map(metric => <option key={metric} value={metric}>{formatHeaderToUnit(metric)}</option>)}
                          </select>
                        </div>
                        <div className="control-group">
                          <label htmlFor="secondaryMetric">Y-Axis Kanan</label>
                          <select id="secondaryMetric" value={secondaryMetric} onChange={(e) => setSecondaryMetric(e.target.value)}>
                            {detectedMetrics.filter(m => m !== primaryMetric).map(metric => <option key={metric} value={metric}>{formatHeaderToUnit(metric)}</option>)}
                          </select>
                        </div>
                        </>
                     )}
                  </div>
                  <div className="chart-container large"><canvas ref={mainChartRef}></canvas></div>
                </div>
                <div className="charts-container">
                  <div className="card"><h2 className="card-title">📊 Metrik Distribusi</h2><div className="chart-container"><canvas ref={distributionChartRef}></canvas></div></div>
                  <div className="card"><h2 className="card-title">🎯 Skor Anomali</h2><div className="chart-container"><canvas ref={scoreChartRef}></canvas></div></div>
                </div>
                <div className="download-pdf-section" style={{ textAlign: "center", marginTop: "20px" }}>
                  <button className="btn btn-secondary" onClick={downloadPdf} disabled={loading} ref={pdfButtonRef}>📥 Unduh Laporan PDF</button>
                </div>
              </div>
            )}
          </div>
          {resultsVisible && (
            <div className="sidebar-content">
              <div className="card anomaly-list"><h2 className="card-title">🚨 Peringatan Anomali</h2><div id="anomaliesContainer"></div></div>
            </div>
          )}
        </div>
        {!loading && !showConfirmModal && <div className="fab theme-toggle" onClick={toggleTheme} title="Ganti Tema">💡</div>}
        {!loading && !showConfirmModal && fileSelected && <div className="fab" onClick={uploadCsv} title="Mulai Analisis">🚀</div>}
        <div className={`modal-overlay ${showConfirmModal ? "show" : ""}`}>
          <div className="modal-content">
            <h3 className="modal-title">❓ Konfirmasi Reset</h3>
            <p>Yakin mau hapus semua data dan atur ulang aplikasi?</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>↩️ Batal</button>
              <button className="btn btn-danger" onClick={executeReset}>🗑️ Reset</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;