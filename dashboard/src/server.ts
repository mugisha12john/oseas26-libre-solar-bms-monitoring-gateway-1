import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mqtt from "mqtt";
import { WebSocketServer } from "ws";

type Telemetry = {
  schema_version: string;
  battery_id: string;
  site_id: string;
  timestamp: string;
  battery: {
    pack_voltage_v: number;
    pack_current_a: number;
    power_w: number;
    soc_pct: number;
    temperature_c: number;
    cycles: number;
  };
  cells: {
    voltages_v: number[];
    min_voltage_v: number;
    max_voltage_v: number;
    avg_voltage_v: number;
    imbalance_v: number;
  };
  bms: {
    state: string;
    balancing: boolean;
    error_flags: string[];
  };
};

type EventMessage = {
  schema_version: string;
  event_id: string;
  battery_id: string;
  site_id: string;
  timestamp: string;
  type: string;
  severity: string;
  message: string;
  value?: number;
  unit?: string;
};

type StatusMessage = {
  schema_version: string;
  battery_id: string;
  site_id: string;
  status: "online" | "offline";
  timestamp: string;
  last_seen?: string;
};

type Snapshot = {
  siteId: string;
  batteryId: string;
  telemetry?: Telemetry;
  status?: StatusMessage;
  events: EventMessage[];
  lastUpdatedAt?: string;
  streamId: string;
};

const newStreamId = (): string => `stream-${Date.now()}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");
const port = Number(process.env.DASHBOARD_PORT || 3000);
const offlineTimeoutMs = Number(process.env.OFFLINE_TIMEOUT_MS || 15000);
const state: Snapshot = {
  siteId: "site-001",
  batteryId: "BAT-001",
  events: [],
  streamId: newStreamId(),
};

const sendSnapshot = (ws: { send: (data: string) => void }) => {
  ws.send(
    JSON.stringify({
      type: "snapshot",
      snapshot: {
        ...state,
        telemetry: state.telemetry ?? null,
        status: state.status ?? null,
        lastUpdatedAt: state.lastUpdatedAt ?? null,
      },
    }),
  );
};

const logger = (...messages: unknown[]): void => {
  console.info(new Date().toISOString(), ...messages);
};

const client = mqtt.connect({
  host: process.env.MQTT_HOST || "mosquitto",
  port: Number(process.env.MQTT_PORT || 1883),
  protocol: "mqtt",
  reconnectPeriod: 2000,
  clientId: `libre-solar-monitor-${Math.random().toString(16).slice(2)}`,
});

client.on("connect", () => {
  logger("Connected to MQTT broker");
  client.subscribe("libre-solar/#");
});

client.on("error", (error) => {
  logger("MQTT error", error);
});

client.on("message", (topic, payload) => {
  try {
    const parsed = JSON.parse(payload.toString());
    if (topic.endsWith("/telemetry")) {
      state.telemetry = parsed as Telemetry;
      state.siteId = parsed.site_id || state.siteId;
      state.batteryId = parsed.battery_id || state.batteryId;
      state.lastUpdatedAt = parsed.timestamp;
      logger("telemetry update", parsed.battery?.soc_pct ?? "n/a");
    }
    if (topic.endsWith("/status")) {
      const isNewOnlineSession =
        parsed.status === "online" &&
        state.status?.status === "online" &&
        parsed.timestamp !== state.status.timestamp;
      if (
        (parsed.status === "offline" && state.status?.status !== "offline") ||
        isNewOnlineSession
      ) {
        state.streamId = newStreamId();
      }
      state.status = parsed as StatusMessage;
      logger("status update", parsed.status);
    }
    if (topic.endsWith("/event")) {
      const event = parsed as EventMessage;
      state.events = [event, ...state.events].slice(0, 20);
      logger("event update", event.type, event.severity);
    }
  } catch (error) {
    logger("Could not parse MQTT payload for", topic, error);
  }
});

const server = http.createServer(async (request, response) => {
  const requestUrl = request.url || "/";
  const pathname = requestUrl.split("?")[0];
  if (
    pathname === "/" ||
    pathname === "/simulator" ||
    pathname.startsWith("/battery/")
  ) {
    const html = await readFile(path.join(publicDir, "index.html"), "utf8");
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }
  const filePath = path.join(publicDir, pathname);
  try {
    const stats = await readFile(filePath);
    const extension = path.extname(filePath);
    const contentType =
      extension === ".css"
        ? "text/css; charset=utf-8"
        : extension === ".js"
          ? "application/javascript; charset=utf-8"
          : "text/plain; charset=utf-8";
    response.writeHead(200, { "Content-Type": contentType });
    response.end(stats);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  sendSnapshot(socket as { send: (data: string) => void });
  socket.on("message", () => undefined);
});

setInterval(() => {
  const now = Date.now();
  const lastReceived = state.lastUpdatedAt
    ? new Date(state.lastUpdatedAt).getTime()
    : 0;
  if (
    state.status &&
    now - lastReceived > offlineTimeoutMs &&
    state.telemetry
  ) {
    state.status = { ...state.status, status: "offline" };
  }
  if (wss.clients) {
    wss.clients.forEach((clientSocket) => {
      sendSnapshot(clientSocket as { send: (data: string) => void });
    });
  }
}, 1000);

server.listen(port, () => {
  logger(`Dashboard listening on http://0.0.0.0:${port}`);
});
