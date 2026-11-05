/** Shared parsed project options preserve absent overrides and finite dev preparation. */
import type { MinimumLogLevel } from "relkit/runtime-effect";
import type { RuntimeName } from "relkit/runtime";

/** Parsed shared project flags; absent overrides preserve authored configuration. */
export interface ProjectArgs {
  readonly projectRoot?: string;
  readonly port?: number;
  readonly inspectorPort?: number;
  readonly local?: "on" | "off";
  readonly logLevel?: MinimumLogLevel;
  readonly verbose?: boolean;
  readonly noColor?: boolean;
  readonly prepare?: boolean;
  /** Runtime `relkit build` emits the production server for. */
  readonly runtime?: RuntimeName;
  /** Deploy target `relkit build` checks the build against; only `vercel` changes the build. */
  readonly target?: "vercel";
}
