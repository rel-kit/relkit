import { observeExecution } from "@relkit/contracts/operation";
import { Effect } from "effect";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import { domainError, domainTry } from "./generator-errors.js";
import { mergeScaffoldManifest, scaffoldManifestDependencies } from "./plan-manifest.js";
import { planDependencyPatchEffect, readDrizzlePatchEffect } from "./dependency-patches.js";
import { resolveProjectDependenciesEffect } from "./project-catalog.js";
import type { PlanBuilderEffects } from "./plan-builder-effects.js";
import type { PlanBuilderState } from "./plan-builder.types.js";

/**
 * Finishes dependencies, scripts and portable patches before transaction mutation begins.
 * @param builder - Request owner whose state remains authoritative in its Ref.
 * @param state - Read-only snapshot passed by the private request-state owner.
 * @returns Newly introduced concrete dependencies; patch-only repair remains file operations.
 */
export const finalizeManifestEffect = Effect.fn("PlanBuilder.finalizeManifest")(
  function* (builder: PlanBuilderEffects, state: PlanBuilderState) {
    const source = yield* builder.readEffect("package.json");
    const declared = yield* domainTry(() => scaffoldManifestDependencies(source));
    const requested = Object.fromEntries(
      [...state.dependencies].flatMap((name) =>
        declared[name] === undefined ? [] : [[name, declared[name]]],
      ),
    );
    const resolved = yield* resolveProjectDependenciesEffect(
      builder.discovery.projectRoot,
      requested,
    );
    const result = yield* domainTry(() =>
      state.dependencies.size === 0 && state.scripts.size === 0
        ? { content: source, added: {} }
        : mergeScaffoldManifest(source, state.dependencies, state.scripts, resolved),
    );
    let content = result.content;
    const dependencies = new Set<string>([...state.dependencies, ...Object.keys(declared)]);
    if (
      ["drizzle-orm", "@relkit/drizzle", "@relkit/testing", "@relkit/effect-mq"].some((name) =>
        dependencies.has(name),
      )
    ) {
      const patch = yield* readDrizzlePatchEffect();
      const planned = state.files.get(patch.path);
      if (planned !== undefined && planned.content !== patch.content)
        return yield* Effect.fail(
          domainError(
            new AddScaffoldError(
              ADD_FAILURE_CODES.collision,
              `${patch.path} already contains a different planned dependency patch.`,
            ),
          ),
        );
      const patched = yield* planDependencyPatchEffect(
        builder.discovery.projectRoot,
        content,
        patch,
      );
      content = patched.content;
      if (patched.operation !== undefined && planned === undefined)
        yield* builder.createEffect(patched.operation.path, patched.operation.content);
    }
    yield* builder.updateEffect("package.json", () => content);
    return result.added;
  },
  (effect) => observeExecution("generator", "planning.finalizeManifest", effect),
);
