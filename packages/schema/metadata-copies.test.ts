import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getJsonSchema, z } from "./src/index.ts";
import { getSchemaMetadata } from "./src/schema-metadata.ts";

test("schema metadata survives independent package copies", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-schema-copy-"));
  try {
    // A second bundled copy has its own module-local state, just like packed installs.
    const result = await Bun.build({
      entrypoints: [new URL("./src/index.ts", import.meta.url).pathname],
      target: "bun",
      outdir: root,
    });
    expect(result.success).toBe(true);
    const other = await import(result.outputs[0]!.path);
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
