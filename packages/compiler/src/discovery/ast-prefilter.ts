import { normalizeSourcePath } from "@relkit/contracts";
import { DEFAULT_TOOLING_CONFIG } from "../config-loader-types.js";
import { matchesExclude, scanSource } from "./ast-prefilter-utils.js";
import type { SourceFacts } from "./source-facts.js";

export type AstCandidateIndicator =
  "relkit-import" | "factory" | "default-export" | "brand-access" | "re-export";

export interface AstSourceModule {
  readonly fileName: string;
  readonly text: string;
}

export interface AstReExport {
  readonly moduleSpecifier: string;
  readonly names: readonly string[];
  readonly exportAll: boolean;
}

export interface AstPrefilterCandidate {
  readonly fileName: string;
  readonly imports: readonly string[];
  readonly factories: readonly string[];
  readonly defaultExports: readonly string[];
  readonly brandAccess: boolean;
  readonly reExports: readonly AstReExport[];
  readonly facts: SourceFacts;
  readonly indicators: readonly AstCandidateIndicator[];
}

export interface AstPrefilterSkipped {
  readonly fileName: string;
  readonly reason: "excluded" | "no-candidate-indicator";
}

export interface AstPrefilterOptions {
  readonly projectRoot?: string;
  readonly exclude?: readonly string[];
}

export interface AstPrefilterResult {
  readonly candidates: readonly AstPrefilterCandidate[];
  readonly skipped: readonly AstPrefilterSkipped[];
}

/** Finds possible descriptor modules from syntax only; it never imports source files. */
export function prefilterSources(
  modules: readonly AstSourceModule[],
  options: AstPrefilterOptions = {},
): AstPrefilterResult {
  const excludes = options.exclude ?? DEFAULT_TOOLING_CONFIG.exclude;
  const ordered = modules
    .map((module) => ({
      fileName: normalizeSourcePath(module.fileName, options.projectRoot),
      text: module.text,
    }))
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
  const candidates: AstPrefilterCandidate[] = [];
  const skipped: AstPrefilterSkipped[] = [];

  for (const module of ordered) {
    if (matchesExclude(module.fileName, excludes)) {
      skipped.push({ fileName: module.fileName, reason: "excluded" });
      continue;
    }
    const facts = scanSource(module.fileName, module.text);
    if (facts.indicators.length === 0) {
      skipped.push({ fileName: module.fileName, reason: "no-candidate-indicator" });
    } else {
      candidates.push(facts);
    }
  }

  return Object.freeze({
    candidates: Object.freeze(candidates),
    skipped: Object.freeze(skipped),
  });
}
