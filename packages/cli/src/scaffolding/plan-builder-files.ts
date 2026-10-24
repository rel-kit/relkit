/** Builds the file operations recorded by the request-local plan builder, preserving create versus update collision rules. */

import { Effect, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";

import type { ProjectDiscovery } from "./project-discovery-types.js";

import type { PlanBuilderState } from "./plan-builder.types.js";

import type { PlanBuilderFileOperations } from "./plan-builder-files.types.js";

import {
  plannedRead,
  plannedCreate,
  plannedUpdate,
  plannedAppend,
} from "./plan-builder-file-operations.js";

/** Creates private Ref-backed planning operations for one discovered project. */
export function planBuilderFiles(
  state: Ref.Ref<PlanBuilderState>,
  discovery: ProjectDiscovery,
): PlanBuilderFileOperations {
  const readEffect = plannedRead(state, discovery);
  const createEffect = plannedCreate(state, discovery);
  const updateEffect = plannedUpdate(state, readEffect);
  const appendLineEffect = plannedAppend(state, discovery, createEffect, updateEffect);
  const operations: PlanBuilderFileOperations = {
    readEffect,
    createEffect,
    updateEffect,
    appendLineEffect,
    envExampleEffect: Effect.fn("PlanBuilder.envExample")(
      (name: string, value = "") =>
        operations.appendLineEffect(".env.example", `${name}=${value}`, (source) =>
          new RegExp(`^${escape(name)}=`, "m").test(source),
        ),
      (effect) => observeExecution("generator", "planning.envExample", effect),
    ),
    gitignoreEffect: Effect.fn("PlanBuilder.gitignore")(
      (pattern: string) =>
        operations.appendLineEffect(".gitignore", pattern, (source) =>
          source.split(/\r?\n/).includes(pattern),
        ),
      (effect) => observeExecution("generator", "planning.gitignore", effect),
    ),
  };
  return operations;
}
/**
 * Escapes a generated environment name for a pure declaration-presence check.
 * @param value - Environment name embedded in a declaration-presence expression.
 * @returns The value with regular-expression metacharacters escaped.
 */
function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
