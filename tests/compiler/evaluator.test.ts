import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { evaluateCandidates } from "../../packages/compiler/src/discovery/evaluator.ts";

const brand = 'Symbol.for("relkit.descriptor")';

describe.serial("isolated evaluator", () => {
  test("returns snapshots and manifest references without corrupting output", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "relkit-evaluator-"));
    const previousAllowed = process.env.RELKIT_EVALUATOR_ALLOWED;
    const previousBlocked = process.env.RELKIT_EVALUATOR_BLOCKED;
    process.env.RELKIT_EVALUATOR_ALLOWED = "allowed-value";
    process.env.RELKIT_EVALUATOR_BLOCKED = "blocked-value";
    try {
      await writeFile(
        join(projectRoot, "app.ts"),
        `const brand = ${brand};
          export const app = Object.freeze({
            [brand]: true,
            kind: "function",
            id: "orders.create",
            ref: Object.freeze({ kind: "function", id: "orders.create" }),
            env: {
              allowed: process.env.RELKIT_EVALUATOR_ALLOWED ?? null,
              blocked: process.env.RELKIT_EVALUATOR_BLOCKED ?? null,
            },
            handler: () => "not serialized",
          });
        `,
      );
      const response = await evaluateCandidates({
        projectRoot,
        candidates: ["app.ts"],
        generationId: "generation-test",
        environmentAllowlist: ["RELKIT_EVALUATOR_ALLOWED"],
        timeoutMs: 1_000,
      });
      expect(response.status).toBe("ok");
      expect(response.generationId).toBe("generation-test");
      expect(response.detectorCoverage.unsupported.length).toBeGreaterThan(0);
      const module = response.modules[0];
      const exported = module?.exports[0];
      expect(exported?.descriptor).toMatchObject({
        id: "orders.create",
        kind: "function",
        ref: { kind: "function", id: "orders.create" },
      });
      expect(exported?.descriptor.metadata).toMatchObject({
        env: { allowed: "allowed-value", blocked: null },
        handler: { $relkit: "function" },
      });
      expect(module?.manifestReferences).toEqual([
        {
          generationId: "generation-test",
          descriptorId: "orders.create",
          kind: "function",
          module: "app.ts",
          exportName: "app",
        },
      ]);
    } finally {
      restoreEnvironment("RELKIT_EVALUATOR_ALLOWED", previousAllowed);
      restoreEnvironment("RELKIT_EVALUATOR_BLOCKED", previousBlocked);
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test("reports supported side effects and keeps generated writes allowed", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "relkit-evaluator-"));
    const cases = [
      [
        "listener.ts",
        "Bun.serve({ port: 0, fetch() { return new Response(); } });",
        "listening-socket",
      ],
      ["timer.ts", "setInterval(() => undefined, 60000);", "live-timer"],
      [
        "write.ts",
        'import fs from "node:fs"; fs.writeFileSync("outside.txt", "nope");',
        "write-outside-generated-sandbox",
      ],
      ["child.ts", 'Bun.spawn(["true"]);', "child-process"],
      [
        "output.ts",
        'console.log("direct stdout"); process.stderr.write("direct stderr");',
        "direct-output",
      ],
      ["network.ts", 'await fetch("https://example.com/");', "unapproved-network"],
    ] as const;
    try {
      for (const [file, source] of cases) await writeFile(join(projectRoot, file), source);
      const response = await evaluateCandidates({
        projectRoot,
        candidates: cases.map(([file]) => file),
        generationId: "side-effect-test",
        timeoutMs: 1_000,
      });
      expect(response.status).toBe("failed");
      const detected = response.failures.flatMap((failure) => failure.sideEffects ?? []);
      for (const [, , kind] of cases) expect(detected.map((entry) => entry.kind)).toContain(kind);
      expect(response.stdout).toContain("direct stdout");
      expect(response.stderr).toContain("direct stderr");
      expect(response.modules).toEqual([]);

      await writeFile(
        join(projectRoot, "allowed.ts"),
        'import fs from "node:fs"; fs.mkdirSync(".relkit/generated", { recursive: true }); fs.writeFileSync(".relkit/generated/ok.txt", "ok"); export const value = 1;',
      );
      const allowed = await evaluateCandidates({ projectRoot, candidates: ["allowed.ts"] });
      expect(allowed.status).toBe("ok");
      expect(allowed.failures).toEqual([]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test("returns source-mapped structured import failures", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "relkit-evaluator-"));
    try {
      await writeFile(join(projectRoot, "bad.ts"), 'throw new Error("source-map-boom");\n');
      const response = await evaluateCandidates({ projectRoot, candidates: ["bad.ts"] });
      expect(response.status).toBe("failed");
      expect(response.failures[0]).toMatchObject({
        code: "RELKIT_EVALUATOR_IMPORT_FAILED",
        module: "bad.ts",
      });
      expect(response.failures[0]?.stack).toContain("bad.ts");
      expect(response.failures[0]?.stack).not.toContain(projectRoot);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test("kills a candidate that exceeds the compilation timeout", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "relkit-evaluator-"));
    try {
      await writeFile(join(projectRoot, "slow.ts"), "await new Promise(() => {});\n");
      const response = await evaluateCandidates({
        projectRoot,
        candidates: ["slow.ts"],
        timeoutMs: 200,
      });
      expect(response.status).toBe("failed");
      expect(response.failures[0]).toMatchObject({
        code: "RELKIT_EVALUATOR_TIMEOUT",
        timedOut: true,
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test("rejects candidates outside the fixed project root", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "relkit-evaluator-"));
    try {
      const response = await evaluateCandidates({
        projectRoot,
        candidates: ["/tmp/outside-relkit-evaluator.ts"],
      });
      expect(response).toMatchObject({
        status: "failed",
        failures: [{ code: "RELKIT_EVALUATOR_REQUEST_INVALID" }],
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
