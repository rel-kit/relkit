export function isRelkitControlPlanePath(path: string): boolean {
  return path === "/_relkit" || path.startsWith("/_relkit/");
}
