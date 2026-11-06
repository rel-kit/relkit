/** Runs the Sentry conformance module on Bun (with `@sentry/bun`) and on Node (with `@sentry/node`). */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "bun:test";

const MODULE = fileURLToPath(new URL("./conformance/sentry-conformance.mjs", import.meta.url));

test.each(["bun", "node"])(
  "exports records through the runtime's Sentry SDK on %s",
  (runtime) => {
    const result = spawnSync(runtime, [MODULE], { encoding: "utf8" });
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(result.stdout).toContain(`Sentry conformance passed on ${runtime}`);
  },
  60_000,
);
