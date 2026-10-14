const seriesButtons = [...document.querySelectorAll("[data-series]")];
const chart = document.getElementById("history-chart");
const eventList = document.getElementById("event-list");
const siteIdNode = document.getElementById("site-id");
const batteryIdNode = document.getElementById("battery-id");
const statusText = document.getElementById("status-text");
const onlineIndicator = document.getElementById("online-indicator");
const updatedText = document.getElementById("last-updated");
const stateValue = document.getElementById("state-value");
const chartTooltip = document.getElementById("chart-tooltip");

const fields = {
  soc: { label: "SOC", get: (d) => d.battery?.soc_pct ?? null, suffix: "%" },
  voltage: {
    label: "Voltage",
    get: (d) => d.battery?.pack_voltage_v ?? null,
    suffix: "V",
  },
  current: {
    label: "Current",
    get: (d) => d.battery?.pack_current_a ?? null,
    suffix: "A",
  },
  power: {
    label: "Power",
    get: (d) => d.battery?.power_w ?? null,
    suffix: "W",
  },
  temperature: {
    label: "Temperature",
    get: (d) => d.battery?.temperature_c ?? null,
    suffix: "°C",
  },
};

const history = {
  soc: [],
  voltage: [],
  current: [],
  power: [],
  temperature: [],
};
let selectedSeries = "soc";
let activeStreamId = null;

function formatValue(value, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return `${Number(value).toFixed(Math.abs(value) >= 10 ? 1 : 2)}${suffix}`;
}

function applyStateClass(state) {
  const normalized = String(state || "NORMAL").toLowerCase();
  stateValue.className = `state-value ${normalized}`;
}

function timeAgo(iso) {
  if (!iso) return "--";
  const diffSeconds = Math.max(
    0,
    (Date.now() - new Date(iso).getTime()) / 1000,
  );
  return `${Math.round(diffSeconds)}s ago`;
}

function showChartTooltip(entry, x) {
  const config = fields[selectedSeries];
  const timestamp = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  chartTooltip.textContent = `${config.label}: ${formatValue(entry.value, ` ${config.suffix}`)}\n${timestamp}`;
  chartTooltip.hidden = false;
  chartTooltip.style.left = `${Math.min(Math.max((x / 600) * 100, 4), 76)}%`;
}

function hideChartTooltip() {
  chartTooltip.hidden = true;
}

function resetLiveHistory() {
  Object.values(history).forEach((series) => {
    series.length = 0;
  });
  eventList.innerHTML = "";
  hideChartTooltip();
}

