/**
 * Contracts shared by `relkit migrate` codemod rules, the planner that runs them over a project
 * and the transaction that publishes or rolls back their edits. Rules are pure text transforms:
 * they receive one file plus read-only project facts and return new text, files to create and
 * findings for code they could not change.
 */

/** One authored text file a rule reads or creates, by project-relative path. */
export interface CodeFile {
  readonly path: string;
  readonly text: string;
}

/** Code a rule saw but could not change, located for the person running the migration. */
export interface CodeFinding {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly message: string;
}

/** A rule's output for one file; `created` files must not exist yet. */
export interface CodeRuleResult {
  readonly text: string;
  readonly findings: readonly CodeFinding[];
  readonly created?: readonly CodeFile[];
}

/** Where a module specifier of the 0.8 packages points in 0.9, or why it has no target. */
export type PackageTarget =
  | { readonly kind: "moved"; readonly specifier: string; readonly packageName: string }
  | { readonly kind: "removed"; readonly reason: string };

/** Read-only project facts that rules consult; tests supply them directly. */
export interface CodeRuleContext {
  /** Every authored source file, so rules can find declarations in other files. */
  readonly sources: ReadonlyMap<string, string>;
  /** Absolute project root, used for source-derived identities. */
  readonly root: string;
  /** Names the curated `relkit` root exports; others need a subpath. */
  readonly rootExports: ReadonlySet<string>;
  /** Export subpath keys (`.`, `./schema`) of the 0.9 packages, when they could be read. */
  readonly packageExports?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Client hook keys (route IDs and `METHOD /path` selectors) mapped to `api` paths. */
  readonly clientRoutes?: ReadonlyMap<string, string>;
  /** The release version written for added `relkit` dependencies. */
  readonly version: string;
}

/** One codemod: a breaking change of the 0.9 release and how to rewrite it. */
export interface CodeRule {
  /** Stable rule ID; the release check maps breaking changesets to these. */
  readonly id: string;
  /** One line shown in the preview and the migration guide. */
  readonly summary: string;
  /** Migration guide anchor for this rule's section. */
  readonly guide: string;
  /** Whether the rule also rewrites TypeScript code fences in Markdown and MDX guidance. */
  readonly markdown?: boolean;
  /** Whether the rule reads this file at all (extension and path filter). */
  readonly appliesTo: (path: string) => boolean;
  /** Rewrites one file; must return the input text unchanged when nothing applies. */
  readonly apply: (file: CodeFile, context: CodeRuleContext) => CodeRuleResult;
}

/** One planned change to a file: `before` is undefined for a file the migration creates. */
export interface CodeChange {
  readonly path: string;
  readonly before: string | undefined;
  readonly after: string;
  readonly rules: readonly string[];
}

/** The complete preview of a code migration over one project. */
export interface CodeMigrationPlan {
  readonly root: string;
  readonly changes: readonly CodeChange[];
  readonly findings: readonly CodeFinding[];
}

/** The secret-free result `relkit migrate` prints: changed paths and findings, never file bytes. */
export interface CodeMigrationResult {
  readonly ok: boolean;
  readonly status: "preview" | "noop" | "committed" | "rolled-back" | "refused";
  readonly changes: readonly {
    readonly path: string;
    readonly created: boolean;
    readonly rules: readonly string[];
  }[];
  readonly findings: readonly CodeFinding[];
  readonly receipt?: string;
  readonly nextSteps: readonly string[];
}

/** Options of one `relkit migrate` code run. */
export interface CodeMigrationOptions {
  /** Client contract used to name `api` properties for string hook keys. */
  readonly contract?: string;
}
