import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { normalizeAddRequest } from "./add-options.js";
import { usage } from "./add-options-parser.js";
import { resolveDomainOptionsEffect } from "./add-resolver-domain.js";
import { resolvePlatformOptionsEffect } from "./add-resolver-platform.js";
import { resolveResourceOptionsEffect } from "./add-resolver-resources.js";
import { resolveServiceForKindEffect } from "./add-resolution-discovery.js";
import { AddResolutionState, choices } from "./add-resolution-state.js";
import { ADD_KINDS, type AddRequest } from "./add-types.js";
import { ProjectDiscoveryServiceTag, projectDiscoveryLive } from "./project-discovery.js";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { GeneratorPrompt, generatorPromptLayer } from "./generator-prompt.js";
import { domainTry, scaffoldErrors } from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import { createClackPromptDriver } from "./prompt-driver.js";
import type {
  AddResolutionService,
  ResolveAddContext,
  ResolvedAddRequest,
} from "./add-resolver.types.js";
export type { ResolveAddContext, ResolvedAddRequest } from "./add-resolver.types.js";

/** Ordered interactive-add resolution, distinct from applying the user's final consent. */
export class AddResolution extends Context.Service<AddResolution, AddResolutionService>()(
  "create-relkit/AddResolution",
) {}

/**
 * Captures declaration discovery, filesystem reads and prompt input at the owning Layer boundary.
 * @returns An AddResolution Layer requiring discovery, filesystem and prompt services.
 */
export const addResolutionLive = Layer.effect(
  AddResolution,
  Effect.gen(function* () {
    const discovery = yield* ProjectDiscoveryServiceTag;
    const fs = yield* GeneratorFileSystem;
    const prompt = yield* GeneratorPrompt;
    return AddResolution.of({
      resolve: Effect.fn("AddResolution.resolve")((args, context) =>
        observeExecution(
          "generator",
          "add.resolve",
          Effect.gen(function* () {
            const interactive = context.interactive === true;
            const input = [...args];
            let prompted = false;
            if (!ADD_KINDS.some((kind) => kind === input[0])) {
              if (!interactive) usage("Usage: relkit add <kind> [name] [options]");
              input.unshift(
                yield* prompt.select({
                  message: "What would you like to add?",
                  options: choices(ADD_KINDS),
                }),
              );
              prompted = true;
            }
            const state = new AddResolutionState(
              input,
              context.cwd,
              interactive,
              context.promptDriver,
            );
            const facts = yield* discovery.discover(state.parsed.projectRoot);
            yield* resolveServiceForKindEffect(state, facts);
            yield* resolveDomainOptionsEffect(state, facts);
            yield* resolveResourceOptionsEffect(state, facts);
            yield* resolvePlatformOptionsEffect(state, facts);
            const request = yield* domainTry(() =>
              normalizeAddRequest(
                state.args,
                context.cwd === undefined ? {} : { cwd: context.cwd },
              ),
            );
            return Object.freeze({ request, prompted: prompted || state.prompted });
          }).pipe(
            scaffoldErrors,
            Effect.provideService(GeneratorFileSystem, fs),
            Effect.provideService(GeneratorPrompt, prompt),
          ),
        ),
      ),
    });
  }),
);

/**
 * Resolves a request through explicit add-resolution authority while retaining consent metadata.
 * @param args - Literal flag and positional arguments.
 * @param context - Caller-owned settings and cancellation.
 * @returns The validated add request and whether resolution asked for interactive input.
 */
export const resolveAddRequestDetailsEffect = Effect.fn("AddResolution.details")(
  function* (args: readonly string[], context: ResolveAddContext = {}) {
    return yield* (yield* AddResolution).resolve(args, context);
  },
  (effect) => observeExecution("generator", "add.resolve.details", effect),
);

/**
 * Preserves the existing normalized-request Promise API.
 * @param args - Literal flag and positional arguments.
 * @param context - Caller-owned settings and cancellation.
 * @returns The validated add request after all required choices are resolved.
 */
export async function resolveAddRequest(
  args: readonly string[],
  context: ResolveAddContext = {},
): Promise<AddRequest> {
  return (await resolveAddRequestDetails(args, context)).request;
}

/**
 * Preserves the existing detailed Promise API and add-flow consent behavior.
 * @param args - Literal flag and positional arguments.
 * @param context - Caller-owned settings and cancellation.
 * @returns The validated request and prompt-consent metadata after native input settles.
 */
export function resolveAddRequestDetails(
  args: readonly string[],
  context: ResolveAddContext = {},
): Promise<ResolvedAddRequest> {
  return runGeneratorPromise(
    resolveAddRequestDetailsEffect(args, context).pipe(
      Effect.provide(addResolutionLive),
      Effect.provide(projectDiscoveryLive),
      Effect.provide(generatorPromptLayer(context.promptDriver ?? createClackPromptDriver())),
    ),
    context.signal,
  );
}
