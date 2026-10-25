/** Authenticates session discovery without executing project code or deleting stale metadata. */
import { Context, Effect, Layer, Schema } from "effect";
import {
  InspectionFiles,
  InspectionFilesLive,
  InspectionHandshakeSchema,
  InspectionConnectionError,
} from "@relkit/inspector-api/connection";
import { InspectorRemote, InspectorRemoteLive } from "./remote.service.js";
import type {
  InspectionFilesOperations,
  InspectionConnectionFile,
} from "@relkit/inspector-api/connection";
import type { InspectorRemoteOperations } from "./remote.types.js";
import type { InspectorDiscoveryOperations, InspectorSelection } from "./discovery.types.js";
import type { InspectorOptions } from "./options.types.js";

/** Captures metadata and transport authority before creating any per-tool session state. */
export class InspectorDiscovery extends Context.Service<
  InspectorDiscovery,
  InspectorDiscoveryOperations
>()("relkit/inspector/Discovery", {
  make: Effect.gen(function* () {
    const files = yield* InspectionFiles;
    const remote = yield* InspectorRemote;
    return {
      select: (options) => selectSession(files, remote, options),
    } satisfies InspectorDiscoveryOperations;
  }),
}) {}

/** Native discovery performs no config import, writes, installation or PID liveness probes. */
export const InspectorDiscoveryLive = Layer.effect(
  InspectorDiscovery,
  InspectorDiscovery.make,
).pipe(Layer.provide(Layer.merge(InspectionFilesLive, InspectorRemoteLive)));

/** Probes a bounded candidate list and requires explicit selection for multiple live sessions. */
const selectSession = Effect.fn("Inspector.discover")(function* (
  files: InspectionFilesOperations,
  remote: InspectorRemoteOperations,
  options: InspectorOptions,
): Effect.fn.Return<InspectorSelection, InspectionConnectionError> {
  const root = options.projectRoot ?? process.cwd();
  const expected =
    options.projectRoot !== undefined || options.connectionFile === undefined
      ? yield* files.projectId(root)
      : undefined;
  const listing =
    options.connectionFile === undefined
      ? yield* files.list(root)
      : { files: [yield* files.read(options.connectionFile)], rejected: 0 };
  const candidates = listing.files;
  const credential =
    options.credentialFile === undefined ? undefined : yield* files.read(options.credentialFile);
  const live = yield* Effect.forEach(
    candidates,
    (candidate) =>
      verifySession(remote, candidate, expected, credential, options.target).pipe(
        Effect.catchTag("InspectionConnectionError", () => Effect.succeed(undefined)),
      ),
    { concurrency: 4 },
  );
  const accepted = live.filter((value) => value !== undefined);
  const rejected = listing.rejected + candidates.length - accepted.length;
  if (accepted.length === 0) return { state: "disconnected", rejected };
  if (accepted.length > 1)
    return {
      state: "ambiguous",
      sessions: accepted.map((value) => value.connection.descriptor.sessionId),
      rejected,
    };
  return { ...accepted[0]!, rejected };
});

/** The response must prove protocol, project and session; process identity is informational. */
const verifySession = Effect.fn("Inspector.verifySession")(function* (
  remote: InspectorRemoteOperations,
  candidate: InspectionConnectionFile,
  expected: string | undefined,
  credential: InspectionConnectionFile | undefined,
  target: string | undefined,
) {
  const descriptor = candidate.descriptor;
  if (expected !== undefined && descriptor.projectId !== expected) return undefined;
  if (
    credential &&
    (credential.descriptor.sessionId !== descriptor.sessionId ||
      credential.descriptor.projectId !== descriptor.projectId)
  )
    return undefined;
  const connection = credential
    ? { ...candidate, descriptor: { ...descriptor, token: credential.descriptor.token } }
    : candidate;
  const response = yield* remote.request(connection, "/_relkit/bridge/v1/handshake", {}, target);
  const handshake = yield* remote.json(response).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(InspectionHandshakeSchema))),
    Effect.mapError((cause) =>
      cause instanceof InspectionConnectionError
        ? cause
        : new InspectionConnectionError({ operation: "discovery.handshake", cause }),
    ),
  );
  if (handshake.projectId !== descriptor.projectId || handshake.sessionId !== descriptor.sessionId)
    return undefined;
  return { state: "connected" as const, connection, handshake };
});
