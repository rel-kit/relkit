/** Owns actual flat/grouped commerce source copies, compiler preparation and native acceptance children through joined scoped cleanup. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Context, Effect, Exit, Layer, Scope } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import {
  scaffoldChild,
  scaffoldProcessLayer,
  ScaffoldProcess,
} from "../../../scripts/scaffold-process.js";
import { ScaffoldProcessFailure } from "../../../scripts/scaffold-process.errors.js";
import { copyCommerce, flattenCommerce } from "./paired-commerce-project.js";
import { commerceGraphContract } from "./paired-commerce-graph.js";

const repository = resolve(import.meta.dir, "../../..");

/** Each acceptance owner retains its borrowed SDK identity and releases children before its private source tree. */
export class PairedCommerce extends Context.Service<PairedCommerce>()(
  "relkit.tests.PairedCommerce",
  {
    make: Effect.gen(function* () {
      const scope = yield* Scope.Scope;
      const process = yield* ScaffoldProcess;
      const root = yield* Effect.acquireRelease(
        scaffoldNative("commerce.pair.root", () =>
          mkdtemp(join(tmpdir(), "relkit-commerce-pair-")),
        ),
        (root, exit) =>
          Exit.isFailure(exit)
            ? Effect.logWarning("Retained failed commerce fixture", { root })
            : scaffoldNative("commerce.pair.release", () =>
                rm(root, { recursive: true, force: true }),
              ).pipe(Effect.orDie),
      );
      return {
        run: (grouped: boolean) =>
          runCommerce(root, grouped).pipe(
            Effect.provideService(ScaffoldProcess, process),
            Effect.provideService(Scope.Scope, scope),
          ),
      };
    }),
  },
) {}
export const pairedCommerceLayer = Layer.effect(PairedCommerce, PairedCommerce.make).pipe(
  Layer.provide(scaffoldProcessLayer),
);

/**
 * Executes unchanged maintained native tests against real compiler-prepared modules in one source layout.
 * @param root - Test-owned repository-shaped source tree.
 * @param grouped - Whether to retain the default grouped layout.
 * @returns Native compiler/test output after every owned process has settled.
 */
const runCommerce = Effect.fn("PairedCommerce.run")(
  function* (root: string, grouped: boolean) {
    yield* scaffoldNative("commerce.pair.copy", () => copyCommerce(root));
    if (!grouped) yield* scaffoldNative("commerce.pair.flatten", () => flattenCommerce(root));
    const process = yield* ScaffoldProcess;
    const checked = yield* process.run({
      cwd: join(root, "examples/commerce"),
      args: [join(repository, "packages/cli/dist/bin.js"), "check", "--json"],
      env: { TMPDIR: join(root, "native-tmp") },
    });
    const output = yield* runCommerceTests(root);
    return { layout: grouped ? "grouped" : "flat", output, ...commerceGraphContract(checked) };
  },
  (effect) => observeExecution("testing", "commerce.pair.run", effect),
);

/**
 * Retains both native test streams and joins failure, interruption and successful shutdown before source release.
 * @param root - Private fixture repository tree.
 * @returns Complete native test output after the original runner settles.
 */
const runCommerceTests = Effect.fn("PairedCommerce.tests")(
  function* (root: string) {
    const child = yield* scaffoldChild({
      cwd: root,
      env: { TMPDIR: join(root, "native-tmp") },
      args: [
        "test",
        "./examples/commerce/tests",
        "./tests/integration/http/commerce-example.test.ts",
        "./tests/integration/agents/commerce-example.test.ts",
        "./tests/integration/commerce-example-consistency.test.ts",
        "./tests/integration/fixtures/commerce-layout-events.test.ts",
        "./tests/integration/fixtures/commerce-layout-tasks.test.ts",
      ],
    });
    const [exit, stdout, stderr] = yield* Effect.promise(() => child.settled);
    if (
      exit.status !== "fulfilled" ||
      stdout.status !== "fulfilled" ||
      stderr.status !== "fulfilled"
    )
      return yield* new ScaffoldProcessFailure({
        operation: "commerce.pair.tests",
        message: "Native test exit and output did not settle",
      });
    const output = stdout.value + stderr.value;
    if (exit.value !== 0)
      return yield* new ScaffoldProcessFailure({
        operation: "commerce.pair.tests",
        message: output,
      });
    return output;
  },
  (effect) => effect.pipe(Effect.scoped),
);
