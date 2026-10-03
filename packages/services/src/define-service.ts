import { createDescriptorBaseEffect, deepFreezeEffect } from "@relkit/contracts";
import { assertEventDescriptorEffect } from "@relkit/events/effect";
import {
  bindDescriptorServiceMembersEffect,
  createUnboundIdentityEffect,
} from "@relkit/invocation";
import { isJobDescriptorEffect, isTaskDescriptorEffect } from "@relkit/jobs";
import { Effect } from "effect";
import type {
  DefineService,
  DefineServiceOptions,
  ServiceDescriptor,
  ServiceEventMap,
  ServiceFunctionMap,
  ServiceJobMap,
  ServiceTaskMap,
} from "./define-service.types.js";
import { assertServiceDescriptorEffect } from "./descriptor-guards.js";
import { isFunctionDescriptorEffect } from "./function-guards.js";
import { ServiceValidationError } from "./service-error.js";
import { assertUniqueServiceMembersEffect, copyServiceMembersEffect } from "./service-members.js";
import { observeService, runServiceSync } from "./service-observability.js";

/** Define a service without cloning its member descriptors.
 * @param options - Metadata and named functions, events, tasks, and jobs.
 * @returns An Effect of a frozen descriptor or ServiceValidationError.
 * @example Effect.runSync(defineServiceEffect({ id: "orders", functions: { lookup } }));
 */
export const defineServiceEffect = Effect.fn("Services.define")(
  <
    const Id extends string,
    const Functions extends ServiceFunctionMap = Readonly<Record<never, never>>,
    const Events extends ServiceEventMap = Readonly<Record<never, never>>,
    const Tasks extends ServiceTaskMap = Readonly<Record<never, never>>,
    const Jobs extends ServiceJobMap = Readonly<Record<never, never>>,
  >(
    options: DefineServiceOptions<Id, Functions, Events, Tasks, Jobs>,
  ) =>
    observeService(
      "define",
      Effect.gen(function* () {
        if (options === null || typeof options !== "object" || Array.isArray(options))
          return yield* new ServiceValidationError({
            message: "Service options must be an object",
          });
        const functions = yield* copyServiceMembersEffect(
          options.functions,
          isFunctionDescriptorEffect,
          "function",
        );
        const events = yield* copyServiceMembersEffect(options.events, isEventMember, "event");
        const tasks = yield* copyServiceMembersEffect(
          options.tasks,
          isTaskDescriptorEffect,
          "task",
        );
        const jobs = yield* copyServiceMembersEffect(options.jobs, isJobDescriptorEffect, "job");
        yield* assertUniqueServiceMembersEffect(functions, events, tasks, jobs);
        const id = (
          options.id === undefined
            ? yield* Effect.mapError(
                createUnboundIdentityEffect(),
                (error) =>
                  new ServiceValidationError({ message: error.message, cause: error.cause }),
              )
            : options.id
        ) as Id;
        const base = yield* Effect.mapError(
          createDescriptorBaseEffect("service", id, options),
          (error) => new ServiceValidationError({ message: error.message, cause: error }),
        );
        const descriptor = { ...base, ...functions, ...events, ...tasks, ...jobs };
        yield* assertServiceDescriptorEffect(descriptor);
        yield* Effect.mapError(
          bindDescriptorServiceMembersEffect(
            [
              ...Object.values(functions),
              ...Object.values(events),
              ...Object.values(tasks),
              ...Object.values(jobs),
            ],
            descriptor,
          ),
          (error) => new ServiceValidationError({ message: error.message, cause: error.cause }),
        );
        return (yield* deepFreezeEffect(descriptor)) as ServiceDescriptor<
          Id,
          Functions,
          Events,
          Tasks,
          Jobs
        >;
      }),
    ),
);

/** Define a service synchronously for authoring and preserve member identity.
 * @param options - Metadata and named functions, events, tasks, and jobs.
 * @returns A frozen service descriptor.
 * @throws TypeError for malformed local input, or the original identity/ID error.
 * @example
 * ```ts
 * import { defineFunction } from "@relkit/functions";
 * import { z } from "@relkit/schema";
 * import { defineService } from "@relkit/services";
 * const lookup = defineFunction({
 *   input: z.string(), output: z.string(), handler: (id) => id,
 * });
 * const orders = defineService({ id: "orders", functions: { lookup } });
 * ```
 * @category Services
 * @since 0.1.0
 */
export const defineService: DefineService = <
  const Id extends string,
  const Functions extends ServiceFunctionMap = Readonly<Record<never, never>>,
  const Events extends ServiceEventMap = Readonly<Record<never, never>>,
  const Tasks extends ServiceTaskMap = Readonly<Record<never, never>>,
  const Jobs extends ServiceJobMap = Readonly<Record<never, never>>,
>(
  options: DefineServiceOptions<Id, Functions, Events, Tasks, Jobs>,
): ServiceDescriptor<Id, Functions, Events, Tasks, Jobs> =>
  runServiceSync(defineServiceEffect(options));

/** Fold expected event validation failures while preserving unexpected defects. */
function isEventMember(value: unknown): Effect.Effect<boolean> {
  return Effect.match(assertEventDescriptorEffect(value), {
    onFailure: () => false,
    onSuccess: () => true,
  });
}
