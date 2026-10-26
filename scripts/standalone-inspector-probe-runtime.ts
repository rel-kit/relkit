/** Native runtime assertions shared by the finite external package probe. */
import assert from "node:assert/strict";
import { join } from "node:path";
import { Effect, Schedule } from "effect";
import { scaffoldChild } from "./scaffold-process.js";
import type { ScaffoldChild } from "./scaffold-process.types.js";

/** A finite native request observes a healthy tool and consumes every unsuccessful reply. */
const waitReply = Effect.fn("StandaloneProbe.response")(function* (
  child: ScaffoldChild,
  port: number,
  path: string,
  includes: string,
) {
  const probe = Effect.tryPromise({
    try: () =>
      fetch(`http://127.0.0.1:${port}/_relkit/backend${path}`, {
        signal: AbortSignal.timeout(2000),
      }).then((response) => response.text()),
    catch: () => new Error("Tool not yet listening"),
  }).pipe(
    Effect.catchIf(
      () => true,
      () => Effect.succeed(""),
    ),
    Effect.flatMap((body) =>
      child.process.exitCode === null
        ? Effect.succeed(body)
        : Effect.fail(new Error(`Packed tool exited: ${child.output()}`)),
    ),
  );
  return yield* probe.pipe(
    Effect.repeat({ until: (body) => body.includes(includes), schedule: Schedule.spaced(100) }),
    Effect.timeout(30_000),
  );
});

/** Uses an actual ephemeral listener allocation rather than a fixed contributor port. */
const availablePort = Effect.gen(function* () {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = server.port!;
  yield* Effect.promise(() => server.stop(true));
  return port;
});

/** Each launch owns the complete tool tree independently of its caller's app. */
export const runPackedTool = Effect.fn("StandaloneProbe.launch")(function* (
  directory: string,
  project: string,
  token: string,
) {
  const port = yield* availablePort;
  const child = yield* scaffoldChild({
    cwd: directory,
    args: [
      join(directory, "node_modules/@relkit/inspector/dist/bin.js"),
      "--project-root",
      project,
      "--port",
      String(port),
    ],
  });
  const graph = yield* waitReply(child, port, "/_relkit/v1/graph", '"nodes":[]');
  const history = yield* waitReply(child, port, "/_relkit/v1/logs", "external packed record");
  assert(!graph.includes(token));
  assert(!history.includes(token));
  assert(!history.includes("synthetic-private-password"));
  return { graph, history };
});
