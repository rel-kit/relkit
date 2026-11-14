/** Decides route access that does not read input, then maps the request to its target input. */
import { enforceAccessBeforeInput, sessionPrincipalSource } from "../engine/index.js";
import type { HttpTriggerRegistration } from "../graph/index.js";
import type { InvocationFailure } from "../runtime-effect/index.js";
import { Effect } from "effect";
import type { Context } from "hono";
import type { HttpRouteRequest, RouteMaterializationOptions } from "./materialize-routes.js";
import { decodeInferredInput } from "./request-inference.js";
import { isRequestMappingFailure, mapRequest } from "./request-mapping.js";

/** Rejects a caller without a session, or one failing the target's roles or permissions, before
 * the route reads input; rules that read input are left to the engine, after validation.
 * @param context - Hono request context whose native request owns the memoized session.
 * @param target - Resolved route target; its `access` rule is read when present.
 * @param options - Route options carrying the request authentication runtime.
 * @returns An effect yielding the access failure, or undefined when the route may read input.
 */
export const routeAccessFailure = Effect.fn("HttpRoutes.accessBeforeInput")(function* (
  context: Context,
  target: unknown,
  options: RouteMaterializationOptions,
) {
  const rule = isRecord(target) ? target.access : undefined;
  if (!isRecord(rule) || options.auth === undefined) return undefined;
  const auth = options.auth.contextFor(context.req.raw);
  const principal = sessionPrincipalSource(() => auth.getSession(), options.auth.resolveAccess);
  return yield* enforceAccessBeforeInput(rule, principal).pipe(
    Effect.as(undefined),
    Effect.catch((failure: InvocationFailure) => Effect.succeed(failure)),
  );
});

/** Selects custom request mapping or declarative mapping followed by schema inference.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param targetFunctionId - target function id supplied by the caller.
 * @param options - Application dependencies and configuration for this domain.
 * @param target - Resolved route target whose input schema guides inference.
 * @returns The mapped target input or the public request-mapping failure envelope.
 */
export async function routeInput(
  request: HttpRouteRequest,
  trigger: HttpTriggerRegistration,
  targetFunctionId: string,
  options: RouteMaterializationOptions,
  target = getEntry(options.manifest.targets ?? {}, trigger.targetFunctionId),
): Promise<unknown> {
  if (options.mapInput !== undefined)
    return options.mapInput(request, trigger, targetFunctionId, trigger.config.request);
  const result = await mapRequest(request, trigger.config.request, {
    ...(options.requestMapping ?? {}),
    ...(trigger.config.maxBodyBytes === undefined
      ? {}
      : { maxBodyBytes: trigger.config.maxBodyBytes }),
    transforms: options.manifest.requestTransforms,
  });
  return isRequestMappingFailure(result)
    ? result
    : decodeInferredInput(
        result.value,
        getEntry(options.manifest.routes ?? {}, trigger.id) ??
          (isRecord(trigger.config.request) && trigger.config.request.kind === "input"
            ? {}
            : { request: trigger.config.request }),
        target,
      );
}

/** Looks up an own entry in either a readonly object or map.
 * @param entries - Readonly lookup table supplied as an object or map.
 * @param id - Stable declaration identifier used for lookup.
 * @typeParam T - Value type retained by this operation.
 * @returns The matching own record property or map entry, or undefined.
 */
export function getEntry<T>(
  entries: Readonly<Record<string, T>> | ReadonlyMap<string, T>,
  id: string,
): T | undefined {
  if (entries instanceof Map) return entries.get(id);
  const record = entries as Readonly<Record<string, T>>;
  return Object.prototype.hasOwnProperty.call(record, id) ? record[id] : undefined;
}

/** Recognizes a non-null object before reading its named properties.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}
