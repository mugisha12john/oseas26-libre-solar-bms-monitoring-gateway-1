# BMS simulator (TypeScript)

The simulator is deterministic and changes state gradually each publishing
interval; it is not a random-number generator. It publishes canonical
telemetry every second by default, a retained `online` status at startup,
and one scenario event where appropriate.

Variables: `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`,
`SITE_ID`, `BATTERY_ID`, `SIMULATOR_SCENARIO`, and
`PUBLISH_INTERVAL_SECONDS`.

Run `npm run build`, `npm test`, or `npm run dev` from this directory. The Docker image uses the compiled JavaScript output.

Runtime MQTT `SET_SCENARIO` commands restart the selected scenario's ramp.
Selecting `NORMAL` explicitly resets simulated measurements to a healthy baseline, so prior heat, low charge, undervoltage, or cell imbalance cannot keep the simulator in `FAULT`.
Other scenario selections preserve measurements; use `RECOVERY` for gradual recovery without resetting them.
Normal cell jitter is anchored to fixed healthy voltages to avoid accumulated rounding drift.
BMS error flags describe active measurement conditions, with fault conditions taking priority over warnings.
These simulator controls do not clear physical BMS faults or stored MPM fault history.

