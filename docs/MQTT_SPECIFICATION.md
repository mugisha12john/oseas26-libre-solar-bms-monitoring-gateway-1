# MQTT contract, version 1.0

This is the central reference for MQTT topics, JSON payloads, and Home Assistant discovery in this project.
The JSON Schema Draft 2020-12 files in [`schemas/`](../schemas/) are authoritative for payload validation.
This document describes their meaning and the current implementation's behavior.

## Topic structure

```text
libre-solar/{site_id}/{battery_id}/{message_type}
```

Example: `libre-solar/site-001/BAT-001/telemetry`.
Topic names and IDs are case-sensitive.
Use nonempty IDs without `/`, `+`, or `#` so each ID occupies one topic level.
Keep topic IDs and payload IDs equal; the JSON schemas cannot enforce that relationship.

| Suffix | Current publisher | Consumer | Publish QoS | Retained |
| --- | --- | --- | --- | --- |
| `telemetry` | Simulator | Dashboard, MPM bridge, Home Assistant sensors | 1 | No |
| `event` | Simulator | Dashboard, MPM bridge | 1 | No |
| `status` | Simulator at startup/graceful shutdown | Dashboard, MPM bridge, Home Assistant | 1 | Yes |
| `alert` | No active publisher in this MVP | MPM bridge supports it | Recommended 1 | Recommended no |
| `control` | Demo operator/test tool | Simulator | Recommended 1 | No: commands should not replay at restart |

The bridge subscribes at QoS 1 to `libre-solar/+/+/+` and handles telemetry, event, alert, and status messages.
It ignores unsupported suffixes such as control.
The dashboard subscribes to `libre-solar/#`; the simulator subscribes at QoS 1 to its own `/control` topic.
Home Assistant uses the state and availability topics in discovery configurations.
MPM itself receives HTTP requests from the bridge, rather than subscribing to MQTT.
The real hardware adapter and Prospect adapter are planned components.

QoS 1 permits duplicate delivery.
The current MPM fault writer appends history rows without event-ID deduplication; do not assume exactly-once storage.
Retention means a new subscriber receives the last value, not full history.
The simulator has no MQTT Last Will, so an abrupt crash can leave retained status as `online`.
The gateway dashboard separately detects stale telemetry with its offline timeout.

## Shared payload rules

- Payloads are UTF-8 JSON objects with `schema_version` exactly `"1.0"`.
- Schema objects with `additionalProperties: false` reject undeclared fields.
- Measurements are JSON numbers, not strings such as `"82%"`.
- Telemetry, status, and alert timestamps require UTC `Z`, with optional fractional seconds.
- The event schema also accepts RFC 3339 timezone offsets; the simulator emits UTC `Z`.
- Units are indicated by field names: volts `_v`, amperes `_a`, watts `_w`, Celsius `_c`, and percentages `_pct`/`_percent`.

The simulator validates outgoing canonical messages and incoming controls using [`MessageValidator`](../simulator/src/validation.ts).
The bridge parses/maps JSON but does not perform full JSON Schema validation itself.

## Telemetry

Topic: `libre-solar/{site_id}/{battery_id}/telemetry`.
Schema: [`telemetry.schema.json`](../schemas/telemetry.schema.json).
Default simulator interval: one second, controlled by `PUBLISH_INTERVAL_SECONDS`.

```json
{
  "schema_version": "1.0",
  "battery_id": "BAT-001",
  "site_id": "site-001",
  "timestamp": "2026-10-12T17:49:03.000Z",
  "battery": {
    "pack_voltage_v": 12.948,
    "pack_current_a": 7.81,
    "power_w": 101.124,
    "soc_pct": 82,
    "temperature_c": 31.2,
    "soh_percent": 93.52,
    "cycle_count": 324,
    "cycles": 324
  },
  "cells": {
    "voltages_v": [3.234, 3.236, 3.238, 3.24],
    "min_voltage_v": 3.234,
    "max_voltage_v": 3.24,
    "avg_voltage_v": 3.237,
    "imbalance_v": 0.006
  },
  "bms": {
    "state": "NORMAL",
    "balancing": false,
    "error_flags": []
  }
}
```

