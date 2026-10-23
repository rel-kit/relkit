/** Verifies CLI-owned generator environment.probe behavior through retained creator services, preserving typed failures and awaited fixture cleanup. */

import { Effect } from "effect";
import {
  discoverProjectEffect,
  projectDiscoveryLive,
} from "../../src/scaffolding/project-discovery.js";
import { planAddEffect, scaffoldPlanningLive } from "../../src/scaffolding/add-plan.js";
import { applyScaffoldPlanEffect } from "../../src/scaffolding/add-transaction.js";
import { generateProjectEffect } from "create-relkit/internal/generate";
import { GeneratorPrompt } from "create-relkit/internal/generator-prompt";
import { generatorFileSystemLive } from "create-relkit/internal/generator-filesystem";
import { generatorProcessLive } from "create-relkit/internal/generator-process";
import { generatorPathsLive } from "create-relkit/internal/generator-paths";
import { generatorPromptLayer } from "create-relkit/internal/generator-prompt";
import { projectGenerationLive } from "create-relkit/internal/generate";
import type { PromptDriver } from "create-relkit/internal/prompt-driver";
import { normalizeAddRequest } from "../../src/scaffolding/add-options.js";
import { normalizeCreateOptions } from "create-relkit/internal/options";
import type { ScaffoldPlan } from "create-relkit/internal/add-types";

/**
 * Retains negative compiler checks for every independently injectable domain owner.
 * @param plan - Compile-only complete scaffold plan.
 * @returns No runtime work; missing-service checks must remain rejected by TypeScript.
 */
function serviceRequirements(plan: ScaffoldPlan): void {
  // @ts-expect-error Project discovery requires its owner.
  void Effect.runPromise(discoverProjectEffect("/project"));
  void Effect.runPromise(
    // @ts-expect-error Discovery's live Layer still requires filesystem authority.
    discoverProjectEffect("/project").pipe(Effect.provide(projectDiscoveryLive)),
  );
  // @ts-expect-error Planning requires its own service, not hidden global I/O.
  void Effect.runPromise(planAddEffect(normalizeAddRequest(["function", "Sample"])));
  void Effect.runPromise(
    // @ts-expect-error Planning acquisition requires discovery and filesystem authority.
    planAddEffect(normalizeAddRequest(["function", "Sample"])).pipe(
      Effect.provide(scaffoldPlanningLive),
    ),
  );
  // @ts-expect-error Transaction requires explicitly acquired mutation authority.
  void Effect.runPromise(applyScaffoldPlanEffect(plan));
  // @ts-expect-error Generation requires explicitly acquired creation authority.
  void Effect.runPromise(generateProjectEffect(normalizeCreateOptions(["sample"])));
  void Effect.runPromise(
    // @ts-expect-error Prompt input cannot run without a live or test Layer.
    GeneratorPrompt.use((prompt) => prompt.confirm({ message: "Continue?" })),
  );
}
void serviceRequirements;

type IsAny<Value> = 0 extends 1 & Value ? true : false;
type AssertFalse<Value extends false> = Value;
type DiscoveryEnvironment = Effect.Services<ReturnType<typeof discoverProjectEffect>>;
type DiscoveryNotAny = AssertFalse<IsAny<DiscoveryEnvironment>>;
type DiscoveryNotNever = AssertFalse<[DiscoveryEnvironment] extends [never] ? true : false>;

/**
 * Compiles a positive graph with all native and prompt authority explicitly provided.
 * @param driver - Test or live prompt adapter.
 * @returns A fully supplied operation whose environment is exactly never.
 */
function suppliedGeneration(driver: PromptDriver): Effect.Effect<unknown, unknown> {
  return generateProjectEffect(normalizeCreateOptions(["sample"])).pipe(
    Effect.provide(projectGenerationLive),
    Effect.provide(generatorFileSystemLive),
    Effect.provide(generatorProcessLive),
    Effect.provide(generatorPathsLive),
    Effect.provide(generatorPromptLayer(driver)),
  );
}
void suppliedGeneration;
export type { DiscoveryNotAny, DiscoveryNotNever };
