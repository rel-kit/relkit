/** Verifies the canonical JavaScript startup and complete emitted server context. */
import { expect, test } from "vitest";
import { DEFAULT_TOOLING_CONFIG } from "@relkit/compiler";
import { dockerfile, dockerignore } from "../src/commands/build-container.js";
import { buildManifest, buildProductionManifest } from "../src/commands/build-manifest.js";
import { serverImportsSource } from "../src/commands/build-server-imports.js";
import type { ServerSourceEmission } from "../src/commands/build-server.types.js";

const emission: ServerSourceEmission = {
  graph: { contractVersion: 1, nodes: [], edges: [] },
  graphHash: "graph",
  activation: { graphHash: "graph", manifestHash: "manifest", runtimeIntegrationsPlanHash: "plan" },
  openapi: {},
  clientContract: {},
  configuration: {
    maxBodyBytes: 1024,
    apiDocs: { enabledInProduction: false },
    clientContract: false,
    mcp: false,
    maxPreviewBytes: 1024,
  },
  options: {
    specializedImports: "",
    localServicesImport: "",
    jobsManifestImport: "",
    jobsManifestVerification: "",
    localServicesVerification: "",
    localServicesInspectorSource: "",
    providerOverridesImport: "",
    providerOverridesSource: "",
  },
  agentSource: { imports: "", startup: "", registration: "", release: "" },
};

test("ordinary production emission gives the lazy inspector an assignable binding", () => {
  const source = serverImportsSource(emission);
  expect(source).toContain("let InspectorQueryError;");
  expect(source).not.toContain('from "@relkit/inspector-api"');
  expect(source).toContain('from "@relkit/engine/internal/server-runtime"');
});

test("build metadata names the emitted JavaScript entrypoint", () => {
  const manifest = JSON.parse(
    buildManifest({
      graphHash: "graph",
      activationFingerprint: emission.activation,
      hasJobs: false,
      hasLocalServices: false,
      tooling: DEFAULT_TOOLING_CONFIG,
    }),
  );
  expect(manifest.entrypoint).toBe("server/index.js");
  expect(manifest.containerEntrypoint).toBe("server/index.js");
});

test("container copies the complete bundled server output with selected worker assets", () => {
  expect(dockerfile(true)).toContain("COPY server/ ./server/");
  expect(dockerfile(true)).toContain("COPY jobs/ ./jobs/");
  expect(dockerignore(true)).toContain("!server/**");
  expect(dockerfile()).toContain('["bun", "run", "--no-env-file", "server/index.js"]');
  expect(dockerignore()).toContain(".env.*");
  expect(dockerignore()).toContain("server/node_modules/**");
  expect(dockerfile()).toContain("bun install --production --network-concurrency 1");
});

test("production installation declares only exact selected normal dependencies", () => {
  const manifest = JSON.parse(
    buildProductionManifest({ "@relkit/local": "0.7.10", inngest: "4.20.0" }),
  );
  expect(manifest.dependencies).toEqual({ "@relkit/local": "0.7.10", inngest: "4.20.0" });
  expect(manifest.devDependencies).toBeUndefined();
});
