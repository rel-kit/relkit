/** Verifies native CLI build contracts, deterministic artifacts, current activation fences and configured HTTP settings. */
import { expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GRAPH_VERSION } from "@relkit/contracts";
import { buildProject } from "./src/commands/build.js";
import { checkProject } from "./src/commands/check.js";

import { readBuilt } from "./src/commands/start-built.js";

import { Schema } from "effect";
import { copyProject } from "../../tests/fixtures/cli/commands-core-fixture.js";
import {
  readBuildArtifacts,
  assertBuildArtifacts,
} from "../../tests/fixtures/cli/commands-core-artifacts.js";
import { registerCommandCleanup } from "../../tests/fixtures/cli/commands-core-fixture.js";

registerCommandCleanup();

test("check refreshes generated event types before project typechecking", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  await writeFile(join(root, "src/type-error.ts"), "const value: string = 1;\nvoid value;\n");
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true },
      files: ["src/type-error.ts", ".relkit/generated/event-registry.d.ts"],
    }),
  );

  const result = await checkProject({ projectRoot: root });
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: "TS2322", file: "src/type-error.ts", line: 1 }),
  );
  expect(result.diagnostics.some(({ code }) => code === "TS6053")).toBe(false);
  expect(await readFile(join(root, ".relkit/generated/event-registry.d.ts"), "utf8")).toContain(
    "interface EventRegistry",
  );
}, 30_000);

test("build succeeds from a checked graph and reports failed checks", async () => {
  const validRoot = await copyProject("tests/compiler/fixtures/valid-minimal");
  const built = await buildProject({ projectRoot: validRoot });
  expect(built.ok).toBe(true);
  expect(built.artifacts).toContain("manifest.json");
  const manifest = JSON.parse(await readFile(join(built.buildDirectory, "manifest.json")));
  expect(manifest).toMatchObject({
    graphHash: built.graphHash,
    activationFingerprint: built.activationFingerprint,
    entrypoint: "server/index.ts",
    containerEntrypoint: "server/index.js",
    contextIgnoreFile: ".dockerignore",
  });
  const readArtifacts = () => readBuildArtifacts(built.buildDirectory);
  const firstArtifacts = await readArtifacts();
  assertBuildArtifacts(firstArtifacts);
  await rm(built.buildDirectory, { recursive: true, force: true });
  const rebuilt = await buildProject({ projectRoot: validRoot });
  expect(rebuilt.ok).toBe(true);
  expect(await readArtifacts()).toEqual(firstArtifacts);
  const runtimeIntegrationsPath = join(
    rebuilt.buildDirectory,
    "server/runtime-integrations.plan.json",
  );
  const runtimeIntegrations = await readFile(runtimeIntegrationsPath, "utf8");
  await writeFile(runtimeIntegrationsPath, `${runtimeIntegrations} `);
  await expect(readBuilt(rebuilt.buildDirectory)).rejects.toThrow(
    "Built activation fingerprint does not match its artifacts.",
  );
  await writeFile(runtimeIntegrationsPath, runtimeIntegrations);
  const graphPath = join(rebuilt.buildDirectory, "application.graph.json");
  const staleGraph = Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
  )(await readFile(graphPath, "utf8"));
  await writeFile(graphPath, JSON.stringify({ ...staleGraph, contractVersion: GRAPH_VERSION - 1 }));
  await expect(readBuilt(rebuilt.buildDirectory)).rejects.toThrow(
    `Built graph contract version ${GRAPH_VERSION - 1} is unsupported; expected ${GRAPH_VERSION}. Rebuild with \`relkit build\`.`,
  );

  const invalidRoot = await copyProject("tests/compiler/fixtures/error-route-collision");
  const failed = await buildProject({ projectRoot: invalidRoot });
  expect(failed.ok).toBe(false);
  expect(failed.artifacts).toEqual([]);
  expect(failed.diagnostics).toContainEqual(
    expect.objectContaining({ code: "RELKIT_ROUTE_COLLISION" }),
  );
});

test("rejects malformed jobs manifests before activation", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  const checked = await checkProject({ projectRoot: root });
  const result = await buildProject({
    projectRoot: root,
    check: async () => ({
      ...checked,
      outputs: { ...checked.outputs, jobsManifest: "{}\n" },
    }),
  });

  expect(result.ok).toBe(false);
  expect(result.artifacts).toEqual([]);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: "RELKIT_BUILD_FAILED", severity: "error" }),
  );
  expect(result.diagnostics).not.toContainEqual(
    expect.objectContaining({ code: "RELKIT_TASK_RUNTIME_UNAVAILABLE" }),
  );
});

test("build carries server port, body limit, and API docs settings into runtime artifacts", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  await writeFile(
    join(root, "relkit.config.ts"),
    'import { defineApp, defineEnv } from "@relkit/app/config";\nexport default defineApp({ env: defineEnv({}), server: { port: 4321, maxBodyBytes: 2048, apiDocs: { enabledInProduction: true } } });\n',
  );
  const built = await buildProject({ projectRoot: root });
  expect(built.ok).toBe(true);
  const manifest = JSON.parse(await readFile(join(built.buildDirectory, "manifest.json")));
  expect(manifest.server).toEqual({
    port: 4321,
    maxBodyBytes: 2048,
    apiDocs: { enabledInProduction: true },
    clientContract: true,
    mcp: true,
  });
  const server = await readFile(join(built.buildDirectory, "server/index.ts"), "utf8");
  expect(server).toContain("maxBodyBytes: 2048");
  expect(server).toContain("enabledInProduction: true");
});
