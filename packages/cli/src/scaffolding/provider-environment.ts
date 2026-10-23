/** Plans environment schema and example declarations without activating native providers. */

import { Effect } from "effect";

import { observeExecution } from "@relkit/contracts/operation";

import { GeneratorFileSystem } from "create-relkit/internal/generator-filesystem";

import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
} from "create-relkit/internal/generator-errors";

import { PlanBuilder } from "./plan-builder.js";

import { addFactoryObjectMember } from "./source-edit.js";

/**
 * Plans ensure environment through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param name - Authored name or declaration key.
 * @param definition - Rendered environment schema expression.
 * @param example - Example value included only when adding a declaration.
 * @returns Completion after the environment schema and missing example value are planned.
 */
export const ensureEnvironmentEffect = Effect.fn("Scaffold.ensureEnvironment")(
  function* (
    builder: PlanBuilder,
    name: string,
    definition: string,
    example = "",
  ): Effect.fn.Return<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem> {
    const path = builder.discovery.envPath
      ? builder.relative(builder.discovery.envPath)
      : "relkit.config.ts";
    yield* builder.updateEffect(path, (source) =>
      addFactoryObjectMember(source, path, ["defineEnv"], [], name, `${name}: ${definition}`),
    );
    yield* builder.envExampleEffect(name, example);
  },
  (effect) => observeExecution("generator", "planning.ensureEnvironment", scaffoldErrors(effect)),
);
