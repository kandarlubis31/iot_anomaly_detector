import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import * as Chart from "chart.js";
import "./App.css";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

Chart.Chart.register(...Chart.registerables);

const REQUIRED_HEADERS = [
  "timestamp",
  "temperature",
  "power_consumption",
  "is_anomaly",
  "anomaly_score",
];

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  "https://iotanomalydetector-production.up.railway.app";
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
    const savedTheme = localStorage.getItem("theme");
    return savedTheme || "default";
  });

  const [summaryStats, setSummaryStats] = useState(DEFAULT_SUMMARY_STATS);
  const [rawData, setRawData] = useState(null);
  const [chartType, setChartType] = useState("line");
  const [dataRange, setDataRange] = useState("last1000");
  const [fileDisplayContent, setFileDisplayContent] =
    useState(DEFAULT_FILE_DISPLAY);

  const mainChartRef = useRef(null);
  const distributionChartRef = useRef(null);
  const scoreChartRef = useRef(null);
  const csvFileInputRef = useRef(null);
  const messageTimeoutRef = useRef(null);
  const pdfButtonRef = useRef(null);

  const filterDataByRange = useCallback((data, range) => {
    if (!data?.timestamps?.length) {
      return {
        timestamps: [],
        temperatures: [],
        power_consumptions: [],
        is_anomaly: [],
        anomaly_scores: [],
      };
    }

    const filteredTimestamps = [];
    const filteredTemperatures = [];
    const filteredPowerConsumptions = [];
    const filteredIsAnomaly = [];
    const filteredAnomalyScores = [];

    let startIndex = 0;
    if (range === "last100") {
      startIndex = Math.max(0, data.timestamps.length - 100);
    } else if (range === "last50") {
      startIndex = Math.max(0, data.timestamps.length - 50);
    } else if (range === "last1000") {
      startIndex = Math.max(0, data.timestamps.length - 1000);
    }

    for (let i = startIndex; i < data.timestamps.length; i++) {
      const rawIsAnomalyValue = data.is_anomaly[i];
      const isAnomaly =
        rawIsAnomalyValue === true ||
        rawIsAnomalyValue === 1 ||
        String(rawIsAnomalyValue).toLowerCase() === "true" ||
        String(rawIsAnomalyValue) === "1";

      const temp = parseFloat(data.temperatures[i]);
      const power = parseFloat(data.power_consumptions[i]);
      const score = parseFloat(data.anomaly_scores[i]);

      if (isNaN(temp) || isNaN(power) || isNaN(score)) {
        continue;
      }

      if (range === "anomalies" && !isAnomaly) continue;

      filteredTimestamps.push(data.timestamps[i]);
      filteredTemperatures.push(temp);
      filteredPowerConsumptions.push(power);
      filteredIsAnomaly.push(isAnomaly);
      filteredAnomalyScores.push(score);
    }

    return {
      timestamps: filteredTimestamps,
      temperatures: filteredTemperatures,
      power_consumptions: filteredPowerConsumptions,
      is_anomaly: filteredIsAnomaly,
      anomaly_scores: filteredAnomalyScores,
    };
  }, []);

  const processedData = useMemo(() => {
    if (!rawData) return null;
    return filterDataByRange(rawData, dataRange);
  }, [rawData, dataRange, filterDataByRange]);

  const getCssVariable = useCallback((variable) => {
    if (typeof document !== "undefined") {
      return getComputedStyle(document.documentElement)
        .getPropertyValue(variable)
        .trim();
    }
    return "";
  }, []);

  const showMessage = useCallback((msg, type = "info") => {
    setMessage(msg);
    setMessageType(type);

    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }

    messageTimeoutRef.current = setTimeout(() => {
      setMessage("");
    }, MESSAGE_TIMEOUT);
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
      if (!canvas) {
        destroyChart(mainChartRef);
        return;
      }
      if (!data?.timestamps?.length) {
        destroyChart(mainChartRef);
        return;
      }

      destroyChart(mainChartRef);

      const ctx = canvas.getContext("2d");
      let datasets = [];
      const timestampsParsed = data.timestamps.map((ts) => new Date(ts));

      const normalPoints = [];
      const anomalyPoints = [];

      timestampsParsed.forEach((timestamp, index) => {
        const point = {
          x: index,
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

      if (
        normalPoints.length > 0 &&
        (chartType === "line" || chartType === "both")
      ) {
        datasets.push(
          {
            label: "Suhu (Normal)",
            data: normalPoints.map((d) => ({ x: d.x, y: d.y })),
            borderColor: getCssVariable("--color-primary"),
            backgroundColor: getCssVariable("--color-primary-light"),
            borderWidth: 2,
            fill: false,
            tension: 0.2,
            pointRadius: 0,
            pointHoverRadius: 3,
            type: "line",
          },
          {
            label: "Daya (Normal)",
            data: normalPoints.map((d) => ({ x: d.x, y: d.y2 })),
            borderColor: getCssVariable("--color-secondary"),
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

      if (
        anomalyPoints.length > 0 &&
        (chartType === "scatter" || chartType === "both")
      ) {
        datasets.push(
          {
            label: "Suhu (Anomali)",
            data: anomalyPoints.map((d) => ({
              x: d.x,
              y: d.y,
              score: d.score,
            })),
            borderColor: getCssVariable("--color-danger"),
            backgroundColor: getCssVariable("--color-danger"),
            borderWidth: 2,
            pointRadius: 8,
            pointHoverRadius: 10,
            pointStyle: "triangle",
            showLine: false,
            type: "scatter",
          },
          {
            label: "Daya (Anomali)",
            data: anomalyPoints.map((d) => ({
              x: d.x,
              y: d.y2,
              score: d.score,
            })),
            borderColor: getCssVariable("--color-warning"),
            backgroundColor: getCssVariable("--color-warning"),
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

      if (
        (dataRange === "anomalies" &&
          chartType === "line" &&
          anomalyPoints.length > 0) ||
        (normalPoints.length === 0 &&
          chartType === "line" &&
          anomalyPoints.length > 0)
      ) {
        datasets = [];

        datasets.push(
          {
            label: "Suhu (Anomali)",
            data: anomalyPoints.map((d) => ({ x: d.x, y: d.y })),
            borderColor: getCssVariable("--color-danger"),
            backgroundColor: getCssVariable("--color-danger"),
            borderWidth: 3,
            fill: false,
            tension: 0.2,
            pointRadius: 6,
            pointHoverRadius: 8,
            pointStyle: "triangle",
            type: "line",
          },
          {
            label: "Daya (Anomali)",
            data: anomalyPoints.map((d) => ({ x: d.x, y: d.y2 })),
            borderColor: getCssVariable("--color-warning"),
            backgroundColor: getCssVariable("--color-warning"),
            borderWidth: 3,
            fill: false,
            tension: 0.2,
            pointRadius: 6,
            pointHoverRadius: 8,
            pointStyle: "star",
            yAxisID: "y1",
            type: "line",
          }
        );
      }

      if (datasets.length === 0 && data.timestamps.length > 0) {
        datasets.push({
          label: "Tidak Ada Data untuk Tampilan Ini",
          data: [{ x: 0, y: 0 }],
          borderColor: getCssVariable("--text-muted"),
          borderWidth: 1,
          fill: false,
          pointRadius: 0,
          showLine: false,
        });
      }

      canvas.chart = new Chart.Chart(ctx, {
        type: "line",
        data: {
          labels: data.timestamps.map((ts) =>
            new Date(ts).toLocaleString()
          ),
          datasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 300,
          },
          parsing: false,
          normalized: true,
          hover: {
            mode: "nearest",
            intersect: true,
            axis: "x",
          },
          plugins: {
            legend: {
              position: "top",
              labels: {
                color: getCssVariable("--text-main"),
                font: { size: 14 },
              },
            },
            tooltip: {
              callbacks: {
                title: (context) => {
                  const index = context[0].parsed.x;
                  return data.timestamps[index]
                    ? new Date(data.timestamps[index]).toLocaleString()
                    : "";
                },
                label: (context) => {
                  let label = context.dataset.label || "";
                  if (label) label += ": ";
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
              backgroundColor: getCssVariable("--bg-container"),
              titleColor: getCssVariable("--text-main"),
              bodyColor: getCssVariable("--text-main"),
              borderColor: getCssVariable("--border-default"),
              borderWidth: 1,
            },
          },
          scales: {
            x: {
              type: "linear",
              title: {
                display: true,
                text: "Index Data",
                color: getCssVariable("--text-main"),
                font: { size: 16, weight: "bold" },
              },
              ticks: {
                color: getCssVariable("--text-muted"),
                callback: function (value, _index, _ticks) {
                  if (data.timestamps && data.timestamps[value]) {
                    return new Date(data.timestamps[value]).toLocaleTimeString();
                  }
                  return value;
                },
              },
              grid: { color: getCssVariable("--border-default") },
            },
            y: {
              type: "linear",
              display: true,
              position: "left",
              title: {
                display: true,
                text: "Suhu (°C)",
                color: getCssVariable("--text-main"),
                font: { size: 16, weight: "bold" },
              },
              ticks: { color: getCssVariable("--text-muted") },
              grid: { color: getCssVariable("--border-default") },
            },
            y1: {
              type: "linear",
              display: true,
              position: "right",
              grid: {
                drawOnChartArea: false,
                color: getCssVariable("--border-default"),
              },
              title: {
                display: true,
                text: "Konsumsi Daya (W)",
                color: getCssVariable("--text-main"),
                font: { size: 16, weight: "bold" },
              },
              ticks: { color: getCssVariable("--text-muted") },
            },
          },
        },
      });
    },
    [chartType, dataRange, destroyChart, getCssVariable]
  );

  const createDistributionChart = useCallback(
    (data) => {
      const canvas = distributionChartRef.current;
      if (!canvas || !data?.temperatures?.length) {
        destroyChart(distributionChartRef);
        return;
      }

      destroyChart(distributionChartRef);

      const ctx = canvas.getContext("2d");
      const allMeasurements = [
        ...data.temperatures,
        ...data.power_consumptions,
      ];
      const bins = createHistogram(allMeasurements, HISTOGRAM_BINS);

      canvas.chart = new Chart.Chart(ctx, {
        type: "bar",
        data: {
          labels: bins.labels,
          datasets: [
            {
              label: "Distribusi Nilai Sensor Gabungan",
              data: bins.counts,
              backgroundColor: getCssVariable("--color-primary"),
              borderColor: getCssVariable("--color-primary-dark"),
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 300 },
          plugins: {
            legend: {
              display: true,
              labels: { color: getCssVariable("--text-main") },
            },
            tooltip: {
              backgroundColor: getCssVariable("--bg-container"),
              titleColor: getCssVariable("--text-main"),
              bodyColor: getCssVariable("--text-main"),
              borderColor: getCssVariable("--border-default"),
              borderWidth: 1,
            },
          },
          scales: {
            x: {
              title: {
                display: true,
                text: "Rentang Nilai",
                color: getCssVariable("--text-main"),
              },
              ticks: { color: getCssVariable("--text-muted") },
              grid: { color: getCssVariable("--border-default") },
            },
            y: {
              title: {
                display: true,
                text: "Frekuensi",
                color: getCssVariable("--text-main"),
              },
              beginAtZero: true,
              ticks: { color: getCssVariable("--text-muted") },
              grid: { color: getCssVariable("--border-default") },
            },
          },
        },
      });
    },
    [createHistogram, destroyChart, getCssVariable]
  );

  const createScoreChart = useCallback(
    (data) => {
      const canvas = scoreChartRef.current;
      if (!canvas || !data?.anomaly_scores?.length) {
        destroyChart(scoreChartRef);
        return;
      }

      destroyChart(scoreChartRef);

      const ctx = canvas.getContext("2d");
      const anomalyScoresOnly = data.anomaly_scores.filter(
        (_, i) => data.is_anomaly[i]
      );
      const scoreBins = createHistogram(anomalyScoresOnly, SCORE_BINS);

      canvas.chart = new Chart.Chart(ctx, {
        type: "bar",
        data: {
          labels: scoreBins.labels,
          datasets: [
            {
              label: "Distribusi Skor Anomali",
              data: scoreBins.counts,
              backgroundColor: getCssVariable("--color-danger"),
              borderColor: getCssVariable("--color-danger"),
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 300 },
          plugins: {
            legend: {
              display: true,
              labels: { color: getCssVariable("--text-main") },
            },
            tooltip: {
              backgroundColor: getCssVariable("--bg-container"),
              titleColor: getCssVariable("--text-main"),
              bodyColor: getCssVariable("--text-main"),
              borderColor: getCssVariable("--border-default"),
              borderWidth: 1,
            },
          },
          scales: {
            x: {
              title: {
                display: true,
                text: "Rentang Skor Anomali",
                color: getCssVariable("--text-main"),
              },
              ticks: { color: getCssVariable("--text-muted") },
              grid: { color: getCssVariable("--border-default") },
            },
            y: {
              title: {
                display: true,
                text: "Frekuensi Anomali",
                color: getCssVariable("--text-main"),
              },
              beginAtZero: true,
              ticks: { color: getCssVariable("--text-muted") },
              grid: { color: getCssVariable("--border-default") },
            },
          },
        },
      });
    },
    [createHistogram, destroyChart, getCssVariable]
  );

  const createAnomalyList = useCallback(
    (data) => {
      const container = document.getElementById("anomaliesContainer");
      if (!container) return;

      container.innerHTML = "";

      if (!data?.timestamps?.length) {
        container.innerHTML = `<p style='color: ${getCssVariable(
          "--text-muted"
        )}; text-align: center; padding: 16px;'>🔍 Tidak ada anomali kritis terdeteksi dalam kumpulan data ini.</p>`;
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
        container.innerHTML = `<p style='color: ${getCssVariable(
          "--text-muted"
        )}; text-align: center; padding: 16px;'>✅ Tidak ada anomali kritis terdeteksi dalam kumpulan data ini.</p>`;
        return;
      }

      anomalies.sort((a, b) => b.score - a.score);
      const anomaliesToDisplay = anomalies.slice(0, ANOMALY_DISPLAY_LIMIT);

      const fragment = document.createDocumentFragment();

      anomaliesToDisplay.forEach((anomaly) => {
        const item = document.createElement("div");
        item.className = "anomaly-item";
        item.innerHTML = `
        <div>
          <strong>⏰ ${anomaly.timestamp.toLocaleString()}</strong><br>
          <small>🌡️ Suhu: ${anomaly.temperature.toFixed(
            2
          )}°C, ⚡ Daya: ${anomaly.power.toFixed(2)}W</small>
        </div>
        <span class="anomaly-score" style="color: ${getCssVariable(
          "--color-danger"
        )};">🎯 Skor: ${anomaly.score.toFixed(3)}</span>
      `;
        fragment.appendChild(item);
      });

      container.appendChild(fragment);

      if (anomalies.length > ANOMALY_DISPLAY_LIMIT) {
        const moreInfo = document.createElement("p");
        moreInfo.style = `text-align: center; margin-top: 16px; color: ${getCssVariable(
          "--text-muted"
        )}; font-size: 0.875rem;`;
        moreInfo.textContent = `📊 Menampilkan ${ANOMALY_DISPLAY_LIMIT} dari ${anomalies.length} total anomali.`;
        container.appendChild(moreInfo);
      }
    },
    [getCssVariable]
  );

  const handleFileChange = useCallback(
    (e) => {
      const file = e.target.files[0];

      const resetInput = () => {
        setFileSelected(null);
        setFileDisplayContent(DEFAULT_FILE_DISPLAY);
        if (csvFileInputRef.current) {
          csvFileInputRef.current.value = "";
        }
      };

      if (!file) {
        resetInput();
        return;
      }

      const isCsvExtension = file.name.toLowerCase().endsWith(".csv");
      if (!isCsvExtension) {
        showMessage(
          "Waduh, file yang dipilih harus berekstensi .csv ya!",
          "error"
        );
        resetInput();
        return;
      }

      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const fileContent = event.target.result;
          const firstLine = fileContent.split("\n")[0].trim();
          const headersInFile = firstLine.split(",").map((h) => h.trim());

          const hasAllRequiredHeaders =
            REQUIRED_HEADERS.length === headersInFile.length &&
            REQUIRED_HEADERS.every((requiredHeader) =>
              headersInFile.includes(requiredHeader)
            );

          if (hasAllRequiredHeaders) {
            setFileSelected(file);
            setFileDisplayContent({
              icon: "📈",
              name: file.name,
              details: `✅ Struktur file valid (${(
                file.size / 1024
              ).toFixed(1)} KB)`,
              color: getCssVariable("--color-secondary"),
            });
          } else {
            const missingHeaders = REQUIRED_HEADERS.filter(
              (h) => !headersInFile.includes(h)
            ).join(", ");
            showMessage(
              `Struktur CSV tidak cocok. Kolom yang hilang: ${missingHeaders}`,
              "error"
            );
            resetInput();
          }
        } catch (readError) {
          console.error("Error reading or parsing file header:", readError);
          showMessage(
            "Gagal memproses header CSV, file mungkin rusak.",
            "error"
          );
          resetInput();
        }
      };

      reader.onerror = () => {
        console.error("FileReader error");
        showMessage("Terjadi kesalahan saat membaca file.", "error");
        resetInput();
      };

      reader.readAsText(file);
    },
    [getCssVariable, showMessage]
  );

  const handleFileDisplayClick = useCallback(() => {
    csvFileInputRef.current?.click();
  }, []);

  const uploadCsv = useCallback(async () => {
    setMessage("");
    if (!fileSelected) {
      showMessage(
        "📁 Silakan pilih file CSV terlebih dahulu untuk memulai analisis.",
        "error"
      );
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
        showMessage("🎉 Deteksi anomali berhasil diselesaikan!", "success");
        setRawData(result.chart_data);
        updateSummaryStats(result);
        setResultsVisible(true);
      } else {
        console.error("Backend error:", result);
        showMessage(
          `❌ Analisis gagal: ${
            result.error || response.statusText
          }. Harap verifikasi format CSV Anda.`,
          "error"
        );
        setResultsVisible(false);
      }
    } catch (error) {
      console.error("Network error:", error);
      showMessage(
        "🌐 Kesalahan jaringan: Tidak dapat terhubung ke server analisis. Silakan periksa koneksi Anda atau coba lagi nanti.",
        "error"
      );
      setResultsVisible(false);
    } finally {
      setLoading(false);
    }
  }, [fileSelected, showMessage, updateSummaryStats]);

  const clearDataAndReload = useCallback(() => {
    setShowConfirmModal(true);
  }, []);

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

    if (csvFileInputRef.current) {
      csvFileInputRef.current.value = "";
    }

    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
  }, [destroyChart]);

  const toggleTheme = useCallback(() => {
    setCurrentTheme((prev) => {
      const newTheme = prev === "default" ? "dark-theme" : "default";
      localStorage.setItem("theme", newTheme);
      return newTheme;
    });
  }, []);

  const downloadPdf = useCallback(() => {
    showMessage("⏳ Mempersiapkan laporan PDF Anda...", "info");
    setLoading(true);

    const resultsSection = document.querySelector(".results-section");
    const pdfButtonElement = pdfButtonRef.current;

    if (resultsSection) {
      if (pdfButtonElement) {
        pdfButtonElement.style.display = "none";
      }

      html2canvas(resultsSection, {
        scale: 2.0,
        useCORS: true,
        windowWidth: resultsSection.scrollWidth,
        windowHeight: resultsSection.scrollHeight,
      })
        .then((canvas) => {
          const imgData = canvas.toDataURL("image/jpeg", 0.8);
          const pdf = new jsPDF("p", "mm", "a4");
          const imgWidth = 210;
          const pageHeight = 297;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;

          let heightLeft = imgHeight;
          let position = 0;
          let pageNumber = 1;

          pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;

          while (heightLeft >= 0 && pageNumber < 2) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            pageNumber++;
          }

          pdf.save("Laporan_Anomali_IoT.pdf");
          showMessage("✅ Laporan PDF berhasil diunduh!", "success");
        })
        .catch((error) => {
          console.error("Error generating PDF:", error);
          showMessage("❌ Gagal mengunduh laporan PDF. Coba lagi.", "error");
        })
        .finally(() => {
          if (pdfButtonElement) {
            pdfButtonElement.style.display = "flex";
          }
          setLoading(false);
        });
    } else {
      showMessage("⚠️ Tidak ada hasil untuk dibuat laporan PDF.", "warning");
      setLoading(false);
    }
  }, [showMessage, setLoading]);

  useEffect(() => {
    document.documentElement.className = currentTheme;
  }, [currentTheme]);

  useEffect(() => {
    if (!rawData) {
      setResultsVisible(false);
      setLoading(false);
    }
  }, [rawData]);

  useEffect(() => {
    if (processedData?.timestamps?.length) {
      createMainChart(processedData);
    } else {
      destroyChart(mainChartRef);
    }
  }, [processedData, chartType, createMainChart, destroyChart, currentTheme]);

  useEffect(() => {
    if (processedData?.timestamps?.length) {
      createDistributionChart(processedData);
      createScoreChart(processedData);
      createAnomalyList(processedData);
    } else {
      destroyChart(distributionChartRef);
      destroyChart(scoreChartRef);

      const container = document.getElementById("anomaliesContainer");
      if (container) {
        container.innerHTML = `<p style='color: ${getCssVariable(
          "--text-muted"
        )}; text-align: center; padding: 16px;'>🔍 Tidak ada anomali kritis terdeteksi dalam kumpulan data ini.</p>`;
      }
    }
  }, [
    processedData,
    createDistributionChart,
    createScoreChart,
    createAnomalyList,
    destroyChart,
    currentTheme,
    getCssVariable,
  ]);

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
      destroyChart(mainChartRef);
      destroyChart(distributionChartRef);
      destroyChart(scoreChartRef);
    };
  }, [destroyChart]);

  return (
    <div className={`app-container ${currentTheme}`}>
      <div className="container">
        <div className="header">
          <div className="header-content">
            <h1>🔍 IoT Anomaly Insights</h1>
            <p>⚡ Deteksi anomali untuk data sensor IoT.</p>
          </div>
        </div>

        <div className="main-content">
          <div
            className="csv-download-info"
            style={{
              marginBottom: "20px",
              padding: "15px",
              borderRadius: "8px",
              backgroundColor: getCssVariable("--bg-container"),
              border: `1px solid ${getCssVariable("--border-default")}`,
              boxShadow: getCssVariable("--shadow-sm"),
            }}
          >
            <p
              style={{
                color: getCssVariable("--text-secondary"),
                fontSize: "0.9rem",
                textAlign: "center",
              }}
            >
              Data simulasi dapat diunduh melalui link ini:{" "}
              <a
                href="https://www.kaggle.com/datasets/hkayan/anomliot"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: getCssVariable("--color-primary"),
                  fontWeight: "bold",
                }}
              >
                🔗 Kaggle Dataset: Anomaly IoT
              </a>
            </p>
          </div>

          {message && (
            <div className={`message-box ${messageType}`}>
              {messageType === "success" && "✅ "}
              {messageType === "error" && "❌ "}
              {messageType === "info" && "ℹ️ "}
              {message}
            </div>
          )}

          <div className="card upload-section">
            <h2 className="card-title">📂 Masukkan Data</h2>
            <div className="file-input-wrapper">
              <input
                type="file"
                id="csvFile"
                accept=".csv"
                onChange={handleFileChange}
                ref={csvFileInputRef}
                style={{ display: "none" }}
              />
              <div
                className="file-input-display"
                onClick={handleFileDisplayClick}
              >
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
                🚀 Analisis Data
              </button>
              <button
                className="btn btn-danger"
                onClick={clearDataAndReload}
                disabled={loading}
              >
                🔄 Bersihkan & Atur Ulang
              </button>
            </div>
          </div>

          {loading && (
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p style={{ color: getCssVariable("--text-main") }}>
                ⚙️ Memproses data... Memulai pemindaian anomali.
              </p>
            </div>
          )}

          {resultsVisible && (
            <div className="results-section show">
              <div className="stats-grid">
                <div className="stat-card primary">
                  <h3 id="totalPoints">
                    📊 {summaryStats.total_points.toLocaleString()}
                  </h3>
                  <p>Total Data Poin</p>
                </div>
                <div className="stat-card error">
                  <h3 id="numAnomalies">
                    ⚠️ {summaryStats.num_anomalies.toLocaleString()}
                  </h3>
                  <p>Anomali Terdeteksi</p>
                </div>
                <div className="stat-card success">
                  <h3 id="normalPoints">
                    ✅ {summaryStats.normal_points.toLocaleString()}
                  </h3>
                  <p>Poin Normal</p>
                </div>
                <div className="stat-card">
                  <h3 id="anomalyPercentage">
                    📈 {summaryStats.anomaly_percentage}%
                  </h3>
                  <p>Tingkat Anomali</p>
                </div>
              </div>

              <div className="card">
                <h2 className="card-title">📈 Analisis Tren *Real-time*</h2>
                <div className="controls">
                  <div className="control-group">
                    <label htmlFor="chartType">🎨 Tipe Visualisasi</label>
                    <select
                      id="chartType"
                      value={chartType}
                      onChange={(e) => setChartType(e.target.value)}
                    >
                      <option value="line">📊 Grafik Garis</option>
                      <option value="scatter">🔵 Diagram Sebar</option>
                      <option value="both">🎭 Tampilan Gabungan</option>
                    </select>
                  </div>
                  <div className="control-group">
                    <label htmlFor="dataRange">🔍 Jendela Data</label>
                    <select
                      id="dataRange"
                      value={dataRange}
                      onChange={(e) => setDataRange(e.target.value)}
                    >
                      <option value="all">🌐 Semua Data Tersedia</option>
                      <option value="last1000">🔢 1000 Entri Terakhir</option>
                      <option value="last100">💯 100 Entri Terakhir</option>
                      <option value="last50">📋 50 Entri Terakhir</option>
                      <option value="anomalies">🎯 Hanya Anomali</option>
                    </select>
                  </div>
                </div>
                <div className="chart-container large">
                  <canvas ref={mainChartRef}></canvas>
                </div>
              </div>

              <div className="charts-container">
                <div className="card">
                  <h2 className="card-title">📊 Metrik Distribusi Data</h2>
                  <div className="chart-container">
                    <canvas ref={distributionChartRef}></canvas>
                  </div>
                </div>

                <div className="card">
                  <h2 className="card-title">🎯 Magnitudo Skor Anomali</h2>
                  <div className="chart-container">
                    <canvas ref={scoreChartRef}></canvas>
                  </div>
                </div>
              </div>
              <div
                className="download-pdf-section"
                style={{ textAlign: "center", marginTop: "20px" }}
              >
                <button
                  className="btn btn-secondary"
                  onClick={downloadPdf}
                  disabled={loading}
                  ref={pdfButtonRef}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "background-color 0.3s ease",
                    backgroundColor: getCssVariable("--color-secondary"),
                    color: getCssVariable("--bg-main"),
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    margin: "0 auto",
                  }}
                >
                  📥 Unduh Laporan PDF
                </button>
              </div>
            </div>
          )}
        </div>

        {resultsVisible && (
          <div className="sidebar-content">
            <div className="card anomaly-list">
              <h2 className="card-title">🚨 Peringatan Anomali Kritis</h2>
              <div id="anomaliesContainer"></div>
            </div>
          </div>
        )}
      </div>

      {!loading && !showConfirmModal && (
        <div className="fab" onClick={uploadCsv} title="Mulai Analisis Data">
          🚀
        </div>
      )}

      {!loading && !showConfirmModal && (
        <div
          className="fab theme-toggle"
          onClick={toggleTheme}
          title="Ganti Tema"
        >
          💡
        </div>
      )}

      <div className={`modal-overlay ${showConfirmModal ? "show" : ""}`}>
        <div className="modal-content">
          <h3 className="modal-title">❓ Konfirmasi Reset</h3>
          <p>
            Apakah Anda yakin ingin menghapus semua data yang dimuat dan
            mengatur ulang aplikasi?
          </p>
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setShowConfirmModal(false)}
            >
              ↩️ Batal
            </button>
            <button className="btn btn-danger" onClick={executeReset}>
              🗑️ Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;