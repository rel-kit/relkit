import type { DevInspectorOptions } from "./dev-process.types.js";
/** Concrete authored or packaged inspector process installation. */
export interface InspectorInstallation {
  readonly root: string;
  readonly command: readonly string[];
}
/** Validated development listener policy. */
export interface DevelopmentPorts {
  readonly backend: number;
  readonly inspector: DevInspectorOptions;
}
