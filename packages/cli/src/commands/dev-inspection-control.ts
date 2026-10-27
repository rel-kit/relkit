/**
 * Carries each accepted generation's inspector policy from compilation to promotion.
 * Compilation opens capture and selects the generation's credentials before its
 * backend starts; the session switches its bridge only after that generation is
 * promoted, then releases capture when inspection was turned off.
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
 * @returns Compile, promotion and release callbacks sharing one identity.
 */
export function makeDevInspectionControl(capture: Ref.Ref<DevCapture | undefined>) {
  const identity = { sessionId: randomUUID(), token: randomBytes(32).toString("base64url") };
  const policies = new Map<number, DevInspectorPolicy>();
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
     * Releases capture once the bridge closed; enabled policies keep it for the bridge.
     * @param policy - Policy the session bridge now follows.
     * @returns Completion after capture release when inspection was turned off.
     */
    applied: (policy: DevInspectorPolicy | undefined) =>
      policy === false
        ? Effect.suspend(() => Ref.getUnsafe(capture)?.disableEffect ?? Effect.void)
        : Effect.void,
  };
}
