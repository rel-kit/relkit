/** Verifies single-use reuse and watch lifetime using deterministic native edit callbacks. */
import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { checkInitialDevProjectEffect } from "../../src/commands/dev-initial-check.js";
import { CliProject } from "../../src/services/project.service.js";
import { CliSourceWatch } from "../../src/services/source-watch.service.js";
import { cleanupLayer } from "../../src/services/cleanup.service.js";
import type { CheckResult } from "../../src/commands/check-result.types.js";

const checked: CheckResult = {
  ok: true,
  activatable: true,
  projectRoot: "/project",
  generatedDirectory: "/project/.relkit/generated",
  diagnostics: [],
  outputs: {
    graph: "",
    manifest: "",
    runtimeActivation: "",
    runtimeIntegrations: "",
    runtimeIntegrationImports: "",
    localServices: "",
    diagnostics: "",
    openapi: "",
    client: "",
    contract: "",
    clientContract: "",
    clientRegistry: "",
    clientManifest: "",
  },
};

/** Injects edit events through the same native callback boundary used during validation. */
function fixture(duringCheck?: string) {
  let change: (file: string) => void = () => undefined;
  let failure = () => undefined;
  let closes = 0;
  let checks = 0;
  const forbidden = () => Effect.die(new Error("Unexpected project operation"));
  const layer = Layer.mergeAll(
    cleanupLayer,
    Layer.succeed(CliSourceWatch, {
      watch: (_root, recursive, onChange, onFailure) =>
        Effect.sync(() => {
          expect(recursive).toBe(true);
          change = onChange;
          failure = () => onFailure(new Error("watch"));
          return () => {
            closes += 1;
          };
        }),
      poll: forbidden,
    }),
    Layer.succeed(CliProject, {
      check: forbidden,
      build: forbidden,
      checkDevelopment: () =>
        Effect.sync(() => {
          checks += 1;
          if (duringCheck !== undefined) change(duringCheck);
          return checked;
        }),
    }),
  );
  return {
    layer,
    change: (file: string) => change(file),
    failure: () => failure(),
    checks: () => checks,
    closes: () => closes,
  };
}

it.effect("reuses unchanged initial validation exactly once and closes the watch once", () =>
  Effect.gen(function* () {
    const test = fixture();
    yield* Effect.scoped(
      Effect.gen(function* () {
        const initial = yield* checkInitialDevProjectEffect("/project");
        expect(initial.checked).toBe(checked);
        test.change(".relkit/generated/application.graph.json");
        expect(yield* initial.take).toBe(checked);
        expect(yield* initial.take).toBeUndefined();
        expect(test.checks()).toBe(1);
      }).pipe(Effect.provide(test.layer)),
    );
    expect(test.closes()).toBe(1);
  }),
);

it.effect(
  "requires fresh validation after source, dependency, configuration or environment edits",
  () =>
    Effect.gen(function* () {
      for (const file of [
        "src/auth/service.ts",
        "node_modules/effect/package.json",
        "tsconfig.json",
        ".env.local",
      ]) {
        const test = fixture();
        yield* Effect.scoped(
          Effect.gen(function* () {
            const initial = yield* checkInitialDevProjectEffect("/project");
            test.change(file);
            expect(yield* initial.take, file).toBeUndefined();
            expect(yield* initial.take).toBeUndefined();
          }).pipe(Effect.provide(test.layer)),
        );
        expect(test.closes()).toBe(1);
      }
    }),
);

it.effect("rejects reuse when an input changes during validation or observation fails", () =>
  Effect.gen(function* () {
    for (const duringCheck of [undefined, "src/todos/service.ts"]) {
      const test = fixture(duringCheck);
      yield* Effect.scoped(
        Effect.gen(function* () {
          const initial = yield* checkInitialDevProjectEffect("/project");
          if (duringCheck === undefined) test.failure();
          expect(yield* initial.take).toBeUndefined();
        }).pipe(Effect.provide(test.layer)),
      );
      expect(test.closes()).toBe(1);
    }
  }),
);

it.effect("discard closes the watch immediately and prevents later reuse", () =>
  Effect.gen(function* () {
    const test = fixture();
    yield* Effect.scoped(
      Effect.gen(function* () {
        const initial = yield* checkInitialDevProjectEffect("/project");
        yield* initial.discard;
        expect(test.closes()).toBe(1);
        expect(yield* initial.take).toBeUndefined();
        yield* initial.discard;
      }).pipe(Effect.provide(test.layer)),
    );
    expect(test.closes()).toBe(1);
  }),
);
