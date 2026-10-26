/** Public development jobs are live provider operations rather than rich inspection. */
import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startDev } from "./src/commands/dev.js";
import { serverHttpSource } from "./src/commands/build-server-http.js";
import {
  makeRoot,
  options,
  serverSource,
  adoptSession,
  registerDevCleanup,
} from "../../tests/fixtures/cli/dev-fixture.js";

registerDevCleanup();

test.each([false, true])("native jobs remain reachable with inspection %s", async (enabled) => {
  const root = await makeRoot();
  const hash = "sha256:native-jobs";
  const session = await startDev({
    ...options(root, hash),
    ...(enabled ? { inspector: { host: "127.0.0.1", port: 0 } } : {}),
    compile: async ({ outputDirectory }) => {
      const entrypoint = join(outputDirectory, "server.ts");
      await writeFile(
        entrypoint,
        serverSource(hash).replace(
          '  return new Response("not found", { status: 404 });',
          '  if (path === "/_relkit/v1/jobs/services") return Response.json({ native: true });\n  return new Response("not found", { status: 404 });',
        ),
      );
      return { entrypoint };
    },
  });
  await adoptSession(session);
  const base = `http://127.0.0.1:${session.backendPort}`;
  expect(await (await fetch(base + "/_relkit/v1/jobs/services")).json()).toEqual({ native: true });
  for (const path of [
    "/_relkit/v1/runtime",
    "/_relkit/v1/actions/functions/hello/invoke",
    "/_relkit/v1/graph/descriptors",
  ])
    expect((await fetch(base + path)).status).toBe(404);
});

test("only selected development jobs emit eager native administration", () => {
  const config = {
    maxBodyBytes: 1_048_576,
    apiDocs: { enabledInProduction: false },
    clientContract: true,
    mcp: false,
    maxPreviewBytes: 1_048_576,
    inspectorEnabled: false,
  };
  expect(serverHttpSource(config)).not.toContain("installJobsAdministrationEndpoints");
  const selected = serverHttpSource({ ...config, jobsAdministration: true });
  expect(selected).toContain("installJobsAdministrationEndpoints");
  expect(selected.indexOf("installJobsAdministrationEndpoints")).toBeLessThan(
    selected.indexOf("const server = Bun.serve"),
  );
});
