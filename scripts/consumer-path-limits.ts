/** Finite evidence budgets shared by native module routes and installed package route projection.
 * Exceeding these bounds rejects collection instead of silently publishing truncated passing evidence.
 */
export const CONSUMER_PATH_LIMITS = Object.freeze({
  files: 65_536,
  edges: 262_144,
  paths: 16_384,
  depth: 64,
});
