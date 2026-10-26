/** Allocates a unique browser-suite evidence/cache root and dynamic listener
 * pair. Exact Next cache cleanup follows the inner native Playwright owner.
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { Effect } from "effect";
import { scaffoldPort } from "./scaffold-http.js";
import { playwrightSelection } from "./playwright-selection.js";
import { scaffoldNative } from "./scaffold-native.js";
import { preserveBrowserState } from "./preserve-browser-state.js";

/** Acquires only this suite's local paths and selected loopback listeners.
 * @param root - Repository root.
 * @param suite - Existing serial browser suite.
 * @returns Shared native config environment and retained evidence paths.
 */
export const playwrightSuite = Effect.fn("Playwright.suite")(function* (
  root: string,
  suite: "inspector" | "commerce",
) {
  const ui = yield* scaffoldPort;
  let backend = yield* scaffoldPort;
  for (let attempt = 0; backend === ui && attempt < 10; attempt++) backend = yield* scaffoldPort;
  if (backend === ui)
    return yield* Effect.fail(new Error("Cannot allocate distinct browser ports"));
  yield* scaffoldNative("browser.mkdir", () => mkdir(join(root, ".relkit"), { recursive: true }));
  const artifacts = yield* scaffoldNative("browser.evidence", () =>
    mkdtemp(join(root, `.relkit/playwright-${suite}-`)),
  );
  const dist = `.relkit/next-e2e-${basename(artifacts)}`;
  const environment = {
    RELKIT_E2E_SUITE: suite,
    RELKIT_E2E_ARTIFACTS: artifacts,
    RELKIT_E2E_DIST: dist,
    RELKIT_E2E_UI_URL: `http://127.0.0.1:${ui}`,
    RELKIT_E2E_BACKEND_URL: `http://127.0.0.1:${backend}`,
  };
  const application = suite === "inspector" ? "apps/inspector" : "examples/commerce-web";
  yield* Effect.addFinalizer(() =>
    Effect.promise(() => rm(join(root, application, dist), { recursive: true, force: true })),
  );
  yield* preserveBrowserState(join(root, application), artifacts);
  return { ...playwrightSelection(suite, environment), environment };
});
