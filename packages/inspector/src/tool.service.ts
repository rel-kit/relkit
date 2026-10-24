/** Composes standalone UI, collector, private discovery and a single project history writer. */
import { randomBytes } from "node:crypto";
import { Context, Effect, Exit, Layer, Ref, Scope } from "effect";
import {
  InspectionFiles,
  InspectionFilesLive,
  InspectionNative,
  InspectionNativeLive,
} from "@relkit/inspector-api/connection";
import { InspectorDiscovery, InspectorDiscoveryLive } from "./discovery.service.js";
import { InspectorRemote, InspectorRemoteLive } from "./remote.service.js";
import { InspectorUiNative, InspectorUiNativeLive } from "./ui-native.service.js";
import { inspectorBackend } from "./tool-backend.js";
import { inspectionLoop } from "./tool-loop.js";
import type { InspectorOptions } from "./options.types.js";
import type { InspectorToolState } from "./tool-state.types.js";
import { InspectorHistoryNative, InspectorHistoryNativeLive } from "./history-native.service.js";
import { acquireLiveEvents } from "./live-events.js";
import { ExecutionSuccessLogs, observeExecution } from "@relkit/contracts/operation";

/** Native authority is captured once; every run owns an independent tool Scope. */
export class InspectorTool extends Context.Service<InspectorTool>()("relkit/inspector/Tool", {
  make: Effect.gen(function* () {
    const files = yield* InspectionFiles;
    const native = yield* InspectionNative;
    const discovery = yield* InspectorDiscovery;
    const remote = yield* InspectorRemote;
    const ui = yield* InspectorUiNative;
    const history = yield* InspectorHistoryNative;
    return {
      run: (options: InspectorOptions) =>
        observeExecution(
          "inspector",
          "tool.run",
          runTool(options, { files, native, discovery, remote, ui, history }),
          () => ({ tools: 1 }),
        ),
    };
  }),
}) {}

/** Live command composition; no app compiler, evaluator or native feature SDK is included. */
export const InspectorToolLive = Layer.effect(InspectorTool, InspectorTool.make).pipe(
  Layer.provide(
    Layer.mergeAll(
      InspectionFilesLive,
      InspectionNativeLive,
      InspectorDiscoveryLive,
      InspectorRemoteLive,
      InspectorUiNativeLive,
      InspectorHistoryNativeLive,
    ),
  ),
);

/** Captured tool authorities cannot be replaced by browser-supplied choices. */
type ToolAuthorities = {
  readonly files: Effect.Success<typeof InspectionFiles.make>;
  readonly native: Effect.Success<typeof InspectionNative.make>;
  readonly discovery: Effect.Success<typeof InspectorDiscovery.make>;
  readonly remote: Effect.Success<typeof InspectorRemote.make>;
  readonly ui: Effect.Success<typeof InspectorUiNative.make>;
  readonly history: Effect.Success<typeof InspectorHistoryNative.make>;
};

/** Independent support owners retire concurrently within their shared flush deadline. */
const runTool = Effect.fn("Inspector.run")(function* (
  options: InspectorOptions,
  authorities: ToolAuthorities,
) {
  const { files, native, discovery, remote, ui, history } = authorities;
  const scope = yield* Scope.make("parallel");
  return yield* Effect.gen(function* () {
    const state = yield* Ref.make<InspectorToolState>({
      selection: { state: "disconnected", rejected: 0 },
      history: undefined,
      sessionId: undefined,
      through: 0,
      error: undefined,
      incomplete: true,
      droppedRecords: 0,
    });
    const token = randomBytes(32).toString("base64url");
    const events = yield* acquireLiveEvents;
    const backend = yield* native.listen(
      { host: "127.0.0.1", port: 0 },
      inspectorBackend(state, remote, token, options, events),
    );
    yield* Effect.addFinalizer(() =>
      Ref.get(state).pipe(
        Effect.flatMap((value) =>
          value.history ? Scope.close(value.history.scope, Exit.void) : Effect.void,
        ),
      ),
    );
    yield* Effect.forkScoped(
      inspectionLoop(state, discovery, remote, files, options, events).pipe(
        Effect.provideService(ExecutionSuccessLogs, false),
        Effect.provideService(InspectorHistoryNative, history),
        Effect.tapCause(() =>
          Ref.update(state, (value) => ({
            ...value,
            error: "collection.failed",
            incomplete: true,
          })),
        ),
      ),
    );
    const exited = yield* ui.start(options, backend, token);
    yield* exited;
  }).pipe(Scope.use(scope));
});
