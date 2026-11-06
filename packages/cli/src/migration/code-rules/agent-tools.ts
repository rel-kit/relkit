/**
 * Splits an agent's `tools` array into RelKit tool references and LangChain tools by syntax:
 * where each entry's binding is imported from (`*.tool` modules versus `langchain`,
 * `@langchain/*` or `deepagents`) or which factory created it (`defineTool` versus a LangChain
 * import). One entry it cannot classify makes the whole array unsplittable, because only types
 * tell them apart and the codemod does not type-check.
 */
import { codeSyntax as ts, type CodeSource } from "../code-parser.js";
import { importModule } from "./descriptor-bindings.js";
import { relkitLocals } from "./rule-support.js";

type ToolKind = "relkit" | "langchain" | undefined;

/**
 * Splits a tools array.
 * @param source - Parsed file.
 * @param array - The `tools` array literal.
 * @returns Entry texts by kind, or undefined when any entry is ambiguous.
 */
export function splitTools(source: CodeSource, array: ts.ArrayLiteralExpression) {
  const relkit: string[] = [];
  const langchain: string[] = [];
  for (const element of array.elements) {
    const kind = classify(source, element);
    if (kind === undefined) return undefined;
    (kind === "relkit" ? relkit : langchain).push(element.getText(source));
  }
  return { relkit, langchain };
}

/**
 * Classifies one tools entry.
 * @param source - Parsed file.
 * @param element - Array entry.
 * @returns Its kind, or undefined when the syntax does not tell.
 */
function classify(source: CodeSource, element: ts.Expression): ToolKind {
  if (ts.isIdentifier(element)) {
    const module = importModule(source, element.text);
    if (module !== undefined) return moduleKind(module);
    const initializer = localInitializer(source, element.text);
    return initializer === undefined ? undefined : classify(source, initializer);
  }
  if (ts.isCallExpression(element) || ts.isNewExpression(element)) {
    const callee = element.expression;
    if (!ts.isIdentifier(callee)) return undefined;
    if (relkitLocals(source, "defineTool").has(callee.text)) return "relkit";
    const module = importModule(source, callee.text);
    return module !== undefined && moduleKind(module) === "langchain" ? "langchain" : undefined;
  }
  return undefined;
}

/**
 * Classifies a module an entry is imported from.
 * @param module - Module specifier.
 * @returns `relkit` for tool modules, `langchain` for LangChain packages.
 */
function moduleKind(module: string): ToolKind {
  if (/^(?:langchain|deepagents)(?:\/|$)|^@langchain\//.test(module)) return "langchain";
  if (/\.tool(?:\.[cm]?[jt]sx?)?$/.test(module)) return "relkit";
  return undefined;
}

/**
 * Reads the initializer of a top-level `const`.
 * @param source - Parsed file.
 * @param name - Binding name.
 * @returns The initializer expression, if declared at the top level.
 */
function localInitializer(source: CodeSource, name: string): ts.Expression | undefined {
  for (const statement of source.statements)
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations)
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name)
          return declaration.initializer;
  return undefined;
}
