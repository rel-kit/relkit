/** Exercises actual grouped candidate generation with example removal; owned native roots and generator calls settle before cleanup, with public unsupported tuples unchanged. */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { ownedNativePromise } from "@relkit/cli/internal/tooling";
import { generateProject, normalizeCreateOptions } from "../../packages/create-relkit/src/index.js";

test("grouped candidate example removal retains the useful hello boundary and platform inputs", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const parent = yield* Effect.acquireRelease(
          ownedNativePromise("generator.examples.root", () =>
            mkdtemp(join(tmpdir(), "relkit-grouped-examples-")),
          ),
          (root) =>
            ownedNativePromise("generator.examples.release", () =>
              rm(root, { recursive: true, force: true }),
            ).pipe(Effect.orDie),
        );
        yield* Effect.forEach(
          ["minimal", "api", "agent", "fullstack"] as const,
          (template) =>
            Effect.gen(function* () {
              const options = normalizeCreateOptions([
                `no-examples-${template}`,
                "--template",
                template,
                "--no-examples",
                "--no-install",
                "--no-git",
              ]);
              const generated = yield* ownedNativePromise("generator.examples.create", (signal) =>
                generateProject(options, {
                  cwd: parent,
                  templateRoot: resolve(import.meta.dir, "../../templates/default/v1"),
                  signal,
                }),
              );
              const exists = (path: string) =>
                ownedNativePromise("generator.examples.exists", () =>
                  Bun.file(join(generated.destination, path)).exists(),
                );
              expect(yield* exists("relkit.config.ts")).toBe(true);
              expect(yield* exists("src/platform/env.ts")).toBe(true);
              expect(yield* exists("src/services/orders/service.ts")).toBe(false);
              expect(yield* exists("src/routes/hello/route.ts")).toBe(false);
              expect(yield* exists("src/services/hello/tools/lookup.tool.ts")).toBe(false);
              expect(yield* exists("src/services/hello/agents/assistant.agent.ts")).toBe(false);
              if (template !== "api") {
                expect(yield* exists("src/services/hello/service.ts")).toBe(true);
                expect(yield* exists("src/services/hello/functions/hello.function.ts")).toBe(true);
              }
              if (template === "fullstack") expect(yield* exists("web/app/page.tsx")).toBe(true);
            }),
          { concurrency: 1, discard: true },
        );
      }),
    ),
  ));
