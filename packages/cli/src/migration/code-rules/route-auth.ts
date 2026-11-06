/**
 * Rule `route-auth`: the Better Auth route's `auth: { protected: [...] }` list was replaced by
 * `auth: "required"` on each route. The rule reads every protected pattern in the project,
 * adds `auth: "required"` to the `defineRoute` calls and `defineServiceRoutes` entries of route
 * modules whose path matches, and removes the list. Patterns no route module matches (such as
 * `/mcp`, now `server.mcp: { auth: "required" }`) are reported.
 */
import { codeSyntax as ts, parseCodeSource } from "../code-parser.js";
import {
  appendProperty,
  applyTextEdits,
  findingAt,
  objectProperty,
  removeProperty,
  type TextEdit,
} from "../code-edits.js";
import type { CodeFinding, CodeRule, CodeRuleContext } from "../code-migration.types.js";
import { defineCalls, relkitLocals } from "./rule-support.js";

const id = "route-auth";

export const routeAuthRule: CodeRule = {
  id,
  summary: 'Require sessions per route with auth: "required"',
  guide: "route-auth",
  appliesTo: (path) => /\.[cm]?[jt]sx?$/.test(path) && !/\.d\.[cm]?ts$/.test(path),
  apply: (file, context) => {
    const source = parseCodeSource(file.path, file.text);
    const edits: TextEdit[] = [];
    const findings: CodeFinding[] = [];
    const patterns = protectedPatterns(context);
    const path = routePath(file.path);
    const routes = defineCalls(source, relkitLocals(source, "defineRoute"));
    for (const { options } of routes) {
      const auth = objectProperty(options, "auth");
      const list =
        auth && ts.isPropertyAssignment(auth) && ts.isObjectLiteralExpression(auth.initializer)
          ? objectProperty(auth.initializer, "protected")
          : undefined;
      if (auth && list) {
        edits.push(removeProperty(source, auth));
        for (const pattern of patterns)
          if (!matchedByRoute(context, pattern))
            findings.push(
              findingAt(
                source,
                auth,
                id,
                pattern === "/mcp"
                  ? 'Protect the MCP endpoint with defineApp({ server: { mcp: { auth: "required" } } }).'
                  : `No route module matches ${pattern}; add auth: "required" to the routes it protected.`,
              ),
            );
        continue;
      }
      if (
        path === undefined ||
        auth !== undefined ||
        objectProperty(options, "target") === undefined
      )
        continue;
      if (patterns.some((pattern) => matches(pattern, path)))
        edits.push(appendProperty(source, options, 'auth: "required"'));
    }
    if (path !== undefined && patterns.some((pattern) => matches(pattern, path)))
      edits.push(...serviceRouteAuth(source));
    return { text: applyTextEdits(file.text, edits), findings };
  },
};

/**
 * Collects every protected pattern declared in the project.
 * @param context - Project sources.
 * @returns Patterns such as `/orders/*`.
 */
function protectedPatterns(context: CodeRuleContext): string[] {
  const patterns: string[] = [];
  for (const text of context.sources.values()) {
    const list = /\bprotected\s*:\s*\[([^\]]*)\]/.exec(text)?.[1];
    if (list === undefined || !text.includes("defineRoute")) continue;
    for (const match of list.matchAll(/["'`]([^"'`]+)["'`]/g)) patterns.push(match[1]!);
  }
  return patterns;
}

/**
 * Maps a route module path to its URL path.
 * @param file - Project-relative path.
 * @returns `/orders/:orderId` for `src/routes/orders/[orderId]/route.ts`, else undefined.
 */
function routePath(file: string): string | undefined {
  const match = /^src\/routes\/(.*?)\/?route\.[cm]?[jt]sx?$/.exec(file);
  if (match === null) return undefined;
  const segments = (match[1] ?? "")
    .split("/")
    .filter((segment) => segment !== "" && !/^\(.*\)$/.test(segment))
    .map((segment) =>
      segment.startsWith("[[...") || segment.startsWith("[...")
        ? "*"
        : segment.replace(/^\[(.+)\]$/, ":$1"),
    );
  return `/${segments.join("/")}`;
}

/**
 * Tells whether a protected pattern covers a route path.
 * @param pattern - `/orders/*` (the folder and below) or an exact path.
 * @param path - Route path.
 * @returns True when the pattern protects the path.
 */
function matches(pattern: string, path: string): boolean {
  if (pattern.endsWith("/*")) {
    const base = pattern.slice(0, -2);
    return path === base || path.startsWith(`${base}/`);
  }
  return path === pattern;
}

/**
 * Tells whether any route module in the project is covered by a pattern.
 * @param context - Project sources.
 * @param pattern - Protected pattern.
 * @returns True when the rule adds `auth` to at least one route for it.
 */
function matchedByRoute(context: CodeRuleContext, pattern: string): boolean {
  for (const file of context.sources.keys()) {
    const path = routePath(file);
    if (path !== undefined && matches(pattern, path)) return true;
  }
  return false;
}

/**
 * Requires a session on every entry of the module's service route maps.
 * @param source - Parsed route module.
 * @returns Edits turning `"member"` into `{ member: "member", auth: "required" }`.
 */
function serviceRouteAuth(source: ts.SourceFile): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const { call } of defineCalls(source, relkitLocals(source, "defineServiceRoutes"), 1))
    for (const entry of (call.arguments[1] as ts.ObjectLiteralExpression).properties) {
      if (!ts.isPropertyAssignment(entry)) continue;
      const value = entry.initializer;
      if (ts.isStringLiteralLike(value))
        edits.push({
          start: value.getStart(source),
          end: value.getEnd(),
          text: `{ member: ${value.getText(source)}, auth: "required" }`,
        });
      else if (ts.isObjectLiteralExpression(value) && objectProperty(value, "auth") === undefined)
        edits.push(appendProperty(source, value, 'auth: "required"'));
    }
  return edits;
}
