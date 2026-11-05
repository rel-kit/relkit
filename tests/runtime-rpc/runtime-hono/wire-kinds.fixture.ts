/**
 * A RelKit REST application with one route per data kind the typed client must carry:
 * dates, large integers, files and streams. Used by the wire protocol evaluation (task 23.1).
 */
import type { HttpTriggerRegistration, RegistrationPlan } from "relkit/graph";
import { createApp, type RuntimeManifest } from "relkit/runtime-hono";
import { runtimeCohort } from "../../../packages/relkit/tests/runtime-hono/test-cohort.ts";

const schema = {
  "~standard": {
    version: 1 as const,
    vendor: "relkit-wire-kinds",
    validate: (value: unknown) => ({ value }),
  },
};
const stream = { kind: "stream", item: schema, ...schema };

/**
 * Builds one route declaration.
 * @param id - Route and target ID.
 * @param method - HTTP method.
 * @param path - Route path.
 * @param fields - Request mapping fields.
 * @param extra - Extra route configuration, such as a stream format.
 * @returns The route.
 */
function route(
  id: string,
  method: string,
  path: string,
  fields: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): HttpTriggerRegistration {
  return {
    kind: "trigger",
    id,
    source: { file: "routes.ts", line: 1, column: 1 },
    triggerType: "http",
    targetFunctionId: id,
    config: {
      method,
      path,
      request: { kind: "input", fields },
      responses: [],
      middleware: [],
      transforms: [],
      client: { operation: method === "GET" ? "query" : "mutation" },
      ...extra,
    },
  } as HttpTriggerRegistration;
}

const plan: RegistrationPlan = {
  graphHash: "sha256:wire-kinds",
  functions: [],
  httpTriggers: [
    route("kinds.date", "POST", "/kinds/date", { at: { kind: "body", name: "at" } }),
    route("kinds.integer", "POST", "/kinds/integer", { count: { kind: "body", name: "count" } }),
    route("kinds.file", "POST", "/kinds/file", {
      file: { kind: "multipart", name: "file" },
      label: { kind: "multipart", name: "label" },
    }),
    route("kinds.stream", "GET", "/kinds/stream", {}, { stream: { format: "sse" } }),
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
};

/** What each target does with its input. */
const targets: Record<string, (input: Record<string, unknown>) => unknown> = {
  // Echo the received date one day later, as a Date the server serializes.
  "kinds.date": ({ at }) => ({
    received: typeof at,
    next: new Date(new Date(String(at)).getTime() + 86_400_000),
  }),
  // 2^53 + 1 is not exact as a JavaScript number.
  "kinds.integer": ({ count }) => ({ received: typeof count, next: BigInt(String(count)) + 1n }),
  "kinds.file": async ({ file, label }) => ({
    name: file instanceof File ? file.name : null,
    text: file instanceof Blob ? await file.text() : null,
    label,
  }),
  "kinds.stream": () =>
    (async function* () {
      yield { tick: 1 };
      yield { tick: 2 };
    })(),
};

/**
 * Creates the application.
 * @returns A Hono application serving the four routes.
 */
export function wireKindsApp() {
  const manifest: RuntimeManifest = {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    targets: Object.fromEntries(
      Object.keys(targets).map((id) => [
        id,
        { input: schema, output: id === "kinds.stream" ? stream : schema, errors: [] },
      ]),
    ),
    middleware: {},
    requestTransforms: {},
  };
  return createApp({
    plan,
    manifest,
    engine: {
      invoke: async ({ functionId, input }) =>
        targets[functionId]!(input as Record<string, unknown>),
    },
  });
}