Every shown field is required except `battery.cycles`, the optional legacy alias of `cycle_count`.
When both cycle fields are supplied, producers should keep them equal.

| Field | Meaning and constraint |
| --- | --- |
| `battery.pack_voltage_v` | Whole-pack voltage, nonnegative |
| `battery.pack_current_a` | Positive for discharge, negative for charging |
| `battery.power_w` | Signed pack voltage × current, subject to rounding |
| `battery.soc_pct` | State of charge, 0–100 |
| `battery.temperature_c` | Temperature in degrees Celsius |
| `battery.soh_percent` | State of health, 0–100; currently simulated |
| `battery.cycle_count` | Nonnegative integer |
| `cells.voltages_v` | At least one nonnegative cell voltage |
| `cells.min_voltage_v`, `max_voltage_v`, `avg_voltage_v` | Nonnegative cell statistics |
| `cells.imbalance_v` | Maximum minus minimum cell voltage, nonnegative |
| `bms.state` | `NORMAL`, `LOW_SOC`, `WARNING`, or `FAULT` |
| `bms.balancing` | Boolean balancing state |
| `bms.error_flags` | Array of strings; may be empty |

The schema checks types/ranges, not arithmetic agreement between measurements.
The simulator computes SOH as `max(0, 100 - cycle_count * 0.02)` for demonstration.
This is not measured Libre Solar BMS health or a validated real battery health model.

## Event

Topic: `libre-solar/{site_id}/{battery_id}/event`.
Schema: [`event.schema.json`](../schemas/event.schema.json).

```json
{
  "schema_version": "1.0",
  "event_id": "evt-example-001",
  "battery_id": "BAT-001",
  "site_id": "site-001",
  "timestamp": "2026-10-12T17:50:00Z",
  "type": "HIGH_TEMPERATURE",
  "severity": "WARNING",
  "message": "Battery temperature exceeded warning threshold",
  "value": 43,
  "unit": "°C"
}
```

All shown fields except `value` and `unit` are required.
Severity is `INFO`, `WARNING`, or `CRITICAL`.
Allowed types are `LOW_SOC`, `HIGH_TEMPERATURE`, `LOW_TEMPERATURE`, `CELL_IMBALANCE`, `OVER_VOLTAGE`, `UNDER_VOLTAGE`, `OVER_CURRENT`, and `BMS_FAULT`.
The simulator implements a subset through scenarios; `RECOVERY` is a scenario, not an allowed event type.
The bridge forwards events as MPM faults immediately, after flushing pending telemetry for that battery.

## Status and availability

Topic: `libre-solar/{site_id}/{battery_id}/status`.
Schema: [`status.schema.json`](../schemas/status.schema.json).

```json
{
  "schema_version": "1.0",
  "battery_id": "BAT-001",
  "site_id": "site-001",
  "status": "online",
  "timestamp": "2026-10-12T17:49:03Z",
  "last_seen": "2026-10-12T17:49:03Z"
}
```

Every field is required; status is `online` or `offline`.
`timestamp` is the status message time; `last_seen` represents the producer's last observation time.
The simulator publishes status at startup and graceful shutdown, not on every telemetry tick.
Its current helper sets both times to when the status is generated.
Home Assistant extracts `status` from JSON; it does not expect a plain-text payload.
The bridge forwards offline status immediately, with null measurements and `bms_state=offline`.
Online status alone does not update MPM health.

## Alert

Topic: `libre-solar/{site_id}/{battery_id}/alert`.
Schema: [`alert.schema.json`](../schemas/alert.schema.json).
The contract and bridge support exist, but no alert/rule publisher is active in this MVP.

