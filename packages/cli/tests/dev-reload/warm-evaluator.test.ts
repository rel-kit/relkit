/**
 * The warm development checker keeps one evaluator per session and, on a save, imports
 * again only the changed module and the modules that depend on it: its service and the
 * routes that import that service. Unchanged functions and the other service are reused.
 */
import { afterAll, expect, test } from "bun:test";
import { Effect } from "effect";
import { createDevChecker } from "../../src/commands/dev-check.js";
import { createDevFixture, functionSource } from "./dev-reload.fixture.js";

const fixture = createDevFixture();
const checker = createDevChecker();

afterAll(async () => {
  await Effect.runPromise(checker.close);
  fixture.remove();
}, 60_000);

/**
 * Runs one warm check.
 * @param generation - Generation identity.
 * @returns Whether the check passed.
 */
async function check(generation: string): Promise<boolean> {
  const result = await Effect.runPromise(
    checker.check({ projectRoot: fixture.root, generationId: generation }),
  );
  return result.ok;
}

test(
  "re-imports only the changed module and its dependents",
  async () => {
    expect(await check("warm-1")).toBe(true);
    const first = checker.reimported();
    expect(first).toContain("src/services/beta/functions/b1.function.ts");
    expect(first).toContain("src/services/alpha/functions/a2.function.ts");

    expect(await check("warm-2")).toBe(true);
    expect(checker.reimported()).toEqual([]);

    fixture.write("src/services/alpha/functions/a1.function.ts", functionSource("a1", "v1"));
    expect(await check("warm-3")).toBe(true);
    expect([...checker.reimported()].sort()).toEqual([
      "src/routes/a1/route.ts",
      "src/routes/a2/route.ts",
      "src/services/alpha/functions/a1.function.ts",
      "src/services/alpha/service.ts",
    ]);
  },
  { timeout: 240_000 },
);
