import { observeCompiler } from "../observability.js";
import * as ts from "typescript";
import { Effect } from "effect";
import { runDiscoverySync } from "./discovery-sync.js";
import { factoryForEffect, membersForEffect } from "./source-facts-factory.js";
import {
  exportFactEffect,
  hasModifier,
  routeMethodEffect,
  sortFacts,
} from "./source-facts-utils.js";
import type {
  ErrorBindingFact,
  ExportFact,
  ExportFacts,
  FactoryBindingFact,
  RouteOperationFact,
  ServiceMemberFact,
  LocalBinding,
} from "./source-facts.types.js";
export type {
  ErrorBindingFact,
  ExportFact,
  ExportFacts,
  FactoryBindingFact,
  FactoryIdPresence,
  RouteOperationFact,
  ServiceMemberFact,
  SourceFacts,
  SourceFactoryKind,
} from "./source-facts.types.js";

/**
 * Reads export identity evidence for synchronous compiler callers.
 * @param sourceFile - Parsed source to inspect without evaluating it.
 * @returns Runtime export lookup and source-ordered factory/member evidence.
 */
export function readFacts(sourceFile: ts.SourceFile): ExportFacts {
  return runDiscoverySync(readFactsEffect(sourceFile));
}

/**
 * Links local declarations and runtime exports using TypeScript syntax only.
 * @param sourceFile - Parsed source whose node positions define source identity.
 * @returns A lazy effect yielding export lookup and position-ordered identity evidence.
 * @remarks Local mutable collections belong to one execution. Imports and factory
 * calls are never evaluated; unsupported syntax simply contributes no evidence.
 */
