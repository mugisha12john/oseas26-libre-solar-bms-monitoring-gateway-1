import assert from "node:assert/strict";
import test from "node:test";
import { BatterySimulator } from "../src/simulator.js";
import { MessageValidator } from "../src/validation.js";

const validator = new MessageValidator();
const telemetry = () => new BatterySimulator("site-001", "BAT-001").step();

test("valid telemetry passes", () =>
  assert.doesNotThrow(() => validator.validate("telemetry", telemetry())));
test("SOC above 100 fails", () => {
  const invalid = telemetry();
  invalid.battery.soc_pct = 101;
  assert.throws(
    () => validator.validate("telemetry", invalid),
    /Invalid telemetry/,
  );
});
test("invalid timestamp fails", () => {
  const invalid = telemetry();
  invalid.timestamp = "today";
  assert.throws(
    () => validator.validate("telemetry", invalid),
    /Invalid telemetry/,
  );
});
test("non-UTC telemetry timestamp fails", () => {
  const invalid = telemetry();
  invalid.timestamp = "2026-10-06T12:00:00+01:00";
  assert.throws(
    () => validator.validate("telemetry", invalid),
    /Invalid telemetry/,
  );
});
test("telemetry requires SOH and cycle count", () => {
  const invalid = telemetry();
  delete (invalid.battery as Record<string, unknown>).soh_percent;
  assert.throws(
    () => validator.validate("telemetry", invalid),
    /Invalid telemetry/,
  );
});
test("missing battery ID fails", () => {
  const invalid = telemetry() as Record<string, unknown>;
  delete invalid.battery_id;
  assert.throws(
    () => validator.validate("telemetry", invalid),
    /Invalid telemetry/,
  );
});
test("invalid event severity fails", () => {
  const invalid = {
    schema_version: "1.0",
    event_id: "evt-1",
    battery_id: "BAT-001",
    site_id: "site-001",
    timestamp: new Date().toISOString(),
    type: "LOW_SOC",
    severity: "URGENT",
    message: "bad severity",
  };
  assert.throws(() => validator.validate("event", invalid), /Invalid event/);
});
test("valid status requires last_seen", () => {
  assert.doesNotThrow(() =>
    validator.validate("status", {
      schema_version: "1.0",
      battery_id: "BAT-001",
      site_id: "site-001",
      status: "online",
      timestamp: "2026-10-06T12:00:00Z",
      last_seen: "2026-10-06T12:00:00Z",
    }),
  );
});
test("status without last_seen fails", () => {
  assert.throws(
    () =>
      validator.validate("status", {
        schema_version: "1.0",
        battery_id: "BAT-001",
        site_id: "site-001",
        status: "online",
        timestamp: "2026-10-06T12:00:00Z",
      }),
    /Invalid status/,
  );
});
test("valid alert and control payloads pass", () => {
  assert.doesNotThrow(() =>
    validator.validate("alert", {
      schema_version: "1.0",
      alert_id: "alert-1",
      battery_id: "BAT-001",
      severity: "WARNING",
      rule_id: "HIGH_TEMPERATURE",
      title: "Temperature warning",
      evidence: {
        metric: "temperature_c",
        value: 43,
        unit: "°C",
        threshold: 40,
        trend: "INCREASING",
      },
      explanation: "Temperature is above the warning threshold.",
      recommended_checks: ["Check battery load and ventilation."],
      created_at: "2026-10-06T12:00:00Z",
    }),
  );
  assert.doesNotThrow(() =>
    validator.validate("control", {
      schema_version: "1.0",
      command: "SET_SCENARIO",
      value: "FAULT",
    }),
  );
});
test("invalid alert and control payloads fail", () => {
  assert.throws(
    () =>
      validator.validate("alert", {
        schema_version: "1.0",
        alert_id: "alert-1",
        battery_id: "BAT-001",
        severity: "WARNING",
        rule_id: "HIGH_TEMPERATURE",
        title: "Temperature warning",
        evidence: { metric: "temperature_c", value: 43, unit: "°C" },
        explanation: "Missing threshold.",
        recommended_checks: [],
        created_at: "2026-10-06T12:00:00+01:00",
      }),
    /Invalid alert/,
  );
  assert.throws(
    () =>
      validator.validate("control", {
        schema_version: "1.0",
        command: "SET_TIME_SCALE",
        value: 0,
      }),
    /Invalid control/,
  );
});
