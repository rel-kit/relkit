import { expect, it } from "@effect/vitest";
import { Effect, Exit, Logger, Metric } from "effect";
import { GeneratorPrompt, generatorPromptLayer } from "../src/generator-prompt.js";
import { GeneratorProcess, generatorProcessLive } from "../src/generator-process.js";
import { GeneratorPaths, generatorPathsLive } from "../src/generator-paths.js";
import { domainTry } from "../src/generator-errors.js";
import { generatorCleanupFailures, recordCleanupFailure } from "../src/generator-cleanup.js";
import type { PromptDriver } from "../src/prompt-driver.js";

it.effect(
  "observes standalone native owners and answer validation without exposing prompt values",
  () =>
    Effect.gen(function* () {
      const registry: Metric.MetricRegistry = new Map();
      const messages: unknown[] = [];
      const logger = Logger.make(({ message }) => {
        messages.push(message);
      });
      const driver: PromptDriver = {
        text: async () => "private-answer",
        select: async (options) => options.options[0]?.value as never,
        multiselect: async () => [],
        // @ts-expect-error Deliberately malformed native input must fail schema decoding.
        confirm: async () => "private-answer",
        note: () => undefined,
        intro: () => undefined,
        outro: () => undefined,
      };
      yield* Effect.gen(function* () {
        expect(
          yield* GeneratorPrompt.use((prompt) => prompt.text({ message: "private-question" })),
        ).toBe("private-answer");
        expect(
          Exit.isFailure(
            yield* Effect.exit(
              GeneratorPrompt.use((prompt) => prompt.confirm({ message: "private-question" })),
            ),
          ),
        ).toBe(true);
        yield* GeneratorProcess.use((processService) => processService.which("private-executable"));
        yield* GeneratorPaths.use((paths) =>
          Effect.all([paths.cwd(), paths.home(), paths.temporaryRoot()]),
        );
      }).pipe(
        Effect.provide(generatorPromptLayer(driver)),
        Effect.provide(generatorProcessLive),
        Effect.provide(generatorPathsLive),
        Effect.provide(Logger.layer([logger])),
        Effect.provideService(Metric.MetricRegistry, registry),
      );
      const operations = [...registry.values()].filter(
        (entry) => entry.id === "relkit_execution_operations_total",
      );
      expect(
        [...registry.values()].some(
          (entry) =>
            entry.id === "relkit_execution_outcomes_total" &&
            entry.attributes?.operation === "prompt.confirm" &&
            entry.attributes?.outcome === "failure",
        ),
      ).toBe(true);
      expect(operations.some((entry) => entry.attributes?.operation === "process.which")).toBe(
        true,
      );
      expect(
        operations.filter((entry) =>
          ["filesystem.cwd", "filesystem.home", "filesystem.temporaryRoot"].includes(
            String(entry.attributes?.operation),
          ),
        ),
      ).toHaveLength(3);
      expect(JSON.stringify([...registry.values()].map((entry) => entry.attributes))).not.toContain(
        "private-",
      );
      expect(JSON.stringify(messages)).not.toContain("private-");
    }),
);

it.effect("preserves unexpected defects and bounds cleanup evidence under reused errors", () =>
  Effect.gen(function* () {
    const defect = new Error("Unexpected implementation defect.");
    const exit = yield* Effect.exit(
      domainTry(() => {
        throw defect;
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit))
      expect(
        exit.cause.reasons.some((reason) => reason._tag === "Die" && reason.defect === defect),
      ).toBe(true);
    yield* Effect.forEach(
      Array.from({ length: 140 }, (_, index) => index),
      (index) => recordCleanupFailure(Exit.fail(defect), "marker", index),
    ).pipe(Effect.provide(Logger.layer([])));
    const evidence = generatorCleanupFailures(defect);
    expect(evidence).toHaveLength(128);
    expect(evidence[0]?.cause).toBe(0);
    expect(evidence.at(-1)?.cause).toBe(139);
  }),
);
