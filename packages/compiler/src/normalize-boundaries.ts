import { createDiagnostic } from "@relkit/diagnostics";
import { dirname, extname, resolve } from "node:path";
import * as ts from "typescript";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";

type Layer =
  | { readonly kind: "domain"; readonly domain: string }
  | { readonly kind: "routes" | "platform" | "config" | "other" };

/** Enforces domain import boundaries and records cross-domain service dependencies. */
export function validateBoundaries(
  work: NormalizationWork,
  sources: ReadonlyMap<string, string>,
  services: ReadonlyMap<string, NormalizedDescriptor>,
): void {
  const root = resolve(work.input.projectRoot ?? process.cwd());
  for (const [file, text] of sources) {
    const from = layerFor(file);
    if (from.kind === "other") continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    for (const specifier of moduleSpecifiers(source)) {
      const targetFile = resolveSource(file, specifier.text, sources, root);
      if (targetFile === undefined) continue;
      const target = layerFor(targetFile);
      if (!allowed(from, target, targetFile)) {
        const location = source.getLineAndCharacterOfPosition(specifier.position);
        work.diagnostics.push(
          createDiagnostic({
            code: "RELKIT_DOMAIN_BOUNDARY",
            severity: "error",
            message: `Import from "${file}" to "${targetFile}" crosses a domain boundary.`,
            location: { file, line: location.line + 1, column: location.character + 1 },
          }),
        );
        continue;
      }
      if (
        from.kind === "domain" &&
        target.kind === "domain" &&
        from.domain !== target.domain &&
        targetFile === `src/${target.domain}/service.ts`
      ) {
        const fromService = services.get(from.domain);
        const toService = services.get(target.domain);
        if (fromService !== undefined && toService !== undefined) {
          work.serviceDependencies.push({ from: fromService.id, to: toService.id });
        }
      }
    }
  }
  work.serviceDependencies = uniqueDependencies(work.serviceDependencies);
}

function allowed(from: Layer, target: Layer, targetFile: string): boolean {
  if (target.kind === "other") return true;
  if (from.kind === "domain") {
    return (
      target.kind === "platform" ||
      (target.kind === "domain" &&
        (target.domain === from.domain || targetFile === `src/${target.domain}/service.ts`))
    );
  }
  if (from.kind === "routes") {
    return (
      target.kind === "platform" ||
      (target.kind === "domain" && targetFile === `src/${target.domain}/service.ts`) ||
      target.kind === "routes"
    );
  }
  if (from.kind === "platform") return target.kind === "platform";
  if (from.kind === "config") return target.kind === "platform" || target.kind === "config";
  return true;
}

function layerFor(file: string): Layer {
  const parts = file.replaceAll("\\", "/").split("/");
  if (file === "relkit.config.ts") return { kind: "config" };
  if (parts[0] !== "src") return { kind: "other" };
  if (parts[1] === "routes") return { kind: "routes" };
  if (parts[1] === "platform") return { kind: "platform" };
  return parts.length > 2 && parts[1] !== undefined
    ? { kind: "domain", domain: parts[1] }
    : { kind: "other" };
}

function moduleSpecifiers(source: ts.SourceFile): readonly {
  readonly text: string;
  readonly position: number;
}[] {
  const result: { text: string; position: number }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      result.push({
        text: node.moduleSpecifier.text,
        position: node.moduleSpecifier.getStart(source),
      });
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      result.push({
        text: node.argument.literal.text,
        position: node.argument.literal.getStart(source),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

function resolveSource(
  file: string,
  specifier: string,
  sources: ReadonlyMap<string, string>,
  root: string,
): string | undefined {
  if (specifier.startsWith(".")) {
    const base = resolve(root, dirname(file), specifier);
    for (const candidate of candidates(base, root)) if (sources.has(candidate)) return candidate;
    return undefined;
  }
  const resolved = ts.resolveModuleName(specifier, resolve(root, file), {}, ts.sys).resolvedModule;
  if (resolved === undefined) return undefined;
  const absolute = resolve(resolved.resolvedFileName);
  const relative = absolute.startsWith(`${root}/`) ? absolute.slice(root.length + 1) : undefined;
  return relative !== undefined && sources.has(relative) ? relative : undefined;
}

function candidates(base: string, root: string): readonly string[] {
  const relative = (value: string): string => value.slice(root.length + 1).replaceAll("\\", "/");
  const extension = extname(base);
  const values = extension
    ? [
        base,
        ...(extension === ".js" ? [base.slice(0, -3) + ".ts", base.slice(0, -3) + ".tsx"] : []),
      ]
    : [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")];
  return values.map(relative);
}

function uniqueDependencies(
  values: readonly { readonly from: string; readonly to: string }[],
): { readonly from: string; readonly to: string }[] {
  return [...new Map(values.map((value) => [`${value.from}\0${value.to}`, value])).values()].sort(
    (left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to),
  );
}
