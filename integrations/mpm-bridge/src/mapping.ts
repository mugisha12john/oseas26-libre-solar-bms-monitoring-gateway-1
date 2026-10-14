import type {
  AlertMessage,
  BatteryFault,
  BatteryHealthSummary,
  EventMessage,
  StatusMessage,
  TelemetryMessage,
} from "./types.js";

const severity = (
  value: "INFO" | "WARNING" | "CRITICAL",
): BatteryFault["severity"] => value.toLowerCase() as BatteryFault["severity"];

export function healthFromTelemetry(
  telemetry: TelemetryMessage,
  maxTemperature = telemetry.battery.temperature_c,
): BatteryHealthSummary {
  return {
    battery_id: telemetry.battery_id,
    site_id: telemetry.site_id,
    soc: telemetry.battery.soc_pct,
    soh: telemetry.battery.soh_percent,
    cycle_count:
      telemetry.battery.cycle_count ?? telemetry.battery.cycles ?? null,
    cell_imbalance_v: telemetry.cells.imbalance_v,
    max_temperature_c: maxTemperature,
    bms_state: telemetry.bms.state.toLowerCase(),
    last_seen_at: telemetry.timestamp,
  };
}

export function healthFromStatus(status: StatusMessage): BatteryHealthSummary {
  return {
    battery_id: status.battery_id,
    site_id: status.site_id,
    soc: null,
    soh: null,
    cycle_count: null,
    cell_imbalance_v: null,
    max_temperature_c: null,
    bms_state: status.status,
    last_seen_at: status.last_seen,
  };
}

export function faultFromEvent(event: EventMessage): BatteryFault {
  return {
    battery_id: event.battery_id,
    rule_id: event.type,
    severity: severity(event.severity),
    title: event.message,
    evidence: {
      value: event.value ?? null,
      unit: event.unit ?? null,
      event_id: event.event_id,
    },
    explanation: event.message,
    status: "open",
    occurred_at: event.timestamp,
  };
}

export function faultFromAlert(alert: AlertMessage): BatteryFault {
  return {
    battery_id: alert.battery_id,
    rule_id: alert.rule_id,
    severity: severity(alert.severity),
    title: alert.title,
    evidence: alert.evidence,
    explanation: alert.explanation,
    status: "open",
    occurred_at: alert.created_at,
  };
}
