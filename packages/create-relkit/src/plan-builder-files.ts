import { resolve } from "node:path";
import { Effect, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import type { ProjectDiscovery } from "./project-discovery-types.js";

import type { PlanBuilderState } from "./plan-builder.types.js";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { domainError, scaffoldErrors } from "./generator-errors.js";

import type { PlanBuilderFileOperations } from "./plan-builder-files.types.js";

/**
 * Creates private file-planning capabilities for one request Ref.
 * @param state - The request owner's private authoritative Ref.
 * @param discovery - Immutable declaration facts establishing the project root.
 * @returns File Effects retaining explicit filesystem authority and atomic Ref updates.
 */
export function planBuilderFiles(state: Ref.Ref<PlanBuilderState>, discovery: ProjectDiscovery) {
  const operations: PlanBuilderFileOperations = {
    /** Reads the planned source first, then the explicit filesystem service. */
    readEffect: Effect.fn("PlanBuilder.read")(
      (path: string) =>
        Effect.gen(function* () {
          const planned = (yield* Ref.get(state)).files.get(path);
          if (planned !== undefined) return planned.content;
          return yield* (yield* GeneratorFileSystem).readText(resolve(discovery.projectRoot, path));
        }),
      (effect) => observeExecution("generator", "planning.read", effect),
    ),

    /** Atomically reserves one create operation after checking the native destination. */
    createEffect: Effect.fn("PlanBuilder.create")(
      (path: string, content: string, mode?: number) =>
        Effect.gen(function* () {
          const fs = yield* GeneratorFileSystem;
          if ((yield* fs.metadata(resolve(discovery.projectRoot, path))) !== undefined)
            return yield* collision(`${path} already exists.`);
          const duplicate = yield* Ref.modify(state, (state) =>
            state.files.has(path)
              ? ([true, state] as const)
              : ([
                  false,
                  {
                    ...state,
                    files: new Map(state.files).set(path, {
                      path,
                      action: "create",
                      content,
                      ...(mode === undefined ? {} : { mode }),
                    }),
                  },
                ] as const),
          );
          if (duplicate) return yield* collision(`${path} already exists.`);
        }),
      (effect) => observeExecution("generator", "planning.create", effect),
    ),

    /** Adds a source transformation to this request; transformations preserve expected validator errors. */
    updateEffect: Effect.fn("PlanBuilder.update")(
      (path: string, transform: (source: string) => string) =>
        Effect.gen(function* () {
          const source = yield* operations
            .readEffect(path)
            .pipe(
              Effect.mapError(() =>
                domainError(
                  new AddScaffoldError(ADD_FAILURE_CODES.invalidProject, `${path} does not exist.`),
                ),
              ),
            );
          yield* Ref.update(state, (state) => {
            const existing = state.files.get(path);
            const current = existing?.content ?? source;
            const content = transform(current);
            return content === current
              ? state
              : {
                  ...state,
                  files: new Map(state.files).set(path, {
                    path,
                    action: existing?.action ?? "update",
                    content,
                    ...(existing?.mode === undefined ? {} : { mode: existing.mode }),
                  }),
                };
          }).pipe(scaffoldErrors);
        }),
      (effect) => observeExecution("generator", "planning.update", effect),
    ),

    /** Plans an environment example without replacing an existing declaration. */
    envExampleEffect: Effect.fn("PlanBuilder.envExample")(
      (name: string, value = "") =>
        operations.appendLineEffect(".env.example", `${name}=${value}`, (source) =>
          new RegExp(`^${escape(name)}=`, "m").test(source),
        ),
      (effect) => observeExecution("generator", "planning.envExample", effect),
    ),

    /** Plans a gitignore entry without duplicating an authored line. */
    gitignoreEffect: Effect.fn("PlanBuilder.gitignore")(
      (pattern: string) =>
        operations.appendLineEffect(".gitignore", pattern, (source) =>
          source.split(/\r?\n/).includes(pattern),
        ),
      (effect) => observeExecution("generator", "planning.gitignore", effect),
    ),

    /** Adds an owned line only when absent from planned and native source. */
    appendLineEffect: Effect.fn("PlanBuilder.appendLine")(
      (path: string, line: string, present: (source: string) => boolean) =>
        Effect.gen(function* () {
          if (
            !(yield* Ref.get(state)).files.has(path) &&
            (yield* (yield* GeneratorFileSystem).metadata(resolve(discovery.projectRoot, path))) ===
              undefined
          ) {
            yield* operations.createEffect(path, `${line}\n`);
          } else
            yield* operations.updateEffect(path, (source) =>
              present(source) ? source : `${source.trimEnd()}\n${line}\n`,
            );
        }),
      (effect) => observeExecution("generator", "planning.appendLine", effect),
    ),
  };
  return operations;
}
/**
 * Constructs a typed collision failure preserving its public constructor.
 * @param message - Diagnostic explaining the conflicting declaration.
 * @returns An Effect failing with the original RELKIT_ADD_COLLISION AddScaffoldError.
 */
function collision(message: string) {
  return Effect.fail(domainError(new AddScaffoldError(ADD_FAILURE_CODES.collision, message)));
}

/**
 * Escapes a generated environment name for a pure declaration-presence check.
 * @param value - Environment name embedded in a declaration-presence expression.
 * @returns The value with regular-expression metacharacters escaped.
 */
function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
