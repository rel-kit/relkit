/** Checks exact suite/URL authority and native shell quoting without opening a
 * browser or relaxing existing UI assertions, origins or readiness deadlines.
 */
import { expect, test } from "bun:test";
import { playwrightSelection } from "../playwright-selection.js";
import { playwrightServerCommand } from "../playwright-server-command.js";

const environment = {
  RELKIT_E2E_SUITE: "commerce",
  RELKIT_E2E_ARTIFACTS: "/tmp/owned-browser-test",
  RELKIT_E2E_DIST: ".relkit/next-e2e-unique",
  RELKIT_E2E_UI_URL: "http://127.0.0.1:48501",
  RELKIT_E2E_BACKEND_URL: "http://127.0.0.1:48502",
};

test("selects the same exact origins and unique result/cache locations", () => {
  expect(playwrightSelection("commerce", environment)).toEqual({
    ui: environment.RELKIT_E2E_UI_URL,
    backend: environment.RELKIT_E2E_BACKEND_URL,
    artifacts: environment.RELKIT_E2E_ARTIFACTS,
    dist: environment.RELKIT_E2E_DIST,
    output: "/tmp/owned-browser-test/results",
  });
});

test("rejects missing runner, wrong suite, foreign origin and shared listeners", () => {
  expect(() => playwrightSelection("commerce", {})).toThrow("bun run test:e2e");
  expect(() => playwrightSelection("inspector", environment)).toThrow("bun run test:e2e");
  expect(() =>
    playwrightSelection("commerce", {
      ...environment,
      RELKIT_E2E_UI_URL: "http://example.com:48501",
    }),
  ).toThrow("Invalid browser fixture origin");
  expect(() =>
    playwrightSelection("commerce", {
      ...environment,
      RELKIT_E2E_UI_URL: environment.RELKIT_E2E_BACKEND_URL,
    }),
  ).toThrow("distinct");
});

test("quotes literal paths and records the exec-preserved native group", () => {
  expect(
    playwrightServerCommand("/tmp/it's $(literal)", "frontend", "node", ["a`b.js", "--webpack"]),
  ).toBe(
    "printf '%s' \"$$\" > '/tmp/it'\\''s $(literal)/frontend.pid'; exec 'node' 'a`b.js' '--webpack'",
  );
});
