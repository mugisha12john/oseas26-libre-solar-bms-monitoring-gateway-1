import type { BatteryState } from "../types.js";
import { clamp, derivePackVoltage, round, setCellVoltages } from "./common.js";

export function underVoltageScenario(
  state: BatteryState,
  tick: number,
): BatteryState {
  const voltageStep = 0.22 + (tick % 3) * 0.12;
  const cellVoltages = setCellVoltages(
    state.cellVoltages.map((cell) => round(cell - voltageStep / 4, 3)),
  );

  return {
    ...state,
    socPct: clamp(state.socPct - 1.2, 10, 70),
    temperatureC: clamp(state.temperatureC - 0.25, 18, 35),
    packCurrentA: round(8.2 + tick * 0.6, 2),
    cellVoltages,
    packVoltageV: derivePackVoltage(cellVoltages),
  };
}
