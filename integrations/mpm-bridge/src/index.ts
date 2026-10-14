import { MpmBridge } from "./bridge.js";
import { MpmClient } from "./mpm-client.js";

const setting = (name: string, fallback: string): string =>
  process.env[name]?.trim() || fallback;

const bridge = new MpmBridge({
  mqttHost: setting("MQTT_HOST", "mosquitto"),
  mqttPort: Number(setting("MQTT_PORT", "1883")),
  mqttUsername: setting("MQTT_USERNAME", ""),
  mqttPassword: setting("MQTT_PASSWORD", ""),
  mpmClient: new MpmClient(
    setting("MPM_BASE_URL", "http://host.docker.internal:8000"),
    setting("MPM_API_KEY", ""),
    Number(setting("MPM_MAX_RETRIES", "4")),
  ),
  intervalMs: Number(setting("MPM_INTERVAL_SECONDS", "60")) * 1000,
});

const stop = async () => {
  await bridge.stop();
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

bridge.start().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
