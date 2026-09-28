import { MIDDLEWARE_BRAND } from "langchain";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { agentDefinitionFailure } from "./define-agent-error.js";
import type { AgentClientStateKey, AgentMiddleware } from "./define-agent-native.types.js";

/** Validates middleware names and brands, retaining input order.
 * @param value - Middleware definitions or undefined.
 * @returns An Effect with a frozen list or AgentDefinitionFailure.
 * @example Effect.runSync(copyAgentMiddlewareEffect([]));
 */
export const copyAgentMiddlewareEffect = Effect.fn("Agents.definition.copyMiddleware")(
  <Middleware extends readonly AgentMiddleware[]>(value: Middleware | undefined) =>
    Effect.try({
      try: (): Middleware => {
        if (value === undefined) return Object.freeze([]) as unknown as Middleware;
        if (!Array.isArray(value)) throw new TypeError("Agent middleware must be an array");
        const names = new Set<string>();
        for (const [index, middleware] of value.entries()) {
          if (!isAgentMiddleware(middleware)) {
            throw new TypeError(`Agent middleware at index ${index} is invalid`);
          }
          if (names.has(middleware.name)) {
            throw new TypeError(`Duplicate agent middleware "${middleware.name}"`);
          }
          names.add(middleware.name);
        }
        return Object.freeze([...value]) as unknown as Middleware;
      },
      catch: agentDefinitionFailure,
    }),
  (effect) => observeAgent("definition.copy-middleware", effect),
);

/** Copies middleware for existing synchronous authoring callers.
 * @param value - Middleware definitions or undefined.
 * @returns A frozen middleware list.
 * @throws The original invalid middleware error.
 * @example const middleware = copyAgentMiddleware([]);
 */
export function copyAgentMiddleware<Middleware extends readonly AgentMiddleware[]>(
  value: Middleware | undefined,
): Middleware {
  return Effect.runSync(
    copyAgentMiddlewareEffect(value).pipe(
      Effect.catchTag("AgentDefinitionFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

/** Collects public state keys declared by middleware schemas.
 * @param middleware - Validated middleware list.
 * @returns An Effect with state keys or AgentDefinitionFailure.
 * @example Effect.runSync(middlewareStateKeysEffect([]));
 */
export const middlewareStateKeysEffect = Effect.fn("Agents.definition.stateKeys")(
  <Middleware extends readonly AgentMiddleware[]>(middleware: Middleware) =>
    Effect.try({
      try: (): ReadonlySet<AgentClientStateKey<Middleware>> => {
        const keys = new Set<string>();
        for (const entry of middleware) {
          const schema = entry.stateSchema as unknown;
          if (!isRecord(schema)) continue;
          const fields = schema.fields;
          if (isRecord(fields)) for (const key of Object.keys(fields)) keys.add(key);
          const shape = typeof schema.shape === "function" ? schema.shape() : schema.shape;
          if (isRecord(shape)) for (const key of Object.keys(shape)) keys.add(key);
        }
        return keys as unknown as ReadonlySet<AgentClientStateKey<Middleware>>;
      },
      catch: agentDefinitionFailure,
    }),
  (effect) => observeAgent("definition.state-keys", effect),
);

/** Collects state keys for existing synchronous authoring callers.
 * @param middleware - Validated middleware list.
 * @returns Public middleware state keys.
 * @throws The original schema access error.
 * @example const keys = middlewareStateKeys([]);
 */
export function middlewareStateKeys<Middleware extends readonly AgentMiddleware[]>(
  middleware: Middleware,
): ReadonlySet<AgentClientStateKey<Middleware>> {
  return Effect.runSync(
    middlewareStateKeysEffect(middleware).pipe(
      Effect.catchTag("AgentDefinitionFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

function isAgentMiddleware(value: unknown): value is AgentMiddleware {
  return (
    isRecord(value) &&
    value[MIDDLEWARE_BRAND] === true &&
    typeof value.name === "string" &&
    value.name.trim() !== ""
  );
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
