import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineEnv, env } from "@zsys/config";
import { runEnv } from "./src/commands/env.js";

const definition = defineEnv({
  API_KEY: env.secret().default("synthetic-secret").description("External API key"),
  OPTIONAL: env.string().optional(),
  SERVICE_PORT: env.port().example(3210),
  REQUIRED: env.string().requiredIn("production").example("safe-example"),
});

function reporter() {
  const outputs: unknown[] = [];
  return {
    outputs,
    reporter: {
      output: (value: unknown) => outputs.push(value),
      error: (code: string, message: string) => outputs.push({ code, message }),
    },
  };
}

describe("zsys env commands", () => {
  test("checks environment-specific requirements and keeps values out of output", async () => {
    const captured = reporter();
    expect(
      await runEnv(
        ["check", "--environment", "production"],
        { json: true, reporter: captured.reporter },
        { definition, source: {} },
      ),
    ).toBe(1);
    expect(JSON.stringify(captured.outputs)).not.toContain("synthetic-secret");
    expect(captured.outputs[0]).toMatchObject({
      command: "check",
      items: expect.arrayContaining([{ name: "REQUIRED", status: "missing" }]),
    });
  });

  test("generates deterministic redacted examples without overwriting edits", async () => {
    const root = await mkdtemp(join(process.cwd(), ".zsys-env-test-"));
    try {
      const path = join(root, ".env.example");
      await writeFile(path, "EDITED=1\n", "utf8");
      const captured = reporter();
      await runEnv(
        ["example"],
        { json: true, reporter: captured.reporter },
        { definition, projectRoot: root },
      );
      expect(await readFile(path, "utf8")).toBe("EDITED=1\n");
      expect(JSON.stringify(captured.outputs)).not.toContain("synthetic-secret");
      expect((captured.outputs[0] as { content: string }).content).toBe(
        "API_KEY=[redacted]\nOPTIONAL=example\nREQUIRED=safe-example\nSERVICE_PORT=3210\n",
      );

      await runEnv(
        ["example", "--write"],
        { json: true, reporter: captured.reporter },
        { definition, projectRoot: root },
      );
      expect(await readFile(path, "utf8")).toBe(
        "API_KEY=[redacted]\nOPTIONAL=example\nREQUIRED=safe-example\nSERVICE_PORT=3210\n",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
