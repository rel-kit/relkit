/**
 * The ordered list of `relkit migrate` codemod rules for the 0.9 release. Order matters: the
 * package rule runs first so later rules only see `relkit` specifiers, and the schema builder
 * rename runs last because other rules recognize the builder by its old name too. The release
 * check reads rule IDs from this list to require a rule for every breaking changeset.
 */
import type { CodeRule } from "../code-migration.types.js";
import { packageImportsRule } from "./package-imports.js";
import { legacyJobsRule } from "./legacy-jobs.js";
import { removedAliasesRule } from "./removed-aliases.js";
import { errorIdsRule } from "./error-ids.js";
import { dependencyDeclarationsRule } from "./dependency-declarations.js";
import { contextCallsRule } from "./context-calls.js";
import { serviceRoutesRule } from "./service-routes.js";
import { betterAuthFileRule } from "./better-auth-file.js";
import { clientHooksRule } from "./client-hooks.js";
import { agentRuntimeRule } from "./agent-runtime.js";
import { schemaBuilderRule } from "./schema-builder.js";
import { routeAuthRule } from "./route-auth.js";
import { problemDetailsRule } from "./problem-details.js";

/** Every 0.9 codemod, in the order they run. */
export const codeRules: readonly CodeRule[] = [
  packageImportsRule,
  legacyJobsRule,
  removedAliasesRule,
  errorIdsRule,
  dependencyDeclarationsRule,
  contextCallsRule,
  serviceRoutesRule,
  routeAuthRule,
  betterAuthFileRule,
  clientHooksRule,
  agentRuntimeRule,
  problemDetailsRule,
  schemaBuilderRule,
];
