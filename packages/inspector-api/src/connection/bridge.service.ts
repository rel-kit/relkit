/**
 * Owns one authenticated development-session listener and private descriptor.
 * Active-generation callbacks change only after the supervisor validates a
 * candidate; session credentials survive reloads and rotate on complete restart.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { Clock, Context, Effect, Layer, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { InspectionFiles } from "./files.service.js";
import { InspectionNative } from "./native.service.js";
import { createInspectionHandler } from "./bridge-handler.js";
import type { InspectionBridgeOperations, InspectionBridgeOptions } from "./bridge.types.js";
import type { InspectionDescriptor } from "./protocol.types.js";
import type { InspectionFilesOperations } from "./protocol.types.js";
import type { InspectionNativeOperations } from "./bridge.types.js";

/** Session bridge; Layers capture I/O while each start has its own caller Scope. */
export class InspectionBridge extends Context.Service<
  InspectionBridge,
  InspectionBridgeOperations
>()("relkit/inspection/Bridge", {
  make: Effect.gen(function* () {
    const files = yield* InspectionFiles;
    const native = yield* InspectionNative;
    return {
      start: (options) =>
        observeExecution(
          "inspector",
          "connection.start",
          startBridge(files, native, options),
          () => ({}),
        ),
    } satisfies InspectionBridgeOperations;
  }),
}) {}

/** Composes the domain with caller-supplied live or deterministic I/O Layers. */
export const InspectionBridgeLive = Layer.effect(InspectionBridge, InspectionBridge.make);

/**
 * Acquires listener before publication and releases only this session's descriptor.
 * @param files - Captured metadata authority.
 * @param native - Captured native listener and one-shot forwarding authority.
 * @param options - Session root, validated bind settings and committed target callback.
 * @returns Acquired identity; closing caller Scope removes metadata and joins I/O.
 */
const startBridge = Effect.fn("Inspection.start")(function* (
  files: InspectionFilesOperations,
  native: InspectionNativeOperations,
  options: InspectionBridgeOptions,
) {
  const current = yield* Ref.make<InspectionDescriptor | undefined>(undefined);
  const endpoint = yield* native.listen(options, (request) =>
    Effect.flatMap(Ref.get(current), (descriptor) =>
      descriptor === undefined
        ? Effect.succeed(Response.json({ error: "session.starting" }, { status: 503 }))
        : createInspectionHandler(descriptor, {
            active: options.active,
            forward: options.forward ?? native.forward,
            ...(options.records === undefined ? {} : { records: options.records }),
          })(request),
    ),
  );
  const createdAt = new Date(yield* Clock.currentTimeMillis).toISOString();
  const descriptor: InspectionDescriptor = {
    protocol: 1,
    projectId: yield* files.projectId(options.root),
    sessionId: options.identity?.sessionId ?? randomUUID(),
    endpoint,
    process: {
      pid: process.pid,
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    },
    createdAt,
    token: options.identity?.token ?? randomBytes(32).toString("base64url"),
  };
  yield* Ref.set(current, descriptor);
  const path = yield* Effect.acquireRelease(files.publish(options.root, descriptor), (path) =>
    files
      .removeOwned(path, descriptor)
      .pipe(
        Effect.catchTag("InspectionConnectionError", () =>
          Effect.logWarning("Inspection descriptor cleanup rejected; foreign files preserved"),
        ),
      ),
  );
  yield* Effect.logInfo("Development inspection bridge listening", {
    endpoint,
    sessionId: descriptor.sessionId,
  });
  return { descriptor, path };
});
