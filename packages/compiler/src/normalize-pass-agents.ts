import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";

import { schemaEffect, schemaEquivalentEffect } from "./normalize-compat.js";
import { add } from "./normalize-pass-utils.js";
import { referenceFor } from "./normalize-reference-index.js";

import { isRecord, refId, refKind } from "./normalize-utils.js";

import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";

/**
 * Checks tool input and output schemas against their target functions.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that checks tool input and output schemas against their target functions; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passToolsEffect = Effect.fn("Compiler.passTools")(
  function* (work: NormalizationWork) {
    yield* Effect.forEach(
      work.descriptors.filter((entry) => entry.kind === "tool"),
      (descriptor) =>
        Effect.gen(function* () {
          const value = descriptor.value as Record<string, any>;
          const target = referenceFor(work, value.target, "function");
          if (refKind(value.target) !== "function" || target?.kind !== "function")
            add(
              work,
              descriptor,
              NORMALIZE_CODES.toolTarget,
              "Tool target must resolve to a function.",
            );
          else if (
            isRecord(target.value) &&
            isRecord(value.target) &&
            (yield* schemaEffect(value.target.input)).ok &&
            (yield* schemaEffect(target.value.input)).ok &&
            (yield* schemaEffect(value.target.output)).ok &&
            (yield* schemaEffect(target.value.output)).ok &&
            ((value.target.input !== undefined &&
              !(yield* schemaEquivalentEffect(value.target.input, target.value.input))) ||
              (value.target.output !== undefined &&
                !(yield* schemaEquivalentEffect(value.target.output, target.value.output))))
          ) {
            add(
              work,
              descriptor,
              NORMALIZE_CODES.toolTarget,
              "Tool target schemas differ from its function.",
            );
          }
        }),
      { discard: true },
    );
  },
  (effect, work) =>
    observeCompiler("normalization", "passTools", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks tool input and output schemas against their target functions.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passTools(work: NormalizationWork): void {
  return runCompilerSync(passToolsEffect(work));
}

/**
 * Checks agent tool references and client approval controls.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that checks agent tool references and client approval controls; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passAgentsEffect = Effect.fn("Compiler.passAgents")(
  function* (work: NormalizationWork) {
    for (const descriptor of work.descriptors.filter((entry) => entry.kind === "agent")) {
      const value = descriptor.value as Record<string, any>;
      if (!Array.isArray(value.tools)) {
        add(work, descriptor, NORMALIZE_CODES.agentTool, "Agent tools must be an array.");
      }
      for (const tool of Array.isArray(value.tools) ? value.tools : []) {
        if (isNativeAgentTool(tool)) continue;
        const toolId = refId(tool);
        const resolved =
          toolId === undefined ? undefined : work.referencesByKind.get("tool")?.get(toolId);
        if (refKind(tool) !== "tool" || toolId === undefined || resolved === undefined)
          add(
            work,
            descriptor,
            NORMALIZE_CODES.agentTool,
            "Agent tool reference does not resolve to a tool.",
          );
        else if (
          value.client !== undefined &&
          isRecord(resolved.value) &&
          resolved.value.approval !== "never" &&
          (!Array.isArray(value.controls) || !value.controls.includes("approve"))
        )
          add(
            work,
            descriptor,
            NORMALIZE_CODES.agentControl,
            'Client-exposed agents with approval-requiring tools must declare the "approve" control.',
          );
      }
    }
  },
  (effect, work) =>
    observeCompiler("normalization", "passAgents", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks agent tool references and client approval controls.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passAgents(work: NormalizationWork): void {
  return runCompilerSync(passAgentsEffect(work));
}

/**
 * Recognizes native agent tools that do not require descriptor references.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when the value is an accepted native agent tool declaration.
 */
export function isNativeAgentTool(value: unknown): boolean {
  return (
    isRecord(value) &&
    ((typeof value.name === "string" && value.schema !== undefined) ||
      typeof value.type === "string")
  );
}
