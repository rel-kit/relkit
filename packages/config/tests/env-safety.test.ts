import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { defineEnv, env, projectEnv, resolveEnv } from "../src/index.js";
import { assertSecretAbsent, readGolden } from "./test-support.js";

const secret = "synthetic-env-secret-2.10";

describe("config declaration safety", () => {
  test("does not read process or files while evaluating a declaration", async () => {
    const processEnv = Object.getOwnPropertyDescriptor(process, "env");
    let processReads = 0;
    Object.defineProperty(process, "env", {
      ...processEnv,
      value: new Proxy(process.env, {
        get() {
          processReads += 1;
          throw new Error("process.env was read during declaration");
        },
      }),
    });
    try {
      const { valueFreeDeclaration } = await import("./fixtures/value-free-declaration.js");
      expect(valueFreeDeclaration.kind).toBe("env-definition");
    } finally {
      if (processEnv) Object.defineProperty(process, "env", processEnv);
    }
    expect(processReads).toBe(0);
    for (const source of ["env.ts", "env-builder.ts", "env-json.ts", "index.ts", "resolve.ts"]) {
      const contents = readFileSync(new URL(`../src/${source}`, import.meta.url), "utf8");
      expect(contents).not.toMatch(/node:(?:fs|process)|\b(?:process|Bun\.file|readFile)\b/);
    }
  });

  test("recursively keeps secret values and defaults out of metadata and snapshots", () => {
    const definition = defineEnv({
      apiKey: env.secret().default(secret).example(secret),
      nestedDefault: env.json().default({ credentials: { token: secret } }),
      requiredSecret: env.secret().requiredIn("production"),
    });
    const projection = projectEnv(definition);
    const golden = readGolden("environment.json");
    const snapshot = JSON.parse(JSON.stringify({ metadata: definition.metadata, projection }));

    assertSecretAbsent(definition.metadata, secret);
    assertSecretAbsent(projection, secret);
    assertSecretAbsent(golden, secret);
    assertSecretAbsent(snapshot, secret);
    expect(JSON.stringify(definition)).not.toContain(secret);
    expect(projection.find(({ name }) => name === "apiKey")).toMatchObject({
      sensitive: true,
      hasDefault: true,
      example: "[redacted]",
    });
    expect(() => resolveEnv(definition, { environment: "production", source: {} })).toThrow(
      "requiredSecret: Required value is missing",
    );
  });
});
