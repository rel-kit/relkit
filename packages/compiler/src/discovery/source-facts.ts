import * as ts from "typescript";
import { factoryFor, membersFor } from "./source-facts-factory.js";
import type {
  ErrorBindingFact,
  ExportFact,
  ExportFacts,
  FactoryBindingFact,
  RouteOperationFact,
  ServiceMemberFact,
} from "./source-facts-types.js";

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
} from "./source-facts-types.js";

const ROUTE_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ALL"]);

interface LocalBinding {
  readonly binding: string;
  readonly position: number;
  readonly factory?: FactoryBindingFact;
  readonly error?: ErrorBindingFact;
}

/** Reads source identity facts using TypeScript syntax only. It never imports or evaluates code. */
export function readFacts(sourceFile: ts.SourceFile): ExportFacts {
  const locals = new Map<string, LocalBinding>();
  const exports = new Map<string, ExportFact>();
  const factoryBindings: FactoryBindingFact[] = [];
  const routeOperations: RouteOperationFact[] = [];
  const serviceMembers: ServiceMemberFact[] = [];
  const errorBindings: ErrorBindingFact[] = [];
  const stars: { module: string; position: number }[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const position =
          declaration.initializer?.getStart(sourceFile) ?? declaration.name.getStart(sourceFile);
        const factory = factoryFor(declaration.initializer, declaration.name.text, position);
        const error =
          statement.declarationList.flags & ts.NodeFlags.Const && factory?.factory === "defineError"
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
          serviceMembers.push(...membersFor(factory, declaration.initializer, sourceFile));
        }
        if (error !== undefined) errorBindings.push(Object.freeze(error));
        if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
          exports.set(declaration.name.text, exportFact(local));
        }
      }
    }
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name === undefined) continue;
      const local = {
        binding: statement.name.text,
        position: statement.getStart(sourceFile),
      } satisfies LocalBinding;
      locals.set(statement.name.text, local);
      if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
        exports.set(statement.name.text, exportFact(local));
      }
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
        exports.set("default", exportFact(local));
      }
    }
  }

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const expression = statement.expression;
      const local = ts.isIdentifier(expression) ? locals.get(expression.text) : undefined;
      const position = local?.position ?? expression.getStart(sourceFile);
      const factory = local?.factory ?? factoryFor(expression, undefined, position);
      if (factory !== undefined && local === undefined) factoryBindings.push(factory);
      exports.set(
        "default",
        local === undefined
          ? { position, ...(factory === undefined ? {} : { factory }) }
          : exportFact(local),
      );
    }
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
    const module =
      statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : undefined;
    if (statement.exportClause === undefined) {
      if (module !== undefined) stars.push({ module, position: statement.getStart(sourceFile) });
      continue;
    }
    if (!ts.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements) {
      if (element.isTypeOnly) continue;
      const name = element.name.text;
      const localName = element.propertyName?.text ?? name;
      if (module !== undefined) {
        exports.set(name, {
          position: element.getStart(sourceFile),
          origin: { module, name: localName },
        });
        continue;
      }
      const local = locals.get(localName);
      exports.set(
        name,
        exportFact(
          local ?? {
            binding: localName,
            position: element.getStart(sourceFile),
          },
        ),
      );
    }
  }

  for (const [exportName, fact] of exports) {
    const method = routeMethod(exportName);
    if (method === undefined || fact.factory?.kind !== "route") continue;
    const operation = Object.freeze({
      exportName,
      method,
      ...(fact.binding === undefined ? {} : { binding: fact.binding }),
      position: fact.position,
    });
    routeOperations.push(operation);
    exports.set(exportName, { ...fact, routeOperation: operation });
  }

  return {
    exports,
    stars: Object.freeze(stars),
    factoryBindings: Object.freeze(sortFacts(factoryBindings)),
    routeOperations: Object.freeze(sortFacts(routeOperations)),
    serviceMembers: Object.freeze(sortFacts(serviceMembers)),
    errorBindings: Object.freeze(sortFacts(errorBindings)),
  };
}

function exportFact(local: LocalBinding): ExportFact {
  return {
    position: local.position,
    binding: local.binding,
    ...(local.factory === undefined ? {} : { factory: local.factory }),
    ...(local.error === undefined ? {} : { errorBinding: local.error }),
  };
}

function routeMethod(value: string): string | undefined {
  const method = value.toUpperCase();
  return ROUTE_METHODS.has(method) ? method : undefined;
}

function sortFacts<T extends { readonly position: number }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => left.position - right.position);
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) === true
  );
}
