export const PROVIDER_CAPABILITIES = [
  "bucket",
  "cache",
  "job",
  "event",
  "model",
  "realtime",
  "agent-state",
] as const;

export type * from "./provider-nodes.types.js";
