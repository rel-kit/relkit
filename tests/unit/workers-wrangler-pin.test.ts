/** The generated Cloudflare workflow and RelKit's own Workers tests run the same wrangler release. */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLOUDFLARE_WRANGLER_VERSION } from "../../packages/cli/src/commands/deploy-init-cloudflare-plan.ts";
import { RUNTIME_SUITE_WRANGLER } from "../../scripts/runtime-http-suite.ts";

test("the runtime HTTP suite, the conformance test and the generator pin one wrangler", () => {
  const pin = `wrangler@${CLOUDFLARE_WRANGLER_VERSION}`;
  expect(RUNTIME_SUITE_WRANGLER).toBe(pin);
  const conformance = readFileSync(
    join(
      import.meta.dir,
      "../../integrations/packages/cloudflare/tests/workers-conformance.test.ts",
    ),
    "utf8",
  );
  expect(conformance).toContain(`const WRANGLER = "${pin}";`);
});
