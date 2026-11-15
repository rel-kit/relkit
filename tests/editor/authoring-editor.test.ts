/**
 * What an editor suggests and reports in RelKit's authoring APIs, position by position, on
 * TypeScript 5.9's language service and on TypeScript 7's language server. A verdict that differs
 * from the one recorded in `probes/` fails in both directions, so a regression is caught and a
 * fix must be recorded.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { EDITORS, FIXTURE } from "./drivers.js";
import type { EditorDriver } from "./language-service.js";
import { measure } from "./measure.js";
import { PROBES } from "./probes/index.js";

for (const [name, start] of Object.entries(EDITORS))
  describe(name, () => {
    let driver: EditorDriver;
    beforeAll(async () => {
      driver = await start();
    }, 120_000);
    afterAll(async () => {
      await driver.close();
    });

    test("the fixture application has no type error", async () => {
      const files = [...new Set(PROBES.map((probe) => `${FIXTURE}/${probe.file}`))];
      for (const file of files)
        expect({ file, errors: await driver.diagnostics(file, driver.read(file)) }).toEqual({
          file,
          errors: [],
        });
    }, 120_000);

    for (const probe of PROBES)
      test(`${probe.surface}: ${probe.position}`, async () => {
        const expected = name.includes("TypeScript 7")
          ? (probe.typescript7 ?? probe.verdict)
          : probe.verdict;
        const measured = await measure(driver, FIXTURE, probe);
        expect(`${measured.verdict}: ${measured.shows}`).toStartWith(`${expected}: `);
      }, 60_000);
  });
