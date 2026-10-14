/** Runs observable source syntax scanning while keeping native exclusion matching separate. */
import { Effect } from "effect";
import * as ts from "typescript";
import { observeCompiler } from "../observability.js";
import { scriptKind } from "./ast-prefilter-syntax.js";
import type { AstPrefilterCandidate } from "./ast-prefilter.types.js";
import { runDiscoverySync } from "./discovery-sync.js";
import { readFactsEffect } from "./source-facts.js";
import {
  INDICATOR_ORDER,
  scanSourceNode,
  sourceScanNodes,
  sourceScanState,
} from "./ast-prefilter-scan.js";
export { matchesExclude, matchesExcludeEffect } from "./ast-prefilter-excludes.js";

/**
 * Runs a syntax scan for legacy synchronous callers.
 * @param fileName - Physical filename retained in diagnostics.
 * @param text - Unevaluated authored source.
 * @returns Candidate evidence; ordinary helpers have no descriptor indicator.
 */
export function scanSource(fileName: string, text: string): AstPrefilterCandidate {
  return runDiscoverySync(scanSourceEffect(fileName, text));
}

/**
 * Collects deterministic syntax evidence with no application-module evaluation.
 * @param fileName - Physical filename selecting the parser syntax mode.
 * @param text - Complete authored text, including incomplete edits.
 * @returns Lazy immutable evidence; parser defects remain visible.
 */
export const scanSourceEffect = Effect.fn("Discovery.scanSource")(
  function* (fileName: string, text: string) {
    const source = ts.createSourceFile(
      fileName,
      text,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(fileName),
    );
    const state = sourceScanState();
    yield* Effect.forEach(sourceScanNodes(source), (node) => scanSourceNode(state, node), {
      discard: true,
    });
    return Object.freeze({
      fileName,
      imports: Object.freeze([...state.imports].sort()),
      factories: Object.freeze([...state.factories].sort()),
      defaultExports: Object.freeze([...state.defaultExports].sort()),
      brandAccess: state.brandAccess,
      reExports: Object.freeze(
        state.reExports.sort((left, right) =>
          left.moduleSpecifier.localeCompare(right.moduleSpecifier),
        ),
      ),
      facts: yield* readFactsEffect(source),
      indicators: Object.freeze(
        INDICATOR_ORDER.filter((indicator) => state.indicators.has(indicator)),
      ),
    }) satisfies AstPrefilterCandidate;
  },
  (effect, _fileName, text) =>
    observeCompiler(
      "discovery",
      "scanSource",
      effect,
      () => ({ files: 1, bytes: Buffer.byteLength(text, "utf8") }),
      false,
    ),
);
