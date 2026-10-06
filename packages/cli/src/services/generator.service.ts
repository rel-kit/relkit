import { Context, Effect, Layer } from "effect";
import { cliAdapterError, cliPromise } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { fail, isGeneratorApi, loadCreateRelkitEffect } from "../main-support.js";
import type { CliGeneratorOperations } from "./generator.types.js";
import type { CliRuntime } from "../main-support-types.js";

/** Foreign generator API authority, adapted into lazy cancellable operations. */
export class CliGenerator extends Context.Service<CliGenerator, CliGeneratorOperations>()(
  "relkit/cli/Generator",
) {}

/**
 * Acquires the selected generator API only for an actual scaffold invocation.
 * @param runtime - Existing optional API-loader injection.
 * @returns A Layer with one API identity and no module cache crossing invocations.
 */
export function generatorLayer(runtime: CliRuntime) {
  return Layer.effect(
    CliGenerator,
    Effect.gen(function* () {
      const api = yield* runtime.loadCreateRelkit === undefined
        ? loadCreateRelkitEffect
        : cliPromise("generator.load", () => runtime.loadCreateRelkit!());
      if (!isGeneratorApi(api))
        return yield* Effect.fail(
          cliAdapterError(
            "generator.load",
            fail(
              "RELKIT_CREATE_API_UNAVAILABLE",
              "The create-relkit generator API is unavailable.",
            ),
          ),
        );
      return CliGenerator.of({
        resolveCreate: (args, context) =>
          observeCli(
            "generator.resolve-create",
            cliPromise("generator.resolve-create", (signal) =>
              api.resolveCreateOptionsDetails
                ? api.resolveCreateOptionsDetails(args, {
                    ...context,
                    signal: AbortSignal.any([signal, context.signal]),
                  })
                : Promise.resolve({
                    options: api.normalizeCreateOptions(args, { json: context.json }),
                    prompted: false,
                  }),
            ),
          ),
        previewCreate: (options, context) =>
          observeCli(
            "generator.preview-create",
            cliPromise("generator.preview-create", () =>
              api.planCreate ? api.planCreate(options, context) : Promise.resolve(undefined),
            ),
          ),
        generate: (options, context) =>
          observeCli(
            "generator.generate",
            settledGeneratorCall((signal) =>
              Promise.resolve(
                api.generateProject(options, {
                  ...context,
                  signal: AbortSignal.any([signal, context.signal]),
                }),
              ),
            ),
          ),
        resolveAdd: (args, context) =>
          observeCli(
            "generator.resolve-add",
            cliPromise("generator.resolve-add", (signal) => {
              if (!api.resolveAddRequestDetails || !api.planAdd || !api.applyScaffoldPlan)
                return Promise.reject(unavailableAdd());
              return api.resolveAddRequestDetails(args, {
                ...context,
                signal: AbortSignal.any([signal, context.signal]),
              });
            }),
          ),
        planAdd: (request) =>
          observeCli(
            "generator.plan-add",
            cliPromise("generator.plan-add", () =>
              api.planAdd ? api.planAdd(request) : Promise.reject(unavailableAdd()),
            ),
          ),
        applyAdd: (plan, context) =>
          observeCli(
            "generator.apply-add",
            settledGeneratorCall((signal) =>
              api.applyScaffoldPlan
                ? api.applyScaffoldPlan(plan, {
                    ...context,
                    signal: AbortSignal.any([signal, context.signal]),
                  })
                : Promise.reject(unavailableAdd()),
            ),
          ),
      });
    }),
  );
}

/**
 * Owns physical mutation completion at the foreign Promise compatibility boundary.
 * @typeParam A - Foreign generator result.
 * @param call - One foreign mutation receiving its owned cancellation signal.
 * @returns Completion only after generator rollback/finalizers settle on interruption.
 * @remarks The generator owns its internal file/process scope; this adapter owns only
 * its cancellation receipt. It never detaches a transaction Promise.
 */
function settledGeneratorCall<A>(call: (signal: AbortSignal) => Promise<A>) {
  return Effect.scoped(
    Effect.gen(function* () {
      const owned = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const controller = new AbortController();
          const promise = Promise.resolve().then(() => call(controller.signal));
          void promise.catch(() => undefined);
          return { controller, promise };
        }),
        (owned) =>
          Effect.gen(function* () {
            yield* Effect.sync(() =>
              owned.controller.abort(new Error("Generator operation scope closed.")),
            );
            yield* Effect.promise(() =>
              owned.promise.then(
                () => undefined,
                () => undefined,
              ),
            );
          }),
      );
      return yield* cliPromise("generator.mutate", () => owned.promise);
    }),
  );
}

/**
 * Constructs the existing add-API compatibility failure.
 * @returns A public failure with unchanged code and message.
 */
function unavailableAdd(): Error & { readonly code: string } {
  return Object.assign(new Error("The create-relkit add API is unavailable."), {
    code: "RELKIT_ADD_API_UNAVAILABLE",
  });
}
