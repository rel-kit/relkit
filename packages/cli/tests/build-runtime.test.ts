/** Covers `relkit build --runtime`: option parsing, the Node server entry and the Node image. */
import { expect, test } from "bun:test";
import { dockerfile } from "../src/commands/build-container.ts";
import { serverImportsSource } from "../src/commands/build-server-imports.ts";
import { parseProjectArgs } from "../src/commands/project-args.ts";
import type { ServerSourceEmission } from "../src/commands/build-server.types.ts";

test("build accepts --runtime bun or node and rejects other values and commands", () => {
  expect(parseProjectArgs(["--runtime", "node"], "build").runtime).toBe("node");
  expect(parseProjectArgs(["--runtime", "bun"], "build").runtime).toBe("bun");
  expect(parseProjectArgs([], "build").runtime).toBeUndefined();
  expect(() => parseProjectArgs(["--runtime", "deno"], "build")).toThrow(
    "--runtime must be bun or node.",
  );
  expect(() => parseProjectArgs(["--runtime", "node"], "check")).toThrow(
    "Unknown check option: --runtime",
  );
});

test("the server imports the selected adapter and finds its entry point on Node 22", () => {
  const emission = (runtime?: "bun" | "node") =>
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
