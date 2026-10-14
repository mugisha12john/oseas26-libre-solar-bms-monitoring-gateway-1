import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats").default as (ajv: Ajv2020) => void;
import type { ValidateFunction } from "ajv";

export type MessageType =
  | "telemetry"
  | "event"
  | "status"
  | "alert"
  | "control";

function schemasDirectory(): string {
  const candidates = [
    resolve(process.cwd(), "schemas"),
    resolve(process.cwd(), "../schemas"),
  ];
  const directory = candidates.find(existsSync);
  if (!directory) throw new Error("Could not locate the schemas directory");
  return directory;
}

export class MessageValidator {
  private readonly validators: Record<MessageType, ValidateFunction>;

  constructor(directory = schemasDirectory()) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    this.validators = Object.fromEntries(
      (["telemetry", "event", "status", "alert", "control"] as const).map(
        (type) => {
          const schema = JSON.parse(
            readFileSync(resolve(directory, `${type}.schema.json`), "utf8"),
          );
          return [type, ajv.compile(schema)];
        },
      ),
    ) as Record<MessageType, ValidateFunction>;
  }

  validate(type: MessageType, payload: unknown): void {
    const validate = this.validators[type];
    if (!validate(payload))
      throw new Error(
        `Invalid ${type} message: ${this.validators[type].errors?.map((error: { instancePath?: string; message?: string }) => `${error.instancePath || "/"} ${error.message}`).join(", ")}`,
      );
  }
}
