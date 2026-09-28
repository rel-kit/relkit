import { normalizeId } from "@relkit/contracts";
import { getDescriptorIdentityEffect, resolveDescriptorIdentityEffect } from "@relkit/invocation";
import { Effect } from "effect";
import { isToolDescriptorEffect } from "./define-tool.js";
import { runToolSync, ToolOperationFailure, toolAttempt, toolTry } from "./tool-observability.js";
import type { ToolDescriptor, ToolRefAny } from "./define-tool.types.js";
import type { ResolvedToolTarget, ToolAllowlistEntry, ToolSource } from "./runtime.types.js";

/** Resolves a tool's function ID and inherited schemas through Effect.
 * @param tool - Registered tool descriptor.
 * @returns Frozen target or tagged input failure.
 * @example Effect.runSync(resolveToolTargetEffect(tool));
 */
export const resolveToolTargetEffect = Effect.fn("tools.resolve-target")(
  (tool: ToolDescriptor<string>) =>
    Effect.gen(function* () {
      if (!(yield* isToolDescriptorEffect(tool))) {
        return yield* toolTry("resolve-target", () => {
          throw new TypeError("Invalid tool descriptor");
        });
      }
      const identity = yield* resolveDescriptorIdentityEffect(tool.target).pipe(
        Effect.mapError(
          (failure) =>
            new ToolOperationFailure({
              operation: "resolve-target",
              reason: failure.message,
              cause: failure.cause,
            }),
        ),
      );
      return yield* toolTry(
        "resolve-target",
        () =>
          Object.freeze({
            functionId: identity.canonical ? identity.id : tool.target.ref.id,
            input: tool.target.input,
            output: tool.target.output,
            ...(tool.target.errors === undefined ? {} : { errors: tool.target.errors }),
          }) satisfies ResolvedToolTarget,
      );
    }),
);

/** Resolves a tool's function ID and inherited schemas.
 * @param tool - Registered tool descriptor.
 * @returns Frozen function target.
 * @throws TypeError when the descriptor is invalid.
 * @example resolveToolTarget(tool);
 */
export function resolveToolTarget(tool: ToolDescriptor<string>): ResolvedToolTarget {
  return runToolSync(resolveToolTargetEffect(tool));
}

/** Finds a canonical descriptor in any supported collection.
 * @param source - Array, map, or record of registered tools.
 * @param id - Canonical tool ID.
 * @returns Matching descriptor, undefined, or tagged identity failure.
 * @example Effect.runSync(findToolEffect([tool], tool.id));
 */
export const findToolEffect = Effect.fn("tools.find")((source: ToolSource, id: string) =>
  Effect.gen(function* () {
    if (Array.isArray(source)) {
      for (const tool of source) if ((yield* getToolIdentityEffect(tool)) === id) return tool;
      return undefined;
    }
    if (source instanceof Map) {
      const direct = source.get(id);
      if (direct != null) return direct;
      for (const tool of source.values())
        if ((yield* getToolIdentityEffect(tool)) === id) return tool;
      return undefined;
    }
    const record = source as Readonly<Record<string, ToolDescriptor<string>>>;
    const direct = yield* toolAttempt("invoke", () => record[id]);
    if (direct != null) return direct;
    const values = yield* toolAttempt("invoke", () => Object.values(record));
    for (const tool of values) if ((yield* getToolIdentityEffect(tool)) === id) return tool;
    return undefined;
  }),
);

/** Checks a tool's canonical ID against an allowlist.
 * @param id - Canonical tool ID.
 * @param allowlist - Allowed IDs and references.
 * @returns Whether the ID is allowed, or a tagged identity failure.
 * @example Effect.runSync(isToolAllowedEffect(tool.id, [tool.id]));
 */
export const isToolAllowedEffect = Effect.fn("tools.is-allowed")(
  (id: string, allowlist: readonly ToolAllowlistEntry[]) =>
    Effect.gen(function* () {
      for (const entry of allowlist) {
        if (typeof entry === "string") {
          if ((yield* toolAttempt("invoke", () => normalizeId(entry))) === id) return true;
          continue;
        }
        const hasId = yield* toolAttempt("invoke", () => "id" in entry);
        const entryId = hasId
          ? yield* getToolIdentityEffect(entry as ToolRefAny)
          : yield* toolAttempt("invoke", () => (entry as ToolRefAny).ref.id);
        if (entryId !== id) continue;
        return true;
      }
      return false;
    }),
);

function getToolIdentityEffect(descriptor: ToolDescriptor<string> | ToolRefAny) {
  return getDescriptorIdentityEffect(descriptor).pipe(
    Effect.mapError(
      (failure) =>
        new ToolOperationFailure({
          operation: "invoke",
          reason: failure.message,
          cause: failure.cause,
        }),
    ),
  );
}
