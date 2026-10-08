import type { CliLogger } from "./main-support-types.js";

/** Invocation-local compatibility callback messages; the stop marker drains prior logs. */
export type CliLogEvent =
  | { readonly kind: "stop" }
  | {
      readonly kind: "log";
      readonly level: Parameters<CliLogger>[0];
      readonly message: string;
      readonly fields: Readonly<Record<string, unknown>>;
    };
