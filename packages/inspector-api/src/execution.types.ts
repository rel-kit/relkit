import type { LoggerOptions } from "@relkit/runtime-effect";

/** Router logger controls; collection stays separate from the queried Inspector feed. */
export type InspectorLoggingOptions = Omit<LoggerOptions, "collector">;

/** Minimal lifetime contract retained by a router's owner registry. */
export interface InspectorExecutionOwner {
  readonly dispose: () => Promise<void>;
}
