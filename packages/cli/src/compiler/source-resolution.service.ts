/**
 * Owns one compilation's effective TypeScript options and native resolution host.
 * Shared configuration is acquired once; literal lookups stay lazy, observable and
 * require no request Context. Tests can substitute this same contract with a Layer.
 */
import { Context, Effect, Layer, Option } from "effect";
import * as ts from "typescript";
import { TypecheckInputs } from "./typecheck-inputs.service.js";
import { sourceResolutionHost, resolveSourceDependency } from "./source-resolution-native.js";
import { sourceResolutionOptionsEffect } from "./source-resolution-options.js";
import { observeCompiler } from "./observability.js";
import type {
  SourceResolutionInput,
  SourceResolutionOperations,
} from "./source-resolution.types.js";

/** Shared declaration-only resolver; construction failures differ from lookup outcomes. */
export class SourceResolution extends Context.Service<
  SourceResolution,
  SourceResolutionOperations
>()("@relkit/compiler/SourceResolution", {
  make: Effect.fn("Compiler.SourceResolution.make")(function* (input: SourceResolutionInput) {
    const journal = yield* Effect.serviceOption(TypecheckInputs);
    const system = Option.isSome(journal) ? journal.value.system : ts.sys;
    const options = yield* sourceResolutionOptionsEffect(input.root, system);
    const host = sourceResolutionHost(input, system);
    /**
     * Resolves a literal through the acquired host without loading its module.
     * @param file - Contained importer source.
     * @param specifier - Static module target.
     * @returns Lazy source/external/unresolved evidence; defects stay visible.
     */
    const resolve = Effect.fn("Compiler.resolveSourceDependency")(
      (file: string, specifier: string) =>
        Effect.sync(() => resolveSourceDependency(input, host, options, file, specifier)),
      (effect) =>
        observeCompiler("discovery", "resolveSourceDependency", effect, () => ({ entries: 1 })),
    );
    return { resolve } satisfies SourceResolutionOperations;
  }),
}) {}

/**
 * Supplies a resolver whose captured sources/options belong to one compilation.
 * @param input - Canonical application root and source text inventory.
 * @returns A live Layer with typed acquisition failure and no owned persistent state.
 */
export function sourceResolutionLayer(input: SourceResolutionInput) {
  return Layer.effect(SourceResolution, SourceResolution.make(input));
}
