import { expect, test } from "bun:test";
import { createClient } from "@relkit/client";
import type { RegistrationPlan } from "@relkit/graph";
import { createApp, type RuntimeManifest } from "./src/index.ts";
import { runtimeCohort } from "./test-cohort.ts";

const schema = {
  "~standard": {
    version: 1 as const,
    vendor: "relkit-test",
    validate: (value: unknown) => ({ value }),
  },
};

test("serves non-cacheable identity and rejects a stale mutation before execution", async () => {
  let epoch = "session-a";
  let executions = 0;
  const plan = mutationPlan();
  const app = createApp({
    plan,
    manifest: manifest(plan),
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: () => ({ identityScope: "user-1", sessionEpoch: epoch }),
    },
    engine: {
      invoke: async () => {
        executions += 1;
        return { ok: true };
      },
    },
  });
  const identity = await app.request("/_relkit/v1/client/identity");
  expect(identity.headers.get("cache-control")).toBe("no-store, private");
  expect(await identity.json()).toMatchObject({ sessionEpoch: "session-a" });

  const client = createClient<any>({
    baseUrl: "http://relkit.test",
    headers: {
      "x-relkit-identity-scope": "user-1",
      "x-relkit-session-epoch": "session-a",
    },
    fetch: (request, init) => app.fetch(new Request(request, init)),
  });
  epoch = "session-b";
  await expect(client["mutate.route"]({ value: 1 })).rejects.toMatchObject({
    code: "IDENTITY_PRECONDITION_FAILED",
  });
  expect(executions).toBe(0);
});

test("registers method/path aliases and excludes client false routes", async () => {
  const plan = mutationPlan();
  const app = createApp({
    plan: {
      ...plan,
      httpTriggers: [
        plan.httpTriggers[0]!,
        {
          ...plan.httpTriggers[0]!,
          id: "private.route",
          config: { ...plan.httpTriggers[0]!.config, path: "/private", client: false },
        },
      ],
    },
    manifest: manifest(plan),
    engine: { invoke: async () => ({ ok: true }) },
  });
  const client = createClient<any>({
    baseUrl: "http://relkit.test",
    fetch: (request, init) => app.fetch(new Request(request, init)),
  });
  expect(await client["POST /mutate"]({})).toEqual({ ok: true });
  await expect(client["private.route"]({})).rejects.toHaveProperty("code", "NOT_FOUND");
  await expect(client["POST /private"]({})).rejects.toHaveProperty("code", "NOT_FOUND");
});

function mutationPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:identity",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "mutate.route",
        source: { file: "route.ts", line: 1, column: 1 },
        triggerType: "http",
        targetFunctionId: "mutate",
        config: {
          method: "POST",
          path: "/mutate",
          request: { kind: "input" },
          responses: [],
          middleware: [],
          transforms: [],
          client: { operation: "mutation" },
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
    middlewares: [],
  };
}

function manifest(plan: RegistrationPlan): RuntimeManifest {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: { mutate: { input: schema, output: schema, errors: [] } },
    middleware: {},
    requestTransforms: {},
  };
}
