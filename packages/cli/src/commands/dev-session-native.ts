/** Creates session SDK facades and blocks rich inspection on the public proxy. */
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
    intercept: (request) => {
      if (isPrivateInspectionPath(new URL(request.url).pathname))
        return Promise.resolve(new Response("Not found", { status: 404 }));
      return options.intercept?.(request);
    },
    ...(options.hostname === undefined ? {} : { hostname: options.hostname }),
    ...(options.stablePort === undefined ? {} : { port: options.stablePort }),
    track: (token) =>
      Ref.getUnsafe(state)
        .drains.get(`${token.sourceToken}:${token.generationToken}`)
        ?.track(token),
  });
  return { observability, stateMachine, proxy };
}

/** Keeps core readiness, identity, jobs RPC and selected public transports independent. */
function isPrivateInspectionPath(path: string): boolean {
  if (path === "/_relkit/v1/graph") return false;
  if (/^\/_relkit\/v1\/jobs(?:\/|$)/.test(path)) return false;
  if (/^\/_relkit\/v1\/agents\/[^/]+\/ag-ui$/.test(path)) return false;
  return (
    path === "/_relkit/v1" ||
    /^\/_relkit\/v1\/(?:runtime|graph|source|env|diagnostics|requests|logs|traces|stream|storage|actions|jobs|descriptors|routes|middlewares|functions|events|buckets|cache|tools|agents|channels|errors|services|providers)(?:\/|$)/.test(
      path,
    )
  );
}
