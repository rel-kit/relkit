/** Owns native prepared-generation disposal and supplies plain SDK descriptors for the original target-inference witness. */
import { Effect } from "effect";
import { z } from "@relkit/schema";
import { createPreparedApp } from "../src/prepared-app.js";
import type { CreateAppOptions } from "../src/create-app.types.js";
import type { HttpInvocationOptions } from "../src/materialize-routes.types.js";
import { preparedOptions } from "./prepared-fixture.js";

/** Acquires one real prepared generation; the live test Scope joins native disposal on every exit.
 * @param options - Original checked application and engine contract.
 * @returns Native application facade with unchanged request and response semantics.
 */
export const acquirePreparedApp = Effect.fn("PreparedHttpTest.acquire")(
  (options: CreateAppOptions) =>
    Effect.acquireRelease(
      Effect.promise(() => createPreparedApp(options)),
      (app) => Effect.promise(() => app.close()),
    ),
);

/** Builds the original native target-inference witness with plain public descriptors.
 * @param invocations - Caller-owned observations projected directly from the SDK invocation ABI.
 * @returns Original target and route options; only page/active query inference is under test.
 */
export function inferredTargetOptions(
  invocations: Pick<HttpInvocationOptions, "input" | "target">[],
) {
  const base = preparedOptions();
  const { mapInput: _mapInput, ...baseWithoutMapInput } = base;
  const target = {
    input: z.object({ page: z.number(), active: z.boolean() }),
    output: z.unknown(),
    handler: () => ({ ok: true }),
  };
  const options = {
    ...baseWithoutMapInput,
    plan: {
      ...base.plan,
      httpTriggers: base.plan.httpTriggers.map((trigger) => ({
        ...trigger,
        config: {
          ...trigger.config,
          request: {
            kind: "input" as const,
            fields: {
              page: { kind: "query" as const, name: "page" },
              active: { kind: "query" as const, name: "active" },
            },
          },
        },
      })),
    },
    resolveTarget: async () => target,
    engine: {
      invoke: async ({ input, target: resolved }) => {
        invocations.push({ input, target: resolved });
        return { ok: true };
      },
    },
  } satisfies CreateAppOptions;
  return { options, target };
}
