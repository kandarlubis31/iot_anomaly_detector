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

  const [contamination, setContamination] = useState(0.05);
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

    const filteredData = {
        metrics: {},
        originalIndices: indicesToKeep 
    };

    const keysToFilter = ['timestamp', 'is_anomaly', 'anomaly_score'];
    keysToFilter.forEach(key => {
        if (data[key]) {
            filteredData[key] = indicesToKeep.map(index => data[key][index]);
        }
    });

    if (data.metrics) {
        for (const metricKey in data.metrics) {
            if(data.metrics[metricKey]) {
               filteredData.metrics[metricKey] = indicesToKeep.map(index => data.metrics[metricKey][index]);
            }
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

  const createHistogram = useCallback((data, bins) => {
    if (!data?.length) return {
      labels: [],
      counts: []
    };
    const values = data.filter(v => isFinite(v));
    if (!values.length) return {
      labels: [],
      counts: []
    };
    const min = Math.min(...values),
      max = Math.max(...values);
    const binSize = max === min ? 1 : (max - min) / bins;
    const counts = new Array(bins).fill(0);
    const labels = Array.from({
      length: bins
    }, (_, i) => `${(min + i * binSize).toFixed(1)}-${(min + (i + 1) * binSize).toFixed(1)}`);
    values.forEach(v => {
      let binIndex = Math.floor((v - min) / binSize);
      counts[Math.max(0, Math.min(bins - 1, binIndex))]++;
    });
    return {
      labels,
      counts
    };
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
            return date.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } else if (total < 500) {
            return date.toLocaleString('id-ID', {
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            return date.toLocaleDateString('id-ID', {
                month: 'short',
                day: '2-digit'
            });
        }
    };

    const normalPoints = [],
        anomalyPoints = [];
    data.timestamp.forEach((timestamp, index) => {
        const point = {
            x: formatTimestamp(timestamp),
            y: data.metrics[primaryMetric]?.[index],
            y2: data.metrics[secondaryMetric]?.[index],
            score: data.anomaly_score?.[index],
            originalIndex: data.originalIndices[index]
        };
        if (point.y === undefined || point.y2 === undefined) return;
        data.is_anomaly[index] === 1 ? anomalyPoints.push(point) : normalPoints.push(point);
    });

    const datasets = [];

    if (normalPoints.length > 0 && (chartType === "line" || chartType === "both")) {
        datasets.push({
            label: `${formatHeaderToUnit(primaryMetric)} (Normal)`,
            data: normalPoints.map(d => ({ x: d.originalIndex, y: d.y })),
            borderColor: getCssVariable("--color-primary"),
            backgroundColor: getCssVariable("--color-primary") + '20',
            type: "line",
            borderWidth: 2.5,
            fill: false,
            tension: 0.3,
            pointRadius: 1,
            pointHoverRadius: 6
        }, {
            label: `${formatHeaderToUnit(secondaryMetric)} (Normal)`,
            data: normalPoints.map(d => ({ x: d.originalIndex, y: d.y2 })),
            borderColor: getCssVariable("--color-secondary"),
            backgroundColor: getCssVariable("--color-secondary") + '20',
            yAxisID: "y1",
            type: "line",
            borderWidth: 2.5,
            fill: false,
            tension: 0.3,
            pointRadius: 1,
            pointHoverRadius: 6
        });
    }

    if (anomalyPoints.length > 0 && (chartType === "scatter" || chartType === "both")) {
        datasets.push({
            label: `${formatHeaderToUnit(primaryMetric)} (Anomali)`,
            data: anomalyPoints.map(d => ({
                x: d.originalIndex,
                y: d.y,
                score: d.score
            })),
            backgroundColor: getCssVariable("--color-danger"),
            borderColor: '#ffffff',
            borderWidth: 2,
            type: "scatter",
            pointRadius: 8,
            pointStyle: 'triangle',
            pointHoverRadius: 12
        }, {
            label: `${formatHeaderToUnit(secondaryMetric)} (Anomali)`,
            data: anomalyPoints.map(d => ({
                x: d.originalIndex,
                y: d.y2,
                score: d.score
            })),
            backgroundColor: getCssVariable("--color-warning"),
            borderColor: '#ffffff',
            borderWidth: 2,
            yAxisID: "y1",
            type: "scatter",
            pointRadius: 8,
            pointStyle: 'star',
            pointHoverRadius: 12
        });
    }

    canvas.chart = new Chart.Chart(ctx, {
        type: 'line',
        data: {
            labels: data.timestamp.map((ts) => formatTimestamp(ts)),
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            parsing: false,
            normalized: true,
            interaction: {
                intersect: false,
                mode: 'index'
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
                            const originalDataIndex = context[0].dataset.data[pointIndex].x;
                            if (rawData && rawData.timestamp && rawData.timestamp[originalDataIndex]) {
                                const timestamp = rawData.timestamp[originalDataIndex];
                                return new Date(timestamp).toLocaleString('id-ID');
                            }
                            return '';
                        },
                        afterBody: function(context) {
                           const pointIndex = context[0].dataIndex;
                           const originalDataIndex = context[0].dataset.data[pointIndex].x;
                           if (rawData && rawData.is_anomaly && rawData.is_anomaly[originalDataIndex] === 1) {
                               return `Skor Anomali: ${rawData.anomaly_score[originalDataIndex]?.toFixed(3)}`;
                           }
                           return '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: "Waktu",
                        color: getCssVariable("--text-main"),
                        font: { size: 14, weight: '600' }
                    },
                    ticks: {
                        color: getCssVariable("--text-muted"),
                        maxTicksLimit: 10,
                        font: { size: 11 },
                         callback: function(value) {
                           const label = this.getLabelForValue(value);
                           return typeof label === 'string' ? label.split(',')[0] : label;
                        }
                    },
                    grid: {
                        color: getCssVariable("--border-card"),
                        lineWidth: 0.5
                    }
                },
                y: {
                    position: "left",
                    title: {
                        display: true,
                        text: formatHeaderToUnit(primaryMetric),
                        color: getCssVariable("--text-main"),
                        font: { size: 14, weight: '600' }
                    },
                    ticks: {
                        color: getCssVariable("--text-muted"),
                        font: { size: 11 }
                    },
                    grid: {
                        color: getCssVariable("--border-card"),
                        lineWidth: 0.5
                    }
                },
                y1: {
                    position: "right",
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: formatHeaderToUnit(secondaryMetric),
                        color: getCssVariable("--text-main"),
                        font: { size: 14, weight: '600' }
                    },
                    ticks: {
                        color: getCssVariable("--text-muted"),
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}, [chartType, getCssVariable, primaryMetric, secondaryMetric, rawData]);

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
        datasets: [{
          data: bins.counts,
          backgroundColor: getCssVariable("--color-primary")
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }, [createHistogram, getCssVariable, primaryMetric, secondaryMetric, currentTheme]);

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
        datasets: [{
          data: scoreBins.counts,
          backgroundColor: getCssVariable("--color-danger")
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }, [createHistogram, getCssVariable, currentTheme]);

  const downloadPdf = async () => {
    if (!window.html2canvas || !window.jspdf || !rawData) {
        showMessage("Library PDF atau data belum siap.", "warning");
        return;
    }

    showMessage("Mempersiapkan laporan PDF...", "info");
    setLoading(true);

    const pdfRenderContainer = document.createElement('div');
    document.body.appendChild(pdfRenderContainer);

    pdfRenderContainer.style.position = 'absolute';
    pdfRenderContainer.style.left = '-9999px';
    pdfRenderContainer.style.top = '0px';
    pdfRenderContainer.style.width = '1200px'; 
    pdfRenderContainer.style.padding = '40px';
    pdfRenderContainer.style.backgroundColor = '#ffffff';
    pdfRenderContainer.style.fontFamily = "'Open Sans', sans-serif";
    
    const LIGHT_THEME_COLORS = {
        primary: '#007bff',
        secondary: '#28a745',
        danger: '#dc3545',
        warning: '#ffc107',
        textMain: '#212529',
        textMuted: '#6c757d',
        bgCard: '#ffffff',
        borderDefault: '#dee2e6',
        borderCard: '#e9ecef',
        fontFamily: "'Open Sans', sans-serif"
    };

    try {
        const createOffscreenChart = (chartConfig) => {
            const canvas = document.createElement('canvas');
            canvas.width = chartConfig.width || 800;
            canvas.height = chartConfig.height || 450;
            new Chart.Chart(canvas, { ...chartConfig.config, options: { ...chartConfig.config.options, animation: false, responsive: false, maintainAspectRatio: true } });
            return canvas.toDataURL('image/jpeg', 0.9);
        };
        
        const chartConfigs = {
            main: {
                width: 1100,
                height: 550,
                config: {
                    type: 'line',
                    data: {
                        labels: rawData.timestamp,
                        datasets: [
                            { label: `${formatHeaderToUnit(primaryMetric)} (Normal)`, data: rawData.metrics[primaryMetric].map((y, x) => ({ x, y })), borderColor: LIGHT_THEME_COLORS.primary, type: "line", borderWidth: 2, tension: 0.2, pointRadius: 0 },
                            { label: `${formatHeaderToUnit(secondaryMetric)} (Normal)`, data: rawData.metrics[secondaryMetric].map((y, x) => ({ x, y })), borderColor: LIGHT_THEME_COLORS.secondary, yAxisID: "y1", type: "line", borderWidth: 2, tension: 0.2, pointRadius: 0 },
                            { label: `${formatHeaderToUnit(primaryMetric)} (Anomali)`, data: rawData.metrics[primaryMetric].map((y, x) => rawData.is_anomaly[x] ? { x, y } : null).filter(p => p), backgroundColor: LIGHT_THEME_COLORS.danger, type: "scatter", pointRadius: 6, pointStyle: 'triangle' },
                            { label: `${formatHeaderToUnit(secondaryMetric)} (Anomali)`, data: rawData.metrics[secondaryMetric].map((y, x) => rawData.is_anomaly[x] ? { x, y } : null).filter(p => p), backgroundColor: LIGHT_THEME_COLORS.warning, yAxisID: "y1", type: "scatter", pointRadius: 6, pointStyle: 'star' }
                        ].filter(d => d.data.length > 0)
                    },
                    options: {
                        plugins: { legend: { position: "top", labels: { color: LIGHT_THEME_COLORS.textMain, font: { size: 14 } } } },
                        scales: {
                            x: { title: { display: true, text: "Waktu", color: LIGHT_THEME_COLORS.textMain, font: { size: 16 } }, ticks: { color: LIGHT_THEME_COLORS.textMuted, beginAtZero: true } },
                            y: { position: "left", title: { display: true, text: formatHeaderToUnit(primaryMetric), color: LIGHT_THEME_COLORS.textMain, font: { size: 16 } }, ticks: { color: LIGHT_THEME_COLORS.textMuted, beginAtZero: true } },
                            y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: formatHeaderToUnit(secondaryMetric), color: LIGHT_THEME_COLORS.textMain, font: { size: 16 } }, ticks: { color: LIGHT_THEME_COLORS.textMuted, beginAtZero: true } },
                        },
                    }
                }
            },
            distribution: {
                config: {
                    type: 'bar',
                    data: { labels: createHistogram([...rawData.metrics[primaryMetric], ...rawData.metrics[secondaryMetric]], HISTOGRAM_BINS).labels, datasets: [{ data: createHistogram([...rawData.metrics[primaryMetric], ...rawData.metrics[secondaryMetric]], HISTOGRAM_BINS).counts, backgroundColor: LIGHT_THEME_COLORS.primary }] },
                    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: LIGHT_THEME_COLORS.textMuted } }, y: { ticks: { color: LIGHT_THEME_COLORS.textMuted } } } }
                }
            },
            score: {
                config: {
                    type: 'bar',
                    data: { labels: createHistogram(rawData.anomaly_score.filter((_, i) => rawData.is_anomaly[i]), SCORE_BINS).labels, datasets: [{ data: createHistogram(rawData.anomaly_score.filter((_, i) => rawData.is_anomaly[i]), SCORE_BINS).counts, backgroundColor: LIGHT_THEME_COLORS.danger }] },
                    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: LIGHT_THEME_COLORS.textMuted } }, y: { ticks: { color: LIGHT_THEME_COLORS.textMuted } } } }
                }
            }
        };

        const mainChartImg = createOffscreenChart(chartConfigs.main);
        const distChartImg = createOffscreenChart(chartConfigs.distribution);
        const scoreChartImg = createOffscreenChart(chartConfigs.score);
        
        pdfRenderContainer.innerHTML = `
            <div style="color: ${LIGHT_THEME_COLORS.textMain};">
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 32px;">
                    <div style="background: ${LIGHT_THEME_COLORS.bgCard}; border: 1px solid ${LIGHT_THEME_COLORS.borderCard}; border-radius: 8px; padding: 24px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                        <h3 style="font-size: 2.8rem; margin: 0; color: ${LIGHT_THEME_COLORS.textMain};">📊 ${summaryStats.total_points.toLocaleString()}</h3>
                        <p style="margin: 0; color: ${LIGHT_THEME_COLORS.textMuted};">Total Poin</p>
                    </div>
                    <div style="background: ${LIGHT_THEME_COLORS.bgCard}; border: 1px solid ${LIGHT_THEME_COLORS.borderCard}; border-radius: 8px; padding: 24px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                        <h3 style="font-size: 2.8rem; margin: 0; color: ${LIGHT_THEME_COLORS.danger};">⚠️ ${summaryStats.num_anomalies.toLocaleString()}</h3>
                        <p style="margin: 0; color: ${LIGHT_THEME_COLORS.textMuted};">Anomali</p>
                    </div>
                    <div style="background: ${LIGHT_THEME_COLORS.bgCard}; border: 1px solid ${LIGHT_THEME_COLORS.borderCard}; border-radius: 8px; padding: 24px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                        <h3 style="font-size: 2.8rem; margin: 0; color: ${LIGHT_THEME_COLORS.secondary};">✅ ${(summaryStats.total_points - summaryStats.num_anomalies).toLocaleString()}</h3>
                        <p style="margin: 0; color: ${LIGHT_THEME_COLORS.textMuted};">Normal</p>
                    </div>
                    <div style="background: ${LIGHT_THEME_COLORS.bgCard}; border: 1px solid ${LIGHT_THEME_COLORS.borderCard}; border-radius: 8px; padding: 24px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                        <h3 style="font-size: 2.8rem; margin: 0; color: ${LIGHT_THEME_COLORS.textMain};">📈 ${summaryStats.anomaly_percentage}%</h3>
                        <p style="margin: 0; color: ${LIGHT_THEME_COLORS.textMuted};">Tingkat Anomali</p>
                    </div>
                </div>

                <div style="background: ${LIGHT_THEME_COLORS.bgCard}; border: 1px solid ${LIGHT_THEME_COLORS.borderCard}; border-radius: 8px; padding: 24px; margin-bottom: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                    <h2 style="font-size: 1.5rem; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid ${LIGHT_THEME_COLORS.borderCard};">📈 Analisis Tren Sensor</h2>
                    <img src="${mainChartImg}" style="width: 100%; height: auto;" />
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px;">
                     <div style="background: ${LIGHT_THEME_COLORS.bgCard}; border: 1px solid ${LIGHT_THEME_COLORS.borderCard}; border-radius: 8px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                        <h2 style="font-size: 1.5rem; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid ${LIGHT_THEME_COLORS.borderCard};">📊 Distribusi Gabungan</h2>
                        <img src="${distChartImg}" style="width: 100%; height: auto;" />
                    </div>
                     <div style="background: ${LIGHT_THEME_COLORS.bgCard}; border: 1px solid ${LIGHT_THEME_COLORS.borderCard}; border-radius: 8px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                        <h2 style="font-size: 1.5rem; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid ${LIGHT_THEME_COLORS.borderCard};">🎯 Sebaran Skor Anomali</h2>
                        <img src="${scoreChartImg}" style="width: 100%; height: auto;" />
                    </div>
                </div>
            </div>
        `;

        await new Promise(resolve => setTimeout(resolve, 500));

        const pdfCanvas = await window.html2canvas(pdfRenderContainer, {
            scale: 2.0,
            useCORS: true,
            logging: false,
        });

        const imgData = pdfCanvas.toDataURL("image/jpeg", 0.8);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF("p", "mm", "a4");
        
        const imgWidth = 210;
        const pageHeight = 297;
        const imgHeight = (pdfCanvas.height * imgWidth) / pdfCanvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft > 0) {
            position -= pageHeight;
            pdf.addPage();
            pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        pdf.save("Laporan_Anomali_IoT.pdf");
        showMessage("Laporan PDF berhasil diunduh!", "success");

    } catch (error) {
        console.error("PDF Download Error:", error);
        showMessage("Gagal mengunduh PDF: " + error.message, "error");
    } finally {
        if (pdfRenderContainer) {
            document.body.removeChild(pdfRenderContainer);
        }
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
      const response = await fetch(`${API_BASE_URL}/api/upload_csv`, {
        method: "POST",
        body: formData
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Error server.");

      showMessage(result.message, "success");
      setRawData(result.chart_data);
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
    setView('dashboard');
    if (csvFileInputRef.current) csvFileInputRef.current.value = "";
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
  }, [destroyChart]);

  const toggleTheme = useCallback(() => setCurrentTheme(p => (p === "default" ? "dark-theme" : "default")), []);

  useEffect(() => {
    const styleId = 'dynamic-app-styles';
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
    }
    
    const improvedCSS = `
        .chart-container {
            position: relative;
            height: 400px;
            margin: 20px 0;
            background: var(--bg-card);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            border: 1px solid var(--border-card);
        }
        .chart-container.large { height: 500px; margin: 25px 0; }
        .controls {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
            padding: 20px;
            background: var(--bg-body);
            border-radius: 10px;
            border: 1px solid var(--border-card);
        }
        .control-group { display: flex; flex-direction: column; gap: 8px; }
        .control-group label { font-weight: 600; color: var(--text-secondary); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
        .control-group select { padding: 10px 14px; border: 2px solid var(--border-card); border-radius: 8px; background: var(--bg-card); color: var(--text-main); font-size: 14px; transition: all 0.2s ease; }
        .control-group select:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary)20; }
        .card { border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 6px 20px rgba(0,0,0,0.06); transition: box-shadow 0.3s ease; }
        .card:hover { box-shadow: 0 8px 30px rgba(0,0,0,0.1); }
        .card-title { margin: 0 0 20px 0; font-size: 1.4rem; font-weight: 700; padding-bottom: 12px; border-bottom: 2px solid var(--border-card); }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 32px; }
        .stat-card { background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-body) 100%); border-radius: 16px; padding: 28px 24px; text-align: center; box-shadow: 0 6px 20px rgba(0,0,0,0.08); transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .stat-card:hover { transform: translateY(-4px); box-shadow: 0 10px 30px rgba(0,0,0,0.15); }
        .stat-card h3 { font-size: 2.2rem; margin: 0 0 8px 0; font-weight: 800; background: linear-gradient(45deg, var(--color-primary), var(--color-accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .stat-card p { margin: 0; color: var(--text-muted); font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
        .anomaly-item { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; margin-bottom: 12px; background: var(--bg-body); border-radius: 12px; border-left: 4px solid var(--color-danger); cursor: pointer; transition: all 0.2s ease; border: 1px solid var(--border-card); }
        .anomaly-item:hover { background: var(--color-danger)10; transform: translateX(4px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .anomaly-score { background: var(--color-danger); color: white; padding: 6px 12px; border-radius: 20px; font-weight: 700; font-size: 12px; min-width: fit-content; }
        .loading-spinner { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; background: var(--bg-card); border-radius: 16px; margin: 20px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .spinner { width: 50px; height: 50px; border: 4px solid var(--border-card); border-top: 4px solid var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .loading-spinner p { color: var(--text-muted); font-weight: 500; margin: 0; }
        @media (max-width: 768px) {
            .controls { grid-template-columns: 1fr; gap: 12px; }
            .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 16px; }
            .chart-container, .chart-container.large { height: 300px; padding: 16px; }
        }
    `;
    styleElement.innerHTML = improvedCSS;

    return () => {
        const style = document.getElementById(styleId);
        if (style) {
            // It's generally better to leave styles injected by react, but if needed:
            // style.remove(); 
        }
    }
  }, []);

  useEffect(() => {
    document.documentElement.className = currentTheme;
    if (rawData) {
        localStorage.setItem('theme', currentTheme);
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
                      timeString: timestamp.toLocaleString('id-ID', {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                      }),
                      primary: processedData.metrics[primaryMetric]?.[i],
                      secondary: processedData.metrics[secondaryMetric]?.[i],
                      score: processedData.anomaly_score?.[i],
                      index: processedData.originalIndices[i]
                  });
              }
          }
      }

      return anomalies
          .filter(item =>
              item &&
              item.primary !== undefined &&
              item.secondary !== undefined &&
              item.score !== undefined
          )
          .sort((a, b) => b.score - a.score)
          .slice(0, ANOMALY_DISPLAY_LIMIT);
  }, [processedData, primaryMetric, secondaryMetric]);

  const renderAnomalyItem = (anomaly, index) => (
      <div
          key={`${anomaly.time.getTime()}-${index}`}
          className="anomaly-item"
          onClick={() => handleAnomalyClick(anomaly)}
      >
          <div>
              <strong>⏰ {anomaly.timeString}</strong><br />
              <small style={{ color: 'var(--text-muted)' }}>
                  {formatHeaderToUnit(primaryMetric)}: <span style={{ fontWeight: '600' }}>{anomaly.primary?.toFixed(2)}</span>
              </small><br />
              <small style={{ color: 'var(--text-muted)' }}>
                  {formatHeaderToUnit(secondaryMetric)}: <span style={{ fontWeight: '600' }}>{anomaly.secondary?.toFixed(2)}</span>
              </small>
          </div>
          <span className="anomaly-score">🎯 {anomaly.score?.toFixed(3)}</span>
      </div>
  );

  useEffect(() => {
    if (view === 'dashboard' && resultsVisible && processedData) {
      createMainChart(processedData);
      createDistributionChart(processedData);
      createScoreChart(processedData);
    }
  }, [view, resultsVisible, processedData, createMainChart, createDistributionChart, createScoreChart, currentTheme]);

  useEffect(() => {
    const loadScript = (src, id) => new Promise((resolve, reject) => {
      if (document.getElementById(id)) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.id = id;
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
              anomaly = {selectedAnomaly}
              fullRawData = {rawData}
              onBack = {() => setView('dashboard')}
              primaryMetric = {primaryMetric}
              secondaryMetric = {secondaryMetric}
            />;
  }

  return (
    <div className="app-container">
      <div className="container">
        <div className="header">
          <div className="header-content"><h1>🔍 IoT Anomaly Insights</h1><p>⚡ Deteksi anomali untuk data sensor IoT.</p></div>
        </div>
        
        <div className="main-content">
           <div className="dataset-link-container">
            <p>Data simulasi untuk pengujian dibuat berdasarkan struktur dari: <a href="https://www.kaggle.com/datasets/hkayan/anomliot" target="_blank" rel="noopener noreferrer">Kaggle Anomaliot Dataset 🔗</a></p>
          </div>
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
              <p>Geser untuk mengatur persentase data yang dianggap anomali.</p>
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
          {loading && <div className="loading-spinner"><div className="spinner"></div><p>Menganalisis data, harap tunggu...</p></div>}
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
              <div className="download-pdf-section" style={{ textAlign: "center", marginTop: "20px" }}>
                  <button className="btn btn-secondary" onClick={downloadPdf} disabled={loading || !fileSelected}>
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
                {anomaliesList.length > 0 ? (
                  anomaliesList.map((anomaly, index) => renderAnomalyItem(anomaly, index))
                ) : (
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
