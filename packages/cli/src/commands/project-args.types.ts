import type { MinimumLogLevel } from "@relkit/runtime-effect";

/** Parsed shared project flags; absent overrides preserve authored configuration. */
export interface ProjectArgs {
  readonly projectRoot?: string;
  readonly port?: number;
  readonly inspectorPort?: number;
  readonly local?: "on" | "off";
  readonly logLevel?: MinimumLogLevel;
  readonly verbose?: boolean;
  readonly noColor?: boolean;
}
