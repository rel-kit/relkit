/** Verifies production bundling resolves its actual installed consumer context. */
import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { DependencySource } from "@relkit/provider/internal/dependencies";
import { bundleServerEffect } from "../../src/commands/build-support.js";
import { cleanupLayer } from "../../src/services/cleanup.service.js";
import { CliProcess } from "../../src/services/process.service.js";
import { filesystemTestLayer } from "./test-layers.js";

it.effect("ordinary and prepared builds resolve modules from the consuming project", () =>
  Effect.gen(function* () {
    for (const inventory of [undefined, "bun.inputs.json"] as const) {
      const links: string[][] = [];
      yield* bundleServerEffect("/stage/server", "/consumer", false, inventory).pipe(
        Effect.provide(
          Layer.mergeAll(
            cleanupLayer,
            Layer.succeed(DependencySource, {
              manager: () => Effect.succeed("bun"),
              resolve: (name, from) =>
                Effect.succeed({ name, version: "1.0.0", root: `${from}/node_modules/${name}` }),
              satisfies: () => true,
            }),
            filesystemTestLayer({
              mkdir: () => Effect.void,
              symlink: (target, path) =>
                Effect.sync(() => {
                  links.push([target, path]);
                }),
              remove: () => Effect.void,
            }),
            Layer.succeed(
              CliProcess,
              CliProcess.of({
                run: (input) =>
                  Effect.sync(() => {
                    expect(input.cwd).toBe("/consumer");
                    expect(input.args).toContain("--external=@relkit/runtime-hono/mcp");
                    expect(input.args).toContain("--external=@relkit/runtime-hono/ag-ui");
                    expect(input.args).toContain("--external=@relkit/runtime-hono/scalar");
                    return { exitCode: 0, stdout: "", stderr: "" };
                  }),
              }),
            ),
          ),
        ),
      );
      expect(links).toContainEqual([
        "/consumer/node_modules/@relkit/engine",
        "/stage/server/node_modules/@relkit/engine",
      ]);
      expect(links).toContainEqual([
        "/consumer/node_modules/@relkit/provider",
        "/stage/server/node_modules/@relkit/provider",
      ]);
      expect(links.every(([target]) => target?.startsWith("/consumer/node_modules/"))).toBe(true);
      expect(links.some(([target]) => /langchain|pulumi|drizzle/.test(target ?? ""))).toBe(false);
    }
  }),
);
