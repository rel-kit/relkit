/** Real host bridge, private metadata and bounded capture for native image acceptance. */
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Clock, Effect, Exit, Scope } from "effect";
import { InspectionBridge, InspectionCapture } from "@relkit/inspector-api/connection";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";

export const containerApplication = Effect.fn("Container.fixtureApplication")(function* () {
  const parent = yield* Effect.scope;
  const root = yield* Effect.acquireRelease(
    scaffoldNative("container.project", () =>
      mkdtemp(join(tmpdir(), "relkit-inspector-container-")),
    ),
    (root, exit) =>
      Exit.isSuccess(exit)
        ? scaffoldNative("container.project-close", () =>
            rm(root, { recursive: true, force: true }),
          ).pipe(Effect.orDie)
        : Effect.logWarning("Container failure evidence retained", { root }),
  );
  const history = join(root, "history");
  yield* scaffoldNative("container.history-directory", () => mkdir(history, { mode: 0o700 }));
  const app = yield* fixtureBackend;
  const backend = `http://127.0.0.1:${app.port}`;
  let session = yield* bridgeSession(parent, root, backend, "first-session");
  const selected = join(root, ".relkit/connections/selected.json");
  yield* publishSelected(session.path, selected);
  const peer = yield* bridgeSession(parent, root, backend, "unselected-peer");
  return {
    root,
    history,
    selected,
    directory: join(root, ".relkit/connections"),
    backend,
    peer: peer.descriptor.sessionId,
    connection: () => session.descriptor,
    rotate: Effect.gen(function* () {
      const previous = session.descriptor;
      yield* Scope.close(session.scope, Exit.void);
      session = yield* bridgeSession(
        parent,
        root,
        backend,
        "rotated-session",
        Number(new URL(previous.endpoint).port),
      );
      yield* publishSelected(session.path, selected);
      return { previous, current: session.descriptor };
    }),
  };
});

const bridgeSession = Effect.fn("Container.bridgeSession")(function* (
  parent: Scope.Scope,
  root: string,
  backend: string,
  message: string,
  port = 0,
) {
  const scope = yield* Scope.fork(parent);
  const capture = yield* InspectionCapture.make({});
  yield* capture.append({
    version: 2,
    signal: "log",
    timestamp: new Date(yield* Clock.currentTimeMillis).toISOString(),
    level: "info",
    component: "container-app",
    message,
    fields: { authorization: "synthetic-secret" },
  });
  const connection = yield* InspectionBridge.use((bridge) =>
    bridge.start({
      root,
      host: "0.0.0.0",
      port,
      active: () => ({
        endpoint: backend,
        generationId: "container-generation",
        capabilities: ["graph", "records"],
      }),
      records: capture.records,
    }),
  ).pipe(Scope.provide(scope));
  return { ...connection, scope };
});

const publishSelected = Effect.fn("Container.atomicSelection")(
  (source: string, destination: string) =>
    scaffoldNative("container.selection", async () => {
      await writeFile(destination + ".tmp", await readFile(source), { mode: 0o600, flag: "wx" });
      await rename(destination + ".tmp", destination);
    }),
);

/** Owns the independent host business listener. */
const fixtureBackend = Effect.acquireRelease(
  Effect.sync(() =>
    Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) =>
        new URL(request.url).pathname === "/hello"
          ? new Response("backend alive")
          : Response.json({
              protocol: "relkit.inspector",
              version: 1,
              generationId: "container-generation",
              graphHash: "container-graph",
              nodes: [],
              edges: [],
            }),
    }),
  ),
  (app) => Effect.promise(() => app.stop(true)),
);
