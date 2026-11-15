/**
 * Turns the output of a failed frozen-lockfile check into the few lines that say why it failed:
 * the package manager's own words, without its usage text and without anything that looks like a
 * credential or a path on the user's machine.
 */
import { homedir } from "node:os";
import { redactFailureDetail } from "relkit/runtime-effect";

/** Most lines kept from the package manager's output. */
const MAXIMUM_LINES = 8;
/** Longest line kept, in characters. */
const MAXIMUM_LINE_LENGTH = 200;
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const PREFIX = /^npm (?:error|ERR!|warn|notice) ?/;

/**
 * Picks the lines of a failed check that explain the failure.
 * @param output - Combined standard error and standard output of the check.
 * @param projectRoot - Project directory, shown as `<project>`.
 * @returns At most eight sanitized lines; empty when the command printed nothing.
 */
export function lockfileReason(output: string, projectRoot: string): string[] {
  const paragraphs: string[][] = [[]];
  for (const raw of output.replace(ANSI, "").split(/\r?\n/)) {
    const line = raw.replace(PREFIX, "").trimEnd();
    if (line.trim() === "") {
      if (paragraphs.at(-1)!.length > 0) paragraphs.push([]);
    } else paragraphs.at(-1)!.push(line.trim());
  }
  const kept = paragraphs.filter((paragraph) => paragraph.length > 0);
  // npm follows the reason with the command's description and usage; neither says why it failed.
  const usage = kept.findIndex((paragraph) => /^Usage:?$/i.test(paragraph[0] ?? ""));
  const reason = usage === -1 ? kept : kept.slice(0, Math.max(usage - 1, 0));
  return reason
    .flat()
    .slice(0, MAXIMUM_LINES)
    .map((line) => sanitize(line, projectRoot));
}

/**
 * Masks credentials and local paths in one line and bounds its length.
 * @param line - One line of package manager output.
 * @param projectRoot - Project directory to replace with `<project>`.
 * @returns The safe line.
 */
function sanitize(line: string, projectRoot: string): string {
  const home = homedir();
  const local = line
    .replaceAll(projectRoot.length > 1 ? projectRoot : "\0", "<project>")
    .replaceAll(home.length > 1 ? home : "\0", "~");
  const masked = local
    .replace(/\/\/[^\s/@:]+:[^\s/@]+@/g, "//[REDACTED]@")
    .replace(/(_auth(?:Token)?|_password)\s*=\s*\S+/gi, "$1=[REDACTED]")
    .replace(/\b(?:npm|gh[pousr]|glpat|xox[abp])[_-][A-Za-z0-9_-]{16,}/g, "[REDACTED]");
  const safe = String(redactFailureDetail(masked));
  return safe.length > MAXIMUM_LINE_LENGTH ? `${safe.slice(0, MAXIMUM_LINE_LENGTH - 1)}…` : safe;
}
