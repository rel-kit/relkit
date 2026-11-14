/**
 * The candidate environment: explicit removals must not reintroduce startup dotenv values, and
 * the host a candidate's port was allocated on is the host its generated server is told to bind.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { startCandidate } from "../../../src/supervisor/candidate.js";
import { childEnvironment } from "../../../src/supervisor/candidate-process.js";

test("explicit removals drop inherited values while supervisor identity remains authoritative", () => {
  const environment = childEnvironment(
    { PATH: undefined, PORT: "incorrect", RELKIT_SOURCE_TOKEN: "incorrect" },
    { sourceToken: 7, generationToken: 9 },
    12345,
  );
  expect(environment.PATH).toBeUndefined();
  expect(environment.PORT).toBe("12345");
  expect(environment.RELKIT_SOURCE_TOKEN).toBe("7");
  expect(environment.RELKIT_HOSTNAME).toBe("127.0.0.1");
  expect(
    childEnvironment(
      { RELKIT_HOSTNAME: "0.0.0.0" },
      { sourceToken: 7, generationToken: 9 },
      1,
      "::1",
    ).RELKIT_HOSTNAME,
  ).toBe("::1");
});

test("a candidate started on a custom host is told to bind that host", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-candidate-host-"));
  const allocated: string[] = [];
  const candidate = await startCandidate({
    projectRoot: root,
    token: { sourceToken: 3, generationToken: 11 },
    hostname: "localhost",
    allocatePort: async (hostname) => {
      allocated.push(hostname);
      return 45_000 + Math.floor(Math.random() * 10_000);
    },
    compile: async ({ outputDirectory }) => {
      const entrypoint = join(outputDirectory, "server.ts");
      // The generated server reads its bind address from RELKIT_HOSTNAME.
      await writeFile(entrypoint, "console.log(`host=${process.env.RELKIT_HOSTNAME}`);");
      return { entrypoint };
    },
  });
  try {
    await candidate.exited;
    expect((await candidate.output).stdout).toContain("host=localhost");
    expect(allocated).toEqual(["localhost"]);
  } finally {
    await candidate.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