export const readFactsEffect = Effect.fn("Discovery.readFacts")(
  function* (sourceFile: ts.SourceFile) {
    const locals = new Map<string, LocalBinding>();
    const exports = new Map<string, ExportFact>();
    const factoryBindings: FactoryBindingFact[] = [];
    const routeOperations: RouteOperationFact[] = [];
    const serviceMembers: ServiceMemberFact[] = [];
    const errorBindings: ErrorBindingFact[] = [];
    const stars: { module: string; position: number }[] = [];

    yield* Effect.forEach(
      sourceFile.statements,
      (statement) =>
        Effect.gen(function* () {
          if (ts.isVariableStatement(statement)) {
            yield* Effect.forEach(
              statement.declarationList.declarations,
              (declaration) =>
                Effect.gen(function* () {
                  if (ts.isObjectBindingPattern(declaration.name)) {
                    const factory = yield* factoryForEffect(
                      declaration.initializer,
                      undefined,
                      declaration.initializer?.getStart(sourceFile) ??
                        declaration.name.getStart(sourceFile),
                    );
                    if (factory?.factory !== "defineServiceRoutes") return;
                    yield* Effect.forEach(
                      declaration.name.elements,
                      (element) =>
                        Effect.gen(function* () {
                          if (
                            element.dotDotDotToken !== undefined ||
                            !ts.isIdentifier(element.name)
                          )
                            return;
                          const binding = element.name.text;
                          const position = element.getStart(sourceFile);
                          const routeFactory = Object.freeze({ ...factory, binding, position });
                          const local = {
                            binding,
                            position,
                            factory: routeFactory,
                          } satisfies LocalBinding;
                          locals.set(binding, local);
                          factoryBindings.push(routeFactory);
                          if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
                            exports.set(binding, yield* exportFactEffect(local));
                          }
                        }),
                      { discard: true },
                    );
                    return;
                  }
                  if (!ts.isIdentifier(declaration.name)) return;
                  const position =
                    declaration.initializer?.getStart(sourceFile) ??
                    declaration.name.getStart(sourceFile);
                  const factory = yield* factoryForEffect(
                    declaration.initializer,
                    declaration.name.text,
                    position,
                  );
                  const error =
                    statement.declarationList.flags & ts.NodeFlags.Const &&
                    factory?.factory === "defineError"
                      ? { binding: declaration.name.text, position, id: factory.id }
                      : undefined;
                  const local: LocalBinding = {
                    binding: declaration.name.text,
                    position,
                    ...(factory === undefined ? {} : { factory }),
                    ...(error === undefined ? {} : { error }),
                  };
                  locals.set(declaration.name.text, local);
                  if (factory !== undefined) {
                    factoryBindings.push(factory);
                    serviceMembers.push(
                      ...(yield* membersForEffect(factory, declaration.initializer, sourceFile)),
                    );
                  }
                  if (error !== undefined) errorBindings.push(Object.freeze(error));
                  if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
                    exports.set(declaration.name.text, yield* exportFactEffect(local));
                  }
                }),
              { discard: true },
            );
          }
          if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
            if (statement.name === undefined) return;
            const local = {
              binding: statement.name.text,
              position: statement.getStart(sourceFile),
            } satisfies LocalBinding;
            locals.set(statement.name.text, local);
            if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
              exports.set(statement.name.text, yield* exportFactEffect(local));
            }
            if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
              exports.set("default", yield* exportFactEffect(local));
            }
          }
        }),
      { discard: true },
    );

    yield* Effect.forEach(
      sourceFile.statements,
      (statement) =>
        Effect.gen(function* () {
          if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
            const expression = statement.expression;
            const local = ts.isIdentifier(expression) ? locals.get(expression.text) : undefined;
            const position = local?.position ?? expression.getStart(sourceFile);
            const factory =
              local?.factory ?? (yield* factoryForEffect(expression, undefined, position));
            if (factory !== undefined && local === undefined) factoryBindings.push(factory);
            exports.set(
              "default",
              local === undefined
                ? { position, ...(factory === undefined ? {} : { factory }) }
                : yield* exportFactEffect(local),
            );
          }
          if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) return;
          const module =
            statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)
              ? statement.moduleSpecifier.text
              : undefined;
          if (statement.exportClause === undefined) {
            if (module !== undefined)
              stars.push({ module, position: statement.getStart(sourceFile) });
            return;
          }
          if (!ts.isNamedExports(statement.exportClause)) return;
          yield* Effect.forEach(
            statement.exportClause.elements,
            (element) =>
              Effect.gen(function* () {
                if (element.isTypeOnly) return;
                const name = element.name.text;
                const localName = element.propertyName?.text ?? name;
                if (module !== undefined) {
                  exports.set(name, {
                    position: element.getStart(sourceFile),
                    origin: { module, name: localName },
                  });
                  return;
                }
                const local = locals.get(localName);
                exports.set(
                  name,
                  yield* exportFactEffect(
                    local ?? {
                      binding: localName,
                      position: element.getStart(sourceFile),
                    },
                  ),
                );
              }),
            { discard: true },
          );
        }),
      { discard: true },
    );

    yield* Effect.forEach(
      exports,
      ([exportName, fact]) =>
        Effect.gen(function* () {
          const method = yield* routeMethodEffect(exportName);
          if (method === undefined || fact.factory?.kind !== "route") return;
          const operation = Object.freeze({
            exportName,
            method,
            ...(fact.binding === undefined ? {} : { binding: fact.binding }),
            position: fact.position,
          });
          routeOperations.push(operation);
          exports.set(exportName, { ...fact, routeOperation: operation });
        }),
      { discard: true },
    );

    return {
      exports,
      stars: Object.freeze(stars),
      factoryBindings: Object.freeze(sortFacts(factoryBindings)),
      routeOperations: Object.freeze(sortFacts(routeOperations)),
      serviceMembers: Object.freeze(sortFacts(serviceMembers)),
      errorBindings: Object.freeze(sortFacts(errorBindings)),
    } satisfies ExportFacts;
  },
  (effect, sourceFile) =>
    observeCompiler("discovery", "readFacts", effect, () => ({ files: 1 }), false),
);
