/** Runs installed development acceptance with Effect-owned child groups, drains and listener cleanup. */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { scanGeneratedSource } from "./scaffold-smoke-source.js";
import { scaffoldChild } from "./scaffold-process.js";
import { awaitScaffoldHttp, scaffoldPort, assertScaffoldPortReleased } from "./scaffold-http.js";
import { verifyScaffoldDevContracts } from "./scaffold-dev-contracts.js";

const packageScripts = Schema.Struct({
  scripts: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});

/**
 * Owns one installed application's backend and packaged Inspector until assertions finish.
 * @param root - Standalone installed application.
 * @param exercise - Optional caller-owned native acceptance callback.
 * @returns Completion after the child group and output readers have terminated.
 */
export const devSmokeAttempt = Effect.fn("ScaffoldDev.attempt")(function* (
  root: string,
  exercise?: (port: number) => Promise<void>,
) {
  const port = yield* scaffoldPort;
  const inspector = yield* scaffoldPort;
  const text = yield* Effect.promise(() => readFile(join(root, "package.json"), "utf8"));
  const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(packageScripts))(text);
  const devScript = manifest.scripts?.["dev:api"] === undefined ? "dev" : "dev:api";
  const taskProject = existsSync(join(root, "src/services/orders/tasks/export-orders.task.ts"));
  yield* Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* scaffoldChild({
        cwd: root,
        env: { PORT: String(port) },
        args: [
          "run",
          devScript,
          "--",
          "--project-root",
          root,
          "--port",
          String(port),
          "--inspector-port",
          String(inspector),
        ],
      });
      yield* awaitScaffoldHttp(owner.process, [
        `http://127.0.0.1:${port}${taskProject ? "/health" : "/hello?name=RelKit"}`,
        `http://127.0.0.1:${inspector}`,
      ]).pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() => console.error(owner.output())).pipe(
            Effect.andThen(Effect.failCause(cause)),
          ),
        ),
      );
      yield* verifyScaffoldDevContracts(port, inspector, taskProject);
      if (exercise !== undefined) yield* Effect.promise(() => exercise(port));
    }),
  );
  yield* assertScaffoldPortReleased(port);
  yield* assertScaffoldPortReleased(inspector);
});

/**
 * Exposes the native smoke boundary while keeping all child resources scoped.
 * @param root - Installed project.
 * @param exercise - Optional live acceptance.
 * @returns Completion after one complete run; failures remain visible to the evidence owner.
 */
export function devSmoke(root: string, exercise?: (port: number) => Promise<void>): Promise<void> {
  return Effect.runPromise(devSmokeAttempt(root, exercise));
}

/**
 * Verifies live behavior and then checks authored generated source conventions.
 * @param root - Installed candidate project.
 * @param exercise - Optional live acceptance.
 * @returns Completion after both checks.
 */
export function verifyGeneratedProject(root: string, exercise?: (port: number) => Promise<void>) {
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* devSmokeAttempt(root, exercise);
      yield* Effect.promise(() => scanGeneratedSource(root));
    }),
  );
}
