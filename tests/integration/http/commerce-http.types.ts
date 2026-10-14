/** Describes native compiler, route client and observation owners for grouped commerce acceptance. */
import type { ApplicationGraph } from "../../../packages/graph/src/index.ts";
import type { HttpInvocationOptions } from "../../../packages/runtime-hono/src/index.ts";
import type { createTestHttpClient } from "../../../packages/testing/src/index.ts";
import type { compileProject } from "../../compiler/fixture-runner.ts";

export interface CommerceHttpFixture {
  readonly compiled: Awaited<ReturnType<typeof compileProject>>;
  readonly graph: ApplicationGraph;
  readonly client: ReturnType<typeof createTestHttpClient>;
  readonly invocations: HttpInvocationOptions[];
  readonly uploadedKeys: string[];
}
