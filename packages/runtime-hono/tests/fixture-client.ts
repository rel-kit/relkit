import {
  createClient,
  createWebSocketClient,
  type CreateClientOptions,
  type CreateWebSocketClientOptions,
} from "@relkit/client";
import { oc } from "@orpc/contract";
import type { Hono } from "hono";
import type { acceptAgentRun, acceptAgentControl } from "../src/agent-rpc-write.js";
import type {
  loadAgent,
  listAgentThreads,
  readAgentHistory,
  observeAgent,
  lookupAgentReceipt,
} from "../src/agent-rpc-read.js";
import type { getJobRun, listJobRuns, watchJobRun } from "../src/jobs/handlers-read.js";
import type { triggerJob } from "../src/jobs/handlers-mutations.js";

/** A permissive input boundary lets transport tests send deliberately invalid requests. */
function valueSchema<A>() {
  return {
    "~standard": {
      version: 1 as const,
      vendor: "relkit-fixture",
      types: undefined as unknown as { input: A; output: A },
      validate: (value: unknown) => ({ value: value as A }),
    },
  };
}
const procedure = <A>() => oc.input(valueSchema<unknown>()).output(valueSchema<A>());
const jobContract = {
  trigger: procedure<Awaited<ReturnType<typeof triggerJob>>>(),
  runs: {
    get: procedure<Awaited<ReturnType<typeof getJobRun>>>(),
    list: procedure<Awaited<ReturnType<typeof listJobRuns>>>(),
    watch: procedure<Awaited<ReturnType<typeof watchJobRun>>>(),
  },
};
const contract = {
  "relkit.agent.run": procedure<Awaited<ReturnType<typeof acceptAgentRun>>>(),
  "relkit.agent.control": procedure<Awaited<ReturnType<typeof acceptAgentControl>>>(),
  "relkit.agent.load": procedure<Awaited<ReturnType<typeof loadAgent>>>(),
  "relkit.agent.threads": procedure<Awaited<ReturnType<typeof listAgentThreads>>>(),
  "relkit.agent.history": procedure<Awaited<ReturnType<typeof readAgentHistory>>>(),
  "relkit.agent.receipt": procedure<Awaited<ReturnType<typeof lookupAgentReceipt>>>(),
  "relkit.agent.observe": procedure<ReturnType<typeof observeAgent>>(),
  "relkit.realtime.subscribe": procedure<AsyncIterable<{ readonly kind: string }>>(),
  "mutate.route": procedure<unknown>(),
  "POST /mutate": procedure<unknown>(),
  "private.route": procedure<unknown>(),
  "POST /private": procedure<unknown>(),
  "GET /query": procedure<unknown>(),
  jobs: { exportOrders: jobContract, hiddenJob: jobContract },
};

/** Typed public client for the shared transport fixture routes. */
export const createFixtureClient = (options: CreateClientOptions) =>
  createClient<typeof contract>(options);
/** Uses the same fixture contract over a native WebSocket transport. */
export const createFixtureWebSocketClient = (options: CreateWebSocketClientOptions) =>
  createWebSocketClient<typeof contract>(options);

/** Fetch adapter for a direct Hono request, including Bun's optional preconnect surface. */
export function appFetch(app: Pick<Hono, "fetch">): typeof fetch {
  return Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request =
        input instanceof Request ? new Request(input, init) : new Request(String(input), init);
      return app.fetch(request);
    },
    { preconnect: globalThis.fetch.preconnect ?? (() => undefined) },
  );
}
