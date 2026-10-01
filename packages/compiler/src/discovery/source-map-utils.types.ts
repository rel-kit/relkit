import type * as ts from "typescript";
import type { ExportFacts } from "./source-facts-types.js";

/** Trusted TypeScript AST and its discovery facts, owned by one mapping invocation. */
export interface ParsedSource {
  readonly sourceFile: ts.SourceFile;
  readonly facts: ExportFacts;
}
