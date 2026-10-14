import { healthFromTelemetry } from "./mapping.js";
import type { BatteryHealthSummary, TelemetryMessage } from "./types.js";

type BatteryKey = `${string}/${string}`;

type Snapshot = {
  telemetry: TelemetryMessage;
  maxTemperature: number;
};

export class BatteryDownsampler {
  private readonly snapshots = new Map<BatteryKey, Snapshot>();
  private readonly lastFlush = new Map<BatteryKey, number>();

  constructor(private readonly intervalMs: number) {}

  ingest(telemetry: TelemetryMessage, now = Date.now()): void {
    const key = this.key(telemetry.site_id, telemetry.battery_id);
    const current = this.snapshots.get(key);
    this.snapshots.set(key, {
      telemetry,
      maxTemperature: Math.max(
        telemetry.battery.temperature_c,
        current?.maxTemperature ?? Number.NEGATIVE_INFINITY,
      ),
    });
    if (!this.lastFlush.has(key)) this.lastFlush.set(key, now);
  }

  due(now = Date.now()): BatteryHealthSummary[] {
    const summaries: BatteryHealthSummary[] = [];
    for (const [key, snapshot] of this.snapshots) {
      if (now - (this.lastFlush.get(key) ?? 0) < this.intervalMs) continue;
      summaries.push(this.take(key, snapshot));
      this.lastFlush.set(key, now);
    }
    return summaries;
  }

  flush(
    siteId: string,
    batteryId: string,
    now = Date.now(),
  ): BatteryHealthSummary | undefined {
    const key = this.key(siteId, batteryId);
    const snapshot = this.snapshots.get(key);
    if (!snapshot) return undefined;
    const summary = this.take(key, snapshot);
    this.lastFlush.set(key, now);
    return summary;
  }

  private take(key: BatteryKey, snapshot: Snapshot): BatteryHealthSummary {
    this.snapshots.delete(key);
    return healthFromTelemetry(snapshot.telemetry, snapshot.maxTemperature);
  }

  private key(siteId: string, batteryId: string): BatteryKey {
    return `${siteId}/${batteryId}`;
  }
}
