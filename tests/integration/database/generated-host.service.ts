/** Owns source, SQLite seed, real generated server, native requests and joined shutdown for flat/grouped specialized acceptance. */
import { Database } from "bun:sqlite";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Context, Effect, Layer, Scope } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { buildProject } from "../../../packages/cli/src/commands/build.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { scaffoldChild, signalScaffoldGroup } from "../../../scripts/scaffold-process.js";
import { scaffoldPort } from "../../../scripts/scaffold-http.js";
import { ScaffoldProcessFailure } from "../../../scripts/scaffold-process.errors.js";
import type { ScaffoldChild } from "../../../scripts/scaffold-process.types.js";
import { writeGeneratedHostFixture } from "./generated-host-fixture.js";
import { flattenGeneratedHost } from "./generated-host-layout.js";
import { prepareGeneratedProtection } from "./generated-protection-project.js";
import { generatedRequest, generatedRecords } from "./generated-host-http.js";

const repository = resolve(import.meta.dir, "../../..");

/** Each test invocation acquires its own specialized source/state/server scope; request identity remains an operation input. */
export class GeneratedHost extends Context.Service<GeneratedHost>()("relkit.tests.GeneratedHost", {
  make: Effect.gen(function* () {
    const scope = yield* Scope.Scope;
    const root = yield* Effect.acquireRelease(
      scaffoldNative("generated.host.root", () =>
        mkdtemp(join(tmpdir(), "relkit-specialized-host-")),
      ),
      (root) =>
        scaffoldNative("generated.host.release", () =>
          rm(root, { recursive: true, force: true }),
        ).pipe(Effect.orDie),
    );
    return {
      root,
      start: (grouped: boolean) =>
        startGeneratedHost(root, grouped).pipe(Effect.provideService(Scope.Scope, scope)),
      startProtected: (grouped: boolean) =>
        startGeneratedHost(root, grouped, true).pipe(Effect.provideService(Scope.Scope, scope)),
    };
  }),
}) {}
export const generatedHostLayer = Layer.effect(GeneratedHost, GeneratedHost.make);

/**
 * Builds one physical layout and starts its original generated native server.
 * @param root - Scope-owned application and state root.
 * @param grouped - Whether grouped source or its equivalent flat compatibility form is required.
 * @param protection - Whether native subject/channel/agent protection acceptance inputs are included.
 * @returns Native request and shutdown operations retained by the caller's scope.
 */
export const startGeneratedHost = Effect.fn("GeneratedHost.start")(
  function* (root: string, grouped: boolean, protection = false) {
    yield* scaffoldNative("generated.host.fixture", () =>
      writeGeneratedHostFixture(root, repository),
    );
    if (protection) yield* prepareGeneratedProtection(root, repository);
    yield* seedDatabase(root);
    if (!grouped) yield* flattenGeneratedHost(root);
    const built = yield* scaffoldNative("generated.host.build", () =>
      buildProject({ projectRoot: root }),
    );
    if (!built.ok)
      return yield* new ScaffoldProcessFailure({
        operation: "generated.host.build",
        message: JSON.stringify(built.diagnostics),
      });
    const port = yield* Effect.scoped(scaffoldPort);
    const baseURL = `http://127.0.0.1:${port}`;
    const child = yield* scaffoldChild({
      cwd: root,
      args: ["run", "--no-env-file", ".relkit/build/server/index.js"],
      env: {
        PORT: String(port),
        NODE_ENV: "test",
        DATABASE_PATH: join(root, "test.sqlite"),
        BETTER_AUTH_URL: baseURL,
        BETTER_AUTH_SECRET: "generated-host-test-secret-at-least-32-bytes",
        RELKIT_TEST_RELEASES: join(root, "releases.txt"),
        RELKIT_DRAIN_TIMEOUT_MS: "5000",
        RELKIT_TELEMETRY_FLUSH_TIMEOUT_MS: "1000",
      },
    });
    yield* awaitHost(child, baseURL);
    return {
      root,
      baseURL,
      request: (path: string, options?: RequestInit) => generatedRequest(baseURL, path, options),
      records: (mode: string) => generatedRecords(baseURL, mode),
      stop: stopHost(child),
      read: (path: string) =>
        scaffoldNative("generated.host.read", () => readFile(join(root, path), "utf8")),
    };
  },
  (effect) => observeExecution("testing", "generated.host.start", effect),
);

/**
 * Seeds only the test-owned SQLite file and closes its native handle before compilation.
 * @param root - Original caller-owned source/state root.
 * @returns Completion after all native DDL and database release settle.
 */
const seedDatabase = Effect.fn("GeneratedHost.seed")(
  function* (root: string) {
    const database = yield* Effect.acquireRelease(
      Effect.sync(() => new Database(join(root, "test.sqlite"))),
      (database) => Effect.sync(() => database.close()),
    );
    const sql = yield* scaffoldNative("generated.host.sql", () =>
      readFile(
        join(root, "src/services/database/migrations/20260831094750_auth/migration.sql"),
        "utf8",
      ),
    );
    yield* Effect.sync(() => {
      database.exec(sql);
      database.exec("create table records (id integer primary key, value text not null)");
      database.exec("create table samples (id integer primary key, value real not null)");
    });
  },
  (effect) => effect.pipe(Effect.scoped),
);

/**
 * Waits for the actual native session endpoint while rejecting an early owned-process exit.
 * @param child - Original scope-owned generated backend.
 * @param baseURL - Owned loopback endpoint.
 * @returns Verified readiness under the original twenty-second startup deadline.
 */
const awaitHost = Effect.fn("GeneratedHost.ready")(
  function* (child: ScaffoldChild, baseURL: string) {
    for (;;) {
      if (child.process.exitCode !== null)
        return yield* new ScaffoldProcessFailure({
          operation: "generated.host.start",
          message: child.output(),
        });
      const response = yield* generatedRequest(baseURL, "/session").pipe(
        Effect.catchTag("ScaffoldProcessFailure", () => Effect.succeed(undefined)),
      );
      if (response)
        yield* scaffoldNative("generated.host.ready.body", () => response.arrayBuffer());
      if (response?.ok) return;
      yield* Effect.sleep(25);
    }
  },
  (effect) => effect.pipe(Effect.timeout("20 seconds")),
);

/**
 * Stops the original process group and joins its complete native output before fixture release.
 * @param child - Scope-owned generated backend and output drains.
 * @returns Actual graceful exit code and settled output.
 */
const stopHost = Effect.fn("GeneratedHost.stop")(
  function* (child: ScaffoldChild) {
    yield* Effect.sync(() => signalScaffoldGroup(child.process.pid, "SIGTERM"));
    const [exit, output, errors] = yield* Effect.promise(() => child.settled);
    if (
      exit.status !== "fulfilled" ||
      output.status !== "fulfilled" ||
      errors.status !== "fulfilled"
    )
      return yield* new ScaffoldProcessFailure({
        operation: "generated.host.stop",
        message: "Owned native shutdown did not settle",
      });
    return { exitCode: exit.value, output: output.value + errors.value };
  },
  (effect) => effect.pipe(Effect.timeout("10 seconds")),
);
