/**
 * Runs the Cloudflare newcomer deploy flow against a stubbed Cloudflare, endpoint and backend, so
 * its control flow is proven without credentials: the call order, the outcome waits, exactly one
 * run per schedule occurrence, and that the throwaway Worker, queue and database are removed
 * whatever fails. The live run is `RELKIT_TEST_CLOUDFLARE=1 bun scripts/cloudflare-newcomer.ts`.
 */
import { expect, test } from "bun:test";
import type { BackendReader } from "../../scripts/railway-newcomer/flow.ts";
import {
  runCloudflareNewcomerDeploy,
  type CloudflareNewcomerPorts,
} from "../../scripts/cloudflare-newcomer/flow.ts";

interface StubOptions {
  readonly authenticated?: boolean;
  readonly failDeploy?: boolean;
  readonly duplicateOccurrence?: boolean;
}

/**
 * Builds stub ports that simulate a healthy Worker: requests complete their work through the
 * queue, and each minute the Cron Trigger claims the next occurrence once.
 * @param options - Faults to inject.
 * @returns The ports and the recorded calls.
 */
function stub(options: StubOptions = {}) {
  const calls: string[] = [];
  let clock = 0;
  const runs = new Map<string, string>();
  const occurrences: { at: string; runs: number }[] = [];
  const record =
    (name: string, result?: unknown) =>
    async (...args: unknown[]) => {
      calls.push([name, ...args.map((arg) => JSON.stringify(arg))].join(" "));
      if (name === "deploy" && options.failDeploy) throw new Error("build failed");
      return result;
    };
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`fetch ${init?.method ?? "GET"} ${url.origin}${url.pathname}`);
    if (url.pathname.startsWith("/probe/")) {
      const { key } = JSON.parse(String(init?.body)) as { key: string };
      runs.set(url.pathname === "/probe/jobs" ? key : `event-${key}`, "completed");
    }
    return Response.json({ status: "ready" });
  }) as typeof fetch;
  const backend: BackendReader = {
    runs: async () => runs,
    completedDeliveries: async () => runs.size,
    occurrences: async () => occurrences,
    close: async () => void calls.push("backend.close"),
  };
  const ports: CloudflareNewcomerPorts = {
    cloudflare: {
      authenticated: async () => options.authenticated ?? true,
      configure: async (root, name) => {
        calls.push(`configure ${root} ${name}`);
        return `${name}-relkit-work`;
      },
      createQueue: record("createQueue") as never,
      deploy: record("deploy", "https://relkit-test-run-1.acme.workers.dev/") as never,
      putSecrets: async (root, secrets) =>
        void calls.push(`putSecrets ${root} ${Object.keys(secrets).join(",")}`),
      detachConsumer: record("detachConsumer") as never,
      deleteWorker: record("deleteWorker") as never,
      deleteQueue: record("deleteQueue") as never,
    },
    database: {
      create: async (name) => {
        calls.push(`database.create ${name}`);
        return `postgres://test/${name}`;
      },
      drop: async (name) => void calls.push(`database.drop ${name}`),
    },
    fetch: fetchStub,
    backend: async (url) => {
      calls.push(`backend ${url}`);
      return backend;
    },
    sleep: async (ms) => {
      clock += ms;
      if (clock % 60_000 === 0)
        occurrences.push({
          at: new Date(clock).toISOString(),
          runs: options.duplicateOccurrence ? 2 : 1,
        });
    },
    now: () => clock,
    log: () => undefined,
  };
  return { ports, calls };
}

test("deploys, proves queue-driven work and Cron schedules, then deletes everything", async () => {
  const { ports, calls } = stub();
  const timings = await runCloudflareNewcomerDeploy(ports, "/project", "Run_1");
  expect(Object.keys(timings)).toEqual([
    "deployed",
    "reachable",
    "jobs-and-events",
    "scheduled",
    "exactly-once",
    "deleted",
  ]);
  expect(calls.slice(0, 5)).toEqual([
    "database.create relkit_test_run_1",
    "configure /project relkit-test-run-1",
    'createQueue "relkit-test-run-1-relkit-work"',
    'deploy "/project"',
    "putSecrets /project DATABASE_URL",
  ]);
  expect(calls).toContain("fetch POST https://relkit-test-run-1.acme.workers.dev/probe/jobs");
  expect(calls.slice(-5)).toEqual([
    "backend.close",
    'detachConsumer "relkit-test-run-1-relkit-work" "relkit-test-run-1"',
    'deleteWorker "relkit-test-run-1"',
    'deleteQueue "relkit-test-run-1-relkit-work"',
    "database.drop relkit_test_run_1",
  ]);
});

test("a failed deploy still deletes the Worker, the queue and the database", async () => {
  const { ports, calls } = stub({ failDeploy: true });
  await expect(runCloudflareNewcomerDeploy(ports, "/project", "run-2")).rejects.toThrow(
    "build failed",
  );
  expect(calls.slice(-4)).toEqual([
    'detachConsumer "relkit-test-run-2-relkit-work" "relkit-test-run-2"',
    'deleteWorker "relkit-test-run-2"',
    'deleteQueue "relkit-test-run-2-relkit-work"',
    "database.drop relkit_test_run_2",
  ]);
});

test("an occurrence with more than one run fails the test", async () => {
  const { ports } = stub({ duplicateOccurrence: true });
  await expect(runCloudflareNewcomerDeploy(ports, "/project", "run-3")).rejects.toThrow(
    "without exactly one run",
  );
});

test("missing credentials stop the flow before anything is created", async () => {
  const { ports, calls } = stub({ authenticated: false });
  await expect(runCloudflareNewcomerDeploy(ports, "/project", "run-4")).rejects.toThrow(
    "CLOUDFLARE_API_TOKEN",
  );
  expect(calls).toEqual([]);
});
