import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";

const repositoryRoot = resolve(import.meta.dir, "../..");
const workerPath = join(import.meta.dir, "agent-graph-worker.ts");
const tsxPath = join(repositoryRoot, "node_modules/.bun/node_modules/tsx/dist/cli.mjs");

test("resumes a SQLite-checkpointed graph once across competing restart processes", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-restart-jobs-"));
  try {
    const paused = await runWorker("pause", root);
    expect(paused.exitCode).toBe(0);
    expect(paused.result).toMatchObject({ outcome: "waiting" });
    const revision = requiredString(paused.result.revision);

    const restored = await runWorker("inspect", root);
    expect(restored.result).toMatchObject({
      outcome: "snapshot",
      status: "waiting",
      revision,
      runs: ["waiting"],
      assistant: [],
      terminal: [],
    });

    const first = runWorker("resume", root, revision, "one");
    const second = runWorker("resume", root, revision, "two");
    await waitForReady(root);
    await writeFile(join(root, "resume-go"), "go");
    const competitors = await Promise.all([first, second]);
    expect(competitors.every((value) => value.exitCode === 0)).toBe(true);
    expect(competitors.map((value) => value.result.outcome).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);

    const final = await runWorker("inspect", root);
    expect(final.result).toMatchObject({
      outcome: "snapshot",
      status: "idle",
      runs: ["waiting", "succeeded"],
      assistant: [
        {
          role: "assistant",
          parts: [{ kind: "text", text: '{"result":"approved"}', state: "complete" }],
        },
      ],
      terminal: [{ output: { result: "approved" } }],
    });
    expect(await nodeEntries(root)).toEqual(["review", "review", "finish"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

type Mode = "pause" | "inspect" | "resume";

async function runWorker(
  mode: Mode,
  root: string,
  revision?: string,
  contender?: "one" | "two",
): Promise<{
  readonly exitCode: number;
  readonly stderr: string;
  readonly result: Record<string, unknown>;
}> {
  const child = Bun.spawn(
    [
      Bun.which("node") ?? "node",
      tsxPath,
      workerPath,
      mode,
      root,
      ...(revision === undefined ? [] : [revision, contender!]),
    ],
    { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" },
  );
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  const exitCode = await child.exited;
  const [output, errors] = await Promise.all([stdout, stderr]);
  const line = output.trim().split("\n").filter(Boolean).at(-1);
  return {
    exitCode,
    stderr: errors,
    result: line === undefined ? {} : (JSON.parse(line) as Record<string, unknown>),
  };
}

async function waitForReady(root: string): Promise<void> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    if (
      (await Bun.file(join(root, "resume-ready-one")).exists()) &&
      (await Bun.file(join(root, "resume-ready-two")).exists())
    ) {
      return;
    }
    await Bun.sleep(5);
  }
  throw new Error("Competing resume workers did not become ready");
}

async function nodeEntries(root: string): Promise<readonly string[]> {
  return (await readFile(join(root, "node-entries.ndjson"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => (JSON.parse(line) as { readonly node: string }).node);
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Missing waiting revision");
  return value;
}
