import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("release mode runs after a green gate with skipped optional jobs", async () => {
  const workflow = await readFile(
    resolve(import.meta.dir, "../../.github/workflows/ci.yml"),
    "utf8",
  );

  expect(workflow).toContain(
    "if: always() && needs.ci-gate.result == 'success' && github.event_name == 'push' && github.ref == 'refs/heads/main'",
  );
});
