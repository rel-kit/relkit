/**
 * Assigns direct third-party declarations to the owners specified by Stage 1.
 * Development and documentation tools stay separate from published runtime
 * requirements; this pure classification does not certify consumer isolation.
 */

/**
 * Names the intended selected capability and package owner for an SDK edge.
 * @param dependency - Exact third-party package name.
 * @param consumer - Source consumer identity.
 * @param development - Whether the declaration is development-only.
 * @returns Responsibility and target owner, retaining ordinary private dependencies.
 */
export function dependencyOwner(dependency: string, consumer: string, development: boolean) {
  if (development) return { capability: "development", finalOwner: consumer };
  if (
    /^(?:@langchain\/|langchain$|langsmith$|deepagents$|@cfworker\/json-schema$)/.test(dependency)
  )
    return { capability: "agent-execution", finalOwner: "@relkit/langchain" };
  if (dependency.startsWith("@duckdb/"))
    return { capability: "inspection-history", finalOwner: "@relkit/observability-local" };
  if (/^@pulumi\//.test(dependency))
    return { capability: "deployment", finalOwner: "@relkit/pulumi" };
  if (/^(?:react(?:-dom)?|next)$/.test(dependency) && consumer === "@relkit/cli")
    return { capability: "legacy-inspector-ui", finalOwner: "@relkit/inspector (Stage 2)" };
  if (/^(?:@tanstack\/|@orpc\/tanstack-query$|react(?:-dom)?$)/.test(dependency))
    return {
      capability: "selected-frontend",
      finalOwner: `${consumer} explicit frontend entrypoint`,
    };
  if (/^(?:@modelcontextprotocol\/|@ag-ui\/|@scalar\/)/.test(dependency))
    return {
      capability: "selected-http-transport",
      finalOwner: "@relkit/runtime-hono optional entrypoint",
    };
  if (/^(?:better-auth|drizzle-orm|drizzle-kit|pg|mysql2|better-sqlite3)$/.test(dependency))
    return { capability: "selected-auth-database", finalOwner: consumer };
  if (dependency === "typescript" && consumer === "create-relkit")
    return { capability: "existing-project-editing", finalOwner: "@relkit/cli" };
  if (/^(?:inngest|effect-mq|@trigger.dev\/sdk|@sentry\/)/.test(dependency))
    return { capability: "selected-integration", finalOwner: consumer };
  return { capability: "required-implementation", finalOwner: consumer };
}
