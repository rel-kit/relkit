/**
 * Rule `agent-runtime`: `defineAgent` from `@relkit/langchain` was removed; agents use
 * `defineAgent` from `relkit/agents` with `runtime: langchain({ ... })`. LangChain's native
 * options (middleware, persistence, DeepAgents fields, a non-string model and LangChain tools)
 * move inside `langchain(...)`; portable fields stay. A `tools` array whose entries the rule
 * cannot tell apart by their imports stays where it is and is reported.
 */
import { codeSyntax as ts, parseCodeSource, type CodeSource } from "../code-parser.js";
import {
  applyTextEdits,
  findingAt,
  indentOf,
  literalText,
  objectProperty,
  removeProperty,
  type TextEdit,
} from "../code-edits.js";
import { addNamedImport, namedImports } from "../code-imports.js";
import type { CodeFinding, CodeRule } from "../code-migration.types.js";
import { defineCalls } from "./rule-support.js";
import { splitTools } from "./agent-tools.js";

const id = "agent-runtime";
const nativeKeys = [
  "middleware",
  "checkpointer",
  "store",
  "subagents",
  "skills",
  "memory",
  "backend",
  "interruptOn",
];
const agentNames = ["defineAgent", "defineAgentEffect"];

export const agentRuntimeRule: CodeRule = {
  id,
  summary: "Select the LangChain adapter with defineAgent({ runtime: langchain() })",
  guide: "agent-runtime",
  markdown: true,
  appliesTo: (path) => /\.[cm]?[jt]sx?$/.test(path),
  apply: (file) => {
    const source = parseCodeSource(file.path, file.text);
    const imports = namedImports(source, (module) => module === "@relkit/langchain");
    const moved = imports.filter((entry) => agentNames.includes(entry.imported));
    if (moved.length === 0) return { text: file.text, findings: [] };
    const edits: TextEdit[] = [];
    const findings: CodeFinding[] = [];
    for (const { call, options } of defineCalls(source, new Set(moved.map((entry) => entry.local))))
      edits.push(...rewriteAgent(source, call, options, findings));
    edits.push(...rewriteImports(source, imports, moved));
    return { text: applyTextEdits(file.text, edits), findings };
  },
};

/**
 * Moves one agent's native options into `runtime: langchain({ ... })`.
 * @param source - Parsed file.
 * @param call - The `defineAgent(...)` call.
 * @param options - Its options object.
 * @param findings - Collector for tool arrays it cannot split.
 * @returns Removal edits for native options and the runtime insertion.
 */
function rewriteAgent(
  source: CodeSource,
  call: ts.CallExpression,
  options: ts.ObjectLiteralExpression,
  findings: CodeFinding[],
): TextEdit[] {
  if (objectProperty(options, "runtime") !== undefined) return [];
  const edits: TextEdit[] = [];
  const native: string[] = [];
  for (const property of options.properties) {
    const name = property.name === undefined ? undefined : property.name.getText(source);
    const value = ts.isPropertyAssignment(property) ? property.initializer : undefined;
    const isNativeModel =
      name === "model" && value !== undefined && literalText(value) === undefined;
    if (name === undefined || !(nativeKeys.includes(name) || isNativeModel)) continue;
    native.push(reindent(source, property));
    edits.push(removeProperty(source, property));
  }
  const tools = objectProperty(options, "tools");
  if (tools && ts.isPropertyAssignment(tools) && ts.isArrayLiteralExpression(tools.initializer)) {
    const split = splitTools(source, tools.initializer);
    if (split === undefined)
      findings.push(
        findingAt(
          source,
          tools,
          id,
          "These tools mix RelKit and LangChain tools the codemod cannot tell apart; keep RelKit tools in tools and move LangChain tools into langchain({ tools }).",
        ),
      );
    else if (split.langchain.length > 0) {
      native.push(`tools: [${split.langchain.join(", ")}]`);
      if (split.relkit.length === 0) edits.push(removeProperty(source, tools));
      else
        edits.push({
          start: tools.initializer.getStart(source),
          end: tools.initializer.getEnd(),
          text: `[${split.relkit.join(", ")}]`,
        });
    }
  }
  const first = options.properties[0];
  const line = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line;
  const multiline = first !== undefined && line(first) !== line(options);
  const indent = indentOf(source, first ?? call);
  let runtime = "runtime: langchain()";
  if (native.length > 0)
    runtime = multiline
      ? `runtime: langchain({\n${native.map((entry) => `${indent}  ${entry},`).join("\n")}\n${indent}})`
      : `runtime: langchain({ ${native.join(", ")} })`;
  const idProperty = objectProperty(options, "id");
  if (first === undefined)
    return [{ start: options.getStart(source), end: options.getEnd(), text: `{ ${runtime} }` }];
  if (idProperty === undefined) {
    const start = first.getStart(source);
    return [...edits, { start, end: start, text: `${runtime},${multiline ? `\n${indent}` : " "}` }];
  }
  const text = source.getFullText();
  const comma = text[idProperty.getEnd()] === ",";
  const at = comma ? idProperty.getEnd() + 1 : idProperty.getEnd();
  const lead = comma ? "" : ",";
  return [
    ...edits,
    {
      start: at,
      end: at,
      text: multiline ? `${lead}\n${indent}${runtime},` : `${lead} ${runtime},`,
    },
  ];
}

/**
 * Indents a moved property's continuation lines one level deeper.
 * @param source - Parsed file.
 * @param property - Property being moved into `langchain({ ... })`.
 * @returns Its text with nested lines shifted by two spaces.
 */
function reindent(source: CodeSource, property: ts.Node): string {
  return property.getText(source).replace(/\n/g, "\n  ");
}

/**
 * Replaces the `@relkit/langchain` agent imports with `relkit/agents` and adds `langchain`.
 * @param source - Parsed file.
 * @param imports - Every named import from `@relkit/langchain`.
 * @param moved - The agent imports that move.
 * @returns Import edits.
 */
function rewriteImports(
  source: CodeSource,
  imports: ReturnType<typeof namedImports>,
  moved: typeof imports,
): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const entry of moved) {
    const add = addNamedImport(
      source,
      "relkit/agents",
      entry.local === entry.imported ? entry.imported : `${entry.imported} as ${entry.local}`,
    );
    if (add) edits.push(add);
  }
  const declaration = moved[0]!.declaration;
  const kept = imports
    .filter((entry) => entry.declaration === declaration && !moved.includes(entry))
    .map((entry) => entry.specifier.getText(source));
  if (!imports.some((entry) => entry.imported === "langchain")) kept.push("langchain");
  edits.push({
    start: declaration.getStart(source),
    end: declaration.getEnd(),
    text: `import { ${kept.join(", ")} } from "@relkit/langchain";`,
  });
  return edits;
}