function renderChart() {
  const series = history[selectedSeries];
  chart.innerHTML = "";
  if (!series.length) {
    const placeholder = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    placeholder.setAttribute("x", "50%");
    placeholder.setAttribute("y", "50%");
    placeholder.setAttribute("text-anchor", "middle");
    placeholder.setAttribute("fill", "#9bb0d1");
    placeholder.textContent = "Waiting for data";
    chart.appendChild(placeholder);
    return;
  }

  const values = series.map((entry) => Number(entry.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 600;
  const height = 220;
  const padding = 20;

  const linePoints = series
    .map((entry, index) => {
      const x =
        padding +
        (index / Math.max(series.length - 1, 1)) * (width - padding * 2);
      const y =
        height -
        padding -
        ((Number(entry.value) - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const bg = document.createElementNS("http://www.w3.org/2000/svg", "line");
  bg.setAttribute("x1", padding);
  bg.setAttribute("x2", width - padding);
  bg.setAttribute("y1", height - padding);
  bg.setAttribute("y2", height - padding);
  bg.setAttribute("stroke", "rgba(255,255,255,0.15)");
  chart.appendChild(bg);

  const path = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polyline",
  );
  path.setAttribute("points", linePoints);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#61dafb");
  path.setAttribute("stroke-width", "3");
  chart.appendChild(path);

  const hoverLine = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "line",
  );
  hoverLine.setAttribute("y1", padding);
  hoverLine.setAttribute("y2", height - padding);
  hoverLine.setAttribute("stroke", "rgba(97,218,251,0.45)");
  hoverLine.setAttribute("stroke-dasharray", "4 4");
  hoverLine.setAttribute("visibility", "hidden");
  chart.appendChild(hoverLine);

  series.forEach((entry, index) => {
    const [x, y] = linePoints.split(" ")[index].split(",");
    const point = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    point.setAttribute("cx", x);
    point.setAttribute("cy", y);
    point.setAttribute("r", "7");
    point.setAttribute("fill", "transparent");
    point.setAttribute("stroke", "transparent");
    point.addEventListener("mouseenter", () => {
      hoverLine.setAttribute("x1", x);
      hoverLine.setAttribute("x2", x);
      hoverLine.setAttribute("visibility", "visible");
      showChartTooltip(entry, Number(x));
    });
    point.addEventListener("mouseleave", hideChartTooltip);
    chart.appendChild(point);
  });

  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("x", width - 120);
  label.setAttribute("y", 24);
  label.setAttribute("fill", "#9bb0d1");
  label.setAttribute("font-size", "12");
  label.textContent = fields[selectedSeries].label;
  chart.appendChild(label);
}

function renderCellBars(cells) {
  const container = document.getElementById("cell-bars");
  if (!cells || !cells.length) return;
  const maxCell = Math.max(...cells);
  container.innerHTML = cells
    .map((voltage, index) => {
      const isAbnormal = Math.abs(voltage - maxCell) > 0.04;
      return `
      <div class="cell-row">
        <span class="cell-label">Cell ${index + 1}</span>
        <div class="cell-track"><div class="cell-fill ${isAbnormal ? "abnormal" : ""}" style="width:${Math.max(8, (voltage / Math.max(maxCell, 0.1)) * 100)}%"></div></div>
        <strong>${formatValue(voltage, " V")}</strong>
      </div>
    `;
    })
    .join("");
}

function renderEvents(events) {
  eventList.innerHTML = events
    .slice(0, 8)
    .map(
      (event) => `
    <li class="event-item">
      <div class="event-meta">
        <span>${new Date(event.timestamp).toLocaleTimeString([], { hour12: false })}</span>
        <span class="event-severity ${event.severity.toLowerCase()}">${event.type}</span>
      </div>
      <div>${event.message}</div>
    </li>
  `,
    )
    .join("");
}

function updateDashboard(snapshot) {
  if (
    snapshot.streamId &&
    activeStreamId &&
    snapshot.streamId !== activeStreamId
  ) {
    resetLiveHistory();
  }
  activeStreamId = snapshot.streamId || activeStreamId;
  const telemetry = snapshot.telemetry || null;
  const status = snapshot.status || { status: "offline" };
  if (!telemetry) {
    return;
  }

  siteIdNode.textContent = telemetry.site_id || snapshot.siteId;
  batteryIdNode.textContent = telemetry.battery_id || snapshot.batteryId;
  document.getElementById("soc-value").textContent = formatValue(
    telemetry.battery?.soc_pct,
    "%",
  );
  document.getElementById("voltage-value").textContent = formatValue(
    telemetry.battery?.pack_voltage_v,
    " V",
  );
  document.getElementById("current-value").textContent = formatValue(
    telemetry.battery?.pack_current_a,
    " A",
  );
  document.getElementById("power-value").textContent = formatValue(
    telemetry.battery?.power_w,
    " W",
  );
  document.getElementById("temperature-value").textContent = formatValue(
    telemetry.battery?.temperature_c,
    " °C",
  );
  const currentState = telemetry.bms?.state || "NORMAL";
  stateValue.textContent = currentState;
  applyStateClass(currentState);
  updatedText.textContent = timeAgo(
    snapshot.lastUpdatedAt || telemetry.timestamp,
  );
  statusText.textContent = status.status
    ? status.status.toUpperCase()
    : "OFFLINE";
  onlineIndicator.classList.toggle("offline", status.status !== "online");

  const cellValues = telemetry.cells?.voltages_v || [];
  document.getElementById("min-cell").textContent = formatValue(
    telemetry.cells?.min_voltage_v,
    " V",
  );
  document.getElementById("max-cell").textContent = formatValue(
    telemetry.cells?.max_voltage_v,
    " V",
  );
  document.getElementById("avg-cell").textContent = formatValue(
    telemetry.cells?.avg_voltage_v,
    " V",
  );
  document.getElementById("imbalance-cell").textContent = formatValue(
    telemetry.cells?.imbalance_v,
    " V",
  );
  document.getElementById("cycle-count").textContent = String(
    telemetry.battery?.cycles ?? "--",
  );
  document.getElementById("health-min").textContent = formatValue(
    telemetry.cells?.min_voltage_v,
    " V",
  );
  document.getElementById("health-max").textContent = formatValue(
    telemetry.cells?.max_voltage_v,
    " V",
  );
  document.getElementById("health-imbalance").textContent = formatValue(
    telemetry.cells?.imbalance_v,
    " V",
  );
  document.getElementById("health-temp").textContent = formatValue(
    telemetry.battery?.temperature_c,
    " °C",
  );
  document.getElementById("health-state").textContent =
    telemetry.bms?.state || "--";
  document.getElementById("balancing-state").textContent = telemetry.bms
    ?.balancing
    ? "ON"
    : "OFF";

  Object.entries(fields).forEach(([key, config]) => {
    const value = config.get(telemetry);
    if (value !== null && value !== undefined) {
      history[key].push({ value, timestamp: telemetry.timestamp });
      if (history[key].length > 40) history[key].shift();
    }
  });

  renderChart();
  renderCellBars(cellValues);
  renderEvents(snapshot.events || []);
}

seriesButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedSeries = button.dataset.series;
    seriesButtons.forEach((item) =>
      item.classList.toggle("active", item === button),
    );
    renderChart();
  });
});

const socket = new WebSocket(
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`,
);
socket.addEventListener("message", (event) => {
  const payload = JSON.parse(event.data);
  if (payload.type === "snapshot") {
    updateDashboard(payload.snapshot);
  }
});

socket.addEventListener("error", () => {
  statusText.textContent = "OFFLINE";
  onlineIndicator.classList.add("offline");
});

window.addEventListener("beforeunload", () => socket.close());
