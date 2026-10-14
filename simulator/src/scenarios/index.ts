import type { BatteryState, Scenario } from "../types.js";
import { normalScenario } from "./normal.js";
import { chargingScenario } from "./charging.js";
import { dischargingScenario } from "./discharging.js";
import { lowSocScenario } from "./low-soc.js";
import { highTemperatureScenario } from "./high-temperature.js";
import { cellImbalanceScenario } from "./cell-imbalance.js";
import { overCurrentScenario } from "./over-current.js";
import { underVoltageScenario } from "./under-voltage.js";
import { faultScenario } from "./fault.js";
import { recoveryScenario } from "./recovery.js";

export const scenarioHandlers: Record<
  Scenario,
  (state: BatteryState, tick: number) => BatteryState
> = {
  NORMAL: normalScenario,
  CHARGING: chargingScenario,
  DISCHARGING: dischargingScenario,
  LOW_SOC: lowSocScenario,
  HIGH_TEMPERATURE: highTemperatureScenario,
  CELL_IMBALANCE: cellImbalanceScenario,
  OVER_CURRENT: overCurrentScenario,
  UNDER_VOLTAGE: underVoltageScenario,
  FAULT: faultScenario,
  RECOVERY: recoveryScenario,
};
