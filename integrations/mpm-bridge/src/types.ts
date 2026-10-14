export interface TelemetryMessage {
  battery_id: string;
  site_id: string;
  timestamp: string;
  battery: {
    soc_pct: number;
    soh_percent: number;
    cycle_count: number;
    cycles?: number;
    temperature_c: number;
  };
  cells: { imbalance_v: number };
  bms: { state: string };
}

export interface EventMessage {
  event_id: string;
  battery_id: string;
  site_id: string;
  timestamp: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  value?: number;
  unit?: string;
}

export interface StatusMessage {
  battery_id: string;
  site_id: string;
  status: "online" | "offline";
  timestamp: string;
  last_seen: string;
}

export interface AlertMessage {
  alert_id: string;
  battery_id: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  rule_id: string;
  title: string;
  evidence: Record<string, unknown>;
  explanation: string;
  created_at: string;
}

export interface BatteryHealthSummary {
  battery_id: string;
  site_id: string;
  soc: number | null;
  soh: number | null;
  cycle_count: number | null;
  cell_imbalance_v: number | null;
  max_temperature_c: number | null;
  bms_state: string | null;
  last_seen_at: string;
}

export interface BatteryFault {
  battery_id: string;
  rule_id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  evidence: Record<string, unknown>;
  explanation: string;
  status: "open";
  occurred_at: string;
}
