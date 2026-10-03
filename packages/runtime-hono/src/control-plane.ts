/** Match the reserved RELKIT control-plane path and its descendants.
 * @param path - Request path or issue location.
 * @returns Whether the path equals /_relkit or begins with /_relkit/.
 */
export function isRelkitControlPlanePath(path: string): boolean {
  return path === "/_relkit" || path.startsWith("/_relkit/");
}
