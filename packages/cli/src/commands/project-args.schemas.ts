import { Schema } from "effect";

/** Existing terminal threshold vocabulary, validated before assigning logger policy. */
export const minimumLogLevelSchema = Schema.Literals([
  "all",
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "none",
]);
