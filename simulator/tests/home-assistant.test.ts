import assert from "node:assert/strict";
import test from "node:test";
import { discoveryMessages } from "../src/home-assistant.js";

function discoveryMap(): Map<string, Record<string, unknown>> {
  return new Map(
    discoveryMessages("site-001", "BAT-001").map(([topic, payload]) => [
      topic,
      JSON.parse(payload) as Record<string, unknown>,
    ]),
  );
}

test("publishes device-based SOC discovery with canonical topics and availability", () => {
  const messages = discoveryMap();
  const config = messages.get(
    "homeassistant/sensor/libre_solar_site_001_BAT_001/soc/config",
  );

  assert.ok(config);
  assert.equal(config.unique_id, "libre_solar_site_001_BAT_001_soc");
  assert.equal(config.object_id, "libre_solar_site_001_BAT_001_soc");
  assert.equal(config.state_topic, "libre-solar/site-001/BAT-001/telemetry");
  assert.equal(config.value_template, "{{ value_json.battery.soc_pct }}");
  assert.equal(
    config.availability_topic,
    "libre-solar/site-001/BAT-001/status",
  );
  assert.equal(config.availability_template, "{{ value_json.status }}");
  assert.equal(config.payload_available, "online");
  assert.equal(config.payload_not_available, "offline");
  assert.deepEqual(config.device, {
    identifiers: ["libre_solar_site_001_BAT_001"],
    name: "Libre Solar BAT-001",
    manufacturer: "Libre Solar",
    model: "BMS C1",
  });
});

test("publishes all dashboard entity discovery configs from canonical telemetry", () => {
  const messages = discoveryMap();
  const expected = [
    "soc",
    "pack_voltage",
    "pack_current",
    "power",
    "temperature",
    "cycles",
    "bms_state",
    "cell_1_voltage",
    "cell_2_voltage",
    "cell_3_voltage",
    "cell_4_voltage",
    "min_cell_voltage",
    "max_cell_voltage",
    "average_cell_voltage",
    "cell_imbalance",
  ];

  for (const key of expected) {
    assert.ok(
      messages.has(
        `homeassistant/sensor/libre_solar_site_001_BAT_001/${key}/config`,
      ),
      `missing discovery config for ${key}`,
    );
  }

  assert.ok(
    messages.has(
      "homeassistant/binary_sensor/libre_solar_site_001_BAT_001/balancing/config",
    ),
  );
  assert.ok(
    messages.has(
      "homeassistant/binary_sensor/libre_solar_site_001_BAT_001/online/config",
    ),
  );
  assert.equal(messages.size, expected.length + 2);
});
