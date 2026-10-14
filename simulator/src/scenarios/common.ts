import type { BatteryState } from "../types.js";

export const defaultCellVoltages = [3.234, 3.236, 3.238, 3.24] as const;

export const round = (value: number, places = 3): number =>
  Number(value.toFixed(places));

export const clamp = (
  value: number,
  minimum: number,
  maximum: number,
): number => Math.min(Math.max(value, minimum), maximum);

export const setCellVoltages = (
  cells: number[],
): BatteryState["cellVoltages"] => cells.map((cell) => round(cell, 3));

export const derivePackVoltage = (cells: number[]): number =>
  round(
    cells.reduce((sum, value) => sum + value, 0),
    3,
  );

export const cellMetrics = (cells: number[]) => {
  const voltages = cells.map((cell) => round(cell, 3));
  const min = Math.min(...voltages);
  const max = Math.max(...voltages);
  const avg = voltages.reduce((sum, value) => sum + value, 0) / voltages.length;
  return {
    voltages_v: voltages,
    min_voltage_v: round(min, 3),
    max_voltage_v: round(max, 3),
    avg_voltage_v: round(avg, 3),
    imbalance_v: round(max - min, 3),
  };
};
