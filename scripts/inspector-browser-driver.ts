/** Adapts the installed browser CLI to the existing acceptance driver. Each command
 * shares the scoped native child owner, retains its sixty-second deadline and
 * propagates cancellation; accessibility assertions remain plain native values.
 */
import { type Context, Effect } from "effect";
import type { ScaffoldProcess } from "./scaffold-process.js";
import type { BrowserAcceptanceDriver } from "./test-inspector-agent-browser.js";

export const browserEnvironment = {
  AGENT_BROWSER_ALLOWED_DOMAINS: "127.0.0.1",
  AGENT_BROWSER_CONTENT_BOUNDARIES: "1",
  AGENT_BROWSER_DEFAULT_TIMEOUT: "60000",
  AGENT_BROWSER_MAX_OUTPUT: "50000",
};

/** Builds a driver for one owned browser session.
 * @param baseUrl - This run's inspector listener.
 * @param session - Unique browser session name.
 * @param root - Repository working directory.
 * @param signal - Current acceptance cancellation.
 * @param commands - Captured finite native command authority.
 * @returns The existing UI acceptance driver contract.
 */
export function inspectorBrowserDriver(
  baseUrl: string,
  session: string,
  root: string,
  signal: AbortSignal,
  commands: Context.Service.Shape<typeof ScaffoldProcess>,
): BrowserAcceptanceDriver {
  const run = (...args: string[]) =>
    Effect.runPromise(
      commands
        .run({
          executable: "agent-browser",
          args: ["--session", session, ...args],
          cwd: root,
          env: browserEnvironment,
        })
        .pipe(Effect.timeout("60 seconds")),
      { signal },
    );
  return { baseUrl, run, snapshot: () => run("snapshot", "-i"), reference, includes };
}

/** Resolves the same accessibility reference used by the original scenarios.
 * @param tree - Native browser accessibility output.
 * @param label - Exact expected control label.
 * @returns Its browser reference, or throws when the control is absent.
 */
function reference(tree: string, label: string): string {
  const line = tree.split("\n").find((candidate) => candidate.includes(label));
  const value = line?.match(/ref=(e\d+)/)?.[1];
  if (value === undefined) throw new Error(`Missing accessibility reference for ${label}`);
  return `@${value}`;
}

/** Preserves the original textual browser assertion.
 * @param value - Native browser output.
 * @param expected - Required text.
 * @returns Nothing when present; throws the original assertion error otherwise.
 */
function includes(value: string, expected: string): void {
  if (!value.includes(expected)) throw new Error(`Expected browser output to include ${expected}`);
}
