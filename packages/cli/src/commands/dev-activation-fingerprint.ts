import { join } from "node:path";
import { Effect, Layer } from "effect";
import {
  RUNTIME_ACTIVATION_FILE,
  isRuntimeActivationFingerprint,
  type RuntimeActivationFingerprint,
} from "@relkit/contracts";
import type { StartedCandidate } from "@relkit/supervisor";
import { cliPromise, cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import type { DevSession } from "./dev-session.js";

/**
 * Validates the complete activation identity before any traffic switch.
 * @param session - Owning session's optional identity provider.
 * @param candidate - Unpublished candidate.
 * @returns An immutable owner-validated identity.
 */
export const resolveActivationFingerprintEffect = Effect.fn("Dev.fingerprint")(
  function* (session: DevSession, candidate: StartedCandidate) {
    const value = session.options.activationFingerprint;
    const fingerprint: unknown =
      value === undefined
        ? yield* CliFileSystem.use((files) =>
            files.readText(join(candidate.directory, "server", RUNTIME_ACTIVATION_FILE)),
          ).pipe(Effect.flatMap((text) => cliTry("dev.fingerprint.parse", () => JSON.parse(text))))
        : typeof value === "function"
          ? yield* cliPromise("dev.fingerprint.callback", () =>
              Promise.resolve(value(candidate)),
            ).pipe(Effect.uninterruptible)
          : value;
    return yield* cliTry("dev.fingerprint.validate", (): RuntimeActivationFingerprint => {
      if (!isRuntimeActivationFingerprint(fingerprint))
        throw new TypeError("Development candidates require an activation fingerprint.");
      return Object.freeze({ ...fingerprint });
    });
  },
  (effect, _session: DevSession, _candidate: StartedCandidate) =>
    observeCli("dev.activation.fingerprint", effect),
);

/** Restores the validated activation identity at the public Promise boundary.
 * @param session - Session inputs.
 * @param candidate - Unpublished candidate.
 * @returns Original validated public identity.
 */
export function resolveActivationFingerprint(
  session: DevSession,
  candidate: StartedCandidate,
): Promise<RuntimeActivationFingerprint> {
  return runCliEffect(resolveActivationFingerprintEffect(session, candidate), fileSystemLayer);
}