```json
{
  "schema_version": "1.0",
  "alert_id": "alert-example-001",
  "battery_id": "BAT-001",
  "severity": "WARNING",
  "rule_id": "HIGH_TEMPERATURE",
  "title": "Battery temperature warning",
  "evidence": {
    "metric": "battery.temperature_c",
    "value": 43,
    "unit": "°C",
    "threshold": 40,
    "trend": "INCREASING"
  },
  "explanation": "Temperature is above the configured warning threshold.",
  "recommended_checks": ["Check battery load and ventilation."],
  "created_at": "2026-10-12T17:50:00Z"
}
```

All top-level fields shown are required.
The schema has no `site_id` field; the topic carries the site.
Evidence requires `metric`, `value`, `unit`, and `threshold`.
Optional evidence fields are `trend` (`INCREASING`, `DECREASING`, `STABLE`) and `affected_cell` (integer starting at 1).
`recommended_checks` must contain at least one nonempty string.
Severity uses the same three uppercase values as events.
The bridge stores evidence/explanation as an MPM fault but currently does not persist `recommended_checks` or `alert_id` as separate fault fields.

## Simulator control

Topic: `libre-solar/{site_id}/{battery_id}/control`.
Schema: [`control.schema.json`](../schemas/control.schema.json).
Controls are implemented in [`simulator/src/main.ts`](../simulator/src/main.ts) and affect the simulator only.
They are not commands for real battery hardware.

```json
{
  "schema_version": "1.0",
  "command": "SET_SCENARIO",
  "value": "LOW_SOC"
}
```

Allowed scenarios: `NORMAL`, `CHARGING`, `DISCHARGING`, `LOW_SOC`, `HIGH_TEMPERATURE`, `CELL_IMBALANCE`, `OVER_CURRENT`, `UNDER_VOLTAGE`, `FAULT`, and `RECOVERY`.

```json
{
  "schema_version": "1.0",
  "command": "SET_TIME_SCALE",
  "value": 2
}
```

All three fields are required; time scale must be a number greater than zero.
The implementation waits `PUBLISH_INTERVAL_SECONDS / value` between steps, so `2` doubles the step/publish rate.
Runtime commands are not retained or written into `.env`; restart restores the configured startup scenario and time scale 1.
`SET_SCENARIO=NORMAL` resets simulated measurements to a healthy baseline on the next published step.
Other scenario changes preserve measurements and restart the selected scenario's ramp.
`RECOVERY` gradually converges cell voltages to the healthy baseline while charge and temperature recover.
Selecting a scenario does not clear stored MPM faults or send commands to real battery hardware.

Demonstrate a scenario change, then restore normal operation:

```bash
docker compose exec -T mosquitto mosquitto_pub -h localhost -q 1 \
  -t 'libre-solar/site-001/BAT-001/control' \
  -m '{"schema_version":"1.0","command":"SET_SCENARIO","value":"LOW_SOC"}'

docker compose exec -T mosquitto mosquitto_pub -h localhost -q 1 \
  -t 'libre-solar/site-001/BAT-001/control' \
  -m '{"schema_version":"1.0","command":"SET_SCENARIO","value":"NORMAL"}'
```

A fault scenario can append fault-history rows in the demo MPM database.
Returning to normal does not delete history or close existing faults.

## Home Assistant auto-discovery

Discovery configurations are generated by [`simulator/src/home-assistant.ts`](../simulator/src/home-assistant.ts).
At startup, the simulator publishes them with QoS 1 and retention enabled.
They use Home Assistant's discovery format rather than the canonical battery schemas.
All entities use the existing telemetry/status topics, with no separate Home Assistant telemetry stream.

```text
homeassistant/{component}/{device_id}/{entity_key}/config
```

Component is `sensor` or `binary_sensor`.
Device ID is `libre_solar_{site_id}_{battery_id}` with hyphens replaced by underscores.
For the demo it is `libre_solar_site_001_BAT_001`.
All entities share the device object so they appear as one battery device.
Choose IDs that remain distinct after this hyphen-to-underscore replacement.

