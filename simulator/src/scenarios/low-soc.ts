import type { BatteryState } from "../types.js";
import { clamp, derivePackVoltage, round, setCellVoltages } from "./common.js";

export function lowSocScenario(
  state: BatteryState,
  tick: number,
): BatteryState {
  const socPct = clamp(state.socPct - 0.7, 10, 35);
  const temperatureC = clamp(state.temperatureC + 0.06, 24, 35);
  const packCurrentA = round(9.1 + (tick % 3) * 0.8, 2);
  const cellVoltages = setCellVoltages(
    state.cellVoltages.map((cell) => round(cell - 0.01, 3)),
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
