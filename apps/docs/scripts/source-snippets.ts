/** Materializes repository examples inside Blume's content boundary without duplicating authorship. */
import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { nextFenceState, type FenceState } from "blume/core/code-fences.ts";
import { Effect } from "effect";
import type { Emit, SourceInclude } from "./generation.types.js";

/** Selects one named region, failing rather than publishing an incomplete example.
 * @param source - Original repository file. @param region - Optional named region.
 * @returns Source bytes suitable for a native code include. */
export function sourceRegion(source: string, region?: string): string {
  let lines = source.split("\n");
  if (region) {
    const starts = lines.flatMap((line, index) =>
      line.trim() === `// #region ${region}` ? [index] : [],
    );
    const ends = lines.flatMap((line, index) =>
      line.trim() === `// #endregion ${region}` ? [index] : [],
    );
    if (starts.length !== 1 || ends.length !== 1 || starts[0]! >= ends[0]!)
      throw new Error(`Missing, incomplete, or ambiguous source region: ${region}`);
    lines = lines.slice(starts[0]! + 1, ends[0]);
  }
  lines = lines.filter((line) => !/^\s*\/\/ #(?:end)?region\b/.test(line));
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => line.search(/\S/)));
  return `${lines
    .map((line) => line.slice(Number.isFinite(indent) ? indent : 0))
    .join("\n")
    .trimEnd()}\n`;
}

/** Finds source declarations on native include elements.
 * @param markdown - Authored page. @returns Declared source and output pairs. */
export function sourceIncludes(markdown: string): SourceInclude[] {
  let fence: FenceState = null;
  const prose = markdown
    .split("\n")
    .map((line) => {
      const next = nextFenceState(line, fence);
      const code = fence !== null || next !== null;
      fence = next;
      return code ? "" : line;
    })
    .join("\n");
  return [...prose.matchAll(/<include\b([^>]*?)>\s*([^<]+?)\s*<\/include>/gs)].flatMap((match) => {
    const source = match[1]!.match(/\bsource="([^"]+)"/)?.[1];
    return source ? [{ source, output: match[2]!.trim() }] : [];
  });
}

/** Copies only explicitly referenced sources through the generator's write/check boundary.
 * @param root - Repository root. @param pages - Authored page files.
 * @param emit - Owned output boundary. @returns Completion after all source copies match. */
export async function generateSourceSnippets(
  root: string,
  pages: readonly string[],
  emit: Emit,
): Promise<void> {
  const owners = new Map<string, string>();
  await Effect.runPromise(
    Effect.forEach(
      pages,
      (page) =>
        Effect.tryPromise({
          try: async () => {
            for (const { source, output } of sourceIncludes(await readFile(page, "utf8"))) {
              if (!output.startsWith("/_snippets/source/") || output.split("/").includes(".."))
                throw new Error(`Invalid snippet output in ${page}: ${output}`);
              if (owners.has(output) && owners.get(output) !== source)
                throw new Error(`Conflicting snippet sources for ${output}`);
              if (owners.has(output)) continue;
              owners.set(output, source);
              const [file, region] = source.split("#");
              const path = resolve(root, file!);
              if (
                relative(root, path) === ".." ||
                relative(root, path).startsWith(`..${sep}`) ||
                path === root
              )
                throw new Error(`Snippet source must be inside the repository: ${source}`);
              await emit(output.slice(1), sourceRegion(await readFile(path, "utf8"), region));
            }
          },
          catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        }),
      { concurrency: 1 },
    ),
  );
}
