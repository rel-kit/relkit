import { defineFunction } from "@zsys/app";
import { telemetryEnvelope } from "../shared/schemas.js";

const captureEventTelemetry = defineFunction({
  id: "telemetry.capture",
  input: telemetryEnvelope,
  output: telemetryEnvelope,
  handler: async (input) => input,
});

export default captureEventTelemetry;
