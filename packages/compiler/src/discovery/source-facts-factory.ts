import { observeCompiler } from "../observability.js";
import * as ts from "typescript";
import { Effect } from "effect";
import { runDiscoverySync } from "./discovery-sync.js";
import { idPresenceEffect, optionNamesEffect, optionPathsEffect } from "./source-facts-options.js";
import { factoryName, memberTarget, propertyName, unwrap } from "./source-facts-syntax.js";
import type {
  FactoryDefinition,
  FactoryBindingFact,
  ServiceMemberFact,
} from "./source-facts.types.js";

const FACTORIES: Readonly<Record<string, FactoryDefinition>> = Object.freeze({
  asTool: { kind: "tool", idOptional: true },
  defineApp: { kind: "app", idOptional: true },
  defineConfig: { kind: "app", idOptional: true },
  defineConstants: { kind: "constants", idOptional: true },
  definePrompt: { kind: "prompt", idOptional: true },
  defineDrizzleService: { kind: "service", idOptional: true },
  defineBetterAuthService: { kind: "service", idOptional: true },
  defineFunction: { kind: "function", idOptional: true },
  defineEventFunction: { kind: "function", idOptional: false },
  defineError: { kind: "error", idOptional: true },
  defineRoute: { kind: "route", idOptional: true },
  defineServiceRoutes: { kind: "route", idOptional: true },
  defineTask: { kind: "task", idOptional: false },
  defineJob: { kind: "job", idOptional: false },
  defineEvent: { kind: "event", idOptional: false },
  defineBucket: { kind: "bucket", idOptional: false },
  defineCache: { kind: "cache", idOptional: false },
  defineTool: { kind: "tool", idOptional: true },
  defineAgent: { kind: "agent", idOptional: true },
  defineGraph: { kind: "agent", idOptional: true },
  defineChannel: { kind: "channel", idOptional: false },
  defineMiddleware: { kind: "middleware", idOptional: true },
  defineService: { kind: "service", idOptional: true },
  defineTransform: { kind: "transform", idOptional: true },
  defineRequestTransform: { kind: "transform", idOptional: true },
});

/**
 * Reads recognized factory-call identity for synchronous compiler callers.
 * @param initializer - Declaration initializer, possibly wrapped in syntax assertions.
 * @param binding - Local identifier when the declaration supplies one.
 * @param position - TypeScript character offset retained in the evidence.
 * @returns Factory identity, or undefined when syntax names no recognized factory.
 */
export function factoryFor(
  initializer: ts.Expression | undefined,
  binding: string | undefined,
  position: number,
): FactoryBindingFact | undefined {
  return runDiscoverySync(factoryForEffect(initializer, binding, position));
}

/**
 * Classifies a declaration's factory call and its source-only ID/options evidence.
 * @param initializer - Unevaluated initializer to unwrap and inspect.
 * @param binding - Local binding associated with the call, if known.
 * @param position - Source character offset associated with the declaration.
 * @returns A lazy effect yielding factory evidence or undefined for unrelated syntax.
 */
export const factoryForEffect = Effect.fn("Discovery.factoryFor")(
  function* (
    initializer: ts.Expression | undefined,
    binding: string | undefined,
    position: number,
  ) {
    const call = unwrap(initializer);
    if (!call || !ts.isCallExpression(call)) return undefined;
    const factory = factoryName(call.expression);
    const definition = factory === undefined ? undefined : FACTORIES[factory];
    if (definition === undefined || factory === undefined) return undefined;
    return Object.freeze({
      ...(binding === undefined ? {} : { binding }),
      factory,
      kind: definition.kind,
      idOptional: definition.idOptional,
      id:
        factory === "defineServiceRoutes"
          ? "omitted"
          : yield* idPresenceEffect(
              factory === "definePrompt" || factory === "defineConstants"
                ? call.arguments[1]
                : call.arguments[0],
            ),
      position,
      options: yield* optionNamesEffect(call.arguments[0]),
      ...(factory === "defineConfig" || factory === "defineApp"
        ? { optionPaths: yield* optionPathsEffect(call.arguments[0]) }
        : {}),
    } satisfies FactoryBindingFact);
  },
  (effect, initializer, binding, position) =>
    observeCompiler("discovery", "factoryFor", effect, () => ({}), false),
);

/**
 * Reads service-member evidence for synchronous compiler callers.
 * @param factory - Factory evidence for the owning declaration.
 * @param initializer - Unevaluated service initializer.
 * @param sourceFile - AST supplying character offsets.
 * @returns Source-ordered service members; non-service declarations yield an empty list.
 */
export function membersFor(
  factory: FactoryBindingFact,
  initializer: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
): readonly ServiceMemberFact[] {
  return runDiscoverySync(membersForEffect(factory, initializer, sourceFile));
}

/**
 * Collects declared function, event, task, and job members of a service factory.
 * @param factory - Factory identity including the service's local binding.
 * @param initializer - Unevaluated initializer containing literal options.
 * @param sourceFile - AST used to read member character offsets.
 * @returns A lazy effect yielding member evidence without resolving or evaluating targets.
 */
export const membersForEffect = Effect.fn("Discovery.membersFor")(
  function* (
    factory: FactoryBindingFact,
    initializer: ts.Expression | undefined,
    sourceFile: ts.SourceFile,
  ) {
    if (factory.kind !== "service" || factory.binding === undefined) return [];
    const service = factory.binding;
    const call = unwrap(initializer);
    const options = call && ts.isCallExpression(call) ? unwrap(call.arguments[0]) : undefined;
    if (!options || !ts.isObjectLiteralExpression(options)) return [];
    return options.properties.flatMap((property) => {
      const category = propertyName(property.name);
      if (
        category !== "functions" &&
        category !== "events" &&
        category !== "tasks" &&
        category !== "jobs"
      ) {
        return [];
      }
      if (!ts.isPropertyAssignment(property)) return [];
      const map = unwrap(property.initializer);
      if (!map || !ts.isObjectLiteralExpression(map)) return [];
      return map.properties.flatMap((member) => {
        const name = propertyName(member.name);
        if (name === undefined || ts.isSpreadAssignment(member)) return [];
        const targetBinding = memberTarget(member);
        return [
          Object.freeze({
            service,
            member: name,
            ...(targetBinding === undefined ? {} : { targetBinding }),
            position: member.name?.getStart(sourceFile) ?? member.getStart(sourceFile),
          } satisfies ServiceMemberFact),
        ];
      });
    });
  },
  (effect, factory, initializer, sourceFile) =>
    observeCompiler("discovery", "membersFor", effect, () => ({}), false),
);
