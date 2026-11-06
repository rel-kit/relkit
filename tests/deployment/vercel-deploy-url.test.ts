/** The Vercel newcomer driver reads the deployment URL from the CLI's stdout, JSON-quoted or not. */
import { expect, test } from "bun:test";
import { deploymentUrl } from "../../scripts/vercel-newcomer/vercel.ts";

test("takes the last URL and drops the JSON quoting the CLI adds when stdout is piped", () => {
  const piped = `{"url":"https://relkit-test-mw5kfl5i-3xu6c0nyd-cipay.vercel.app","alias":["https://relkit-test-mw5kfl5i.vercel.app",\n"https://relkit-test-mw5kfl5i-cipay.vercel.app"]}`;
  expect(deploymentUrl(piped)).toBe("https://relkit-test-mw5kfl5i-cipay.vercel.app");
  expect(deploymentUrl('https://relkit-test-debug.vercel.app",')).toBe(
    "https://relkit-test-debug.vercel.app",
  );
  expect(deploymentUrl("Production https://a-b.vercel.app\nAliased https://a.vercel.app\n")).toBe(
    "https://a.vercel.app",
  );
});

test("fails when the CLI printed no URL", () => {
  expect(() => deploymentUrl("Vercel CLI 65.11.0\nError: nope\n")).toThrow("printed no URL");
});
