/**
 * Rule `better-auth-file`: `defineBetterAuthService({ ...options })` is deprecated in favor of
 * a plain Better Auth file. The rule creates `better-auth.ts` beside the service with
 * `export const auth = betterAuth({ ...options })`, carrying over the imports the options use,
 * and turns the service into `defineBetterAuthService({ auth })`. Options that read a local
 * declaration of the service file, or a service folder that already has `better-auth.ts`, are
 * reported instead.
 */
import { posix } from "node:path";
import { codeSyntax as ts, parseCodeSource, type CodeSource } from "../code-parser.js";
import {
  applyTextEdits,
  findingAt,
  literalText,
  objectProperty,
  walk,
  type TextEdit,
} from "../code-edits.js";
import { addNamedImport, bindingReferences } from "../code-imports.js";
import type { CodeFinding, CodeRule } from "../code-migration.types.js";
import { defineCalls } from "./rule-support.js";

const id = "better-auth-file";

export const betterAuthFileRule: CodeRule = {
  id,
  summary: "Move Better Auth options into a Better Auth file",
  guide: "better-auth-file",
  appliesTo: (path) => /\.[cm]?[jt]sx?$/.test(path),
  apply: (file, context) => {
    const source = parseCodeSource(file.path, file.text);
    const locals = betterAuthLocals(source);
    const findings: CodeFinding[] = [];
    for (const { call, options } of defineCalls(source, locals)) {
      if (objectProperty(options, "auth") !== undefined) continue;
      const target = posix.join(posix.dirname(file.path), "better-auth.ts");
      const blocked = context.sources.has(target)
        ? `${target} already exists; move these options into it and pass defineBetterAuthService({ auth }).`
        : bindingReferences(source, "auth").length > 0
          ? "The service file already uses the name auth; move these options into a Better Auth file by hand."
          : localReference(source, options);
      if (blocked !== undefined) {
        findings.push(findingAt(source, call, id, blocked));
        continue;
      }
      const carried = carriedImports(source, options);
      const created = [
        "/** The application's Better Auth instance. RelKit adds the database and mounts it. */",
        'import { betterAuth } from "better-auth";',
        ...carried.lines,
        "",
        `export const auth = betterAuth(${options.getText(source)});`,
        "",
      ].join("\n");
      const edits: TextEdit[] = [
        { start: options.getStart(source), end: options.getEnd(), text: "{ auth }" },
        ...carried.removals,
      ];
      const add = addNamedImport(source, "./better-auth.js", "auth");
      if (add) edits.push(add);
      return {
        text: applyTextEdits(file.text, edits),
        findings,
        created: [{ path: target, text: created }],
      };
    }
    return { text: file.text, findings };
  },
};

/**
 * Lists local names of `defineBetterAuthService`.
 * @param source - Parsed file.
 * @returns Local bindings imported from `@relkit/better-auth`.
 */
function betterAuthLocals(source: CodeSource): Set<string> {
  const locals = new Set<string>();
  for (const statement of source.statements)
    if (
      ts.isImportDeclaration(statement) &&
      literalText(statement.moduleSpecifier) === "@relkit/better-auth"
    ) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings))
        for (const element of bindings.elements)
          if ((element.propertyName ?? element.name).text === "defineBetterAuthService")
            locals.add(element.name.text);
    }
  return locals;
}

/**
 * Reports options that read a top-level declaration of the service file.
 * @param source - Parsed file.
 * @param options - Options object.
 * @returns A finding message, or undefined when the options are self-contained.
 */
function localReference(
  source: CodeSource,
  options: ts.ObjectLiteralExpression,
): string | undefined {
  const declared = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations)
        if (ts.isIdentifier(declaration.name)) declared.add(declaration.name.text);
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name)
      declared.add(statement.name.text);
  }
  let found: string | undefined;
  walk(options, (node) => {
    if (
      ts.isIdentifier(node) &&
      declared.has(node.text) &&
      bindingReferences(source, node.text).includes(node)
    )
      found = node.text;
  });
  return found === undefined
    ? undefined
    : `The options read ${found} from this file; move it and the options into a Better Auth file by hand.`;
}

/**
 * Copies the imports the options read, and drops them from the service when only the options
 * used them.
 * @param source - Parsed service file.
 * @param options - Options object.
 * @returns Import lines for the new file and removal edits for the service file.
 */
function carriedImports(source: CodeSource, options: ts.ObjectLiteralExpression) {
  const lines: string[] = [];
  const removals: TextEdit[] = [];
  const inside = (node: ts.Node) => node.pos >= options.pos && node.end <= options.end;
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) continue;
    const module = statement.moduleSpecifier.getText(source);
    const names: { text: string; node: ts.Node; spec: string; default: boolean }[] = [];
    const clause = statement.importClause;
    if (clause.name)
      names.push({
        text: clause.name.text,
        node: clause.name,
        spec: clause.name.text,
        default: true,
      });
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings))
      for (const element of bindings.elements)
        names.push({
          text: element.name.text,
          node: element,
          spec: element.getText(source),
          default: false,
        });
    const used = names.filter((name) => bindingReferences(source, name.text).some(inside));
    if (used.length === 0) continue;
    const head = used.find((name) => name.default)?.spec;
    const named = used.filter((name) => !name.default).map((name) => name.spec);
    const parts = [head, named.length ? `{ ${named.join(", ")} }` : undefined].filter(Boolean);
    lines.push(`import ${parts.join(", ")} from ${module.replace(/^(['"])\.\//, "$1./")};`);
    const only = used.filter((name) => bindingReferences(source, name.text).every(inside));
    if (only.length === names.length) {
      const end =
        source.getFullText()[statement.getEnd()] === "\n"
          ? statement.getEnd() + 1
          : statement.getEnd();
      removals.push({ start: statement.getStart(source), end, text: "" });
    }
  }
  return { lines, removals };
}
