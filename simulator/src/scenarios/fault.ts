import type { BatteryState } from "../types.js";
import { clamp, derivePackVoltage, round, setCellVoltages } from "./common.js";

export function faultScenario(state: BatteryState, tick: number): BatteryState {
  const cellVoltages = setCellVoltages([
    round(state.cellVoltages[0] - 0.12, 3),
    round(state.cellVoltages[1] - 0.09, 3),
    round(state.cellVoltages[2] - 0.08, 3),
    round(state.cellVoltages[3] - 0.15, 3),
  ]);

  return {
    ...state,
    socPct: clamp(state.socPct - 1.2, 5, 35),
    temperatureC: clamp(state.temperatureC + 2.4, 43, 60),
    packCurrentA: round(28 + (tick % 2 === 0 ? 0 : 6), 2),
    cellVoltages,
    packVoltageV: derivePackVoltage(cellVoltages),
  };
}
