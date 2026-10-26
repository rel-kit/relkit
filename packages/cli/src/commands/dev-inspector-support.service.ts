/**
 * Owns the development bridge independently of backend readiness. The active
 * callback reads only the committed generation; UI and history have no owner
 * in this process. Closing the support fiber joins the listener and descriptor.
 */
import { Context, Effect, Layer, Ref, Scope } from "effect";
import {
  InspectionBridge,
  InspectionBridgeLive,
  InspectionFilesLive,
  InspectionNativeLive,
} from "@relkit/inspector-api/connection";
import type { InspectionBridgeOperations } from "@relkit/inspector-api/connection";
import { CliAdapterError } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { DevInspectorSupportOperations } from "./dev-inspector-support.types.js";
import type { DevSession } from "./dev-session.js";
import { forwardDevInspection } from "./dev-inspection-forward.js";

/** Captures bridge authority without starting support until explicitly enabled. */
export class CliInspectorSupport extends Context.Service<
  CliInspectorSupport,
  DevInspectorSupportOperations
>()("relkit/cli/InspectorSupport", {
  make: Effect.gen(function* () {
    const bridge = yield* InspectionBridge;
    return {
      run: (session) => observeCli("dev.inspector.support", runSupport(session, bridge)),
    } satisfies DevInspectorSupportOperations;
  }),
}) {}

/** Live support has no Node, Next, package installation or local-store dependency. */
export const inspectorSupportLayer = Layer.effect(
  CliInspectorSupport,
  CliInspectorSupport.make,
).pipe(
  Layer.provide(
    InspectionBridgeLive.pipe(
      Layer.provide(Layer.merge(InspectionFilesLive, InspectionNativeLive)),
    ),
  ),
);

/**
 * Holds one bridge until session stop, preserving its credentials across reloads.
 * @param session - Session identity, committed target and authored bind policy.
 * @param bridge - Captured transport and metadata authority.
 * @returns Joined support lifetime; acquisition failure degrades independently.
 */
const runSupport = Effect.fn("Dev.inspectionLifetime")(function* (
  session: DevSession,
  bridge: InspectionBridgeOperations,
) {
  const options = session.options.inspector;
  const identity = session.inspectionIdentity;
  if (!options || !identity) return;
  yield* Effect.scoped(
    Effect.gen(function* () {
      const parent = yield* Scope.Scope;
      const requests = yield* Scope.fork(parent);
      const inspector = yield* bridge.start({
        ...options,
        forward: forwardDevInspection(session, requests),
        root: session.projectRoot,
        identity,
        active: () => {
          const candidate = session.active;
          if (!candidate) return undefined;
          return {
            endpoint: `http://127.0.0.1:${candidate.port}`,
            generationId: `generation-${candidate.token.generationToken}`,
            capabilities: ["graph", "functions", "providers", "records"],
          };
        },
        ...(session.options.inspectionRecords === undefined
          ? {}
          : { records: session.options.inspectionRecords }),
      });
      yield* Ref.update(session.state, (state) => ({ ...state, inspector }));
      yield* Effect.addFinalizer(() =>
        Ref.update(session.state, (state) => ({ ...state, inspector: undefined })),
      );
      session.log({
        level: "info",
        event: "dev.inspector.ready",
        fields: { bridge: inspector.descriptor.endpoint },
      });
      yield* Effect.never;
    }),
  ).pipe(
    Effect.mapError(
      (cause) =>
        new CliAdapterError({
          operation: "dev.inspector.bridge",
          message: "Inspection bridge unavailable",
          cause,
        }),
    ),
  );
});
