import type { BatteryState } from "../types.js";
import { clamp, derivePackVoltage, round, setCellVoltages } from "./common.js";

export function dischargingScenario(
  state: BatteryState,
  tick: number,
): BatteryState {
  const socPct = clamp(state.socPct - 0.42, 10, 95);
  const temperatureC = clamp(
    state.temperatureC + (tick % 2 === 0 ? 0.14 : -0.08),
    24,
    38,
  );
  const packCurrentA = round(8.8 + (tick % 4) * 0.9, 2);
  const cellVoltages = setCellVoltages(
    state.cellVoltages.map((cell) => round(cell - 0.008, 3)),
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
