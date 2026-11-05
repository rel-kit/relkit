/**
 * `relkit check` reports `RELKIT_WORKERS_PROVIDER_UNSUPPORTED` and
 * `RELKIT_WORKERS_SQLITE_UNSUPPORTED` when a project with a wrangler configuration uses a provider
 * that needs a local filesystem or a long-lived process, through the real check pipeline, and stays
 * quiet without a wrangler configuration or with providers that run on Workers.
 */
import { expect, test } from "bun:test";
import { mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { checkProjectEffect } from "../src/commands/check.js";
import {
  WORKERS_PROVIDER_CODE,
  WORKERS_SQLITE_CODE,
  workersProviderDiagnostics,
} from "../src/commands/check-workers-providers.js";
import { projectCapabilitiesLayer } from "../src/services/project-capabilities.js";
import {
  copyProject,
  registerCommandCleanup,
} from "../../../tests/fixtures/cli/commands-core-fixture.js";

registerCommandCleanup();

/**
 * Copies the minimal application and adds a channel on the local realtime provider.
 * @param wrangler - Wrangler configuration file to add, if any.
 * @returns The project root.
 */
async function projectWithChannel(wrangler: string | undefined): Promise<string> {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  const zod = await realpath(join(import.meta.dir, "../../relkit/node_modules/zod"));
  await symlink(zod, join(root, "node_modules/zod"));
  await writeFile(
    join(root, "relkit.config.ts"),
    `import { defineApp, defineEnv, env as envFactory } from "relkit";
import { localRealtime } from "@relkit/local";

const env = defineEnv({ SERVICE_PORT: envFactory.port().default(3000) });
export default defineApp({
  id: "minimal-app",
  env,
  realtime: { default: localRealtime() },
  defaults: { realtime: "default" },
});
`,
  );
  await mkdir(join(root, "src/hello/channels"), { recursive: true });
  await writeFile(
    join(root, "src/hello/channels/feed.channel.ts"),
    `import { defineChannel } from "relkit/realtime";
import { z } from "zod";

export default defineChannel({
  id: "hello.updates",
  params: z.object({}),
  events: { posted: z.object({ message: z.string() }) },
  client: { public: true },
});
`,
  );
  if (wrangler !== undefined) await writeFile(join(root, wrangler), "{}\n");
  return root;
}

/**
 * Runs the real check pipeline.
 * @param projectRoot - Project root.
 * @returns The check result.
 */
function check(projectRoot: string) {
  return Effect.runPromise(
    checkProjectEffect({ projectRoot }).pipe(Effect.provide(projectCapabilitiesLayer)),
  );
}

test("a channel on the local provider fails the check in a Workers project", async () => {
  const result = await check(await projectWithChannel("wrangler.jsonc"));
  expect(result.ok).toBe(false);
  const reported = result.diagnostics.filter(({ code }) => code === WORKERS_PROVIDER_CODE);
  expect(reported).toHaveLength(1);
  expect(reported[0]).toMatchObject({ severity: "error", file: "relkit.config.ts" });
  expect(reported[0]!.message).toContain(
    "The realtime profile default (1 channel) uses the local provider",
  );
  expect(reported[0]!.suggestion).toContain("durableObjectRealtime()");
});

test("the same project passes without a wrangler configuration", async () => {
  const result = await check(await projectWithChannel(undefined));
  expect(result.diagnostics.map(({ code }) => code)).not.toContain(WORKERS_PROVIDER_CODE);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
});

/**
 * Builds a graph with one used profile and its provider.
 * @param kind - Consumer node kind.
 * @param capability - Provider capability.
 * @param integrationId - Provider integration, or undefined for none.
 * @returns Graph JSON.
 */
function graph(kind: string, capability: string, integrationId: string | undefined): string {
  return JSON.stringify({
    nodes: [
      { kind, id: `${kind}.one`, profile: "default" },
      ...(integrationId === undefined
        ? []
        : [{ kind: "provider", capability, profile: "default", adapter: { integrationId } }]),
    ],
  });
}

test("each capability names the provider and a Workers alternative", () => {
  const message = (text: string) => workersProviderDiagnostics(text, "/project")[0];
  expect(message(graph("job", "job", "local"))?.suggestion).toContain(
    "relkit add jobs --provider postgres",
  );
  expect(message(graph("job", "job", "effect-mq"))?.message).toContain(
    "uses the effect-mq provider, which runs a worker that polls Postgres",
  );
  expect(message(graph("event", "event", "inngest"))?.suggestion).toContain(
    "relkit add events --provider postgres",
  );
  expect(message(graph("cache", "cache", undefined))?.message).toContain(
    "The cache profile default (1 cache) has no provider, so it would fall back to local state",
  );
  expect(message(graph("bucket", "bucket", "local"))?.suggestion).toContain("r2()");
  const agents = JSON.stringify({
    nodes: [
      { kind: "agent", id: "agent.one", profile: "model", stateProfile: "state" },
      {
        kind: "provider",
        capability: "agent-state",
        profile: "state",
        adapter: { integrationId: "local" },
      },
    ],
  });
  expect(message(agents)?.message).toContain("The agent-state profile state (1 agent)");
  expect(message(agents)?.suggestion).toContain("No agent state provider runs on Workers yet");
  const redisAgents = agents.replace('"integrationId":"local"', '"integrationId":"redis"');
  expect(message(redisAgents)?.message).toContain("uses the redis provider");
});

test("Workers providers, unused profiles and other databases pass; SQLite does not", () => {
  expect(workersProviderDiagnostics(graph("cache", "cache", "cloudflare"), "/p")).toEqual([]);
  expect(workersProviderDiagnostics(graph("cache", "cache", "redis"), "/p")).toEqual([]);
  expect(workersProviderDiagnostics(graph("bucket", "bucket", "s3"), "/p")).toEqual([]);
  expect(workersProviderDiagnostics(graph("job", "job", "postgres"), "/p")).toEqual([]);
  expect(workersProviderDiagnostics(graph("event", "event", "postgres"), "/p")).toEqual([]);
  expect(workersProviderDiagnostics(graph("channel", "realtime", "cloudflare"), "/p")).toEqual([]);
  const unused = JSON.stringify({
    nodes: [
      {
        kind: "provider",
        capability: "job",
        profile: "spare",
        adapter: { integrationId: "local" },
      },
    ],
  });
  expect(workersProviderDiagnostics(unused, "/p")).toEqual([]);
  const services = (dialect: string) =>
    JSON.stringify({
      nodes: [
        {
          kind: "service",
          id: "database",
          capability: { kind: "drizzle", dialect, tables: [] },
          source: { file: "/p/src/database/service.ts", line: 3, column: 1 },
        },
      ],
    });
  expect(workersProviderDiagnostics(services("pg"), "/p")).toEqual([]);
  const sqlite = workersProviderDiagnostics(services("sqlite"), "/p");
  expect(sqlite).toHaveLength(1);
  expect(sqlite[0]).toMatchObject({ code: WORKERS_SQLITE_CODE, file: "src/database/service.ts" });
  expect(sqlite[0]!.suggestion).toContain("Hyperdrive");
});
