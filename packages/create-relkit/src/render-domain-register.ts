import { observeExecution } from "@relkit/contracts/operation";
import type { DomainTarget, DomainArtifact } from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";
import { Effect } from "effect";
import { runGeneratorSync } from "./generator-runtime.js";

/**
 * Registers a rendered artifact through the existing synchronous planning API.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param kind - Authoritative artifact kind.
 * @param artifact - Rendered path, binding, ID and export form.
 * @returns Completion after request state records the rendered artifact.
 */
export function register(
  builder: PlanBuilder,
  target: DomainTarget,
  kind: "function" | "error" | "event" | "task" | "job" | "prompt" | "constants",
  artifact: DomainArtifact,
): void {
  runGeneratorSync(registerEffect(builder, target, kind, artifact));
}

/**
 * Registers one rendered artifact through the request's authoritative Ref.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param kind - Authoritative artifact kind.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @returns Completion after the authoritative artifact kind and projected identity enter request state.
 */
export const registerEffect = Effect.fn("Scaffold.register")(
  (
    builder: PlanBuilder,
    target: DomainTarget,
    kind: "function" | "error" | "event" | "task" | "job" | "prompt" | "constants",
    artifact: DomainArtifact,
  ) =>
    builder.registerArtifactEffect(kind, {
      domain: target.domain.fileStem,
      path: artifact.path,
      binding: artifact.binding,
      id: artifact.id,
      exportKind: artifact.exportKind,
    }),
  (effect) => observeExecution("generator", "planning.register", effect),
);
