import { Ref } from "effect";
import {
  createSupervisorObservability,
  createSupervisorProxy,
  createSupervisorStateMachine,
} from "@relkit/supervisor";
import type { DevSessionState } from "./dev-session.types.js";
import type { DevOptions, DevLog } from "./dev.types.js";

/**
 * Creates the retained synchronous SDK facades without starting processes or listeners.
 * @param options - Captured public session policy.
 * @param state - Session-owned committed generation and drain state.
 * @param log - Existing safe synchronous logging edge.
 * @returns Native state witnesses whose resource operations are acquired by the session engine.
 */
export function createDevNativeSession(
  options: DevOptions,
  state: Ref.Ref<DevSessionState>,
  log: DevLog,
) {
  const observability = createSupervisorObservability({
    ...(options.observability ?? {}),
    activationFingerprint: (token) =>
      Ref.getUnsafe(state).fingerprints.get(token.generationToken) ??
      Ref.getUnsafe(state).fingerprint,
  });
  const stateMachine = createSupervisorStateMachine({
    onTelemetry: (event) => {
      observability.emit(event);
      log({
        level: event.type === "outcome" && event.outcome.endsWith("failed") ? "error" : "info",
        event: `supervisor.${event.type}`,
        fields: {
          phase: event.type === "outcome" ? event.phase : event.from,
          state: event.type === "transition" ? event.to : event.outcome,
          sourceToken: event.sourceToken,
          generationToken: event.generationToken,
        },
      });
    },
  });
  const proxy = createSupervisorProxy({
    ...(options.intercept === undefined ? {} : { intercept: options.intercept }),
    ...(options.hostname === undefined ? {} : { hostname: options.hostname }),
    ...(options.stablePort === undefined ? {} : { port: options.stablePort }),
    track: (token) =>
      Ref.getUnsafe(state)
        .drains.get(`${token.sourceToken}:${token.generationToken}`)
        ?.track(token),
  });
  return { observability, stateMachine, proxy };
}
