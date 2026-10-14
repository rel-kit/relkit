/** Uses effective TypeScript resolution for import edits; computed references block publication. */
import * as ts from "typescript";
import { SourceResolution } from "@relkit/compiler";
import { Effect } from "effect";
import { observeCli } from "../cli-runtime.js";
import { layoutSourceSyntax } from "./layout-source-syntax.js";
import {
  applyTextEdits,
  rewrittenModule,
  rewrittenSourceUrl,
  rewrittenToolPath,
} from "./layout-rewrite-paths.js";
import type { MigrationFinding, MigrationMove } from "./layout.types.js";
import type { LayoutRewrite, LayoutTextEdit } from "./layout-rewrite.types.js";

/**
 * Rewrites source tokens through the shared resolver without executing any module.
 * @param file - Original project-relative filename.
 * @param text - Complete authored source.
 * @param moves - Complete selected service moves.
 * @returns Candidate text plus explicit unsupported-reference conflicts.
 */
export const rewriteLayoutSource = Effect.fn("Migration.rewriteSource")(
  function* (
    file: string,
    text: string,
    moves: readonly MigrationMove[],
  ): Effect.fn.Return<LayoutRewrite, never, SourceResolution> {
    const resolver = yield* SourceResolution;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const { references, urls, tooling, conflicts } = layoutSourceSyntax(source, moves);
    const edits: LayoutTextEdit[] = [];
    for (const literal of references) {
      const target = yield* resolver.resolve(file, literal.text);
      if (target.kind === "source")
        appendLiteral(
          edits,
          source,
          literal,
          rewrittenModule(file, target.file, literal.text, moves),
        );
      else if (target.kind === "unresolved" && target.application)
        conflicts.push({
          file,
          message: `Unresolved application import ${literal.text}; resolve it before migration.`,
        });
    }
    for (const literal of urls)
      appendLiteral(edits, source, literal, rewrittenSourceUrl(file, literal.text, moves));
    for (const literal of tooling.filter(
      (literal) => !references.includes(literal) && !urls.includes(literal),
    )) {
      if (knownToolingLiteral(literal))
        appendLiteral(edits, source, literal, rewrittenToolPath(literal.text, moves));
      else
        conflicts.push({
          file,
          message: `Ambiguous path literal at ${source.getLineAndCharacterOfPosition(literal.getStart(source)).line + 1}; update manually.`,
        });
    }
    return { text: applyTextEdits(text, edits), conflicts };
  },
  (effect) => observeCli("migration.rewrite.source", effect),
);

/**
 * Recognizes explicit schema configuration and filesystem API path positions.
 * @param literal - Authored path token.
 * @returns Whether its syntax establishes a tooling path rather than user data.
 */
function knownToolingLiteral(literal: ts.StringLiteralLike): boolean {
  let parent = literal.parent;
  if (ts.isArrayLiteralExpression(parent)) parent = parent.parent;
  if (ts.isPropertyAssignment(parent)) {
    const name = parent.name.getText().replace(/^["']|["']$/g, "");
    if (name === "schema") return true;
    if (/(?:codegen|drizzle)[^/]*\.[cm]?[jt]s$/.test(literal.getSourceFile().fileName))
      return ["input", "entry", "source", "schemaPath"].includes(name);
  }
  if (!ts.isCallExpression(parent)) return false;
  return /^(?:Bun\.file|readFile|readFileSync|writeFile|writeFileSync|stat|existsSync|resolve|join|new URL)$/.test(
    parent.expression.getText(),
  );
}

/**
 * Adds a changed literal token without altering surrounding comments or syntax.
 * @param edits - Invocation-local offset buffer.
 * @param source - Parsed original module.
 * @param literal - Exact original token.
 * @param replacement - Candidate literal value.
 * @returns No value.
 */
function appendLiteral(
  edits: LayoutTextEdit[],
  source: ts.SourceFile,
  literal: ts.StringLiteralLike,
  replacement: string,
): void {
  if (replacement !== literal.text)
    edits.push({
      start: literal.getStart(source),
      end: literal.getEnd(),
      text: JSON.stringify(replacement),
    });
}
