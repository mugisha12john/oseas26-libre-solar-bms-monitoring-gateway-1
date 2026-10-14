import { MqttPublisher } from "./mqtt-publisher.js";
import { BatterySimulator } from "./simulator.js";
import type { ControlCommand, Scenario } from "./types.js";

const scenarios: Scenario[] = [
  "NORMAL",
  "CHARGING",
  "DISCHARGING",
  "LOW_SOC",
  "HIGH_TEMPERATURE",
  "CELL_IMBALANCE",
  "OVER_CURRENT",
  "UNDER_VOLTAGE",
  "FAULT",
  "RECOVERY",
];
const setting = (name: string, fallback: string): string =>
  process.env[name]?.trim() || fallback;
const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main(): Promise<void> {
  const scenario = setting(
    "SIMULATOR_SCENARIO",
    "NORMAL",
  ).toUpperCase() as Scenario;
  if (!scenarios.includes(scenario))
    throw new Error(
      `Unknown SIMULATOR_SCENARIO '${scenario}'. Choose: ${scenarios.join(", ")}`,
    );
  const siteId = setting("SITE_ID", "site-001");
  const batteryId = setting("BATTERY_ID", "BAT-001");
  const simulator = new BatterySimulator(siteId, batteryId, scenario);
  const publisher = new MqttPublisher(
    setting("MQTT_HOST", "mosquitto"),
    Number(setting("MQTT_PORT", "1883")),
    siteId,
    batteryId,
    setting("MQTT_USERNAME", ""),
    setting("MQTT_PASSWORD", ""),
  );
  const interval = Number(setting("PUBLISH_INTERVAL_SECONDS", "1")) * 1000;
  let timeScale = 1;
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await publisher.connect();
  await publisher.subscribeControl((command: ControlCommand) => {
    if (command.command === "SET_SCENARIO") {
      simulator.setScenario(command.value as Scenario);
      console.info(`Scenario changed at runtime: ${simulator.scenario}`);
      return;
    }
    timeScale = command.value as number;
    console.info(`Time scale changed at runtime: ${timeScale}`);
  });
  console.info(`Connected to MQTT broker; scenario=${scenario}`);
  await publisher.publishDiscovery();
  await publisher.publish("status", simulator.status("online"), true);
  try {
    while (!stopping) {
      const telemetry = simulator.step();
      await publisher.publish("telemetry", telemetry);
      const event = simulator.nextEvent();
      if (event) await publisher.publish("event", event);
      await sleep(interval / timeScale);
    }
  } finally {
    if (publisher)
      await publisher
        .publish("status", simulator.status("offline"), true)
        .catch(() => undefined);
    await publisher.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
