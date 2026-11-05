import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const templates = join(dirname(fileURLToPath(import.meta.url)), "../../../templates/default/v1");

describe("template package scripts", () => {
  it("starts the built server through relkit start in every template", () => {
    const names = readdirSync(templates, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const manifest = JSON.parse(readFileSync(join(templates, name, "package.json"), "utf8")) as {
        scripts: Record<string, string>;
      };
      expect([name, manifest.scripts.start]).toEqual([name, "relkit start"]);
    }
  });
});
