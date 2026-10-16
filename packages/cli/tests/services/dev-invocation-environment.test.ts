/** Executes generated invocation wiring with a capturing engine boundary. */
import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { SERVER_INVOCATION_SOURCE } from "../../src/commands/build-server-invocation.js";

test("generated HTTP invocation forwards resolved environment into the engine", async () => {
  const values = Object.freeze({ RECOVERY_VALUE: "resolved" });
  let received: object | undefined;
  const request = { functionId: "hello.greet", input: {} };
  await runInNewContext(`${SERVER_INVOCATION_SOURCE}\ninvokeHttp(request);`, {
    values,
    request,
    providerStartup: Promise.resolve({}),
    targetFor: () => undefined,
    registry: new Map(),
    shutdownController: new AbortController(),
    createDependencySources: () => ({}),
    graph: { nodes: [] },
    plan: { jobs: [] },
    telemetry: {},
    runtimeOwner: { track: (work: Promise<void>) => work },
    invoke: async (options: { readonly env?: object }) => {
      received = options.env;
    },
  });
  expect(received).toBe(values);
});
