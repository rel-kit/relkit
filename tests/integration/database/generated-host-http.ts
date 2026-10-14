/** Executes bounded native HTTP requests and decodes the real generated database/auth host's public response contracts. */
import { Effect, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { ScaffoldProcessFailure } from "../../../scripts/scaffold-process.errors.js";
import { GeneratedRecordResponse } from "./generated-host.schemas.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";

/**
 * Sends a native request with caller interruption and the existing ten-second HTTP deadline.
 * @param baseURL - Owned loopback host address.
 * @param path - Controlled public route path.
 * @param options - Native request options, including request-specific session identity.
 * @returns The original native response; scope cancellation aborts the transport.
 */
export const generatedRequest = Effect.fn("GeneratedHost.request")(
  (baseURL: string, path: string, options: RequestInit = {}) =>
    Effect.tryPromise({
      try: (signal) =>
        fetch(baseURL + path, {
          ...options,
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(10_000),
            ...(options.signal ? [options.signal] : []),
          ]),
        }),
      catch: (cause) =>
        new ScaffoldProcessFailure({
          operation: "generated.host.http",
          message: cause instanceof Error ? cause.message : "Native request failed",
        }),
    }),
  (effect) => observeExecution("testing", "generated.host.http", effect),
);

/**
 * Exercises the native record route without substituting its middleware, engine or transactional model callbacks.
 * @param baseURL - Original owned host address.
 * @param mode - Controlled native lifecycle probe.
 * @returns Schema-validated public observations after the complete body settles.
 */
export const generatedRecords = Effect.fn("GeneratedHost.records")(function* (
  baseURL: string,
  mode: string,
) {
  const response = yield* generatedRequest(baseURL, "/records", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (response.status !== 200)
    return yield* new ScaffoldProcessFailure({
      operation: "generated.host.records",
      message: `Native records response was ${response.status}`,
    });
  return yield* generatedBody(response).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(GeneratedRecordResponse)),
  );
});

/**
 * Joins native JSON consumption through interruption before the host scope may release its process/root.
 * @param response - Original response carrying its already bounded request signal.
 * @returns Native JSON for immediate schema decoding at the caller's contract boundary.
 */
export function generatedBody(response: Response) {
  return scaffoldNative("generated.host.body", () => response.json());
}
