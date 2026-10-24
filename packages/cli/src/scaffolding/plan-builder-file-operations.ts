/** Creates Ref-backed file operations without moving their state or filesystem authority. */

import { resolve } from "node:path";
import { Effect, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { ADD_FAILURE_CODES, AddScaffoldError } from "create-relkit/internal/add-types";
import type { ProjectDiscovery } from "./project-discovery-types.js";

import type { PlanBuilderState } from "./plan-builder.types.js";
import { GeneratorFileSystem } from "create-relkit/internal/generator-filesystem";
import { domainError, scaffoldErrors } from "create-relkit/internal/generator-errors";

import type { PlanBuilderFileOperations } from "./plan-builder-files.types.js";

export function plannedRead(
  state: Ref.Ref<PlanBuilderState>,
  discovery: ProjectDiscovery,
): PlanBuilderFileOperations["readEffect"] {
  return Effect.fn("PlanBuilder.read")(
    (path: string) =>
      Effect.gen(function* () {
        const planned = (yield* Ref.get(state)).files.get(path);
        if (planned !== undefined) return planned.content;
        return yield* (yield* GeneratorFileSystem).readText(resolve(discovery.projectRoot, path));
      }),
    (effect) => observeExecution("generator", "planning.read", effect),
  );
}
export function plannedCreate(
  state: Ref.Ref<PlanBuilderState>,
  discovery: ProjectDiscovery,
): PlanBuilderFileOperations["createEffect"] {
  return Effect.fn("PlanBuilder.create")(
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
  );
}
export function plannedUpdate(
  state: Ref.Ref<PlanBuilderState>,
  readEffect: PlanBuilderFileOperations["readEffect"],
): PlanBuilderFileOperations["updateEffect"] {
  return Effect.fn("PlanBuilder.update")(
    (path: string, transform: (source: string) => string) =>
      Effect.gen(function* () {
        const source = yield* readEffect(path).pipe(
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
  );
}
export function plannedAppend(
  state: Ref.Ref<PlanBuilderState>,
  discovery: ProjectDiscovery,
  createEffect: PlanBuilderFileOperations["createEffect"],
  updateEffect: PlanBuilderFileOperations["updateEffect"],
): PlanBuilderFileOperations["appendLineEffect"] {
  return Effect.fn("PlanBuilder.appendLine")(
    (path: string, line: string, present: (source: string) => boolean) =>
      Effect.gen(function* () {
        if (
          !(yield* Ref.get(state)).files.has(path) &&
          (yield* (yield* GeneratorFileSystem).metadata(resolve(discovery.projectRoot, path))) ===
            undefined
        ) {
          yield* createEffect(path, `${line}\n`);
        } else
          yield* updateEffect(path, (source) =>
            present(source) ? source : `${source.trimEnd()}\n${line}\n`,
          );
      }),
    (effect) => observeExecution("generator", "planning.appendLine", effect),
  );
}
/**
 * Constructs a typed collision failure preserving its public constructor.
 * @param message - Diagnostic explaining the conflicting declaration.
 * @returns An Effect failing with the original RELKIT_ADD_COLLISION AddScaffoldError.
 */
function collision(message: string) {
  return Effect.fail(domainError(new AddScaffoldError(ADD_FAILURE_CODES.collision, message)));
}
