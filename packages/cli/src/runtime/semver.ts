/**
 * npm-style semantic version ranges for `relkit doctor`, the same on Bun and Node: `*`, exact
 * and partial versions (`1`, `1.2`, `1.x`), comparators (`>=`, `>`, `<=`, `<`, `=`), caret and
 * tilde ranges, space-separated intersections and `||` unions. A pre-release version satisfies
 * a range only through a comparator naming a pre-release of the same major.minor.patch.
 */

type Version = readonly [number, number, number, readonly string[]];

/**
 * Checks a version against a range.
 * @param version - Installed version.
 * @param range - Declared range.
 * @returns Whether the version satisfies the range; malformed input throws.
 */
export function satisfiesRange(version: string, range: string): boolean {
  const parsed = parseVersion(version);
  const tuple = parsed.slice(0, 3).join(".");
  return range.split("||").some((alternative) => {
    const set = comparators(alternative.trim());
    // npm's rule: a pre-release only matches a set naming a pre-release of the same tuple.
    if (
      parsed[3].length > 0 &&
      !set.some(([, bound]) => bound[3].length > 0 && bound.slice(0, 3).join(".") === tuple)
    )
      return false;
    return set.every(([operator, bound]) => compareWith(parsed, operator, bound));
  });
}

/**
 * Expands one alternative into primitive comparators.
 * @param text - Space-separated range alternative.
 * @returns Operator and bound pairs; `*` yields none.
 */
function comparators(text: string): Array<readonly [string, Version]> {
  const result: Array<readonly [string, Version]> = [];
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const match = /^(\^|~|>=|<=|>|<|=)?v?(.*)$/.exec(token)!;
    const operator = match[1] ?? "";
    const parts = match[2]!.split("-", 1)[0]!.split(".");
    const wild = (part: string | undefined) => part === undefined || /^[x*X]$/.test(part);
    if (parts.every(wild)) continue;
    const [major, minor, patch] = parts.map((part) => (wild(part) ? 0 : Number(part)));
    const exact = parts.length === 3 && !parts.some(wild);
    const base = exact ? parseVersion(match[2]!) : ([major!, minor ?? 0, patch ?? 0, []] as const);
    if (operator === "^" || operator === "~" || (operator === "" && !exact)) {
      const upper: Version =
        operator === "^"
          ? base[0] > 0 || wild(parts[1])
            ? [base[0] + 1, 0, 0, []]
            : base[1] > 0 || wild(parts[2])
              ? [0, base[1] + 1, 0, []]
              : [0, 0, base[2] + 1, []]
          : wild(parts[1])
            ? [base[0] + 1, 0, 0, []]
            : [base[0], base[1] + 1, 0, []];
      result.push([">=", base], ["<", upper]);
    } else result.push([operator === "" ? "=" : operator, base]);
  }
  return result;
}

/**
 * Applies one comparator.
 * @param version - Installed version.
 * @param operator - Primitive operator.
 * @param bound - Comparator bound.
 * @returns Whether the comparator holds.
 */
function compareWith(version: Version, operator: string, bound: Version): boolean {
  const order = compare(version, bound);
  if (operator === ">=") return order >= 0;
  if (operator === ">") return order > 0;
  if (operator === "<=") return order <= 0;
  if (operator === "<") return order < 0;
  return order === 0;
}

/**
 * Orders two versions.
 * @param left - First version.
 * @param right - Second version.
 * @returns Negative, zero or positive.
 */
function compare(left: Version, right: Version): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] as number) - (right[index] as number);
    if (difference !== 0) return difference;
  }
  if (left[3].length === 0 || right[3].length === 0) return right[3].length - left[3].length;
  for (let index = 0; index < Math.max(left[3].length, right[3].length); index += 1) {
    const a = left[3][index];
    const b = right[3][index];
    if (a === undefined || b === undefined) return a === undefined ? -1 : 1;
    if (a === b) continue;
    const numeric = /^\d+$/.test(a) && /^\d+$/.test(b);
    return numeric ? Number(a) - Number(b) : a < b ? -1 : 1;
  }
  return 0;
}

/**
 * Parses a full version.
 * @param text - `major.minor.patch[-pre][+build]`.
 * @returns The parsed version; malformed text throws.
 */
function parseVersion(text: string): Version {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    text.trim(),
  );
  if (match === null) throw new TypeError(`Invalid version: ${text}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4]?.split(".") ?? []];
}
