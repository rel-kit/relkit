/** Verifies production manifests follow actual runtime capability/phase selection. */
import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { canonicalJson } from "@relkit/contracts";
import {
  DependencySource,
  SelectedDependenciesLayer,
} from "@relkit/provider/internal/dependencies";
import { captureProductionDependencies } from "../src/commands/build-production-dependencies.js";

const source = Layer.succeed(DependencySource, {
  manager: () => Effect.succeed("bun"),
  resolve: (name: string, root: string) =>
    Effect.succeed({
      name,
      root: `${root}/node_modules/${name}`,
      version:
        name === "inngest" ? "4.20.0" : name === "@scalar/hono-api-reference" ? "0.12.9" : "0.7.10",
    }),
  satisfies: () => true,
});
const authorities = SelectedDependenciesLayer.pipe(Layer.provideMerge(source));

it.effect(
  "external production dependencies retain selected runtime peers with exact observed versions",
  () =>
    Effect.gen(function* () {
      const plan = canonicalJson({
        integrations: [
          {
            packageName: "@relkit/inngest",
            packageVersion: "0.7.10",
            capability: "job",
            requirements: [
              {
                package: "inngest",
                supportedRange: "^4.20.0",
                capabilities: ["job"],
                phases: ["runtime"],
                installSection: "dependencies",
              },
              {
                package: "@pulumi/pulumi",
                supportedRange: "^3.259.0",
                capabilities: ["job"],
                phases: ["deploy"],
                installSection: "devDependencies",
              },
            ],
          },
        ],
      });
      const dependencies = yield* captureProductionDependencies(
        "/consumer",
        plan,
        { contractVersion: 1, nodes: [], edges: [] },
        [],
      );
      expect(dependencies).toEqual({ "@relkit/inngest": "0.7.10", inngest: "4.20.0" });
    }).pipe(Effect.provide(authorities)),
);

it.effect("minimal production does not declare installed but unselected integrations", () =>
  Effect.gen(function* () {
    const dependencies = yield* captureProductionDependencies(
      "/consumer",
      '{"integrations":[]}',
      { contractVersion: 1, nodes: [], edges: [] },
      [],
    );
    expect(dependencies).toEqual({});
  }).pipe(Effect.provide(authorities)),
);

it.effect(
  "selected HTTP transport retains its actual runtime owner and only the selected SDK",
  () =>
    Effect.gen(function* () {
      const dependencies = yield* captureProductionDependencies(
        "/consumer",
        '{"integrations":[]}',
        { contractVersion: 1, nodes: [], edges: [] },
        ["scalar"],
      );
      expect(dependencies).toEqual({
        "@relkit/runtime-hono": "0.7.10",
        "@scalar/hono-api-reference": "0.12.9",
      });
    }).pipe(Effect.provide(authorities)),
);

it.effect("isolated HTTP builds resolve their fixed framework owner from its producer", () =>
  Effect.gen(function* () {
    const resolutions: string[][] = [];
    const isolated = Layer.succeed(DependencySource, {
      manager: () => Effect.succeed("bun"),
      resolve: (name: string, from: string) => {
        resolutions.push([name, from]);
        return Effect.succeed(
          name === "@relkit/runtime-hono" && from === "/consumer"
            ? null
            : {
                name,
                root:
                  name === "@relkit/runtime-hono"
                    ? "/producer/runtime-hono"
                    : `/consumer/node_modules/${name}`,
                version: name === "@scalar/hono-api-reference" ? "0.12.9" : "0.7.10",
              },
        );
      },
      satisfies: () => true,
    });
    const dependencies = yield* captureProductionDependencies(
      "/consumer",
      '{"integrations":[]}',
      { contractVersion: 1, nodes: [], edges: [] },
      ["scalar"],
    ).pipe(Effect.provide(SelectedDependenciesLayer.pipe(Layer.provideMerge(isolated))));
    expect(dependencies).toEqual({
      "@relkit/runtime-hono": "0.7.10",
      "@scalar/hono-api-reference": "0.12.9",
    });
    expect(resolutions).toContainEqual(["@scalar/hono-api-reference", "/producer/runtime-hono"]);
  }),
);
