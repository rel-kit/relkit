/** Places paired backend/frontend examples inside their owning generated API entry, preserving source identity and fenced Markdown. */
import { nextFenceState, type FenceState } from "blume/core/code-fences.ts";
import { frontendExamples } from "./frontend-examples.js";

/** Adds a source-backed browser example before the next API entry, never inside a code fence.
 * @param markdown - Cleaned docgen output for one implementation file.
 * @param source - Repository-relative implementation identity, including its owning package.
 * @returns Markdown with an inline companion, or the unchanged module when none applies.
 * @throws Error when a configured declaration is missing or ambiguous. */
export function withFrontendExample(markdown: string, source: string): string {
  const example = frontendExamples.find((entry) => entry.source === source);
  if (!example) return markdown;
  const companion = [
    "#### Backend and frontend example",
    "",
    ...("note" in example ? [example.note, ""] : []),
    "**Backend** — these maintained files define the operation used by the frontend below.",
    "",
    ...example.backend.map(sourceInclude),
    "**Frontend**",
    "",
    `<include>/_frontend/${example.partial}.mdx</include>`,
    "",
  ].join("\n");
  const output: string[] = [];
  let fence: FenceState = null;
  let active = false;
  let matches = 0;
  for (const line of markdown.split("\n")) {
    const next = nextFenceState(line, fence);
    if (fence === null && next === null && /^#{2,3} /.test(line)) {
      if (active) output.push(companion);
      active = line === `### ${example.symbol}`;
      if (active) matches += 1;
    }
    output.push(line);
    fence = next;
  }
  if (active) output.push("", companion);
  if (matches !== 1)
    throw new Error(`Expected one frontend example owner: ${source}:${example.symbol}`);
  return output.join("\n");
}

/** Reuses a materialized backend source or region with a reader-facing filename.
 * @param source - Maintained backend source, optionally followed by a named region.
 * @returns A native Blume include using the same source ownership as authored modules. */
function sourceInclude(source: string): string {
  const [file, region] = source.split("#");
  const output = region ? file!.replace(/(\.[^.]+)$/, `--${region}$1`) : file!;
  return `<include source="${source}" lang="ts" meta='title="${file}"'>\n/_snippets/source/${output}\n</include>\n`;
}
