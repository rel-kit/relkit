/**
 * Plans development inspection for an existing application: the authored
 * `inspector.enabled` bridge flag in relkit.config.ts, the project-local
 * `@relkit/inspector` devDependency, and an `inspector` package script that runs
 * `relkit inspector`. Planning only edits source text through the PlanBuilder;
 * installation and file publication belong to the add transaction, and no
 * bridge, UI listener or history store is started here.
 */

import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runGeneratorPromise } from "create-relkit/internal/generator-runtime";
import { scaffoldErrors } from "create-relkit/internal/generator-errors";
import type { AddRequest } from "create-relkit/internal/add-types";
import { PlanBuilder } from "./plan-builder.js";
import { addFactoryObjectMember } from "./source-edit.js";

/** Package script that launches the project-local inspector UI. */
export const INSPECTOR_SCRIPT = "relkit inspector";

/**
 * Plans the bridge flag, local UI dependency and launch script.
 * @param builder - Per-request planning owner holding discovery facts and planned edits.
 * @param _request - Normalized inspector request; it has no kind-specific options.
 * @returns Lazy completion after the edits are recorded. An authored
 * `inspector.enabled` value other than `true` fails as a typed scaffold collision,
 * so an explicit opt-out is never overwritten.
 */
export const renderInspectorEffect = Effect.fn("Scaffold.renderInspector")(
  function* (builder: PlanBuilder, _request: Extract<AddRequest, { kind: "inspector" }>) {
    yield* builder.updateEffect("relkit.config.ts", (source) =>
      addFactoryObjectMember(
        source,
        "relkit.config.ts",
        [builder.discovery.appFactory],
        ["inspector"],
        "enabled",
        "enabled: true",
      ),
    );
    yield* builder.dependencyEffect("@relkit/inspector");
    yield* builder.scriptEffect("inspector", INSPECTOR_SCRIPT);
    yield* builder.nextStepEffect("bun run dev");
    yield* builder.nextStepEffect("bun run inspector");
  },
  (effect) => observeExecution("generator", "planning.renderInspector", scaffoldErrors(effect)),
);

/**
 * Preserves the Promise compatibility shape used by the other platform renderers.
 * @param builder - Per-request planning owner.
 * @param request - Normalized inspector request.
 * @returns Completion after the inspector edits are planned.
 */
export function renderInspector(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "inspector" }>,
): Promise<void> {
  return runGeneratorPromise(renderInspectorEffect(builder, request));
}
