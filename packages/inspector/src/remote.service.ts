/** Authenticates bounded server-to-server requests without exposing app credentials to UI. */
import { Cause, Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { InspectionConnectionError, connectionAttempt } from "@relkit/inspector-api/connection";
import type { InspectorRemoteOperations } from "./remote.types.js";

/** Remote transport can be replaced by a deterministic Layer in collection tests. */
export class InspectorRemote extends Context.Service<InspectorRemote, InspectorRemoteOperations>()(
  "relkit/inspector/Remote",
  {
    make: Effect.sync(
      () => ({ request: requestRemote, json: readRemoteJson }) satisfies InspectorRemoteOperations,
    ),
  },
) {}

/** Live request capability; acquisition opens no network connections. */
export const InspectorRemoteLive = Layer.effect(InspectorRemote, InspectorRemote.make);

/** Overrides only routing while retaining the descriptor's host and authenticated identity. */
const requestRemote: InspectorRemoteOperations["request"] = (
  connection,
  path,
  options = {},
  target,
) =>
  Effect.tryPromise({
    try: (signal) => {
      const descriptor = connection.descriptor;
      const base = new URL(target ?? descriptor.endpoint);
      const url = new URL(path, base);
      if (url.origin !== base.origin)
        throw new InspectionConnectionError({
          operation: "remote.target-contained",
          cause: new Error("Inspection paths must stay within the selected target"),
        });
      const headers = new Headers(options.headers);
      const user = headers.get("authorization");
      headers.delete("x-relkit-user-authorization");
      if (user !== null) headers.set("x-relkit-user-authorization", user);
      headers.delete("origin");
      headers.delete("referer");
      headers.set("host", new URL(descriptor.endpoint).host);
      headers.set("authorization", `Bearer ${descriptor.token}`);
      headers.set("x-relkit-project-id", descriptor.projectId);
      headers.set("x-relkit-session-id", descriptor.sessionId);
      return fetch(url, {
        ...options,
        headers,
        redirect: "manual",
        signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal,
      });
    },
    catch: (cause) =>
      cause instanceof InspectionConnectionError
        ? cause
        : new InspectionConnectionError({
            operation: "remote.request",
            cause:
              cause instanceof Error ? cause : new Error("Inspection request failed", { cause }),
          }),
  }).pipe(
    (operation) => (path.startsWith("/v1/") ? operation.pipe(Effect.timeout(2000)) : operation),
    Effect.catchCause((cause) =>
      Effect.failCause(Cause.map(cause, (error) => remoteFailure("remote.timeout", error))),
    ),
    (effect) => observeExecution("inspector", "remote.request", effect, () => ({ requests: 1 })),
  );

/** Reads at most one MiB before any foreign JSON decoding; all exits release the reader. */
const readRemoteJson: InspectorRemoteOperations["json"] = (response) =>
  Effect.gen(function* () {
    if (!response.ok) {
      yield* connectionAttempt(
        "remote.rejected-close",
        () => response.body?.cancel() ?? Promise.resolve(),
      ).pipe(
        Effect.catchTag("InspectionConnectionError", () =>
          Effect.logWarning("Rejected inspection response cleanup failed"),
        ),
      );
      return yield* new InspectionConnectionError({
        operation: `remote.status-${response.status}`,
        cause: new Error("Inspection endpoint rejected the request"),
      });
    }
    const reader = response.body?.getReader();
    if (!reader) return "";
    return yield* Effect.acquireUseRelease(Effect.succeed(reader), readBoundedBody, (reader) =>
      connectionAttempt("remote.cancel", () => reader.cancel()).pipe(
        Effect.catchTag("InspectionConnectionError", () =>
          Effect.logWarning("Inspection response cleanup failed"),
        ),
        Effect.ensuring(Effect.sync(() => reader.releaseLock())),
      ),
    );
  }).pipe(
    Effect.timeout(2000),
    Effect.catchCause((cause) =>
      Effect.failCause(Cause.map(cause, (error) => remoteFailure("remote.body-timeout", error))),
    ),
    (effect) => observeExecution("inspector", "remote.json", effect, () => ({ responses: 1 })),
  );

/** Typed timeout translation preserves every other Cause reason unchanged. */
function remoteFailure(operation: string, cause: Error) {
  return cause instanceof InspectionConnectionError
    ? cause
    : new InspectionConnectionError({ operation, cause });
}

/** Native reader admission counts UTF-8 transport bytes before foreign JSON is decoded. */
const readBoundedBody = Effect.fn("Inspector.remoteBody")(function* (
  reader: Pick<ReadableStreamDefaultReader<Uint8Array>, "read">,
) {
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const next = yield* connectionAttempt("remote.body", () => reader.read());
    if (next.done) break;
    bytes += next.value.byteLength;
    if (bytes > 1_048_576)
      return yield* new InspectionConnectionError({
        operation: "remote.oversized",
        cause: new Error("Inspection response exceeds its bound"),
      });
    chunks.push(next.value);
  }
  return Buffer.concat(chunks).toString("utf8");
});
