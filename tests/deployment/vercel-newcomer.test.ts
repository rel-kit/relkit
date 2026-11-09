/**
 * Runs the Vercel newcomer deploy flow against a stubbed Vercel, endpoint and backend, so its
 * control flow is proven without credentials: the call order, the outcome waits, the concurrent
 * cron calls with exactly one run per occurrence, the refused wrong secret, and that the throwaway
 * project and database are removed whatever fails. The live run is
 * `RELKIT_TEST_VERCEL=1 bun scripts/vercel-newcomer.ts`.
 */
import { expect, test } from "bun:test";
import type { BackendReader } from "../../scripts/railway-newcomer/flow.ts";
import {
  runVercelNewcomerDeploy,
  type VercelNewcomerPorts,
} from "../../scripts/vercel-newcomer/flow.ts";
import type { VercelDriver } from "../../scripts/vercel-newcomer/vercel.ts";

interface StubOptions {
  readonly authenticated?: boolean;
  readonly failDeploy?: boolean;
  readonly duplicateOccurrence?: boolean;
  readonly openCron?: boolean;
}

/**
 * Builds stub ports that simulate a healthy deployment: requests complete their work, and each
 * cron call (Vercel's or the test's) claims the next occurrence once.
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
  const vercel = {
    authenticated: async () => options.authenticated ?? true,
    createProject: record("createProject", "prj_1"),
    setEnv: async (id: string, key: string) => void calls.push(`setEnv ${id} ${key}`),
    deploy: record("deploy", "https://relkit-test-run-1-abc.vercel.app/"),
    deleteProject: record("deleteProject"),
  } as VercelDriver;
  const claim = () =>
    occurrences.push({
      at: new Date(clock).toISOString(),
      runs: options.duplicateOccurrence ? 2 : 1,
    });
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`fetch ${init?.method ?? "GET"} ${url.pathname}`);
    if (url.pathname.startsWith("/_relkit/v1/vercel/cron/")) {
      const authorization = new Headers(init?.headers).get("authorization");
      if (authorization !== "Bearer secret-1" && !options.openCron)
        return new Response("", { status: 401 });
      claim();
      return Response.json({ occurrences: 1, runs: 1, deliveries: 0 });
    }
    if (url.pathname === "/probe/jobs") runs.set("vercel-job", "completed");
    if (url.pathname === "/probe/events") runs.set("event-vercel-event", "completed");
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const backend: BackendReader = {
    runs: async () => runs,
    completedDeliveries: async () => runs.size,
    occurrences: async () => occurrences,
    close: record("close") as () => Promise<void>,
  };
  const ports: VercelNewcomerPorts = {
    vercel,
    database: {
      create: async (name) => (calls.push(`createDatabase ${name}`), `postgres://db/${name}`),
      drop: async (name) => void calls.push(`dropDatabase ${name}`),
    },
    fetch: fetchStub,
    backend: async (url) => (calls.push(`backend ${url}`), backend),
    secret: () => "secret-1",
    // Vercel Cron claims one occurrence while the test waits.
    sleep: async (ms) => {
      clock += ms;
      if (clock % 60_000 === 0) claim();
    },
    now: () => clock,
    log: () => undefined,
  };
  return { ports, calls };
}

test("deploys, proves jobs, events and exactly-once schedules, then removes everything", async () => {
  const { ports, calls } = stub();
  const timings = await runVercelNewcomerDeploy(ports, "/project", "run-1");
  expect(Object.keys(timings)).toEqual([
    "deployed",
    "reachable",
    "jobs-and-events",
    "scheduled",
    "exactly-once",
    "deleted",
  ]);
  expect(calls.slice(0, 5)).toEqual([
    "createDatabase relkit_test_run_1",
    'createProject "relkit-test-run-1"',
    "setEnv prj_1 DATABASE_URL",
    "setEnv prj_1 CRON_SECRET",
    'deploy "/project" "prj_1"',
  ]);
  expect(calls).toContain("fetch POST /probe/jobs");
  expect(calls.slice(-3)).toEqual([
    "close",
    'deleteProject "prj_1"',
    "dropDatabase relkit_test_run_1",
  ]);
});

test("a duplicate run for one occurrence fails the test and still removes everything", async () => {
  const { ports, calls } = stub({ duplicateOccurrence: true });
  await expect(runVercelNewcomerDeploy(ports, "/project", "run-2")).rejects.toThrow(
    "without exactly one run",
  );
  expect(calls.slice(-2)).toEqual(['deleteProject "prj_1"', "dropDatabase relkit_test_run_2"]);
});

test("a cron endpoint that accepts a wrong secret fails the test", async () => {
  const { ports } = stub({ openCron: true });
  await expect(runVercelNewcomerDeploy(ports, "/project", "run-3")).rejects.toThrow(
    "to a wrong secret",
  );
});

test("a failed deploy removes the project and the database", async () => {
  const { ports, calls } = stub({ failDeploy: true });
  await expect(runVercelNewcomerDeploy(ports, "/project", "run-4")).rejects.toThrow("build failed");
  expect(calls.slice(-2)).toEqual(['deleteProject "prj_1"', "dropDatabase relkit_test_run_4"]);
});

test("missing credentials stop before anything is created", async () => {
  const { ports, calls } = stub({ authenticated: false });
  await expect(runVercelNewcomerDeploy(ports, "/project", "run-5")).rejects.toThrow("VERCEL_TOKEN");
  expect(calls).toEqual([]);
});
