/** Checks the public help and parser paths for the retired dev inspector flag. */
import { expect, test } from "vitest";
import { parseEffectCli } from "./src/cli-effect-runtime.js";

test("hides the retired inspector flag from dev help while retaining its parsed value", async () => {
  const help = await parseEffectCli(["dev", "--help"], "test");
  expect(help.stdout).toContain("relkit dev");
  expect(help.stdout).not.toContain("--inspector-port");

  const parsed = await parseEffectCli(["dev", "--inspector-port", "1"], "test");
  expect(parsed.invocation).toEqual({ command: "dev", args: ["--inspector-port", "1"] });
});
