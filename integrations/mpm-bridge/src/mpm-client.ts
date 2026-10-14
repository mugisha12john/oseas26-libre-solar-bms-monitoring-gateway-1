import type { BatteryFault, BatteryHealthSummary } from "./types.js";

export class MpmClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly maxRetries = 4,
  ) {}

  upsertHealth(summary: BatteryHealthSummary): Promise<void> {
    return this.request(
      "/api/libre-solar/battery-health/health",
      "PUT",
      summary,
    );
  }

  storeFault(fault: BatteryFault): Promise<void> {
    return this.request(
      "/api/libre-solar/battery-health/faults",
      "POST",
      fault,
    );
  }

  private async request(
    path: string,
    method: string,
    body: unknown,
  ): Promise<void> {
    if (!this.apiKey) throw new Error("MPM_API_KEY is required");
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await fetch(
          `${this.baseUrl.replace(/\/$/, "")}${path}`,
          {
            method,
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          },
        );
        if (response.ok) return;
        const message = await response.text();
        if (response.status < 429 && response.status < 500) {
          throw new Error(
            `MPM ${method} ${path} returned ${response.status}: ${message}`,
          );
        }
        lastError = new Error(
          `MPM ${method} ${path} returned ${response.status}: ${message}`,
        );
      } catch (error) {
        lastError = error;
      }
      if (attempt < this.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("MPM request failed");
  }
}
