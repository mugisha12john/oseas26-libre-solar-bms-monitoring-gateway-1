import type { BatteryState } from "../types.js";
import { clamp, derivePackVoltage, round, setCellVoltages } from "./common.js";

export function highTemperatureScenario(
  state: BatteryState,
  tick: number,
): BatteryState {
  const socPct = clamp(state.socPct - 0.12, 20, 70);
  const temperatureC = clamp(state.temperatureC + 0.9, 30, 46);
  const packCurrentA = round(10.8 + Math.sin(tick / 3) * 1.7, 2);
  const cellVoltages = setCellVoltages(
    state.cellVoltages.map((cell) => round(cell + 0.002, 3)),
  );

  return {
    ...state,
    socPct,
    temperatureC,
    packCurrentA,
    cellVoltages,
    packVoltageV: derivePackVoltage(cellVoltages),
  };
}
