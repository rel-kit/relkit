import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { startCandidate } from "./src/candidate.js";

test("starts a token-scoped Bun backend on a dynamic port and disposes only itself", async () => {
  const root = await mkdtemp(join(tmpdir(), "zsys-candidate-"));
  const active = join(root, ".zsys", "generated", "generation-7");
  await mkdir(join(root, ".zsys", "generated"), { recursive: true });
  await writeFile(active, "active", { encoding: "utf8" });
  const logs: string[] = [];
  const candidate = await startCandidate({
    projectRoot: root,
    token: { sourceToken: 1, generationToken: 8 },
    logger: (event) => logs.push(event.event),
    compile: async ({ outputDirectory }) => {
      const entrypoint = join(outputDirectory, "server.ts");
      await writeFile(
        entrypoint,
        'Bun.serve({ port: Number(process.env.PORT), fetch: () => new Response("candidate") });',
      );
      return { entrypoint };
    },
  });

  expect(candidate.port).toBeGreaterThan(0);
  const response = await waitForResponse(`http://127.0.0.1:${candidate.port}`);
  expect(await response.text()).toBe("candidate");
  await candidate.dispose();
  await expect(readFile(active, "utf8")).resolves.toBe("active");
  await expect(readFile(candidate.directory, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  expect(logs).toContain("candidate.compile.succeeded");
  expect(logs).toContain("candidate.start.succeeded");
});

test("cleans a failed compile without touching the active generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "zsys-candidate-"));
  const active = join(root, ".zsys", "generated", "generation-9");
  await mkdir(join(root, ".zsys", "generated"), { recursive: true });
  await writeFile(active, "active", { encoding: "utf8", flag: "w" });

  await expect(
    startCandidate({
      projectRoot: root,
      token: { sourceToken: 2, generationToken: 10 },
      compile: async () => {
        throw new Error("compile failed");
      },
    }),
  ).rejects.toThrow("compile failed");

  await expect(readFile(active, "utf8")).resolves.toBe("active");
  await expect(readFile(join(root, ".zsys", "generated", "generation-10"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("bounds startup output before logging and retaining it", async () => {
  const root = await mkdtemp(join(tmpdir(), "zsys-candidate-"));
  const candidate = await startCandidate({
    projectRoot: root,
    token: { sourceToken: 3, generationToken: 11 },
    maxStartupOutputBytes: 16,
    compile: async ({ outputDirectory }) => {
      const entrypoint = join(outputDirectory, "server.ts");
      await writeFile(
        entrypoint,
        'process.stdout.write("x".repeat(100)); setTimeout(() => {}, 1000);',
      );
      return { entrypoint };
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  await candidate.stop();
  const output = await candidate.output;
  expect(new TextEncoder().encode(output.stdout).byteLength).toBeLessThanOrEqual(16);
  expect(output.truncated).toBe(true);
  await candidate.cleanup();
});

async function waitForResponse(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await fetch(url);
    } catch {
      await Bun.sleep(10);
    }
  }
  throw new Error(`Candidate did not start at ${url}`);
}
