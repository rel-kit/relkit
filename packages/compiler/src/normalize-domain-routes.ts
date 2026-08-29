import { createDiagnostic } from "@relkit/diagnostics";
import * as ts from "typescript";
import { add } from "./normalize-pass-utils.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";
import { isRecord, refId } from "./normalize-utils.js";

const ROUTE_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

export function validateDomainServicesAndRoutes(
  work: NormalizationWork,
  sources: ReadonlyMap<string, string>,
): void {
  validateSpecializedServices(work);
  validateAuthMounts(work);
  for (const [file, text] of sources) validateServiceRouteBindings(work, file, text);
}

function validateSpecializedServices(work: NormalizationWork): void {
  const auth = work.descriptors.filter(
    (descriptor) =>
      isRecord(descriptor.value) && descriptor.value.capability?.kind === "better-auth",
  );
  const database = work.descriptors.filter(
    (descriptor) => isRecord(descriptor.value) && descriptor.value.capability?.kind === "drizzle",
  );
  if (auth.length > 1) {
    add(
      work,
      auth[1]!,
      NORMALIZE_CODES.authDuplicate,
      "Only one Better Auth service is supported.",
    );
  }
  if (database.length > 1) {
    add(work, database[1]!, NORMALIZE_CODES.domain, "Only one Drizzle service is supported.");
  }
  if (auth.length > 0 && database.length !== 1) {
    add(
      work,
      auth[0]!,
      NORMALIZE_CODES.domain,
      "Better Auth requires exactly one Drizzle service.",
    );
  }
}

function validateAuthMounts(work: NormalizationWork): void {
  const authServices = work.descriptors.filter(
    (descriptor) =>
      isRecord(descriptor.value) && descriptor.value.capability?.kind === "better-auth",
  );
  for (const service of authServices) {
    const mounts = work.descriptors.filter((descriptor) => {
      const value = isRecord(descriptor.value) ? descriptor.value : {};
      if (descriptor.kind !== "route" || !isRecord(value.auth)) return false;
      return refId(value.auth.service) === service.id;
    });
    if (mounts.length !== 1) {
      add(
        work,
        service,
        NORMALIZE_CODES.authDuplicate,
        mounts.length === 0
          ? "Better Auth service requires one ALL catch-all route mount."
          : "Better Auth service has multiple route mounts.",
      );
      continue;
    }
    const mount = mounts[0]!;
    const value = isRecord(mount.value) ? mount.value : {};
    const path = typeof value.path === "string" ? value.path : "";
    if (value.method !== "ALL" || !/^\/(?:.*\/)?\*[^/]+\??$/.test(path)) {
      add(
        work,
        mount,
        NORMALIZE_CODES.routeExport,
        "Better Auth must mount on one ALL catch-all route.",
      );
    }
  }
}

function validateServiceRouteBindings(work: NormalizationWork, file: string, text: string): void {
  if (!file.startsWith("src/routes/") || !file.endsWith("/route.ts")) return;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer;
      if (!initializer || !ts.isCallExpression(initializer)) continue;
      const name = ts.isIdentifier(initializer.expression)
        ? initializer.expression.text
        : undefined;
      if (name !== "defineServiceRoutes") continue;
      if (!ts.isObjectBindingPattern(declaration.name) || !hasExport(statement)) {
        diagnostic(
          work,
          file,
          "defineServiceRoutes must use an exported object destructuring binding.",
        );
        continue;
      }
      for (const element of declaration.name.elements) {
        const property = element.propertyName ?? element.name;
        const canonical =
          ts.isIdentifier(property) &&
          ts.isIdentifier(element.name) &&
          property.text === element.name.text;
        if (
          element.dotDotDotToken !== undefined ||
          !canonical ||
          !ROUTE_METHODS.has(element.name.getText(source))
        ) {
          diagnostic(
            work,
            file,
            "Service route exports cannot use aliases, rest bindings, or invalid methods.",
          );
        }
      }
    }
  }
}

function hasExport(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ===
      true
  );
}

function diagnostic(work: NormalizationWork, file: string, message: string): void {
  work.diagnostics.push(
    createDiagnostic({
      code: NORMALIZE_CODES.routeExport,
      severity: "error",
      message,
      location: { file, line: 1, column: 1 },
    }),
  );
}
