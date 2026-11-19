/**
 * Measures one editor position and classifies it. The permanent test asserts the verdict of every
 * position; the survey prints the same measurements as a table.
 */
import { join } from "node:path";
import type { EditorDriver } from "./language-service.js";
import type { Probe, Verdict } from "./probes/probe.js";

/** What an editor showed at one position. */
export interface Measurement {
  readonly verdict: Verdict;
  /** One line for the survey table. */
  readonly shows: string;
}

const NAMES_SHOWN = 8;

/**
 * Applies a probe's replacement to its fixture file.
 * @param text - The fixture file's text.
 * @param probe - The position to measure.
 * @returns The changed text and the cursor offset, which is where `|` stood.
 */
export function applyProbe(text: string, probe: Probe): { text: string; offset: number } {
  const at = text.indexOf(probe.anchor);
  if (at < 0 || text.indexOf(probe.anchor, at + 1) >= 0)
    throw new Error(
      `${probe.file}: the anchor of "${probe.surface}: ${probe.position}" must occur exactly once`,
    );
  const cursor = probe.replacement.indexOf("|");
  const replacement = probe.replacement.replace("|", "");
  return {
    text: text.slice(0, at) + replacement + text.slice(at + probe.anchor.length),
    offset: at + Math.max(cursor, 0),
  };
}

/**
 * Asks the editor what it shows at a probe's position.
 * @param driver - Language service or language server.
 * @param fixture - Absolute path of the fixture directory.
 * @param probe - The position to measure.
 * @returns The verdict and the line the survey prints.
 */
export async function measure(
  driver: EditorDriver,
  fixture: string,
  probe: Probe,
): Promise<Measurement> {
  const file = join(fixture, probe.file);
  const { text, offset } = applyProbe(driver.read(file), probe);
  if (probe.expect !== undefined) {
    const { names, global } = await driver.completions(file, text, offset);
    // In the global scope a known value counts only when the editor ranks it first.
    const offered = global ? names.slice(0, probe.expect.length) : names;
    const found = probe.expect.filter((name) => offered.includes(name));
    const unwanted = (probe.absent ?? []).filter((name) => names.includes(name));
    const verdict: Verdict =
      unwanted.length > 0
        ? "misleading"
        : found.length === probe.expect.length
          ? "works"
          : found.length === 0
            ? "nothing"
            : "partly";
    const list = names.slice(0, NAMES_SHOWN).join(", ");
    const more = names.length > NAMES_SHOWN ? ", …" : "";
    return {
      verdict,
      shows:
        names.length === 0
          ? "no suggestions"
          : `${names.length} ${global ? "suggestions from the whole scope" : "suggestions"}: ${list}${more}`,
    };
  }
  const diagnostics = await driver.diagnostics(file, text);
  const required = probe.error ?? [];
  const first = diagnostics[0];
  const verdict: Verdict =
    first === undefined
      ? "nothing"
      : diagnostics.length === 1 &&
          required.every((part) => first.message.includes(part)) &&
          first.text.includes(probe.on ?? "")
        ? "works"
        : "misleading";
  return {
    verdict,
    shows:
      first === undefined
        ? "no error"
        : `${diagnostics.length} ${diagnostics.length === 1 ? "error" : "errors"}; on \`${first.text}\`: ${first.message.replace(/\s+/gu, " ").slice(0, 200)}`,
  };
}
