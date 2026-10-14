import mqtt, { type MqttClient } from "mqtt";

import { BatteryDownsampler } from "./downsampler.js";
import { faultFromAlert, faultFromEvent, healthFromStatus } from "./mapping.js";
import { MpmClient } from "./mpm-client.js";
import type {
  AlertMessage,
  EventMessage,
  StatusMessage,
  TelemetryMessage,
} from "./types.js";

export interface BridgeOptions {
  mqttHost: string;
  mqttPort: number;
  mqttUsername?: string;
  mqttPassword?: string;
  mpmClient: MpmClient;
  intervalMs: number;
}

export class MpmBridge {
  private readonly downsampler: BatteryDownsampler;
  private client?: MqttClient;
  private timer?: NodeJS.Timeout;
  private flushing = false;

  constructor(private readonly options: BridgeOptions) {
    this.downsampler = new BatteryDownsampler(options.intervalMs);
  }

  async start(): Promise<void> {
    this.client = mqtt.connect({
      host: this.options.mqttHost,
      port: this.options.mqttPort,
      protocol: "mqtt",
      username: this.options.mqttUsername || undefined,
      password: this.options.mqttPassword || undefined,
      clientId: `libre-solar-mpm-bridge-${process.pid}`,
      reconnectPeriod: 2_000,
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("MQTT bridge connection timed out")),
        15_000,
      );
      this.client?.once("connect", () => {
        clearTimeout(timeout);
        resolve();
      });
      this.client?.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    await this.subscribe();
    this.timer = setInterval(
      () => void this.flushDue(),
      Math.max(1_000, this.options.intervalMs / 2),
    );
    console.info(
      `MPM bridge connected to MQTT ${this.options.mqttHost}:${this.options.mqttPort}`,
    );
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (!this.client) return;
    await new Promise<void>((resolve) =>
      this.client?.end(false, {}, () => resolve()),
    );
  }

  private async subscribe(): Promise<void> {
    if (!this.client) throw new Error("MQTT bridge is not connected");
    await new Promise<void>((resolve, reject) => {
      this.client?.subscribe("libre-solar/+/+/+", { qos: 1 }, (error) =>
        error ? reject(error) : resolve(),
      );
    });
    this.client.on(
      "message",
      (topic, payload) => void this.handleMessage(topic, payload.toString()),
    );
  }

  private async handleMessage(topic: string, raw: string): Promise<void> {
    const parts = topic.split("/");
    if (parts.length !== 4 || parts[0] !== "libre-solar") return;
    const [, topicSiteId, topicBatteryId, messageType] = parts;
    try {
      const payload = JSON.parse(raw) as Record<string, unknown>;
      if (messageType === "telemetry") {
        this.downsampler.ingest(
          this.withTopicIds(
            payload,
            topicSiteId,
            topicBatteryId,
          ) as unknown as TelemetryMessage,
        );
        return;
      }
      if (messageType === "event") {
        await this.flush(topicSiteId, topicBatteryId);
        await this.options.mpmClient.storeFault(
          faultFromEvent(
            this.withTopicIds(
              payload,
              topicSiteId,
              topicBatteryId,
            ) as unknown as EventMessage,
          ),
        );
        console.info(`Forwarded event for ${topicSiteId}/${topicBatteryId}`);
        return;
      }
      if (messageType === "alert") {
        await this.flush(topicSiteId, topicBatteryId);
        await this.options.mpmClient.storeFault(
          faultFromAlert(
            this.withTopicIds(
              payload,
              topicSiteId,
              topicBatteryId,
            ) as unknown as AlertMessage,
          ),
        );
        console.info(`Forwarded alert for ${topicSiteId}/${topicBatteryId}`);
        return;
      }
      if (messageType === "status" && payload.status === "offline") {
        await this.flush(topicSiteId, topicBatteryId);
        await this.options.mpmClient.upsertHealth(
          healthFromStatus(
            this.withTopicIds(
              payload,
              topicSiteId,
              topicBatteryId,
            ) as unknown as StatusMessage,
          ),
        );
        console.info(
          `Forwarded offline status for ${topicSiteId}/${topicBatteryId}`,
        );
      }
    } catch (error) {
      console.error(`Failed to process MQTT message ${topic}:`, error);
    }
  }

  private async flushDue(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (const summary of this.downsampler.due()) {
        try {
          await this.options.mpmClient.upsertHealth(summary);
          console.info(
            `Forwarded health summary for ${summary.site_id}/${summary.battery_id}`,
          );
        } catch (error) {
          console.error(
            `Failed to forward health summary for ${summary.site_id}/${summary.battery_id}:`,
            error,
          );
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private async flush(siteId: string, batteryId: string): Promise<void> {
    const summary = this.downsampler.flush(siteId, batteryId);
    if (summary) await this.options.mpmClient.upsertHealth(summary);
  }

  private withTopicIds(
    payload: Record<string, unknown>,
    siteId: string,
    batteryId: string,
  ): Record<string, unknown> {
    return {
      ...payload,
      site_id: payload.site_id ?? siteId,
      battery_id: payload.battery_id ?? batteryId,
    };
  }
}
