import type { BatteryState } from "../types.js";
import { clamp, derivePackVoltage, round, setCellVoltages } from "./common.js";

export function chargingScenario(
  state: BatteryState,
  tick: number,
): BatteryState {
  const socPct = clamp(state.socPct + 0.45, 50, 100);
  const temperatureC = clamp(state.temperatureC + 0.12, 28, 39);
  const packCurrentA = round(-(12.5 + Math.sin(tick / 3) * 1.8), 2);
  const cellVoltages = setCellVoltages(
    state.cellVoltages.map((cell) => round(cell + 0.012, 3)),
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
