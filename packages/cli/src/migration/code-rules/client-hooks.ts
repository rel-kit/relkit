/**
 * Rule `client-hooks`: route hooks take `api` properties instead of string keys.
 * `useRoute("GET /orders", …)` and `useRoute("route.get.orders", …)` become
 * `useRoute(api.orders.searchOrders, …)`, with `api` imported from `@relkit/client`. The
 * mapping comes from the backend's client contract (route IDs and `METHOD /path` selectors
 * named by the same `clientApiPaths` rule the generator uses). Keys the contract does not
 * list, and every key when no contract was found, are reported.
 */
import { codeSyntax as ts, parseCodeSource } from "../code-parser.js";
import { applyTextEdits, findingAt, literalText, walk, type TextEdit } from "../code-edits.js";
import { addNamedImport, namedImports } from "../code-imports.js";
import type { CodeFinding, CodeRule } from "../code-migration.types.js";

const id = "client-hooks";
const routeHooks = new Set([
  "useRoute",
  "useSuspenseRoute",
  "useRouteMutation",
  "useInfiniteRoute",
  "useRouteUtils",
  "useStream",
]);

export const clientHooksRule: CodeRule = {
  id,
  summary: "Pass api properties to route hooks instead of string keys",
  guide: "client-hooks",
  markdown: true,
  appliesTo: (path) => /\.[cm]?[jt]sx?$/.test(path),
  apply: (file, context) => {
    const source = parseCodeSource(file.path, file.text);
    const hooks = new Set(
      namedImports(source, (module) => module.startsWith("@relkit/client"))
        .filter((entry) => routeHooks.has(entry.imported))
        .map((entry) => entry.local),
    );
    if (hooks.size === 0) return { text: file.text, findings: [] };
    const edits: TextEdit[] = [];
    const findings: CodeFinding[] = [];
    walk(source, (node) => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
      if (!hooks.has(node.expression.text)) return;
      const key = literalText(node.arguments[0]);
      if (key === undefined) return;
      const path = context.clientRoutes?.get(key);
      if (path === undefined) {
        findings.push(
          findingAt(
            source,
            node,
            id,
            context.clientRoutes === undefined
              ? `No client contract was found to name "${key}"; pass its api property, or run relkit migrate --contract <client-contract.json>.`
              : `"${key}" is not a route in the client contract; pass its api property (jobs use useJobTrigger).`,
          ),
        );
        return;
      }
      const argument = node.arguments[0]!;
      edits.push({ start: argument.getStart(source), end: argument.getEnd(), text: `api.${path}` });
    });
    if (edits.length > 0) {
      const add = addNamedImport(source, "@relkit/client", "api");
      if (add) edits.push(add);
    }
    return { text: applyTextEdits(file.text, edits), findings };
  },
};
