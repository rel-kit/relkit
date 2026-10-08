import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer } from "effect";
import type { PromptDriver } from "create-relkit";
import { CliFileSystem } from "../../src/services/filesystem.service.js";
import { resolveRootMenuEffect } from "../../src/root-menu.js";
import { interactionLayer } from "../../src/cli-interaction.service.js";
import { testFiles } from "../read-services/test-files.js";

/**
 * Supplies only the declared single-choice prompt for deterministic menu scenarios.
 * @param select - Original generic choice authority.
 * @returns Complete driver rejecting every unintended question.
 */
function menuDriver(select: PromptDriver["select"]): PromptDriver {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected prompt");
  };
  return {
    text: unexpected,
    select,
    multiselect: unexpected,
    confirm: unexpected,
    note: () => {},
    intro: () => {},
    outro: () => {},
  };
}

it.effect("menu probes both roots concurrently before presenting existing project actions", () =>
  Effect.gen(function* () {
    const both = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const reads: string[] = [];
    const choices: string[] = [];
    const files = testFiles({
      exists: (path) =>
        Effect.gen(function* () {
          reads.push(path);
          if (reads.length === 2) yield* Deferred.succeed(both, undefined);
          yield* Deferred.await(release);
          return true;
        }),
    });
    const worker = yield* Effect.forkChild(
      resolveRootMenuEffect([], {
        enabled: true,
        cwd: "/fixture",
        promptDriver: menuDriver(async (options) => {
          choices.push(...options.options.map((option) => option.value));
          const selected = options.options[0];
          if (!selected) throw new Error("No declared menu action");
          return selected.value;
        }),
      }).pipe(Effect.provide(Layer.merge(interactionLayer, Layer.succeed(CliFileSystem, files)))),
    );
    yield* Deferred.await(both);
    expect(choices).toEqual([]);
    yield* Deferred.succeed(release, undefined);
    expect(yield* Fiber.join(worker)).toEqual(["add"]);
    expect(reads).toEqual(["/fixture/package.json", "/fixture/relkit.config.ts"]);
    expect(choices).toContain("dev");
  }),
);

it.effect("explicit arguments bypass filesystem discovery and all prompts", () =>
  Effect.gen(function* () {
    const result = yield* resolveRootMenuEffect(["--help"], {
      enabled: true,
      promptDriver: menuDriver(async () => {
        throw new Error("Unexpected select");
      }),
    }).pipe(
      Effect.provide(Layer.merge(interactionLayer, Layer.succeed(CliFileSystem, testFiles()))),
    );
    expect(result).toEqual(["--help"]);
  }),
);

it.effect("fiber interruption reaches and releases the native prompt signal", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    let signal: AbortSignal | undefined;
    let canceled = 0;
    const driver = menuDriver(
      (_options, supplied) =>
        new Promise<never>((_resolve, reject) => {
          signal = supplied;
          const abort = () => {
            canceled++;
            reject(supplied?.reason);
          };
          supplied?.addEventListener("abort", abort, { once: true });
          Deferred.doneUnsafe(entered, Effect.void);
        }),
    );
    const worker = yield* Effect.forkChild(
      resolveRootMenuEffect([], { enabled: true, promptDriver: driver }).pipe(
        Effect.provide(
          Layer.merge(
            interactionLayer,
            Layer.succeed(CliFileSystem, testFiles({ exists: () => Effect.succeed(false) })),
          ),
        ),
      ),
    );
    yield* Deferred.await(entered);
    yield* Fiber.interrupt(worker);
    expect(signal?.aborted).toBe(true);
    expect(canceled).toBe(1);
  }),
);
