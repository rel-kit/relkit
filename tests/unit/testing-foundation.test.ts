/** Keeps optional native testing helpers buildable without a full testing/runtime cycle. */
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

for (const task of ["build", "typecheck"]) {
  test(`LangChain ${task} first compiles the standalone testing foundation`, () => {
    const result = Bun.spawnSync(
      ["./node_modules/.bin/turbo", "run", task, "--filter=@relkit/langchain", "--dry=json"],
      { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 10_000 },
    );
    expect(result.exitCode).toBe(0);
    const plan = result.stdout.toString();
    expect(plan).toContain(`"taskId": "@relkit/testing#${task}:foundation"`);
    expect(plan).not.toContain(`"taskId": "@relkit/testing#${task}"`);
  });
}
