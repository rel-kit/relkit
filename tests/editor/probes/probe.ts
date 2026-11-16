/** The shape of one measured editor position. */

/** What the editor does at a position. */
export type Verdict = "works" | "partly" | "nothing" | "misleading";

/** Why a position does not work; the survey explains each. */
export type Cause =
  | "typing"
  | "access-names"
  | "captured-options"
  | "overloads"
  | "nested-call"
  | "profile-names"
  | "path-parameters";

/**
 * One position. A suggestion probe (`expect`) puts the cursor at `|` in `replacement`; a
 * diagnostic probe (`error`) replaces the anchor with a wrong value and reads the file's errors.
 */
export interface Probe {
  readonly surface: string;
  readonly position: string;
  /** Fixture file, relative to the fixture directory. */
  readonly file: string;
  /** Text of the fixture file, occurring once, that the replacement stands in for. */
  readonly anchor: string;
  readonly replacement: string;
  /** Names a developer expects among the suggestions. */
  readonly expect?: readonly string[];
  /** Names the editor must not offer, such as an option that was removed. */
  readonly absent?: readonly string[];
  /** Texts the single error must contain, such as the valid names. */
  readonly error?: readonly string[];
  /** What the editor does here; the test fails when a measurement differs. */
  readonly verdict: Verdict;
  /** The verdict on TypeScript 7 when it differs from TypeScript 5.9. */
  readonly typescript7?: Verdict;
  /** Set when the verdict is not `works`. */
  readonly cause?: Cause;
}

/** A suggestion probe that works. */
export const suggest = (
  surface: string,
  position: string,
  file: string,
  anchor: string,
  replacement: string,
  expect: readonly string[],
  rest: Partial<Pick<Probe, "verdict" | "typescript7" | "cause" | "absent">> = {},
): Probe => ({ surface, position, file, anchor, replacement, expect, verdict: "works", ...rest });

/** A diagnostic probe whose single error names the given texts. */
export const wrong = (
  surface: string,
  position: string,
  file: string,
  anchor: string,
  replacement: string,
  error: readonly string[],
  rest: Partial<Pick<Probe, "verdict" | "typescript7" | "cause">> = {},
): Probe => ({ surface, position, file, anchor, replacement, error, verdict: "works", ...rest });
