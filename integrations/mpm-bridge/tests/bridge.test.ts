import assert from "node:assert/strict";
import test from "node:test";

import { BatteryDownsampler } from "../src/downsampler.js";
import {
  faultFromAlert,
  faultFromEvent,
  healthFromTelemetry,
} from "../src/mapping.js";

const telemetry = {
  battery_id: "BAT-001",
  site_id: "site-001",
  timestamp: "2026-10-09T18:00:00Z",
  battery: {
    soc_pct: 78,
    soh_percent: 93,
    cycle_count: 324,
    temperature_c: 32,
  },
  cells: { imbalance_v: 0.012 },
  bms: { state: "NORMAL" },
};

test("maps telemetry and keeps interval maximum temperature", () => {
  const downsampler = new BatteryDownsampler(60_000);
  downsampler.ingest(telemetry, 0);
  downsampler.ingest(
    {
      ...telemetry,
      timestamp: "2026-10-09T18:00:30Z",
      battery: { ...telemetry.battery, temperature_c: 41 },
    },
    30_000,
  );
  assert.deepEqual(downsampler.due(59_999), []);
  const [summary] = downsampler.due(60_000);
  assert.equal(summary.max_temperature_c, 41);
  assert.equal(summary.soc, 78);
  assert.equal(summary.bms_state, "normal");
});

test("maps events and alerts to MPM fault payloads", () => {
  const event = faultFromEvent({
    event_id: "event-1",
    battery_id: "BAT-001",
    site_id: "site-001",
    timestamp: "2026-10-09T18:00:00Z",
    type: "HIGH_TEMPERATURE",
    severity: "WARNING",
    message: "Temperature high",
    value: 41,
    unit: "°C",
  });
  assert.equal(event.severity, "warning");
  assert.equal(event.rule_id, "HIGH_TEMPERATURE");
  assert.equal(event.evidence.value, 41);

  const alert = faultFromAlert({
    alert_id: "alert-1",
    battery_id: "BAT-001",
    severity: "CRITICAL",
    rule_id: "cell-imbalance",
    title: "Cell imbalance",
    evidence: { metric: "imbalance_v", value: 0.1, unit: "V", threshold: 0.05 },
    explanation: "Cell delta is high",
    created_at: "2026-10-09T18:00:00Z",
  });
  assert.equal(alert.severity, "critical");
  assert.equal(alert.evidence.threshold, 0.05);
});

test("maps the latest telemetry to a health summary", () => {
  assert.deepEqual(healthFromTelemetry(telemetry, 41), {
    battery_id: "BAT-001",
    site_id: "site-001",
    soc: 78,
    soh: 93,
    cycle_count: 324,
    cell_imbalance_v: 0.012,
    max_temperature_c: 41,
    bms_state: "normal",
    last_seen_at: "2026-10-09T18:00:00Z",
  });
});
