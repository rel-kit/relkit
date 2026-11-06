/**
 * `relkit check` reports `RELKIT_VERCEL_REALTIME_PROVIDER_REQUIRED` for a client-facing channel on
 * the local realtime provider when the project has `vercel.json`, through the real check pipeline,
 * and stays quiet without `vercel.json` or with an external provider.
 */
import { expect, test } from "bun:test";
import { mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { checkProjectEffect } from "../src/commands/check.js";
import { vercelRealtimeDiagnostics } from "../src/commands/check-vercel-realtime.js";
import { projectCapabilitiesLayer } from "../src/services/project-capabilities.js";
import {
  copyProject,
  registerCommandCleanup,
} from "../../../tests/fixtures/cli/commands-core-fixture.js";

registerCommandCleanup();

const CODE = "RELKIT_VERCEL_REALTIME_PROVIDER_REQUIRED";

/**
 * Copies the minimal application and adds a public channel on the local realtime provider.
 * @param vercel - Whether the project targets Vercel.
 * @returns The project root.
 */
async function projectWithChannel(vercel: boolean): Promise<string> {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  // The channel's schema library, borrowed from the framework's own installation.
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
  if (vercel) await writeFile(join(root, "vercel.json"), "{}\n");
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

test("a public channel on the local provider fails the check in a Vercel project", async () => {
  const result = await check(await projectWithChannel(true));
  expect(result.ok).toBe(false);
  const reported = result.diagnostics.filter((diagnostic) => diagnostic.code === CODE);
  expect(reported).toHaveLength(1);
  expect(reported[0]).toMatchObject({
    severity: "error",
    file: "src/hello/channels/feed.channel.ts",
  });
  expect(reported[0]!.message).toContain("Channel hello.updates uses realtime profile default");
});

test("the same project passes without vercel.json", async () => {
  const result = await check(await projectWithChannel(false));
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(CODE);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
});

test("an external provider or an internal channel passes", () => {
  const graph = (integrationId: string | undefined, client: string) =>
    JSON.stringify({
      nodes: [
        { kind: "channel", id: "hello.updates", profile: "default", client },
        ...(integrationId === undefined
          ? []
          : [
              {
                kind: "provider",
                capability: "realtime",
                profile: "default",
                adapter: { integrationId },
              },
            ]),
      ],
    });
  expect(vercelRealtimeDiagnostics(graph("redis", "public"), "/project")).toEqual([]);
  expect(vercelRealtimeDiagnostics(graph("local", "internal"), "/project")).toEqual([]);
  expect(vercelRealtimeDiagnostics(graph("local", "protected"), "/project")).toHaveLength(1);
  expect(vercelRealtimeDiagnostics(graph(undefined, "public"), "/project")[0]!.message).toContain(
    "has no provider",
  );
});
