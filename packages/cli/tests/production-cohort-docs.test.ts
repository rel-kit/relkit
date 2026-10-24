/** Checks docs SDK capture through the real production cohort using owned native fixture files. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { Effect, Layer } from "effect";
import { DEFAULT_TOOLING_CONFIG } from "@relkit/compiler";
import { GRAPH_VERSION } from "@relkit/contracts";
import { hashGraph } from "@relkit/graph";
import {
  DependencySource,
  SelectedDependenciesLayer,
} from "@relkit/provider/internal/dependencies";
import { fileSystemLayer } from "../src/services/filesystem.service.js";
import { loadBuildStageCohort } from "../src/commands/build-stage-cohort.js";

const source = Layer.succeed(DependencySource, {
  manager: () => Effect.succeed("bun"),
  resolve: (name: string, root: string) =>
    Effect.succeed({
      name,
      root: `${root}/node_modules/${name}`,
      version: name === "@scalar/hono-api-reference" ? "0.12.9" : "0.7.10",
    }),
  satisfies: () => true,
});
const authorities = Layer.merge(
  fileSystemLayer,
  SelectedDependenciesLayer.pipe(Layer.provideMerge(source)),
);

test.each([false, true])(
  "production cohort uses production docs exposure: %s",
  async (enabledInProduction) => {
    const root = await mkdtemp(join(tmpdir(), "relkit-production-docs-"));
    const generatedDirectory = join(root, ".relkit/generated");
    const graph = { contractVersion: GRAPH_VERSION, nodes: [], edges: [] };
    const graphHash = hashGraph(graph);
    try {
      await mkdir(generatedDirectory, { recursive: true });
      await writeFile(
        join(generatedDirectory, "runtime.manifest.ts"),
        "export const runtimeManifest = {};\n",
      );
      const cohort = await Effect.runPromise(
        loadBuildStageCohort({
          projectRoot: root,
          buildDirectory: join(root, "build"),
          stage: join(root, "stage"),
          options: {},
          checked: {
            ok: true,
            activatable: true,
            projectRoot: root,
            generatedDirectory,
            graphHash,
            diagnostics: [],
            config: {
              ...DEFAULT_TOOLING_CONFIG,
              server: {
                ...DEFAULT_TOOLING_CONFIG.server,
                apiDocs: { ui: "scalar", enabledInProduction },
              },
            },
            outputs: {
              manifest: "export const runtimeManifest = {};\n",
              runtimeActivation: "",
              runtimeIntegrationImports: "",
              diagnostics: "[]",
              openapi: "{}",
              client: "",
              contract: "",
              clientContract: "{}",
              clientRegistry: "",
              clientManifest: "{}",
              graph: JSON.stringify(graph),
              runtimeIntegrations: JSON.stringify({ version: 1, graphHash, integrations: [] }),
              localServices: JSON.stringify({ version: 1, graphHash, services: [] }),
            },
          },
        }).pipe(Effect.provide(authorities)),
      );
      expect(cohort.productionDependencies).toEqual(
        enabledInProduction
          ? { "@relkit/runtime-hono": "0.7.10", "@scalar/hono-api-reference": "0.12.9" }
          : {},
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
