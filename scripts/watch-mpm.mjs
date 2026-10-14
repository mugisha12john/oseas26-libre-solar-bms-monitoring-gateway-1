import mqtt from 'mqtt';

const duration = Number(process.env.WATCH_SECONDS || 150);
if (!Number.isFinite(duration) || duration < 1) throw new Error('WATCH_SECONDS must be positive');
const base = (process.env.MPM_BASE_URL || 'http://host.docker.internal:8000').replace(/\/$/, '');
const client = mqtt.connect({
  host: process.env.MQTT_HOST || 'mosquitto',
  port: Number(process.env.MQTT_PORT || 1883),
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  clientId: `mpm-diagnostic-${Date.now()}`,
  reconnectPeriod: 2000,
});
let lastTelemetry;
let polling = false;
let failed = false;
let observedMessages = false;
let observedRows = false;
const log = (message) => console.log(`${new Date().toISOString()} ${message}`);
client.on('connect', () => client.subscribe('libre-solar/+/+/+', { qos: 1 }, (error, grants) => {
  if (error || grants.some(grant => grant.qos === 128)) {
    failed = true;
    log('MQTT subscription rejected');
    return;
  }
  log('Diagnostic subscriber acknowledged: libre-solar/+/+/+');
}));
client.on('error', () => { failed = true; log('MQTT connection error; check broker configuration'); });
client.on('message', (topic, raw) => {
  const type = topic.split('/')[3];
  if (!['telemetry', 'event', 'status', 'alert'].includes(type)) return;
  observedMessages = true;
  try {
    const message = JSON.parse(raw.toString());
    if (type === 'telemetry') {
      lastTelemetry = { topic, timestamp: message.timestamp, soc: message.battery?.soc_pct, cycles: message.battery?.cycle_count, temperature: message.battery?.temperature_c };
    } else {
      log(`MQTT ${topic} ${JSON.stringify(message)}`);
    }
  } catch { log(`Invalid JSON: ${topic}`); }
});
async function poll() {
  if (polling) return;
  polling = true;
  try {
    if (lastTelemetry) log(`Latest MQTT telemetry ${JSON.stringify(lastTelemetry)}`);
    if (!process.env.MPM_API_KEY) {
      failed = true;
      log('MPM_API_KEY missing in bridge container');
      return;
    }
    const response = await fetch(`${base}/api/libre-solar/battery-health/health`, {
      headers: { Authorization: `Bearer ${process.env.MPM_API_KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    log(`MPM GET health HTTP ${response.status}`);
    if (!response.ok) { failed = true; return; }
    const body = await response.json();
    const rows = Array.isArray(body.data) ? body.data : body.data?.data;
    if (!Array.isArray(rows)) { failed = true; log('Unexpected health API response shape'); return; }
    observedRows ||= rows.length > 0;
    for (const row of rows) log(`MPM stored ${JSON.stringify(row)}`);
    if (!rows.length) log('MPM returned no battery rows for this API key/company');
  } catch {
    failed = true;
    log('MPM request failed; check URL, network, and backend logs');
  } finally { polling = false; }
}
log(`Watching for ${duration}s; API polling every 10s. Bridge telemetry interval=${process.env.MPM_INTERVAL_SECONDS || 60}s.`);
void poll();
const timer = setInterval(() => void poll(), 10000);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  log(`Observed MQTT=${observedMessages}, MPM rows=${observedRows}. Compare battery_id, soc and advancing last_seen_at; rows alone do not prove forwarding.`);
  client.end(true);
  process.exitCode = failed || !observedMessages || !observedRows ? 1 : 0;
}
setTimeout(stop, duration * 1000).unref();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
