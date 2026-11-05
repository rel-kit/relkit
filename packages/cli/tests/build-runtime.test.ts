/**
 * Covers `relkit build --runtime`: option parsing, the Node and Workers server entries and the
 * Node image.
 */
import { expect, test } from "bun:test";
import { dockerfile } from "../src/commands/build-container.ts";
import { serverImportsSource } from "../src/commands/build-server-imports.ts";
import { serverSource } from "../src/commands/build-server.ts";
import { workersEntrySource } from "../src/commands/build-workers-entry.ts";
import { parseProjectArgs } from "../src/commands/project-args.ts";
import type { ServerSourceEmission } from "../src/commands/build-server.types.ts";

test("build accepts --runtime bun, node or workers and rejects other values and commands", () => {
  expect(parseProjectArgs(["--runtime", "node"], "build").runtime).toBe("node");
  expect(parseProjectArgs(["--runtime", "bun"], "build").runtime).toBe("bun");
  expect(parseProjectArgs(["--runtime", "workers"], "build").runtime).toBe("workers");
  expect(parseProjectArgs([], "build").runtime).toBeUndefined();
  expect(() => parseProjectArgs(["--runtime", "deno"], "build")).toThrow(
    "--runtime must be bun, node or workers.",
  );
  expect(() => parseProjectArgs(["--runtime", "workers", "--target", "vercel"], "build")).toThrow(
    "--target vercel builds the Node server",
  );
  expect(() => parseProjectArgs(["--runtime", "node"], "check")).toThrow(
    "Unknown check option: --runtime",
  );
});

test("the server imports the selected adapter and finds its entry point on Node 22", () => {
  const emission = (runtime?: "bun" | "node" | "workers") =>
    serverImportsSource({
      agentSource: { imports: "", startup: "", registration: "", release: "" },
      options: {
        providerOverridesImport: "",
        specializedImports: "",
        localServicesImport: "",
        jobsManifestImport: "",
      },
      configuration: runtime === undefined ? {} : { runtime },
      graph: { nodes: [], edges: [] },
    } as unknown as ServerSourceEmission);
  const bun = emission();
  expect(bun).toContain('import { bunRuntime as relkitRuntime } from "relkit/runtime/bun";');
  expect(bun).toContain("const relkitEntryPoint = import.meta.main;");
  const node = emission("node");
  expect(node).toContain('import { nodeRuntime as relkitRuntime } from "relkit/runtime/node";');
  expect(node).toContain("pathToFileURL(realpathSync(process.argv[1])).href");
  expect(node).not.toContain("= import.meta.main");
  const workers = emission("workers");
  expect(workers).toContain(
    'import { workersRuntime as relkitRuntime } from "relkit/runtime/workers";',
  );
  expect(workers).toContain("const relkitEntryPoint = false;");
  expect(workers).not.toContain("realpathSync");
});

test("a Workers server has no top-level await or disk static files, and its entry exports fetch", () => {
  const graph = { version: 1, appId: "app", nodes: [], edges: [] };
  const activation = {
    graphHash: "sha256:0",
    manifestHash: "sha256:0",
    runtimeIntegrationsPlanHash: "sha256:0",
  };
  const configuration = (runtime?: "workers") => ({
    maxBodyBytes: 1_048_576,
    apiDocs: { enabledInProduction: false, ui: false as const },
    clientContract: true,
    mcp: false,
    agUi: false,
    maxPreviewBytes: 1_048_576,
    ...(runtime === undefined ? {} : { runtime }),
  });
  const emit = (runtime?: "workers") =>
    serverSource(
      graph as never,
      "sha256:0",
      activation as never,
      {},
      {},
      configuration(runtime) as never,
    );
  const bun = emit();
  expect(bun).toContain("if (relkitEntryPoint) await activateRelkitApplication();");
  expect(bun).toContain('new URL("../public", import.meta.url)');
  const workers = emit("workers");
  expect(workers).not.toContain("await activateRelkitApplication();");
  expect(workers).not.toContain("staticFiles");
  expect(workers.trimEnd().endsWith("}")).toBe(true);

  const entry = workersEntrySource();
  expect(entry).toContain('import("./index.ts")');
  expect(entry).toContain("functionHost: true");
  expect(entry).toContain('process.env.RELKIT_WORKER_ROLE = "api";');
  expect(entry).toContain("export default {\n  async fetch(request, env, context) {");
  // Nothing runs at the Worker's global scope except declarations.
  expect(entry).not.toMatch(/^await /mu);
});

test("the Node image installs with Bun and runs the server with Node", () => {
  const image = dockerfile(true, true, "node");
  expect(image).toMatch(/^FROM oven\/bun:1\.3\.10@sha256:[0-9a-f]{64} AS dependencies\n/);
  expect(image).toContain("COPY patches/ ./patches/\nRUN bun install --production");
  expect(image).toMatch(/\nFROM node:24\.22\.0-bookworm-slim@sha256:[0-9a-f]{64}\n/);
  expect(image).toContain("COPY --from=dependencies /app/node_modules ./node_modules");
  expect(image).toContain("COPY jobs/ ./jobs/");
  expect(image).toContain("USER node");
  expect(image).toContain('CMD ["node", "server/index.js"]');
  expect(dockerfile()).toBe(dockerfile(false, false, "bun"));
  expect(dockerfile()).not.toContain("node:24");
});
