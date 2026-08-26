import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const publicApis = [
  ["packages/app/src/config.ts", "defineConfig"],
  ["packages/schema/src/builder.ts", "z"],
  ["packages/schema/src/standard-schema.ts", "validate"],
  ["packages/functions/src/define-error.ts", "defineError"],
  ["packages/functions/src/define-function.ts", "defineFunction"],
  ["packages/services/src/define-service.ts", "defineService"],
  ["packages/services/src/service-middleware.ts", "defineServiceMiddleware"],
  ["packages/routes/src/define-route.ts", "defineRoute"],
  ["packages/routes/src/define-middleware.ts", "defineMiddleware"],
  ["packages/routes/src/http-dsl.ts", "http"],
  ["packages/events/src/define-event.ts", "defineEvent"],
  ["packages/events/src/on-event.ts", "onEvent"],
  ["packages/events/src/selectors.ts", "events"],
  ["packages/jobs/src/define-job.ts", "defineJob"],
  ["packages/buckets/src/define-bucket.ts", "defineBucket"],
  ["packages/cache/src/define-cache.ts", "defineCache"],
  ["packages/tools/src/define-tool.ts", "defineTool"],
  ["packages/agents/src/define-agent.ts", "defineAgent"],
  ["packages/testing/src/invoke-function.ts", "invokeFunction"],
  ["packages/testing/src/application.ts", "createTestApplication"],
] as const;

const failures: string[] = [];
for (const [path, name] of publicApis) {
  const source = await readFile(resolve(root, path), "utf8");
  const match = new RegExp(
    `export\\s+(?:async\\s+)?(?:function|const|class)\\s+${escapeRegExp(name)}\\b`,
  ).exec(source);
  if (match === null) {
    failures.push(`${path}: missing public export ${name}`);
    continue;
  }
  const before = source.slice(0, match.index);
  const close = before.lastIndexOf("*/");
  const open = before.lastIndexOf("/**");
  const doc =
    open >= 0 && close > open && before.slice(close + 2).trim() === ""
      ? before.slice(open, close + 2)
      : "";
  const missing = [
    ["description", hasDescription(doc)],
    ["@category", doc.includes("@category ")],
    ["@since", doc.includes("@since ")],
    ["executable @example", doc.includes("@example") && doc.includes("```ts")],
  ]
    .filter(([, present]) => !present)
    .map(([label]) => label);
  if (missing.length > 0) failures.push(`${path}:${name} missing ${missing.join(", ")}`);
}

if (failures.length > 0) throw new Error(`Public API JSDoc check failed:\n${failures.join("\n")}`);
console.log(`Checked rich JSDoc for ${publicApis.length} public authoring APIs.`);

function hasDescription(doc: string): boolean {
  return doc
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*\/\*\*?\s?/, "")
        .replace(/^\s*\*\/?\s?/, "")
        .trim(),
    )
    .some((line) => line !== "" && !line.startsWith("@") && !line.startsWith("```"));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
