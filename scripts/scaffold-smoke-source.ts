import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const forbidden =
  "effect hono next @pulumi/ @aws-sdk/ @relkit/compiler @relkit/engine @relkit/graph " +
  "@relkit/runtime-effect @relkit/runtime-hono @relkit/supervisor";
const pattern = createPattern(forbidden);
const webPattern = createPattern(forbidden.replace("next ", ""));

export async function scanGeneratedSource(root: string): Promise<void> {
  const scan = async (directory: string): Promise<string[]> => {
    const result: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", ".next", ".relkit"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) result.push(...(await scan(path)));
      else if (entry.isFile() && /\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
        const name = relative(root, path).replaceAll("\\", "/");
        if ((name.startsWith("web/") ? webPattern : pattern).test(await readFile(path, "utf8")))
          result.push(name);
      }
    }
    return result;
  };
  const violations = await scan(root);
  if (violations.length > 0)
    throw new Error(`Generated source scan failed:\n${violations.join("\n")}`);
}

function createPattern(values: string): RegExp {
  return new RegExp(`(?:from|import)\\s*["'](?:${values.split(" ").join("|")})`);
}
