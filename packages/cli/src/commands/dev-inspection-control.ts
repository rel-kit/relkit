/**
 * Carries each accepted generation's inspector policy from compilation to promotion.
 * Compilation opens capture and selects the generation's credentials before its
 * backend starts; the session switches its bridge only after that generation is
 * promoted. Capture is released whenever the serving policy is off and no pending
 * generation still needs it, including after a rejected enabled generation.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { Effect, Ref } from "effect";
import type { InspectorConfiguration } from "@relkit/contracts";
import type { CandidateCompileRequest } from "@relkit/supervisor";
import { DISABLED_CAPTURE_ENVIRONMENT } from "./dev-capture.service.js";
import type { DevCapture } from "./dev-capture.types.js";
import type { DevInspectorPolicy } from "./dev-inspector-support.types.js";

/**
 * Creates the session's stable bridge identity and per-generation policy ledger.
 * @param capture - Command capture, attached after compiler acquisition.
 * @param initial - Bridge policy the session starts serving.
 * @returns Compile, promotion and release callbacks sharing one identity.
 */
export function makeDevInspectionControl(
  capture: Ref.Ref<DevCapture | undefined>,
  initial: DevInspectorPolicy,
) {
  const identity = { sessionId: randomUUID(), token: randomBytes(32).toString("base64url") };
  const policies = new Map<number, DevInspectorPolicy>();
  let serving = initial;
  // Releases capture unless the serving bridge or a pending generation still needs it.
  const release = Effect.suspend(() =>
    serving !== false || [...policies.values()].some((policy) => policy !== false)
      ? Effect.void
      : (Ref.getUnsafe(capture)?.disableEffect ?? Effect.void),
  );
  return {
    identity,
    /**
     * Records a generation's policy and selects its backend inspection environment.
     * @param configuration - Defaulted inspector settings from the accepted check.
     * @param request - Generation identity used when it is promoted.
     * @returns Credentials for enabled inspection, or explicit removals otherwise.
     */
    prepare: (configuration: InspectorConfiguration, request: CandidateCompileRequest) =>
      Effect.gen(function* () {
        const policy = configuration.enabled ? configuration.connection : false;
        policies.set(request.token.generationToken, policy);
        if (policy === false)
          return { ...DISABLED_CAPTURE_ENVIRONMENT, RELKIT_INSPECTOR_SESSION_TOKEN: undefined };
        const owned = yield* Ref.get(capture);
        const producer = owned === undefined ? {} : yield* owned.enableEffect;
        return { ...producer, RELKIT_INSPECTOR_SESSION_TOKEN: identity.token };
      }),
    /**
     * Takes a promoted generation's policy and forgets it and every older generation.
     * @param generationToken - Promoted generation.
     * @returns Its recorded policy, or undefined when compilation recorded none.
     */
    policyFor: (generationToken: number): DevInspectorPolicy | undefined => {
      const policy = policies.get(generationToken);
      for (const key of policies.keys()) if (key <= generationToken) policies.delete(key);
      return policy;
    },
    /**
     * Records the policy a promoted generation serves and releases capture when it is off.
     * @param policy - Policy the session bridge now follows.
     * @returns Completion after any capture release.
     */
    applied: (policy: DevInspectorPolicy) =>
      Effect.suspend(() => {
        serving = policy;
        return release;
      }),
    /**
     * Forgets a generation that was not promoted and rolls back capture it opened.
     * @param generationToken - Rejected or superseded generation.
     * @returns Completion after any capture release.
     */
    rejected: (generationToken: number) =>
      Effect.suspend(() => {
        policies.delete(generationToken);
        return release;
      }),
  };
}
