import type { BatteryState } from "../types.js";
import { clamp, derivePackVoltage, round, setCellVoltages } from "./common.js";

export function cellImbalanceScenario(
  state: BatteryState,
  tick: number,
): BatteryState {
  const baseline = [3.234, 3.236, 3.238, 3.24];
  const drift = clamp((tick - 1) * 0.035, 0, 0.2);
  const cellVoltages = baseline.map((cell, index) => {
    if (index === 3) return round(cell + drift + 0.05, 3);
    return round(cell + Math.max(0, 0.001 * Math.sin((tick + index) / 2)), 3);
  });

  return {
    ...state,
    socPct: clamp(state.socPct - 0.18, 40, 80),
    temperatureC: clamp(state.temperatureC + 0.15, 30, 38),
    packCurrentA: round(9.5 + Math.sin(tick / 2.5) * 0.8, 2),
    cellVoltages: setCellVoltages(cellVoltages),
    packVoltageV: derivePackVoltage(cellVoltages),
  };
}
