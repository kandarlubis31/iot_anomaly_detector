/* eslint-disable no-irregular-whitespace */
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import * as Chart from "chart.js";
import "./App.css";
import AnomalyDetail from "./AnomalyDetail";

Chart.Chart.register(...Chart.registerables);

const API_BASE_URL = "https://iotanomalydetector-production.up.railway.app";
const MESSAGE_TIMEOUT = 5000;
const ANOMALY_PAGE_SIZE = 50;
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
  const [displayedAnomalies, setDisplayedAnomalies] = useState(ANOMALY_PAGE_SIZE);
  const [detectedMetrics, setDetectedMetrics] = useState([]);
  const [primaryMetric, setPrimaryMetric] = useState(null);
  const [secondaryMetric, setSecondaryMetric] = useState(null);
  const [contamination, setContamination] = useState(0.05);
  const [view, setView] = useState("dashboard");
  const [selectedAnomaly, setSelectedAnomaly] = useState(null);

  const mainChartRef = useRef(null);
  const distributionChartRef = useRef(null);
  const scoreChartRef = useRef(null);
  const csvFileInputRef = useRef(null);
  const messageTimeoutRef = useRef(null);

  const handleAnomalyClick = (anomaly) => {
    setSelectedAnomaly(anomaly);
    setView("detail");
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
    if (range === "anomalies") {
      indicesToKeep = data.is_anomaly
        .map((isA, i) => (isA ? i : -1))
        .filter((i) => i !== -1);
    } else {
      let startIndex = 0;
      if (range === "last100") startIndex = Math.max(0, totalLength - 100);
      else if (range === "last50") startIndex = Math.max(0, totalLength - 50);
      else if (range === "last1000") startIndex = Math.max(0, totalLength - 1000);
      indicesToKeep = Array.from({ length: totalLength - startIndex }, (_, i) => i + startIndex);
    }

    const filteredData = {
      metrics: {},
      originalIndices: indicesToKeep,
    };

    const keysToFilter = ["timestamp", "is_anomaly", "anomaly_score"];
    keysToFilter.forEach((key) => {
      if (data[key]) {
        filteredData[key] = indicesToKeep.map((index) => data[key][index]);
      }
    });

    if (data.metrics) {
      for (const metricKey in data.metrics) {
        if (data.metrics[metricKey]) {
          filteredData.metrics[metricKey] = indicesToKeep.map(
            (index) => data.metrics[metricKey][index]
          );
        }
      }
    }
    return filteredData;
  }, []);

  const processedData = useMemo(() => {
    if (!rawData) return null;
    return filterDataByRange(rawData, dataRange);
  }, [rawData, dataRange, filterDataByRange]);

  const getCssVariable = useCallback(
    (variable) =>
      getComputedStyle(document.documentElement)
        .getPropertyValue(variable)
        .trim(),
    []
  );

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

  const createHistogram = useCallback((data, bins) => {
    if (!data?.length) return { labels: [], counts: [] };
    const values = data.filter((v) => isFinite(v));
    if (!values.length) return { labels: [], counts: [] };
    const min = Math.min(...values), max = Math.max(...values);
    const binSize = max === min ? 1 : (max - min) / bins;
    const counts = new Array(bins).fill(0);
    const labels = Array.from({ length: bins }, (_, i) =>
        `${(min + i * binSize).toFixed(1)}-${(min + (i + 1) * binSize).toFixed(1)}`
    );
    values.forEach((v) => {
      let binIndex = Math.floor((v - min) / binSize);
      counts[Math.max(0, Math.min(bins - 1, binIndex))]++;
    });
    return { labels, counts, };
  }, []);

  const createMainChart = useCallback((data) => {
    const canvas = mainChartRef.current;
    if (!canvas || !data?.timestamp?.length || !primaryMetric || !secondaryMetric) {
      destroyChart(mainChartRef);
      return;
    }
    destroyChart(mainChartRef);
    const ctx = canvas.getContext("2d");

    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        const total = data.timestamp.length;
        if (total < 50) {
            return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } else if (total < 500) {
            return date.toLocaleString('id-ID', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString('id-ID', { month: 'short', day: '2-digit' });
        }
    };

    const normalPoints = [], anomalyPoints = [];
    data.timestamp.forEach((timestamp, index) => {
        const point = {
            x: formatTimestamp(timestamp),
            y: data.metrics[primaryMetric]?.[index],
            y2: data.metrics[secondaryMetric]?.[index],
            score: data.anomaly_score?.[index],
            originalIndex: data.originalIndices[index],
            isAnomaly: data.is_anomaly[index] === 1,
        };
        if (point.y === undefined || point.y2 === undefined) return;
        point.isAnomaly ? anomalyPoints.push(point) : normalPoints.push(point);
    });

    const allChartPoints = [...normalPoints, ...anomalyPoints].sort(
        (a, b) => a.originalIndex - b.originalIndex
    );

    const datasets = [];

    datasets.push({
        label: `${formatHeaderToUnit(primaryMetric)}`,
        data: allChartPoints.map(p => ({ x: p.originalIndex, y: p.y })),
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 6,
        tension: 0.3,
        hidden: !(chartType === 'line' || chartType === 'both'),
        segment: {
            borderColor: ctx => {
                const p1_isAnomaly = allChartPoints[ctx.p1DataIndex]?.isAnomaly;
                return p1_isAnomaly ? getCssVariable('--color-danger') : getCssVariable('--color-primary');
            },
        },
    });

    datasets.push({
        label: `${formatHeaderToUnit(secondaryMetric)}`,
        data: allChartPoints.map(p => ({ x: p.originalIndex, y: p.y2 })),
        yAxisID: "y1",
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 6,
        tension: 0.3,
        hidden: !(chartType === 'line' || chartType === 'both'),
        segment: {
            borderColor: ctx => {
                const p1_isAnomaly = allChartPoints[ctx.p1DataIndex]?.isAnomaly;
                return p1_isAnomaly ? getCssVariable('--color-warning') : getCssVariable('--color-secondary');
            },
        },
    });

    if (anomalyPoints.length > 0) {
        datasets.push({
            label: `Anomali ${primaryMetric}`,
            data: anomalyPoints.map(d => ({ x: d.originalIndex, y: d.y })),
            backgroundColor: getCssVariable("--color-danger"),
            type: "scatter",
            pointRadius: 8,
            pointStyle: 'triangle',
            hidden: !(chartType === 'scatter' || chartType === 'both'),
        });
        datasets.push({
            label: `Anomali ${secondaryMetric}`,
            data: anomalyPoints.map(d => ({ x: d.originalIndex, y: d.y2 })),
            backgroundColor: getCssVariable("--color-warning"),
            yAxisID: "y1",
            type: "scatter",
            pointRadius: 8,
            pointStyle: 'star',
            hidden: !(chartType === 'scatter' || chartType === 'both'),
        });
    }

    canvas.chart = new Chart.Chart(ctx, {
        type: "line",
        data: {
            labels: allChartPoints.map(p => p.originalIndex),
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            parsing: false,
            normalized: true,
            interaction: {
                intersect: false,
                mode: "index",
            },
            plugins: {
                legend: {
                    position: "top",
                    labels: {
                        color: getCssVariable("--text-main"),
                        font: { size: 13, weight: '500' },
                        padding: 15,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: getCssVariable("--bg-card"),
                    titleColor: getCssVariable("--text-main"),
                    bodyColor: getCssVariable("--text-main"),
                    borderColor: getCssVariable("--border-card"),
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        title: function(context) {
                            const pointIndex = context[0].dataIndex;
                            const originalDataIndex = allChartPoints[pointIndex]?.originalIndex;
                            if (rawData && rawData.timestamp && originalDataIndex !== undefined) {
                                const timestamp = rawData.timestamp[originalDataIndex];
                                return new Date(timestamp).toLocaleString('id-ID');
                            }
                            return '';
                        },
                        afterBody: function(context) {
                            const pointIndex = context[0].dataIndex;
                            const point = allChartPoints[pointIndex];
                            if (point?.isAnomaly) {
                                const originalDataIndex = point.originalIndex;
                                return `Skor Anomali: ${rawData.anomaly_score[originalDataIndex]?.toFixed(3)}`;
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: "Waktu", color: getCssVariable("--text-main"), font: { size: 14, weight: '600' } },
                    ticks: {
                        color: getCssVariable("--text-muted"),
                        maxTicksLimit: 10,
                        font: { size: 11 },
                        callback: function(value) {
                            const originalDataIndex = this.getLabelForValue(value);
                            const timestamp = rawData.timestamp[originalDataIndex];
                            if(timestamp) {
                               return formatTimestamp(timestamp).split(',')[0];
                            }
                            return value;
                        }
                    },
                    grid: { color: getCssVariable("--border-card"), lineWidth: 0.5 }
                },
                y: {
                    position: "left",
                    title: { display: true, text: formatHeaderToUnit(primaryMetric), color: getCssVariable("--text-main"), font: { size: 14, weight: '600' } },
                    ticks: { color: getCssVariable("--text-muted"), font: { size: 11 } },
                    grid: { color: getCssVariable("--border-card"), lineWidth: 0.5 }
                },
                y1: {
                    position: "right",
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: formatHeaderToUnit(secondaryMetric), color: getCssVariable("--text-main"), font: { size: 14, weight: '600' } },
                    ticks: { color: getCssVariable("--text-muted"), font: { size: 11 } }
                }
            }
        },
    });
  }, [chartType, getCssVariable, primaryMetric, secondaryMetric, rawData, destroyChart, formatHeaderToUnit]);

  const createDistributionChart = useCallback((data) => {
    const canvas = distributionChartRef.current;
    if (!canvas || !data?.metrics?.[primaryMetric] || !data?.metrics?.[secondaryMetric]) {
        destroyChart(distributionChartRef);
        return;
    }
    destroyChart(distributionChartRef);
    const allMeasurements = [...data.metrics[primaryMetric], ...data.metrics[secondaryMetric]];
    const bins = createHistogram(allMeasurements, HISTOGRAM_BINS);
    canvas.chart = new Chart.Chart(canvas.getContext("2d"), {
        type: "bar",
        data: {
            labels: bins.labels,
            datasets: [{ data: bins.counts, backgroundColor: getCssVariable("--color-primary") }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
        },
    });
  }, [createHistogram, getCssVariable, primaryMetric, secondaryMetric, destroyChart]);

  const createScoreChart = useCallback((data) => {
    const canvas = scoreChartRef.current;
    if (!canvas || !data?.anomaly_score?.length) {
        destroyChart(scoreChartRef);
        return;
    }
    destroyChart(scoreChartRef);
    const anomalyScoresOnly = data.anomaly_score.filter((_, i) => data.is_anomaly[i] === 1);
    const scoreBins = createHistogram(anomalyScoresOnly, SCORE_BINS);
    canvas.chart = new Chart.Chart(canvas.getContext("2d"), {
        type: "bar",
        data: {
            labels: scoreBins.labels,
            datasets: [{ data: scoreBins.counts, backgroundColor: getCssVariable("--color-danger") }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
        },
    });
  }, [createHistogram, getCssVariable, destroyChart]);

  const downloadPdf = async () => {
    if (!resultsVisible || !processedData) {
      showMessage("Tidak ada data untuk diunduh.", "warning");
      return;
    }

    setLoading(true);
    showMessage("Membuat laporan PDF...", "info");

    try {
      if (typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined' || typeof window.jspdf.API.autoTable === 'undefined') {
        throw new Error("Library PDF belum siap. Coba lagi.");
      }
      
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF("p", "pt", "a4");
      const margin = 40;
      let yPos = margin;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      pdf.setFontSize(22);
      pdf.setTextColor(getCssVariable("--text-main-rgb").split(',').map(Number));
      pdf.text("Laporan Analisis Anomali IoT", margin, yPos);
      yPos += 30;

      pdf.setFontSize(12);
      pdf.setTextColor(getCssVariable("--text-main-rgb").split(',').map(Number));
      const date = new Date().toLocaleDateString("id-ID", {
        year: "numeric", month: "long", day: "numeric",
      });
      const time = new Date().toLocaleTimeString("id-ID");
      pdf.text(`Tanggal: ${date} ${time}`, margin, yPos);
      yPos += 20;

      const addSectionTitle = (title) => {
        yPos += 20;
        if (yPos + 30 > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.setFontSize(16);
        pdf.setTextColor(getCssVariable("--color-primary-rgb").split(',').map(Number));
        pdf.text(title, margin, yPos);
        yPos += 20;
        pdf.setTextColor(getCssVariable("--text-main-rgb").split(',').map(Number));
        pdf.setFontSize(12);
      };

      addSectionTitle("Ringkasan Data");
      const summaryText = [
        `Total Poin Data: ${summaryStats.total_points.toLocaleString()}`,
        `Jumlah Anomali Terdeteksi: ${summaryStats.num_anomalies.toLocaleString()}`,
        `Poin Normal: ${(summaryStats.total_points - summaryStats.num_anomalies).toLocaleString()}`,
        `Persentase Anomali: ${summaryStats.anomaly_percentage}%`,
        `Sensitivitas (Kontaminasi): ${Math.round(contamination * 100)}%`,
        `File Analisis: ${fileSelected ? fileSelected.name : "N/A"}`
      ];
      summaryText.forEach(line => {
        if (yPos + 15 > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
          pdf.setFontSize(12);
        }
        pdf.text(line, margin, yPos);
        yPos += 15;
      });

      addSectionTitle("Grafik Utama: Tren Sensor dan Anomali");
      if (mainChartRef.current) {
        const mainChartCanvas = await html2canvas(mainChartRef.current);
        const imgData = mainChartCanvas.toDataURL("image/png");
        const imgWidth = pageWidth - 2 * margin;
        const imgHeight = (mainChartCanvas.height * imgWidth) / mainChartCanvas.width;
        if (yPos + imgHeight + 20 > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.addImage(imgData, "PNG", margin, yPos, imgWidth, imgHeight);
        yPos += imgHeight + 10;
      }

      addSectionTitle("Distribusi Data Metrik");
      if (distributionChartRef.current) {
        const distChartCanvas = await html2canvas(distributionChartRef.current);
        const imgData = distChartCanvas.toDataURL("image/png");
        const imgWidth = (pageWidth - 2 * margin) / 2 - 10;
        const imgHeight = (distChartCanvas.height * imgWidth) / distChartCanvas.width;
        if (yPos + imgHeight + 20 > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.addImage(imgData, "PNG", margin, yPos, imgWidth, imgHeight);
      }

      addSectionTitle("Sebaran Skor Anomali");
      if (scoreChartRef.current) {
        const scoreChartCanvas = await html2canvas(scoreChartRef.current);
        const imgData = scoreChartCanvas.toDataURL("image/png");
        const imgWidth = (pageWidth - 2 * margin) / 2 - 10;
        const imgHeight = (scoreChartCanvas.height * imgWidth) / scoreChartCanvas.width;
        if (distributionChartRef.current && scoreChartRef.current && (yPos + imgHeight + 20 <= pageHeight - margin)) {
          pdf.addImage(imgData, "PNG", margin + (pageWidth - 2 * margin) / 2 + 10, yPos, imgWidth, imgHeight);
          yPos += imgHeight + 10;
        } else {
          pdf.addPage();
          yPos = margin;
          pdf.addImage(imgData, "PNG", margin, yPos, imgWidth, imgHeight);
          yPos += imgHeight + 10;
        }
      }

      addSectionTitle("Daftar Anomali Teratas");
      const anomaliesTableData = anomaliesList.slice(0, displayedAnomalies).map(a => [
        a.timeString,
        a.primary?.toFixed(2),
        a.secondary?.toFixed(2),
        a.score?.toFixed(3),
      ]);
      const tableHeaders = ["Waktu", formatHeaderToUnit(primaryMetric), formatHeaderToUnit(secondaryMetric), "Skor Anomali"];

      const tableConfig = {
        startY: yPos,
        head: [tableHeaders],
        body: anomaliesTableData,
        theme: 'striped',
        headStyles: { fillColor: getCssVariable("--color-primary-rgb").split(',').map(Number), textColor: [255,255,255], fontStyle: 'bold' },
        bodyStyles: { textColor: getCssVariable("--text-main-rgb").split(',').map(Number) },
        margin: { left: margin, right: margin },
        didDrawPage: (data) => {
          yPos = data.cursor.y;
        },
        pageBreak: 'auto',
        autoSize: true,
      };

      if (anomaliesTableData.length > 0) {
        pdf.autoTable(tableConfig);
      } else {
        if (yPos + 15 > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.text("Tidak ada anomali terdeteksi.", margin, yPos);
        yPos += 15;
      }
      
      pdf.save("Laporan-Anomali-IoT.pdf");
      showMessage("Laporan PDF berhasil diunduh!", "success");
    } catch (error) {
      console.error("Gagal membuat PDF:", error);
      showMessage(`Gagal mengunduh PDF: ${error.message || "Terjadi kesalahan"}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileSelected(file);
    setFileDisplayContent({
      icon: "📈",
      name: file.name,
      details: `✅ Siap dianalisis (${(file.size / 1024).toFixed(1)} KB)`,
      color: "var(--color-secondary)",
    });
  }, []);

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
    formData.append("contamination", contamination);
    try {
      const response = await fetch(`${API_BASE_URL}/api/upload_csv`, { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Error server.");
      showMessage(result.message, "success");
      setRawData(result.chart_data);
      updateSummaryStats(result);
      const metricKeys = Object.keys(result.chart_data.metrics || {});
      setDetectedMetrics(metricKeys);
      setPrimaryMetric(metricKeys.find((k) => k.toLowerCase().includes("temperature")) || metricKeys[0] || null);
      setSecondaryMetric(metricKeys.find((k) => k !== (metricKeys.find((k) => k.toLowerCase().includes("temperature")) || metricKeys[0])) || metricKeys[1] || null);
      setView("dashboard");
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
    setDataRange("all");
    setDetectedMetrics([]);
    setPrimaryMetric(null);
    setSecondaryMetric(null);
    setView("dashboard");
    if (csvFileInputRef.current) csvFileInputRef.current.value = "";
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
  }, [destroyChart]);

  const toggleTheme = useCallback(() => setCurrentTheme((p) => (p === "default" ? "dark-theme" : "default")), []);

  useEffect(() => {
    document.documentElement.className = currentTheme;
    if (rawData) {
      localStorage.setItem("theme", currentTheme);
    }
  }, [currentTheme, rawData]);

  const anomaliesList = useMemo(() => {
    if (!processedData || !primaryMetric || !secondaryMetric) {
      return [];
    }
    const anomalies = [];
    for (let i = 0; i < processedData.timestamp.length; i++) {
      if (processedData.is_anomaly[i] === 1 && processedData.timestamp[i]) {
        const timestamp = new Date(processedData.timestamp[i]);
        if (!isNaN(timestamp.getTime())) {
          anomalies.push({
            time: timestamp,
            timeString: timestamp.toLocaleString("id-ID", { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
            primary: processedData.metrics[primaryMetric]?.[i],
            secondary: processedData.metrics[secondaryMetric]?.[i],
            score: processedData.anomaly_score?.[i],
            index: processedData.originalIndices[i],
          });
        }
      }
    }
    return anomalies
      .filter((item) => item && item.primary !== undefined && item.secondary !== undefined && item.score !== undefined)
      .sort((a, b) => b.score - a.score);
  }, [processedData, primaryMetric, secondaryMetric]);

  const renderAnomalyItem = (anomaly, index) => (
    <div key={`${anomaly.time.getTime()}-${index}`} className="anomaly-item" onClick={() => handleAnomalyClick(anomaly)}>
      <div>
        <strong>⏰ {anomaly.timeString}</strong><br />
        <small style={{ color: "var(--text-muted)" }}>
          {formatHeaderToUnit(primaryMetric)}: <span style={{ fontWeight: "600" }}>{anomaly.primary?.toFixed(2)}</span>
        </small><br />
        <small style={{ color: "var(--text-muted)" }}>
          {formatHeaderToUnit(secondaryMetric)}: <span style={{ fontWeight: "600" }}>{anomaly.secondary?.toFixed(2)}</span>
        </small>
      </div>
      <span className="anomaly-score">🎯 {anomaly.score?.toFixed(3)}</span>
    </div>
  );

  useEffect(() => {
    if (view === "dashboard" && resultsVisible && processedData) {
      createMainChart(processedData);
      createDistributionChart(processedData);
      createScoreChart(processedData);
    }
  }, [view, resultsVisible, processedData, createMainChart, createDistributionChart, createScoreChart]);

  useEffect(() => {
    const loadScript = (src, id) =>
      new Promise((resolve, reject) => {
        if (document.getElementById(id)) return resolve();
        const script = document.createElement("script");
        script.src = src;
        script.id = id;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Script load error for ${src}`));
        document.head.appendChild(script);
      });

    const loadPdfScripts = async () => {
      try {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", "html2canvas-script");
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", "jspdf-script");
        // Pastikan jspdf sudah terload sebelum mencoba me-load plugin autotable
        if (window.jspdf) {
          await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.14/jspdf.plugin.autotable.min.js", "jspdf-autotable-script");
        }
      } catch (error) {
        console.error("Gagal memuat script PDF:", error);
        showMessage("Gagal memuat fungsi PDF. Silakan coba refresh.", "error");
      }
    };

    loadPdfScripts();

    return () => {
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
      destroyChart(mainChartRef);
      destroyChart(distributionChartRef);
      destroyChart(scoreChartRef);
    };
  }, [destroyChart, showMessage]);

  if (view === "detail") {
    return (
      <AnomalyDetail
        anomaly={selectedAnomaly}
        fullRawData={rawData}
        onBack={() => setView("dashboard")}
        primaryMetric={primaryMetric}
        secondaryMetric={secondaryMetric}
      />
    );
  }

  return (
    <div className="app-container">
      <div className="container">
        <div className="header">
          <div className="header-content">
            <h1>🔍 IoT Anomaly Insights</h1>
            <p>⚡ Deteksi anomali untuk data sensor IoT.</p>
          </div>
        </div>
        <div className="main-content">
          <div className="dataset-link-container">
            <p>
              Data simulasi untuk pengujian dibuat berdasarkan struktur dari:{" "}
              <a href="https://www.kaggle.com/datasets/hkayan/anomliot" target="_blank" rel="noopener noreferrer">
                Kaggle Anomaliot Dataset 🔗
              </a>
            </p>
          </div>
          <div className="card upload-section">
            <h2 className="card-title">📂 Masukkan Data</h2>
            <div className="file-input-wrapper">
              <input type="file" id="csvFile" accept=".csv" onChange={handleFileChange} ref={csvFileInputRef} style={{ display: "none" }} />
              <div className="file-input-display" onClick={handleFileDisplayClick}>
                <strong>{fileDisplayContent.icon} {fileDisplayContent.name}</strong>
                <br />
                <span style={{ color: fileDisplayContent.color }}>
                  {fileDisplayContent.details}
                </span>
              </div>
            </div>
            <div className="contamination-slider">
              <label htmlFor="contamination">
                Sensitivitas Anomali: <strong>{Math.round(contamination * 100)}%</strong>
              </label>
              <p>Geser untuk mengatur persentase data yang dianggap anomali.</p>
              <input type="range" id="contamination" min="0.01" max="0.20" step="0.01" value={contamination} onChange={(e) => setContamination(parseFloat(e.target.value))} />
            </div>
            <div className="button-group">
              <button className="btn btn-primary" onClick={uploadCsv} disabled={loading || !fileSelected}>
                🚀 Analisis & Latih Ulang
              </button>
              <button className="btn btn-danger" onClick={clearDataAndReload} disabled={loading}>
                🔄 Bersihkan & Atur Ulang
              </button>
            </div>
          </div>
          {loading && (
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Menganalisis data, harap tunggu...</p>
            </div>
          )}
          {message && <div className={`message-box ${messageType}`}>{message}</div>}
          {resultsVisible && (
            <div className="results-section show">
              <div className="stats-grid">
                <div className="stat-card"><h3>📊 {summaryStats.total_points.toLocaleString()}</h3><p>Total Poin</p></div>
                <div className="stat-card"><h3>⚠️ {summaryStats.num_anomalies.toLocaleString()}</h3><p>Anomali</p></div>
                <div className="stat-card"><h3>✅ {(summaryStats.total_points - summaryStats.num_anomalies).toLocaleString()}</h3><p>Normal</p></div>
                <div className="stat-card"><h3>📈 {summaryStats.anomaly_percentage}%</h3><p>Tingkat Anomali</p></div>
              </div>
              <div className="card">
                <h2 className="card-title">📈 Analisis Tren Sensor</h2>
                <div className="controls">
                  <div className="control-group">
                    <label>Tipe Visualisasi</label>
                    <select value={chartType} onChange={(e) => setChartType(e.target.value)}>
                      <option value="line">Grafik Garis</option>
                      <option value="scatter">Diagram Sebar</option>
                      <option value="both">Tampilan Gabungan</option>
                    </select>
                  </div>
                  <div className="control-group">
                    <label>Jendela Data</label>
                    <select value={dataRange} onChange={(e) => setDataRange(e.target.value)}>
                      <option value="all">Semua Data</option>
                      <option value="last1000">1000 Terakhir</option>
                      <option value="last100">100 Terakhir</option>
                      <option value="last50">50 Terakhir</option>
                      <option value="anomalies">Hanya Anomali</option>
                    </select>
                  </div>
                  {detectedMetrics.length > 1 && (
                    <>
                      <div className="control-group">
                        <label>Y-Axis Kiri</label>
                        <select value={primaryMetric || ''} onChange={(e) => setPrimaryMetric(e.target.value)}>
                          {detectedMetrics.filter(m => m !== secondaryMetric).map(metric => <option key={metric} value={metric}>{formatHeaderToUnit(metric)}</option>)}
                        </select>
                      </div>
                      <div className="control-group">
                        <label>Y-Axis Kanan</label>
                        <select value={secondaryMetric || ''} onChange={(e) => setSecondaryMetric(e.target.value)}>
                          {detectedMetrics.filter(m => m !== primaryMetric).map(metric => <option key={metric} value={metric}>{formatHeaderToUnit(metric)}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                </div>
                <div id="mainChartContainer" className="chart-container large"><canvas id="mainChartCanvas" ref={mainChartRef}></canvas></div>
              </div>
              <div className="charts-container">
                <div className="card"><h2 className="card-title">📊 Distribusi Gabungan</h2><div className="chart-container"><canvas id="distChartCanvas" ref={distributionChartRef}></canvas></div></div>
                <div className="card"><h2 className="card-title">🎯 Sebaran Skor Anomali</h2><div className="chart-container"><canvas id="scoreChartCanvas" ref={scoreChartRef}></canvas></div></div>
              </div>
{/*               <div className="download-pdf-section" style={{ textAlign: "center", marginTop: "20px" }}>
                <button className="btn btn-secondary" onClick={downloadPdf} disabled={loading || !fileSelected}>
                  📥 Unduh Laporan PDF
                </button>
              </div> */}
            </div>
          )}
        </div>
        {resultsVisible && (
          <div className="sidebar-content">
            <div className="card anomaly-list">
              <h2 className="card-title">🚨 Peringatan Anomali</h2>
              <div id="anomaliesContainer">
                {anomaliesList.slice(0, displayedAnomalies).map((anomaly, index) => renderAnomalyItem(anomaly, index))}
                {anomaliesList.length > displayedAnomalies && (
                  <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <button className="btn btn-primary" onClick={() => setDisplayedAnomalies(prev => prev + ANOMALY_PAGE_SIZE)}>
                      Muat Lebih Banyak
                    </button>
                  </div>
                )}
                {anomaliesList.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>✅ Tidak ada anomali terdeteksi.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className={`modal-overlay ${showConfirmModal ? "show" : ""}`}>
        <div className="modal-content">
          <h3 className="modal-title">Konfirmasi Reset</h3>
          <p>Yakin mau hapus semua data dan atur ulang aplikasi?</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>Batal</button>
            <button className="btn btn-danger" onClick={executeReset}>Reset</button>
          </div>
        </div>
      </div>
      <div className="fab theme-toggle" onClick={toggleTheme} title="Ganti Tema">
        💡
      </div>
    </div>
  );
}

export default App;
