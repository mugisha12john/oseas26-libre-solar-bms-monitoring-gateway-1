import type { BatteryState } from "../types.js";
import { clamp, derivePackVoltage, round, setCellVoltages } from "./common.js";

export function overCurrentScenario(
  state: BatteryState,
  tick: number,
): BatteryState {
  const packCurrentA = round(35 + (tick % 6) * 4.5, 2);
  const socPct = clamp(state.socPct - 0.4, 18, 76);
  const temperatureC = clamp(state.temperatureC + 0.6, 32, 55);
  const cellVoltages = setCellVoltages(
    state.cellVoltages.map((cell) => round(cell - 0.02, 3)),
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
