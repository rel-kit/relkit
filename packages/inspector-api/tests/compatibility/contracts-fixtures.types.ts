import type { Hono } from "hono";
import type { createObservabilityStream, ObservabilityQueryRequest } from "@relkit/observability";
import type { InspectorApiOptions } from "../../src/router.types.js";

/** Existing fixture protection options derived from the installed router contract. */
export type ContractFixtureOptions = Pick<InspectorApiOptions, "mode" | "bearerToken">;

/** Native fixture authorities and recorded queries observed by the legacy assertions. */
export interface ContractFixture {
  readonly app: Hono;
  readonly stream: ReturnType<typeof createObservabilityStream>;
  readonly seen: ObservabilityQueryRequest[];
}
