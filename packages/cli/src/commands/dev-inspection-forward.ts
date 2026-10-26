/** Reuses supervisor request/body ownership so inspection participates in native generation draining. */
import { Cause, Effect } from "effect";
import type { Scope } from "effect";
import { proxyRequest } from "@relkit/supervisor/internal/request";
import { InspectionConnectionError } from "@relkit/inspector-api/connection";
import type { InspectionBridgeAuthority } from "@relkit/inspector-api/connection";
import type { DevSession } from "./dev-session.js";

/** Captures the committed candidate and lease before any forwarding await; mutations never retry. */
export function forwardDevInspection(
  session: DevSession,
  scope: Scope.Closeable,
): InspectionBridgeAuthority["forward"] {
  return (target, request) =>
    Effect.suspend(() => {
      const candidate = session.active;
      if (!candidate || target.generationId !== `generation-${candidate.token.generationToken}`)
        return Effect.succeed(
          Response.json({ protocol: 1, error: "generation.stale" }, { status: 409 }),
        );
      const { token } = candidate;
      const lease = session.drains
        .get(`${token.sourceToken}:${token.generationToken}`)
        ?.track(token);
      if (!lease)
        return Effect.succeed(
          Response.json({ protocol: 1, error: "generation.draining" }, { status: 409 }),
        );
      return proxyRequest(
        request,
        {
          target: {
            token,
            port: candidate.port,
            hostname: session.options.candidateHostname ?? "127.0.0.1",
          },
          lease,
          scope,
        },
        fetch,
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.failCause(
            Cause.map(
              cause,
              (error) =>
                new InspectionConnectionError({
                  operation: "generation.forward",
                  cause:
                    error instanceof Error
                      ? error
                      : new Error("Inspection forwarding failed", { cause: error }),
                }),
            ),
          ),
        ),
      );
    });
}
