import type { ClientRoute } from "./generate-request-statements.types.js";
import { canonicalJson } from "@relkit/contracts";
import { Effect } from "effect";
import { routeParameterCalculations } from "./route-parameters.js";
const bodyKinds = ["body", "whole-body", "multipart", "multipart-all", "constant"];
/** Detects whether a route has any body mappings.
 * @param route - Resolved public HTTP route.
 * @returns An Effect yielding a boolean; it has no expected failure.
 * @example Effect.runSync(hasBodyEffect(route));
 */
export const hasBodyEffect = Effect.fnUntraced(function* (route: ClientRoute) {
  return route.fields.some((field) => bodyKinds.includes(field.kind));
});
/** Renders substitutions for named and catch-all path segments.
 * @param route - Resolved public HTTP route.
 * @returns An Effect yielding path statements; it has no expected failure.
 * @example Effect.runSync(pathStatementsEffect(route));
 */
export const pathStatementsEffect = Effect.fnUntraced(function* (route: ClientRoute) {
  const lines: string[] = [];
  for (const { segment, name, kind } of yield* routeParameterCalculations.parseEffect(
    route.trigger.config.path,
  )) {
    const field = route.fields.find((entry) => entry.kind === kind && entry.name === name);
    const path = field?.inputPath ?? [name];
    lines.push(
      kind === "path-segments"
        ? `      path = replacePathSegments(path, ${JSON.stringify(segment)}, readPath(input, ${canonicalJson(path)}));`
        : `      path = path.replace(${JSON.stringify(segment)}, encodeURIComponent(String(readPath(input, ${canonicalJson(path)}))));`,
    );
  }
  return lines;
});
/** Renders query append calls in mapping order.
 * @param route - Resolved public HTTP route.
 * @returns An Effect yielding query statements; it has no expected failure.
 * @example Effect.runSync(queryStatementsEffect(route));
 */
export const queryStatementsEffect = Effect.fnUntraced(function* (route: ClientRoute) {
  const lines: string[] = [];
  let index = 0;
  for (const field of route.fields) {
    if (field.kind !== "query") continue;
    const path = canonicalJson(field.inputPath);
    const name = JSON.stringify(field.name ?? field.outputPath.at(-1) ?? `query${index}`);
    lines.push(`      appendQuery(query, ${name}, readPath(input, ${path}));`);
    index++;
  }
  return lines;
});
/** Renders header and cookie assignments for one route.
 * @param route - Resolved public HTTP route.
 * @returns An Effect yielding header statements; it has no expected failure.
 * @example Effect.runSync(headerStatementsEffect(route));
 */
export const headerStatementsEffect = Effect.fnUntraced(function* (route: ClientRoute) {
  const headers = route.fields.filter((field) => field.kind === "header");
  const cookies = route.fields.filter((field) => field.kind === "cookie");
  const lines = headers.map(
    (field, index) =>
      `      setHeader(headers, ${JSON.stringify(field.name ?? `header${index}`)}, readPath(input, ${canonicalJson(field.inputPath)}));`,
  );
  if (cookies.length > 0) {
    lines.push("      const cookies: string[] = [];");
    for (const [index, field] of cookies.entries())
      lines.push(
        `      appendCookie(cookies, ${JSON.stringify(field.name ?? `cookie${index}`)}, readPath(input, ${canonicalJson(field.inputPath)}));`,
      );
    lines.push('      if (cookies.length > 0) headers.cookie = cookies.join("; ");');
  }
  return lines;
});
/** Renders JSON, whole-body, or multipart body construction.
 * @param route - Resolved public HTTP route.
 * @returns An Effect yielding body statements; it has no expected failure.
 * @example Effect.runSync(bodyStatementsEffect(route));
 */
export const bodyStatementsEffect = Effect.fnUntraced(function* (route: ClientRoute) {
  if (!(yield* hasBodyEffect(route))) return [] as string[];
  const fields = route.fields.filter((field) => bodyKinds.includes(field.kind));
  const lines = ["      let requestBody: string | FormData | undefined;"];
  const whole = fields.filter((field) => field.kind === "whole-body");
  if (whole.length === 1 && fields.length === 1) {
    lines.push(
      `      const wholeBody = readPath(input, ${canonicalJson(whole[0]!.inputPath)});`,
      "      if (wholeBody !== undefined) requestBody = JSON.stringify(wholeBody);",
    );
    return lines;
  }
  if (fields.some((field) => field.kind === "multipart" || field.kind === "multipart-all")) {
    lines.push("      const form = new FormData();");
    for (const [index, field] of fields.entries()) {
      const value =
        field.kind === "constant"
          ? canonicalJson(field.value)
          : `readPath(input, ${canonicalJson(field.inputPath)})`;
      lines.push(
        `      appendFormValue(form, ${JSON.stringify(field.name ?? field.outputPath.at(-1) ?? `field${index}`)}, ${value});`,
      );
    }
    lines.push("      requestBody = form;");
    return lines;
  }
  lines.push("      const payload: Record<string, unknown> = {};");
  for (const field of fields) {
    const value =
      field.kind === "constant"
        ? canonicalJson(field.value)
        : `readPath(input, ${canonicalJson(field.inputPath)})`;
    lines.push(`      setBodyValue(payload, ${canonicalJson(field.outputPath)}, ${value});`);
  }
  lines.push(
    '      headers["content-type"] = "application/json";',
    "      requestBody = JSON.stringify(payload);",
  );
  return lines;
});
