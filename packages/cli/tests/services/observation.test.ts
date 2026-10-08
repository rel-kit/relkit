import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Logger, Metric, References } from "effect";
import { CliFileSystem, fileSystemLayer } from "../../src/services/filesystem.service.js";
import { CliModules, makeSessionModuleLayer } from "../../src/services/modules.service.js";
import { CliCleanup, cleanupLayer } from "../../src/services/cleanup.service.js";
import { CliClient } from "../../src/services/client.service.js";
import {
  CliDeployConfirmation,
  deployConfirmationLayer,
} from "../../src/services/deploy-confirmation.service.js";
import { runClientEffect } from "../../src/commands/client.js";
import type { CliCommandContext } from "../../src/main-support-types.js";

it.effect(
  "standalone native operations, cache hits, consent and validation emit bounded redacted outcomes",
  () =>
    Effect.gen(function* () {
      const registry: Metric.MetricRegistry = new Map();
      const messages: unknown[] = [];
      const logger = Logger.make(({ message, logLevel, fiber }) => {
        messages.push({
          message,
          logLevel,
          annotations: fiber.getRef(References.CurrentLogAnnotations),
        });
      });
      const context: CliCommandContext = {
        command: "client",
        args: [],
        json: true,
        signal: new AbortController().signal,
        reporter: { output: () => undefined, error: () => undefined },
        log: () => undefined,
      };
      let loads = 0;
      const namespace = { private: "private-secret" };
      const graph = Layer.mergeAll(
        fileSystemLayer,
        cleanupLayer,
        makeSessionModuleLayer(() =>
          Effect.sync(() => {
            loads += 1;
            return namespace;
          }),
        ),
        deployConfirmationLayer({ confirm: async () => true }),
        Layer.succeed(
          CliClient,
          CliClient.of({
            pull: () => Effect.die("unexpected pull"),
            check: () => Effect.die("unexpected check"),
          }),
        ),
      );
      yield* Effect.gen(function* () {
        yield* CliFileSystem.use((files) => files.exists("private-missing-file"));
        yield* CliModules.use((modules) =>
          Effect.gen(function* () {
            expect(yield* modules.load("private-import-url")).toBe(namespace);
            expect(yield* modules.load("private-import-url")).toBe(namespace);
            yield* modules.invalidate();
            yield* modules.load("private-import-url");
          }),
        );
        yield* CliCleanup.use((cleanup) =>
          cleanup
            .record("private-release-label", Cause.fail("private-secret"))
            .pipe(Effect.andThen(cleanup.snapshot())),
        );
        expect(
          yield* CliDeployConfirmation.use((confirmation) =>
            confirmation.confirm("private-question"),
          ),
        ).toBe(true);
        expect(Exit.isFailure(yield* Effect.exit(runClientEffect([], context)))).toBe(true);
      }).pipe(
        Effect.provide(graph),
        Effect.provide(Logger.layer([logger])),
        Effect.provideService(References.MinimumLogLevel, "Info"),
        Effect.provideService(Metric.MetricRegistry, registry),
      );
      expect(loads).toBe(2);
      const operations = [...registry.values()]
        .filter((entry) => entry.id === "relkit_execution_operations_total")
        .map((entry) => entry.attributes?.operation);
      for (const operation of [
        "filesystem.exists",
        "modules.load",
        "modules.invalidate",
        "cleanup.record",
        "cleanup.snapshot",
        "deployment.confirm",
        "client.command",
      ])
        expect(operations).toContain(operation);
      expect(
        [...registry.values()].some(
          (entry) =>
            entry.id === "relkit_execution_outcomes_total" &&
            entry.attributes?.operation === "client.command" &&
            entry.attributes?.outcome === "failure",
        ),
      ).toBe(true);
      expect(messages.filter((item) => JSON.stringify(item).includes("modules.load"))).toHaveLength(
        3,
      );
      expect(JSON.stringify(messages)).not.toContain("private-");
      expect(JSON.stringify([...registry.values()].map((entry) => entry.attributes))).not.toContain(
        "private-",
      );
    }),
);
