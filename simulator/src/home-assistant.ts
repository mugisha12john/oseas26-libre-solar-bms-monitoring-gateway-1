export function discoveryMessages(
  siteId: string,
  batteryId: string,
): Array<[string, string]> {
  const baseTopic = `libre-solar/${siteId}/${batteryId}`;
  const deviceId = `libre_solar_${siteId}_${batteryId}`.replaceAll("-", "_");
  const device = {
    identifiers: [deviceId],
    name: `Libre Solar ${batteryId}`,
    manufacturer: "Libre Solar",
    model: "BMS C1",
  };
  const telemetryTopic = `${baseTopic}/telemetry`;
  const statusTopic = `${baseTopic}/status`;
  const metrics = [
    ["soc", "Battery SOC", "battery.soc_pct", "%", "battery", "measurement"],
    [
      "pack_voltage",
      "Pack Voltage",
      "battery.pack_voltage_v",
      "V",
      "voltage",
      "measurement",
    ],
    [
      "pack_current",
      "Pack Current",
      "battery.pack_current_a",
      "A",
      "current",
      "measurement",
    ],
    ["power", "Battery Power", "battery.power_w", "W", "power", "measurement"],
    [
      "temperature",
      "Battery Temperature",
      "battery.temperature_c",
      "°C",
      "temperature",
      "measurement",
    ],
    [
      "min_cell_voltage",
      "Minimum Cell Voltage",
      "cells.min_voltage_v",
      "V",
      "voltage",
      "measurement",
    ],
    [
      "max_cell_voltage",
      "Maximum Cell Voltage",
      "cells.max_voltage_v",
      "V",
      "voltage",
      "measurement",
    ],
    [
      "cell_imbalance",
      "Cell Imbalance",
      "cells.imbalance_v",
      "V",
      "voltage",
      "measurement",
    ],
    [
      "cell_1_voltage",
      "Cell 1 Voltage",
      "cells.voltages_v[0]",
      "V",
      "voltage",
      "measurement",
    ],
    [
      "cell_2_voltage",
      "Cell 2 Voltage",
      "cells.voltages_v[1]",
      "V",
      "voltage",
      "measurement",
    ],
    [
      "cell_3_voltage",
      "Cell 3 Voltage",
      "cells.voltages_v[2]",
      "V",
      "voltage",
      "measurement",
    ],
    [
      "cell_4_voltage",
      "Cell 4 Voltage",
      "cells.voltages_v[3]",
      "V",
      "voltage",
      "measurement",
    ],
    [
      "average_cell_voltage",
      "Average Cell Voltage",
      "cells.avg_voltage_v",
      "V",
      "voltage",
      "measurement",
    ],
    [
      "cycles",
      "Cycle Count",
      "battery.cycle_count",
      undefined,
      undefined,
      "total_increasing",
    ],
    ["bms_state", "BMS State", "bms.state", undefined, undefined, undefined],
  ] as const;
  const messages = metrics.map(
    ([key, name, path, unit, deviceClass, stateClass]) => {
      const config: Record<string, unknown> = {
        name,
        unique_id: `${deviceId}_${key}`,
        object_id: `${deviceId}_${key}`,
        state_topic: telemetryTopic,
        value_template: `{{ value_json.${path} }}`,
        availability_topic: statusTopic,
        availability_template: "{{ value_json.status }}",
        payload_available: "online",
        payload_not_available: "offline",
        device,
      };
      if (unit) config.unit_of_measurement = unit;
      if (deviceClass) config.device_class = deviceClass;
      if (stateClass) config.state_class = stateClass;
      return [
        `homeassistant/sensor/${deviceId}/${key}/config`,
        JSON.stringify(config),
      ] as [string, string];
    },
  );
  messages.push([
    `homeassistant/binary_sensor/${deviceId}/balancing/config`,
    JSON.stringify({
      name: "Balancing",
      unique_id: `${deviceId}_balancing`,
      object_id: `${deviceId}_balancing`,
      state_topic: telemetryTopic,
      value_template: "{{ value_json.bms.balancing }}",
      availability_topic: statusTopic,
      availability_template: "{{ value_json.status }}",
      payload_available: "online",
      payload_not_available: "offline",
      payload_on: "True",
      payload_off: "False",
      device,
    }),
  ]);
  messages.push([
    `homeassistant/binary_sensor/${deviceId}/online/config`,
    JSON.stringify({
      name: "Online",
      unique_id: `${deviceId}_online`,
      object_id: `${deviceId}_online`,
      state_topic: statusTopic,
      value_template: "{{ value_json.status }}",
      payload_on: "online",
      payload_off: "offline",
      device,
    }),
  ]);
  return messages;
}
