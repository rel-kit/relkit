/**
 * Supplies a checked REST cohort for prepared transport behavioral tests. The
 * engine records request identities without depending on real process state;
 * each test constructs its own application and owns generation disposal.
 */
import type { CreateAppOptions } from "../src/create-app.types.js";
import { runtimeCohort } from "./test-cohort.js";

/** Creates complete options for one public REST invocation.
 * @param invoked - Optional request identity observer, owned by the calling test.
 * @returns A route cohort usable by eager, prepared and injected loader applications.
 */
export function preparedOptions(
  invoked?: (requestId: string | undefined) => void,
): CreateAppOptions {
  return {
    plan: {
      graphHash: "sha256:prepared-test",
      functions: [],
      httpTriggers: [
        {
          kind: "trigger",
          id: "hello.route",
          source: { file: "src/app.ts", line: 1, column: 1 },
          triggerType: "http",
          targetFunctionId: "hello",
          config: {
            method: "GET",
            path: "/hello",
            request: { kind: "input" },
            responses: [],
            middleware: [],
            transforms: [],
          },
        },
      ],
      queues: [],
      schedules: [],
      eventTriggers: [],
      buckets: [],
      caches: [],
      tools: [],
      agents: [],
      channels: [],
      middlewares: [],
    },
    manifest: {
      ...runtimeCohort("sha256:prepared-test"),
      functions: {},
      middleware: {},
      requestTransforms: {},
    },
    mapInput: () => ({}),
    engine: {
      invoke: async ({ requestId }) => {
        invoked?.(requestId);
        return { ok: true };
      },
    },
  };
}
