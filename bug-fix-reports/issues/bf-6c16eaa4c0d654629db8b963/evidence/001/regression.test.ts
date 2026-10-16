import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flattenCommerce } from "../integration/fixtures/paired-commerce-project.js";

async function withProject(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "relkit-commerce-flat-regression-"));
  try {
    const service = join(root, "examples/commerce/src/services/database");
    await mkdir(service, { recursive: true });
    await writeFile(join(service, "service.ts"), 'export const database = "native";\n');
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("commerce flattening creates an absent destination and preserves service bytes", () =>
  withProject(async (root) => {
    await flattenCommerce(root);
    expect(await readFile(join(root, "examples/commerce/src/database/service.ts"), "utf8")).toBe(
      'export const database = "native";\n',
    );
  }));

test("commerce flattening accepts an existing empty destination", () =>
  withProject(async (root) => {
    await mkdir(join(root, "examples/commerce/src/database"));
    await flattenCommerce(root);
    expect(await readFile(join(root, "examples/commerce/src/database/service.ts"), "utf8")).toBe(
      'export const database = "native";\n',
    );
  }));

for (const name of ["keep.txt", ".keep"]) {
  test(`commerce flattening rejects and preserves existing destination content: ${name}`, () =>
    withProject(async (root) => {
      const destination = join(root, "examples/commerce/src/database");
      await mkdir(destination);
      await writeFile(join(destination, name), "owned bytes");
      await expect(flattenCommerce(root)).rejects.toThrow("contains authored content");
      expect(await readFile(join(destination, name), "utf8")).toBe("owned bytes");
      expect(
        await readFile(join(root, "examples/commerce/src/services/database/service.ts"), "utf8"),
      ).toBe('export const database = "native";\n');
    }));
}

test("commerce flattening rejects collisions before rewriting authored imports", () =>
  withProject(async (root) => {
    const destination = join(root, "examples/commerce/src/database");
    const text = 'export { value } from "../services/other/service.js";\n';
    await mkdir(destination);
    await writeFile(join(destination, "keep.ts"), text);
    await expect(flattenCommerce(root)).rejects.toThrow("contains authored content");
    expect(await readFile(join(destination, "keep.ts"), "utf8")).toBe(text);
  }));
