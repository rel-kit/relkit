/** Generated production omits rich inspection even when development config and legacy environment request it. */
import { expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Schedule } from "effect";
import { generatedAppFixture } from "../fixtures/inspector/generated-app.js";
import { runCli } from "../../packages/cli/src/main.js";
import { scaffoldChild } from "../../scripts/scaffold-process.js";

/** Uses the ordinary production build command after releasing the development candidate. */
const buildProduction = Effect.fn("InspectorProduction.build")(function* (project: string) {
  const errors: string[] = [];
  const status = yield* Effect.promise(() =>
    runCli(["build", "--project-root", project, "--json"], {
      installSignalHandlers: false,
      io: { stdout: () => {}, stderr: (line) => errors.push(line) },
    }),
  );
  expect(status, errors.join("\n")).toBe(0);
  const entry = join(project, ".relkit/build/server/index.js");
  const source = yield* Effect.promise(() => readFile(entry, "utf8"));
  expect(source).not.toContain("@relkit/inspector-api");
  expect(source).not.toContain("installInspectorEndpoints");
  return entry;
});

/** Waits on the real business route while retaining a terminated child's diagnostic output. */
const productionReply = Effect.fn("InspectorProduction.wait")(function* (
  port: number,
  child: Effect.Success<ReturnType<typeof scaffoldChild>>,
) {
  const probe = Effect.tryPromise({
    try: () => fetch(`http://127.0.0.1:${port}/hello`).then((response) => response.status),
    catch: () => new Error("Production not ready"),
  }).pipe(
    Effect.catchIf(
      () => true,
      () => Effect.succeed(0),
    ),
    Effect.flatMap((status) =>
      child.process.exitCode === null
        ? Effect.succeed(status)
        : Effect.fail(new Error(child.output())),
    ),
  );
  yield* probe.pipe(
    Effect.repeat({ until: (status) => status === 200, schedule: Schedule.spaced(50) }),
    Effect.timeout(15_000),
  );
});

test("production serves business/core probes while rich APIs and bridge discovery stay absent", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const f = yield* Effect.acquireRelease(Effect.promise(generatedAppFixture), (fixture) =>
          Effect.promise(fixture.close),
        );
        yield* Effect.promise(() => f.session.stop());
        const entry = yield* buildProduction(f.projectRoot);
        const allocator = Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          fetch: () => new Response(),
        });
        const port = allocator.port!;
        yield* Effect.promise(() => allocator.stop(true));
        const child = yield* scaffoldChild({
          cwd: f.projectRoot,
          args: ["run", "--no-env-file", entry],
          env: {
            NODE_ENV: "production",
            PORT: String(port),
            RELKIT_INTERNAL_ENDPOINTS: "1",
            RELKIT_INTERNAL_ENDPOINT_TOKEN: "production-probe-token",
            RELKIT_INSPECTOR_SESSION_TOKEN: "attempted-inspection-token",
            RELKIT_INSPECTOR_ROOT: "/must-not-be-used",
          },
        });
        yield* productionReply(port, child);
        const endpoint = `http://127.0.0.1:${port}`;
        yield* assertProductionEndpoints(endpoint);
        expect(
          yield* Effect.promise(() =>
            readdir(join(f.projectRoot, ".relkit/connections")).catch((cause) => {
              if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return [];
              throw cause;
            }),
          ),
        ).toEqual([]);
        expect(
          yield* Effect.promise(() =>
            Bun.file(join(f.projectRoot, ".relkit/observability/observability.duckdb")).exists(),
          ),
        ).toBe(false);
      }),
    ),
  );
}, 60_000);

/** Exercises core authorization and rich-inspection absence on the same listener. */
const assertProductionEndpoints = Effect.fn("InspectorProduction.endpoints")(function* (
  endpoint: string,
) {
  const headers = {
    authorization: "Bearer production-probe-token",
    "x-relkit-inspector-session-token": "attempted-inspection-token",
  };
  expect(
    (yield* Effect.promise(() => fetch(`${endpoint}/_relkit/v1/health/ready`, { headers }))).status,
  ).toBe(200);
  expect((yield* Effect.promise(() => fetch(`${endpoint}/_relkit/v1/graph`))).status).toBe(401);
  expect(
    (yield* Effect.promise(() => fetch(`${endpoint}/_relkit/v1/graph`, { headers }))).status,
  ).toBe(200);
  for (const path of [
    "/_relkit/v1/runtime/functions",
    "/_relkit/v1/actions/functions/hello/invoke",
    "/_relkit/v1/logs",
  ])
    expect((yield* Effect.promise(() => fetch(endpoint + path, { headers }))).status).toBe(404);
});
