import { canonicalJson } from "@relkit/contracts";
import { Context, Effect, Layer, Option, Result } from "effect";
import { SubmissionSupportFailure } from "./submission-support-run.js";
import { observeJobs } from "./jobs-observability.js";
/** Substitutable SHA-256 digest provider for canonical submission input.
 * @example const service = yield* SubmissionDigest;
 */
export class SubmissionDigest extends Context.Service<
  SubmissionDigest,
  {
    readonly digest: (bytes: Uint8Array) => Promise<ArrayBuffer>;
  }
>()("relkit/jobs/SubmissionDigest") {}
/** Provides a deterministic SHA-256 digest implementation.
 * @param digest - Digest function for canonical UTF-8 bytes.
 * @returns A Layer for hashWireEffect.
 * @example submissionDigestLayer(async () => new ArrayBuffer(32));
 */
export const submissionDigestLayer = (digest: (bytes: Uint8Array) => Promise<ArrayBuffer>) =>
  Layer.succeed(SubmissionDigest, { digest });
/** Hashes a canonical wire envelope in Effect.
 * @param value - Canonical JSON value or envelope.
 * @returns SHA-256 hex identity or SubmissionSupportFailure.
 * @example Effect.runPromise(hashWireEffect({ version: 1, kind: "void" }));
 */
export const hashWireEffect = Effect.fn("Jobs.hashSubmissionWire")((value: unknown) =>
  observeJobs(
    "submissionSupport.hashWire",
    Effect.gen(function* () {
      const service = yield* Effect.serviceOption(SubmissionDigest);
      return yield* Effect.tryPromise({
        try: async () => {
          const bytes = new TextEncoder().encode(canonicalJson(value));
          const digest = Option.isSome(service)
            ? await service.value.digest(bytes)
            : await globalThis.crypto.subtle.digest("SHA-256", bytes);
          return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("")}`;
        },
        catch: (cause) => new SubmissionSupportFailure({ cause }),
      });
    }),
  ),
);
/** Promise compatibility canonical wire hasher.
 * @param value - Canonical JSON value or envelope.
 * @returns SHA-256 hex identity.
 * @throws Original canonical JSON or digest error.
 * @example await hashWire({ version: 1, kind: "void" });
 */
export async function hashWire(value: unknown): Promise<string> {
  const result = await Effect.runPromise(Effect.result(hashWireEffect(value)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
