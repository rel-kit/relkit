/** Defines audited constructor identities and contained import paths for static snapshot eligibility. */
import { posix } from "node:path";

export const snapshotFactories = new Map([
  ["@langchain/langgraph", new Set(["END", "MemorySaver", "START", "StateSchema", "interrupt"])],
  ["@relkit/app/agents", new Set(["defineAgent"])],
  ["@relkit/langchain", new Set(["defineAgent", "defineGraph", "defineGraphNode"])],
  ["@relkit/app/config", new Set(["defineApp", "defineEnv", "env"])],
  ["@relkit/app/functions", new Set(["defineFunction", "defineError"])],
  ["@relkit/better-auth", new Set(["defineBetterAuthService"])],
  ["@relkit/drizzle", new Set(["defineDrizzleService"])],
  [
    "drizzle-orm/sqlite-core",
    new Set(["integer", "text", "sqliteTable", "check", "primaryKey", "uniqueIndex"]),
  ],
  ["drizzle-orm", new Set(["sql"])],
  ["bun:sqlite", new Set(["Database"])],
  ["node:fs", new Set(["mkdirSync"])],
  ["node:path", new Set(["dirname"])],
  ["drizzle-orm/bun-sqlite", new Set(["drizzle"])],
  ["@relkit/app/jobs", new Set(["defineJob"])],
  ["@relkit/app/services", new Set(["defineService"])],
  ["@relkit/app/routes", new Set(["defineRoute", "defineServiceRoutes"])],
  ["@relkit/app/schema", new Set(["z"])],
  ["@relkit/app/tasks", new Set(["defineTask"])],
  ["@relkit/local", new Set(["localAgentState", "localRealtime"])],
  ["langchain", new Set(["FakeToolCallingModel", "todoListMiddleware", "tool"])],
]);

/** Detects authored files or package self-references that could shadow an audited import. */
export function isSnapshotFactoryShadow(path: string): boolean {
  const identity = path.toLowerCase();
  return [...snapshotFactories.keys()].some((module) => {
    const parts = module.split("/");
    const name = module.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
    return (
      identity === name ||
      identity.startsWith(`${name}/`) ||
      identity.replace(/\.(?:[cm]?[jt]sx?|json)$/, "") === name
    );
  });
}

/** All runtime imports and reexports stay within the audited backend source inventory. */
export function assertLocalImport(module: string, path: string): void {
  if (!(module.startsWith("@app/") || module.startsWith("./") || module.startsWith("../")))
    throw new Error("Unaudited module import");
  const resolved = module.startsWith("@app/")
    ? posix.normalize(`src/${module.slice(5)}`)
    : posix.normalize(posix.join(posix.dirname(path), module));
  if (
    !resolved.startsWith("src/") ||
    !/\.(?:[cm]?[jt]sx?)$/.test(resolved) ||
    resolved.endsWith(".d.ts") ||
    resolved
      .split("/")
      .some(
        (segment) =>
          ["tests", "web", ".relkit", "node_modules"].includes(segment) ||
          segment === ".env" ||
          segment.startsWith(".env."),
      )
  )
    throw new Error("Uncaptured local import");
}
