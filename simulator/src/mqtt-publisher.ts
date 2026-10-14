import mqtt, { type MqttClient } from "mqtt";
import { discoveryMessages } from "./home-assistant.js";
import { MessageValidator, type MessageType } from "./validation.js";
import type { ControlCommand } from "./types.js";

export class MqttPublisher {
  private readonly baseTopic: string;
  private readonly validator = new MessageValidator();
  private client?: MqttClient;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly siteId: string,
    private readonly batteryId: string,
    private readonly username = "",
    private readonly password = "",
  ) {
    this.baseTopic = `libre-solar/${siteId}/${batteryId}`;
  }

  async connect(): Promise<void> {
    this.client = mqtt.connect({
      host: this.host,
      port: this.port,
      protocol: "mqtt",
      clientId: `libre-solar-simulator-${this.batteryId}`,
      username: this.username || undefined,
      password: this.password || undefined,
      reconnectPeriod: 2_000,
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            new Error(`MQTT connection to ${this.host}:${this.port} timed out`),
          ),
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
  }

  async publish(
    type: MessageType,
    payload: unknown,
    retain = false,
  ): Promise<void> {
    this.validator.validate(type, payload);
    await this.publishRaw(
      `${this.baseTopic}/${type}`,
      JSON.stringify(payload),
      retain,
    );
  }

  async publishDiscovery(): Promise<void> {
    await Promise.all(
      discoveryMessages(this.siteId, this.batteryId).map(([topic, payload]) =>
        this.publishRaw(topic, payload, true),
      ),
    );
  }

  async subscribeControl(
    onCommand: (command: ControlCommand) => void,
  ): Promise<void> {
    if (!this.client?.connected) {
      throw new Error("MQTT client is not connected");
    }
    await new Promise<void>((resolve, reject) => {
      this.client?.subscribe(
        `${this.baseTopic}/control`,
        { qos: 1 },
        (error) => (error ? reject(error) : resolve()),
      );
    });
    this.client.on("message", (topic, payload) => {
      if (topic !== `${this.baseTopic}/control`) return;
      try {
        const parsed = JSON.parse(payload.toString()) as unknown;
        this.validator.validate("control", parsed);
        onCommand(parsed as ControlCommand);
      } catch (error) {
        console.error("Ignoring invalid MQTT control command", error);
      }
    });
  }

  async close(): Promise<void> {
    if (!this.client) return;
    await new Promise<void>((resolve) =>
      this.client?.end(false, {}, () => resolve()),
    );
  }

  private publishRaw(
    topic: string,
    payload: string,
    retain: boolean,
  ): Promise<void> {
    if (!this.client?.connected)
      return Promise.reject(new Error("MQTT client is not connected"));
    return new Promise((resolve, reject) =>
      this.client?.publish(topic, payload, { qos: 1, retain }, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
  }
}
