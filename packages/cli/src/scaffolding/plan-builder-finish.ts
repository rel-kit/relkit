/** Freezes the final scaffold plan after manifest ownership is settled. */

import { Effect, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";

import type { PlanBuilderState } from "./plan-builder.types.js";
import { finalizeManifestEffect } from "./plan-builder-manifest.js";

import type { PlanBuilderEffects } from "./plan-builder-effects.js";
export function finishPlannedRequest(
  builder: PlanBuilderEffects,
  stateRef: Ref.Ref<PlanBuilderState>,
) {
  return observeExecution(
    "generator",
    "planning.finish",
    Effect.gen(function* () {
      const dependencies = yield* finalizeManifestEffect(builder, yield* Ref.get(stateRef));
      const state = yield* Ref.get(stateRef);
      return Object.freeze({
        request: builder.request,
        projectRoot: builder.discovery.projectRoot,
        operations: Object.freeze(
          [...state.files.values()].sort((a, b) => a.path.localeCompare(b.path)),
        ),
        dependencies: Object.freeze(dependencies),
        artifacts: Object.freeze(
          state.artifacts.map(({ kind, path, id, binding }) => ({
            kind,
            path,
            id: id ?? binding,
            binding,
          })),
        ),
        profiles: Object.freeze(
          state.profiles.map(({ capability, name }) => ({ capability, name })),
        ),
        warnings: Object.freeze([...state.warnings.values()]),
        nextSteps: Object.freeze([...state.nextSteps]),
      });
    }),
  );
}