Example topic: `homeassistant/sensor/libre_solar_site_001_BAT_001/soc/config`.

```json
{
  "name": "Battery SOC",
  "unique_id": "libre_solar_site_001_BAT_001_soc",
  "object_id": "libre_solar_site_001_BAT_001_soc",
  "state_topic": "libre-solar/site-001/BAT-001/telemetry",
  "value_template": "{{ value_json.battery.soc_pct }}",
  "availability_topic": "libre-solar/site-001/BAT-001/status",
  "availability_template": "{{ value_json.status }}",
  "payload_available": "online",
  "payload_not_available": "offline",
  "device": {
    "identifiers": ["libre_solar_site_001_BAT_001"],
    "name": "Libre Solar BAT-001",
    "manufacturer": "Libre Solar",
    "model": "BMS C1"
  },
  "unit_of_measurement": "%",
  "device_class": "battery",
  "state_class": "measurement"
}
```

| Entity key | Component | JSON value path | Unit/class |
| --- | --- | --- | --- |
| `soc` | sensor | `battery.soc_pct` | %, battery |
| `pack_voltage` | sensor | `battery.pack_voltage_v` | V, voltage |
| `pack_current` | sensor | `battery.pack_current_a` | A, current |
| `power` | sensor | `battery.power_w` | W, power |
| `temperature` | sensor | `battery.temperature_c` | °C, temperature |
| `min_cell_voltage` | sensor | `cells.min_voltage_v` | V, voltage |
| `max_cell_voltage` | sensor | `cells.max_voltage_v` | V, voltage |
| `cell_imbalance` | sensor | `cells.imbalance_v` | V, voltage |
| `cell_1_voltage` through `cell_4_voltage` | sensor | `cells.voltages_v[0]` through `[3]` | V, voltage |
| `average_cell_voltage` | sensor | `cells.avg_voltage_v` | V, voltage |
| `cycles` | sensor | `battery.cycle_count` | `total_increasing` state class |
| `bms_state` | sensor | `bms.state` | Text, no state class |
| `balancing` | binary_sensor | `bms.balancing` | `True` / `False` after rendering |
| `online` | binary_sensor | `status` from the status topic | `online` / `offline` |

The default battery has 15 sensors and two binary sensors.
Numeric sensors other than cycles use state class `measurement`.
Balancing shares telemetry availability settings; online reads status directly with no separate availability topic.
Discovery assumes four cells, although the telemetry schema permits other cell counts.
There is currently no SOH discovery entity.
Home Assistant may normalize entity IDs or keep registry names; `unique_id` is the stable integration identity.

Connect Home Assistant's MQTT integration to this broker, then import [`dashboard.yaml`](../integrations/home-assistant/dashboard.yaml).
For the current host-networked Home Assistant container, use `localhost:1883`; `mosquitto` resolves only on the gateway Docker network.
See [Home Assistant setup](../integrations/home-assistant/README.md) for dashboard instructions.

## Inspect and validate

Run from the gateway repository:

```bash
# Watch canonical battery messages.
docker compose exec -T mosquitto mosquitto_sub -h localhost \
  -t 'libre-solar/#' -v

# Watch retained discovery configurations.
docker compose exec -T mosquitto mosquitto_sub -h localhost \
  -t 'homeassistant/#' -v

# Run schema, simulator, and discovery tests.
docker compose run --rm --no-deps simulator npm test

# Compare MQTT telemetry and MPM stored summaries.
bash scripts/inspect-mpm.sh watch
```

Broker commands assume the checked-in anonymous development configuration.
Authenticated deployments need matching client credentials and transport configuration.
Update schemas, this document, implementations, and relevant tests together whenever the contract changes.
Keep consumer-specific mapping inside adapters instead of inventing different telemetry formats.
