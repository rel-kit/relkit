import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getJsonSchema, z } from "../src/index.js";
import { getSchemaMetadata } from "../src/schema-metadata.js";

test("schema metadata survives independent package copies", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-schema-copy-"));
  try {
    // A second bundled copy has its own module-local state, just like packed installs.
    const output = join(root, "schema.js");
    execFileSync("bun", [
      "build",
      new URL("../src/index.ts", import.meta.url).pathname,
      "--target",
      "bun",
      "--outfile",
      output,
    ]);
    const other = await import(output);
    const schema = other.z.string().min(1).max(8);
    expect(getJsonSchema(schema)).toEqual({
      ok: true,
      schema: { type: "string", minLength: 1, maxLength: 8 },
    });
    expect(getSchemaMetadata(other.z.string().optional())?.optional).toBe(true);
    expect(schema["~standard"].jsonSchema.input({ target: "draft-2020-12" })).toEqual({
      type: "string",
      minLength: 1,
      maxLength: 8,
    });
    expect(other.getJsonSchema(z.number().int().positive())).toEqual({
      ok: true,
      schema: { type: "integer", exclusiveMinimum: 0 },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
