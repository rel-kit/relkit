import type { Hono } from "hono";
import type { InspectorActionServices } from "../../src/actions.types.js";

/** Legacy action fixture state; assertions continue to observe the same native authorities. */
export interface ActionTestState {
  readonly app: Hono;
  readonly actions: InspectorActionServices;
  readonly audits: readonly unknown[];
  readonly approvals: Map<string, string>;
  readonly calls: () => number;
  readonly setActive: (generation: ActionTestGeneration) => void;
}

/** Stored generation identity accepted by the compatibility action fixture. */
export interface ActionTestGeneration {
  readonly generationId: string;
  readonly graphHash: string;
  readonly actions?: InspectorActionServices;
}
