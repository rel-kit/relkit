/**
 * Runs the Railway newcomer deploy flow against a stubbed Railway, HTTP endpoint and backend, so
 * its control flow is proven without credentials: the call order, the readiness and outcome waits,
 * the duplicate-occurrence check, and that the throwaway project is deleted whatever fails. The
 * live run is `RELKIT_TEST_RAILWAY=1 bun scripts/railway-newcomer.ts`.
 */
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  runNewcomerDeploy,
  type BackendReader,
  type NewcomerPorts,
} from "../../scripts/railway-newcomer/flow.ts";
import type { RailwayDriver } from "../../scripts/railway-newcomer/railway.ts";

interface StubOptions {
  readonly authenticated?: boolean;
  readonly failUp?: boolean;
  readonly duplicateOccurrence?: boolean;
}

/**
 * Builds stub ports that simulate a healthy deployment.
 * @param options - Faults to inject.
 * @returns The ports and the recorded Railway calls.
 */
function stub(options: StubOptions = {}) {
  const calls: string[] = [];
  let clock = 0;
  const submitted = new Set<string>();
  let deliveries = 0;
  let occurrences = 0;
  const record =
    (name: string, result?: unknown) =>
    async (...args: unknown[]) => {
      calls.push([name, ...args.map((arg) => JSON.stringify(arg))].join(" "));
      if (name === "up" && options.failUp) throw new Error("build failed");
      return result;
    };
  const railway = {
    authenticated: async () => options.authenticated ?? true,
    createProject: record("createProject", "project-1"),
    addPostgres: record("addPostgres"),
    addService: record("addService"),
    up: record("up"),
    domain: record("domain", "web-production.up.railway.app"),
    publicDatabaseUrl: record("publicDatabaseUrl", "postgres://public"),
    redeploy: record("redeploy"),
    scale: record("scale"),
    runningInstances: record("runningInstances", 2),
    deleteProject: record("deleteProject"),
  } as unknown as RailwayDriver;
  const backend: BackendReader = {
    runs: async () =>
      new Map(
        [...submitted].flatMap((key) =>
          key.startsWith("events:")
            ? [[`event-${key.slice(7)}`, "completed"] as const]
            : [[key.slice(5), "completed"] as const],
        ),
      ),
    completedDeliveries: async () => deliveries,
    occurrences: async () => {
      occurrences += 1;
      return Array.from({ length: occurrences }, (_, index) => ({
        at: new Date(index * 60_000).toISOString(),
        runs: options.duplicateOccurrence && index === 0 ? 2 : 1,
      }));
    },
    close: async () => undefined,
  };
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input.toString());
    if (url.protocol !== "https:") return new Response("plain HTTP", { status: 400 });
    if (url.pathname === "/healthz") return Response.json({ status: "ready" });
    const [, , path] = url.pathname.split("/");
    const key = (JSON.parse(String(init?.body)) as { key: string }).key;
    if (new Headers(init?.headers).get("origin") !== url.origin)
      return new Response("origin required", { status: 403 });
    submitted.add(`${path}:${key}`);
    if (path === "events") deliveries += 1;
    return Response.json({ key });
  }) as typeof fetch;
  const ports: NewcomerPorts = {
    railway,
    fetch: fetchStub,
    backend: async (url) => {
      calls.push(`backend ${url}`);
      return backend;
    },
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    log: () => undefined,
  };
  return { ports, calls, submitted };
}

test("deploys, proves every phase and deletes the project", async () => {
  const { ports, calls, submitted } = stub();
  const timings = await runNewcomerDeploy(ports, "run-1");
  expect(calls).toEqual([
    'createProject "relkit-test-run-1"',
    "addPostgres",
    'addService "web" {"DATABASE_URL":"${{Postgres.DATABASE_URL}}"}',
    'up "web"',
    'domain "web"',
    "publicDatabaseUrl",
    "backend postgres://public",
    'redeploy "web"',
    'scale "web" 2',
    'runningInstances "web"',
    'deleteProject "project-1"',
  ]);
  expect(submitted).toContain("jobs:before-restart");
  expect(submitted).toContain("events:two-instances-4");
  expect(Object.keys(timings)).toEqual([
    "deployed",
    "reachable",
    "first-instance",
    "after-restart",
    "two-instances",
    "deleted",
  ]);
});

test("deletes the project when the deploy fails", async () => {
  const { ports, calls } = stub({ failUp: true });
  await expect(runNewcomerDeploy(ports, "run-2")).rejects.toThrow("build failed");
  expect(calls.at(-1)).toBe('deleteProject "project-1"');
});

test("fails on a schedule occurrence that produced more than one run", async () => {
  const { ports, calls } = stub({ duplicateOccurrence: true });
  await expect(runNewcomerDeploy(ports, "run-3")).rejects.toThrow("exactly one run");
  expect(calls.at(-1)).toBe('deleteProject "project-1"');
});

test("creates nothing without credentials", async () => {
  const { ports, calls } = stub({ authenticated: false });
  await expect(runNewcomerDeploy(ports, "run-4")).rejects.toThrow("RAILWAY_API_TOKEN");
  expect(calls).toEqual([]);
});

test("the entry point skips unless RELKIT_TEST_RAILWAY=1", async () => {
  const environment = { ...process.env };
  delete environment.RELKIT_TEST_RAILWAY;
  const child = Bun.spawn(
    [process.execPath, resolve(import.meta.dir, "../../scripts/railway-newcomer.ts")],
    { env: environment, stdout: "pipe", stderr: "inherit" },
  );
  expect(await child.exited).toBe(0);
  expect(await new Response(child.stdout).text()).toContain("set RELKIT_TEST_RAILWAY=1");
});
