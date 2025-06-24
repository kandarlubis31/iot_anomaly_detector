import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import * as Chart from "chart.js";
import './App.css'; 
import AnomalyDetail from "./AnomalyDetail";

Chart.Chart.register(...Chart.registerables);

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

function App() {
  const [fileSelected, setFileSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [loading, setLoading] = useState(false);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(() => {
    try {
      return localStorage.getItem("theme") || "default";
    } catch (error) {
      return "default";
    }
  });

  const [summaryStats, setSummaryStats] = useState(DEFAULT_SUMMARY_STATS);
  const [rawData, setRawData] = useState(null);
  const [chartType, setChartType] = useState("line");
  const [dataRange, setDataRange] = useState("all");
  const [fileDisplayContent, setFileDisplayContent] = useState(DEFAULT_FILE_DISPLAY);
  
  const [detectedMetrics, setDetectedMetrics] = useState([]);
  const [primaryMetric, setPrimaryMetric] = useState(null);
  const [secondaryMetric, setSecondaryMetric] = useState(null);
  
  const [anomaliesToDisplay, setAnomaliesToDisplay] = useState([]);

  const [contamination, setContamination] = useState(0.04);
  const [view, setView] = useState('dashboard');
  const [selectedAnomaly, setSelectedAnomaly] = useState(null);

  const mainChartRef = useRef(null);
  const distributionChartRef = useRef(null);
  const scoreChartRef = useRef(null);
  const csvFileInputRef = useRef(null);
  const messageTimeoutRef = useRef(null);
  const pdfButtonRef = useRef(null);

  const handleAnomalyClick = (anomaly) => {
    setSelectedAnomaly(anomaly);
    setView('detail');
  };

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

  const filterDataByRange = useCallback((data, range) => {
    if (!data || !data.timestamp || data.timestamp.length === 0) return null;
    const totalLength = data.timestamp.length;
    let indicesToKeep;
    if (range === 'anomalies') {
        indicesToKeep = data.is_anomaly.map((isA, i) => isA ? i : -1).filter(i => i !== -1);
    } else {
        let startIndex = 0;
        if (range === "last100") startIndex = Math.max(0, totalLength - 100);
        else if (range === "last50") startIndex = Math.max(0, totalLength - 50);
        else if (range === "last1000") startIndex = Math.max(0, totalLength - 1000);
        indicesToKeep = Array.from({ length: totalLength - startIndex }, (_, i) => i + startIndex);
    }
    const filteredData = { metrics: {} };
    for (const key in data) {
      if (key === 'metrics') {
        for (const metricKey in data.metrics) {
            filteredData.metrics[metricKey] = indicesToKeep.map(index => data.metrics[metricKey][index]);
        }
      } else {
        filteredData[key] = indicesToKeep.map(index => data[key][index]);
      }
    }
    return filteredData;
  }, []);
  
  const processedData = useMemo(() => {
      if (!rawData) return null;
      return filterDataByRange(rawData, dataRange);
  }, [rawData, dataRange, filterDataByRange]);

  const getCssVariable = useCallback((variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(), []);
  const showMessage = useCallback((msg, type = "info") => {
    setMessage(msg);
    setMessageType(type);
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    messageTimeoutRef.current = setTimeout(() => setMessage(""), MESSAGE_TIMEOUT);
  }, []);
  const updateSummaryStats = useCallback((result) => {
    const total = result.total_points || 0;
    setSummaryStats({
      total_points: total,
      num_anomalies: result.num_anomalies || 0,
      normal_points: total - (result.num_anomalies || 0),
      anomaly_percentage: result.anomaly_percentage || 0,
    });
  }, []);
  const destroyChart = useCallback((chartRef) => {
    if (chartRef.current?.chart) {
      chartRef.current.chart.destroy();
      chartRef.current.chart = null;
    }
  }, []);
  
  const createMainChart = useCallback((data) => {
    const canvas = mainChartRef.current;
    if (!canvas || !data?.timestamp?.length || !primaryMetric || !secondaryMetric) {
      destroyChart(mainChartRef);
      return;
    }
    destroyChart(mainChartRef);
    const ctx = canvas.getContext("2d");
    const normalPoints = [], anomalyPoints = [];
    data.timestamp.forEach((_, index) => {
      const point = {
        x: index,
        y: data.metrics[primaryMetric]?.[index],
        y2: data.metrics[secondaryMetric]?.[index],
        score: data.anomaly_score?.[index],
      };
      if (point.y === undefined || point.y2 === undefined) return;
      data.is_anomaly[index] === 1 ? anomalyPoints.push(point) : normalPoints.push(point);
    });
    const datasets = [];
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
      type: 'line', data: { labels: data.timestamp, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, parsing: false, normalized: true,
        plugins: { legend: { position: "top", labels: { color: getCssVariable("--text-main") } } },
        scales: {
          x: { title: { display: true, text: "Waktu", color: getCssVariable("--text-main") }, ticks: { color: getCssVariable("--text-muted") } },
          y: { position: "left", title: { display: true, text: formatHeaderToUnit(primaryMetric), color: getCssVariable("--text-main") }, ticks: { color: getCssVariable("--text-muted") } },
          y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: formatHeaderToUnit(secondaryMetric), color: getCssVariable("--text-main") }, ticks: { color: getCssVariable("--text-muted") } },
        },
      }
    });
  }, [chartType, getCssVariable, primaryMetric, secondaryMetric]);

  const createHistogram = useCallback((data, bins) => {
    if (!data?.length) return { labels: [], counts: [] };
    const values = data.filter(v => isFinite(v));
    if (!values.length) return { labels: [], counts: [] };
    const min = Math.min(...values), max = Math.max(...values);
    const binSize = max === min ? 1 : (max - min) / bins;
    const counts = new Array(bins).fill(0);
    const labels = Array.from({ length: bins }, (_, i) => `${(min + i * binSize).toFixed(1)}-${(min + (i + 1) * binSize).toFixed(1)}`);
    values.forEach(v => {
      let binIndex = Math.floor((v - min) / binSize);
      counts[Math.max(0, Math.min(bins - 1, binIndex))]++;
    });
    return { labels, counts };
  }, []);

  const createDistributionChart = useCallback((data) => {
    const canvas = distributionChartRef.current;
    if (!canvas || !data?.metrics?.[primaryMetric] || !data?.metrics?.[secondaryMetric]) {
      destroyChart(distributionChartRef); return;
    }
    destroyChart(distributionChartRef);
    const allMeasurements = [...data.metrics[primaryMetric], ...data.metrics[secondaryMetric]];
    const bins = createHistogram(allMeasurements, HISTOGRAM_BINS);
    canvas.chart = new Chart.Chart(canvas.getContext("2d"), {
      type: "bar", data: { labels: bins.labels, datasets: [{ data: bins.counts, backgroundColor: getCssVariable("--color-primary") }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }, [createHistogram, getCssVariable, primaryMetric, secondaryMetric]);

  const createScoreChart = useCallback((data) => {
    const canvas = scoreChartRef.current;
    if (!canvas || !data?.anomaly_score?.length) {
      destroyChart(scoreChartRef); return;
    }
    destroyChart(scoreChartRef);
    const anomalyScoresOnly = data.anomaly_score.filter((_, i) => data.is_anomaly[i] === 1);
    const scoreBins = createHistogram(anomalyScoresOnly, SCORE_BINS);
    canvas.chart = new Chart.Chart(canvas.getContext("2d"), {
      type: "bar", data: { labels: scoreBins.labels, datasets: [{ data: scoreBins.counts, backgroundColor: getCssVariable("--color-danger") }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }, [createHistogram, getCssVariable]);

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

  const handleFileChange = useCallback((e) => {
      const file = e.target.files[0];
      if (!file) return;
      setFileSelected(file);
      setFileDisplayContent({
        icon: "📈", name: file.name,
        details: `✅ Siap dianalisis (${(file.size / 1024).toFixed(1)} KB)`,
        color: "var(--color-secondary)",
      });
    }, []);
  const handleFileDisplayClick = useCallback(() => csvFileInputRef.current?.click(), []);
  const uploadCsv = useCallback(async () => {
    if (!fileSelected) { showMessage("Pilih file CSV terlebih dahulu.", "error"); return; }
    setLoading(true); setResultsVisible(false);
    const formData = new FormData();
    formData.append("csv_file", fileSelected);
    formData.append("contamination", contamination);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/upload_csv`, { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Error server.");

      showMessage(result.message, "success"); setRawData(result.chart_data);
      updateSummaryStats(result);

      const metricKeys = Object.keys(result.chart_data.metrics || {});
      setDetectedMetrics(metricKeys);
      setPrimaryMetric(metricKeys.find(k => k.toLowerCase().includes('temperature')) || metricKeys[0] || null);
      setSecondaryMetric(metricKeys.find(k => k !== (metricKeys.find(k => k.toLowerCase().includes('temperature')) || metricKeys[0])) || metricKeys[1] || null);
      setView('dashboard');
      setResultsVisible(true);
    } catch (error) {
      showMessage(`Error: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [fileSelected, showMessage, updateSummaryStats, contamination]);

  const clearDataAndReload = useCallback(() => setShowConfirmModal(true), []);
  const executeReset = useCallback(() => {
    setShowConfirmModal(false);
    destroyChart(mainChartRef); destroyChart(distributionChartRef); destroyChart(scoreChartRef);
    setFileSelected(null); setRawData(null); setResultsVisible(false);
    setSummaryStats(DEFAULT_SUMMARY_STATS); setFileDisplayContent(DEFAULT_FILE_DISPLAY);
    setMessage(""); setChartType("line"); setDataRange("all");
    setDetectedMetrics([]); setPrimaryMetric(null); setSecondaryMetric(null);
    setAnomaliesToDisplay([]);
    setView('dashboard');
    if (csvFileInputRef.current) csvFileInputRef.current.value = "";
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
  }, [destroyChart]);

  const toggleTheme = useCallback(() => setCurrentTheme(p => (p === "default" ? "dark-theme" : "default")), []);
  
  useEffect(() => { document.documentElement.className = currentTheme; }, [currentTheme]);
  
  useEffect(() => {
    if (view === 'dashboard' && resultsVisible && processedData) {
      createMainChart(processedData);
      createDistributionChart(processedData);
      createScoreChart(processedData);
    }
  }, [view, resultsVisible, processedData, createMainChart, createDistributionChart, createScoreChart]);

  useEffect(() => {
    if (processedData && primaryMetric && secondaryMetric) {
        const anomalies = processedData.timestamp.map((ts, i) => processedData.is_anomaly[i] === 1 ? {
            time: new Date(ts),
            primary: processedData.metrics[primaryMetric]?.[i],
            secondary: processedData.metrics[secondaryMetric]?.[i],
            score: processedData.anomaly_score?.[i],
          } : null
        ).filter(item => item && item.primary !== undefined && item.secondary !== undefined)
         .sort((a, b) => b.score - a.score).slice(0, ANOMALY_DISPLAY_LIMIT);
        
        setAnomaliesToDisplay(anomalies);
    }
  }, [processedData, primaryMetric, secondaryMetric]);
  
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

  if (view === 'detail') {
    return <AnomalyDetail 
              anomaly={selectedAnomaly} 
              fullRawData={rawData}
              onBack={() => setView('dashboard')}
              primaryMetric={primaryMetric}
              secondaryMetric={secondaryMetric}
            />;
  }

  return (
    <div className="app-container">
      <div className="container">
        <div className="header">
          <div className="header-content"><h1>🔍 IoT Anomaly Insights</h1><p>⚡ Deteksi anomali untuk data sensor IoT.</p></div>
        </div>
        <div className="main-content">
          <div className="card upload-section">
            <h2 className="card-title">📂 Masukkan Data</h2>
            <div className="file-input-wrapper">
              <input type="file" id="csvFile" accept=".csv" onChange={handleFileChange} ref={csvFileInputRef} style={{ display: "none" }} />
              <div className="file-input-display" onClick={handleFileDisplayClick}>
                <strong>{fileDisplayContent.icon} {fileDisplayContent.name}</strong><br />
                <span style={{ color: fileDisplayContent.color }}>{fileDisplayContent.details}</span>
              </div>
            </div>
            <div className="contamination-slider">
              <label htmlFor="contamination">Sensitivitas Anomali: <strong>{Math.round(contamination * 100)}%</strong></label>
              <p>Geser ke kanan untuk mendeteksi lebih banyak anomali (lebih sensitif).</p>
              <input 
                type="range" 
                id="contamination" 
                min="0.01" 
                max="0.20" 
                step="0.01"
                value={contamination} 
                onChange={(e) => setContamination(parseFloat(e.target.value))}
              />
            </div>
            <div className="button-group">
              <button className="btn btn-primary" onClick={uploadCsv} disabled={loading || !fileSelected}>🚀 Analisis & Latih Ulang</button>
              <button className="btn btn-danger" onClick={clearDataAndReload} disabled={loading}>🔄 Bersihkan & Atur Ulang</button>
            </div>
          </div>
          {loading && <div className="loading-spinner"><div className="spinner"></div><p>Memproses data...</p></div>}
          {message && <div className={`message-box ${messageType}`}>{message}</div>}
          {resultsVisible && (
            <div className="results-section show">
              <div className="stats-grid">
                <div className="stat-card primary"><h3>📊 {summaryStats.total_points.toLocaleString()}</h3><p>Total Data Poin</p></div>
                <div className="stat-card error"><h3>⚠️ {summaryStats.num_anomalies.toLocaleString()}</h3><p>Anomali Terdeteksi</p></div>
                <div className="stat-card success"><h3>✅ {(summaryStats.total_points - summaryStats.num_anomalies).toLocaleString()}</h3><p>Poin Normal</p></div>
                <div className="stat-card"><h3>📈 {summaryStats.anomaly_percentage}%</h3><p>Tingkat Anomali</p></div>
              </div>
              <div className="card">
                <h2 className="card-title">📈 Analisis Tren Sensor</h2>
                <div className="controls">
                  {/* ... Kontrol chart ... */}
                </div>
                <div className="chart-container large"><canvas ref={mainChartRef}></canvas></div>
              </div>
              <div className="charts-container">
                <div className="card"><h2 className="card-title">📊 Metrik Distribusi</h2><div className="chart-container"><canvas ref={distributionChartRef}></canvas></div></div>
                <div className="card"><h2 className="card-title">🎯 Skor Anomali</h2><div className="chart-container"><canvas ref={scoreChartRef}></canvas></div></div>
              </div>
               <div className="download-pdf-section" style={{ textAlign: "center", marginTop: "20px" }}>
                  <button className="btn btn-secondary" onClick={downloadPdf} disabled={loading} ref={pdfButtonRef}>
                    📥 Unduh Laporan PDF
                  </button>
              </div>
            </div>
          )}
        </div>
        {resultsVisible && (
          <div className="sidebar-content">
            <div className="card anomaly-list">
              <h2 className="card-title">🚨 Peringatan Anomali</h2>
              <div id="anomaliesContainer">
                {anomaliesToDisplay.length > 0 ? (
                  anomaliesToDisplay.map((anomaly, index) => (
                    <div key={index} className="anomaly-item" style={{cursor: 'pointer'}} onClick={() => handleAnomalyClick(anomaly)}>
                      <div>
                        <strong>⏰ {anomaly.time.toLocaleString()}</strong><br />
                        <small>{formatHeaderToUnit(primaryMetric)}: {anomaly.primary.toFixed(2)}</small>
                      </div>
                      <span className="anomaly-score">🎯 {anomaly.score.toFixed(3)}</span>
                    </div>
                  ))
                ) : (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>✅ Tidak ada anomali terdeteksi.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {!loading && !showConfirmModal && <div className="fab theme-toggle" onClick={toggleTheme} title="Ganti Tema">💡</div>}
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
  );
}

export default App;