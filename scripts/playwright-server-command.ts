/** Builds literal native server commands for Playwright's own detached-group
 * lifecycle. Recording the exec-preserved group ID permits exact fallback join.
 */
import { join } from "node:path";

/** Selects an installed executable without shell expansion of paths or arguments.
 * @param artifacts - Unique runner-owned evidence root.
 * @param name - One of the two exact native webServer owners.
 * @param executable - Installed native executable, never fetched by a runner.
 * @param args - Literal argument vector.
 * @returns A shell command preserving the native Playwright process-group leader.
 */
export function playwrightServerCommand(
  artifacts: string,
  name: "backend" | "frontend",
  executable: string,
  args: readonly string[],
): string {
  const pid = quote(join(artifacts, `${name}.pid`));
  return `printf '%s' "$$" > ${pid}; exec ${[executable, ...args].map(quote).join(" ")}`;
}

/** Escapes literal command operands for Playwright's native POSIX shell launch. */
function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
