/** Moves a package's most-used API entries ahead of the file-ordered complete reference. */
import { nextFenceState, type FenceState } from "blume/core/code-fences.ts";

/** A level-two or level-three heading found outside code fences. */
interface Heading {
  readonly index: number;
  readonly depth: number;
  readonly text: string;
}

/** Splits a reference into its most-used entries and the remaining complete reference.
 * @param markdown - Composed docgen modules; `##` names a file and `###` an API entry.
 * @param names - Most-used API names in the order the page should lead with.
 * @returns The extracted entries (with their examples) and the reference without them.
 * @remarks Each entry moves, not copies, so heading anchors stay unique. When a name has several
 * entries, the first one with an example moves. A file heading that loses
 * its last entry is dropped. A name without a `###` entry is skipped. */
export function leadWithCommonApis(
  markdown: string,
  names: readonly string[],
): { readonly lead: string; readonly rest: string } {
  let lines = markdown.split("\n");
  const lead: string[] = [];
  for (const name of names) {
    const headings = findHeadings(lines);
    const matches = headings
      .map((heading, position) => ({ heading, position }))
      .filter(
        ({ heading }) =>
          heading.depth === 3 && (heading.text === name || heading.text.startsWith(`${name} (`)),
      )
      .map(({ heading, position }) => ({
        first: heading.index,
        end: headings.slice(position + 1).find(({ depth }) => depth <= 3)?.index ?? lines.length,
      }));
    const entry =
      matches.find(({ first, end }) => lines.slice(first, end).includes("**Example**")) ??
      matches[0];
    if (entry === undefined) continue;
    if (lead.length > 0) lead.push("");
    lead.push(...trimBlank(lines.slice(entry.first, entry.end)));
    lines = [...lines.slice(0, entry.first), ...lines.slice(entry.end)];
  }
  return { lead: lead.join("\n"), rest: dropEmptyFileSections(lines).join("\n") };
}

/** Finds `##` and `###` headings outside fenced code.
 * @param lines - Markdown lines. @returns Headings with their line index. */
function findHeadings(lines: readonly string[]): Heading[] {
  const headings: Heading[] = [];
  let fence: FenceState = null;
  lines.forEach((line, index) => {
    const next = nextFenceState(line, fence);
    const match = fence === null && next === null ? line.match(/^(#{2,3}) (.+)$/) : null;
    if (match) headings.push({ index, depth: match[1]!.length, text: match[2]! });
    fence = next;
  });
  return headings;
}

/** Removes `##` file headings that no longer own any entry.
 * @param lines - Markdown lines after extraction. @returns Lines without empty file sections. */
function dropEmptyFileSections(lines: readonly string[]): string[] {
  const headings = findHeadings(lines);
  const drop = new Set<number>();
  headings.forEach((heading, position) => {
    if (heading.depth !== 2) return;
    const nextIndex =
      headings.slice(position + 1).find(({ depth }) => depth === 2)?.index ?? lines.length;
    const body = lines.slice(heading.index + 1, nextIndex);
    if (body.every((line) => line.trim() === "")) {
      for (let index = heading.index; index < nextIndex; index += 1) drop.add(index);
    }
  });
  return lines.filter((_, index) => !drop.has(index));
}

/** Removes leading and trailing blank lines.
 * @param lines - Markdown lines. @returns The same lines without surrounding blanks. */
function trimBlank(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === "") start += 1;
  while (end > start && lines[end - 1]!.trim() === "") end -= 1;
  return lines.slice(start, end);
}
