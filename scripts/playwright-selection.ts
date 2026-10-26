/** Shares one exact loopback authority between native browser config, fixtures
 * and tests. Direct Playwright invocation requires the resource-owning runner.
 */
import { isAbsolute, join } from "node:path";

/** Reads the runner's selected endpoints without opening a listener.
 * @param suite - Expected fixture owner, preventing cross-suite configuration.
 * @param environment - Native child environment overrides, before parent merging.
 * @returns Exact origins and this invocation's isolated output/cache paths.
 */
export function playwrightSelection(
  suite: "inspector" | "commerce",
  environment: Partial<NodeJS.ProcessEnv> = process.env,
) {
  const artifacts = environment.RELKIT_E2E_ARTIFACTS;
  const dist = environment.RELKIT_E2E_DIST;
  if (
    environment.RELKIT_E2E_SUITE !== suite ||
    !artifacts ||
    !isAbsolute(artifacts) ||
    !dist ||
    !/^\.relkit\/next-e2e-[\w-]+$/.test(dist)
  )
    throw new Error(
      "Run browser acceptance with bun run test:e2e to allocate owned listeners and output.",
    );
  const ui = origin(environment.RELKIT_E2E_UI_URL);
  const backend = origin(environment.RELKIT_E2E_BACKEND_URL);
  if (ui === backend) throw new Error("Browser UI and backend must use distinct owned listeners.");
  return { ui, backend, artifacts, dist, output: join(artifacts, "results") };
}

/** Validates an exact local fixture origin instead of broadening CORS authority. */
function origin(value: string | undefined): string {
  if (value === undefined) throw new Error("Missing browser fixture origin; run bun run test:e2e.");
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error(`Invalid browser fixture origin: ${value}`);
  return url.origin;
}
