/** Authored bridge policy; UI process ownership belongs to the standalone tool. */
import type { InspectorConfiguration } from "@relkit/contracts";
/** Validated development listener policy. */
export interface DevelopmentPorts {
  readonly backend: number;
  readonly inspector: InspectorConfiguration["connection"] | false;
}
